-- Cambiar de cabaña una reserva y completar los datos de una noche de Booking.
-- · channel_stays.reservation_code: la noche de Booking ya es una reserva del panel (con huésped). Enlazada deja de ocupar
--   por su cuenta (ocupa la reserva), así no se cuenta dos veces.
-- · Si la reserva enlazada se cancela o cambia de fechas o de cabaña, el enlace se rompe: la noche vuelve a ocupar hasta que
--   se cambie también en el extranet, y el equipo recibe el recordatorio (el panel nunca vende lo que Booking sigue teniendo).
-- · Cambiar solo de cabaña no manda correo (enqueue_reservation_emails mira las fechas): deja una nota y un aviso.

alter table public.channel_stays
  add column reservation_code text references public.reservations (code) on delete set null;
create unique index channel_stays_reservation_code_key on public.channel_stays (reservation_code) where reservation_code is not null;

-- 1. Las noches enlazadas no ocupan por su cuenta.
create or replace function public.free_unit(
  p_type text,
  p_ci date,
  p_co date,
  p_ignore text default null,
  p_taken text[] default '{}',
  p_prefer integer default null
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n integer;
  u integer;
begin
  select c.units into n from public.cabin_types c where c.id = p_type;
  if coalesce(n, 0) < 1 then return 0; end if;
  for u in
    select g from generate_series(1, n) g order by (g = p_prefer) desc nulls last, g
  loop
    continue when (p_type || ':' || u) = any (p_taken);
    continue when exists (
      select 1 from public.reservations r
      where r.cabin_type_id = p_type and r.unit = u and r.code is distinct from p_ignore
        and r.status in ('confirmed', 'rescheduled', 'checked_in') and r.check_in < p_co and r.check_out > p_ci);
    continue when exists (
      select 1 from public.blocks b
      where b.cabin_type_id = p_type and b.unit = u and b.from_date < p_co and b.to_date >= p_ci);
    continue when exists (
      select 1 from public.channel_stays s
      where s.cabin_type_id = p_type and s.unit = u and s.removed_at is null and not s.echo and s.reservation_code is null
        and s.check_in < p_co and s.check_out > p_ci);
    return u;
  end loop;
  return 0;
end;
$$;
revoke execute on function public.free_unit(text, date, date, text, text[], integer) from public, anon, authenticated;

create or replace function public.bump_unpaid_after_channel_stay() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.removed_at is null and not new.echo and new.reservation_code is null then
    perform public.bump_unpaid(new.cabin_type_id, new.check_in, new.check_out);
  end if;
  return null;
end;
$$;
revoke execute on function public.bump_unpaid_after_channel_stay() from public, anon, authenticated;

-- 2. Avisos nuevos: Booking canceló una noche enlazada (channel_cancelled) y cambios que faltan en el extranet (channel_moved).
alter table public.admin_notifications drop constraint admin_notifications_kind_check;
alter table public.admin_notifications add constraint admin_notifications_kind_check check (kind in (
  'reservation_created', 'reservation_confirmed', 'reservation_cancelled', 'reservation_expired',
  'proof_uploaded', 'proof_approved', 'proof_rejected',
  'payment_declined', 'payment_refund', 'balance_paid', 'balance_overdue', 'email_failed',
  'channel_conflict', 'channel_moved', 'channel_cancelled', 'channel_sync_failed',
  'booking_pending', 'booking_modified', 'booking_cancelled', 'booking_failed',
  'checkout_pending', 'reservation_moved'
));

-- 3. Cambio de cabaña (nota y aviso) y enlace con Booking.
create function public.after_reservation_stay_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  seen timestamptz := case when auth.uid() is null then null else now() end;
  same_dates boolean := (new.check_in, new.check_out) is not distinct from (old.check_in, old.check_out);
  other_cabin boolean := (new.cabin_type_id, new.unit) is distinct from (old.cabin_type_id, old.unit);
  cancelled boolean := new.status is distinct from old.status and new.status in ('cancelled', 'expired');
  stay public.channel_stays;
  before_name text;
  after_name text;
begin
  if other_cabin then
    select 'Cabaña ' || coalesce(nullif(trim(c.unit_labels[old.unit]), ''), old.unit::text) into before_name
    from public.cabin_types c where c.id = old.cabin_type_id;
    select 'Cabaña ' || coalesce(nullif(trim(c.unit_labels[new.unit]), ''), new.unit::text) into after_name
    from public.cabin_types c where c.id = new.cabin_type_id;
  end if;

  -- Solo el cambio de cabaña: el pago de una pendiente también puede reasignarla, y ese ya tiene su propio aviso.
  if other_cabin and same_dates and new.status is not distinct from old.status then
    insert into public.reservation_notes (reservation_code, text)
    values (new.code, 'Cambio de cabaña: de ' || before_name || ' a ' || after_name || '.');
    insert into public.admin_notifications (kind, title, body, reservation_code, read_at)
    values ('reservation_moved', left('Cambio de cabaña · ' || new.code, 160),
            left(new.guest_full_name || ' pasó de ' || before_name || ' a ' || after_name || '.', 400), new.code, seen);
  end if;

  if not (cancelled or other_cabin or not same_dates) then return null; end if;
  select * into stay from public.channel_stays s where s.reservation_code = new.code;
  if not found then return null; end if;
  update public.channel_stays set reservation_code = null where id = stay.id;
  -- Si Booking ya la había cancelado, no queda nada por hacer en el extranet.
  if stay.removed_at is null then
    insert into public.admin_notifications (kind, title, body, reservation_code)
    values ('channel_moved', left('Falta actualizar Booking · ' || new.code, 160),
            left(case when cancelled
                   then 'La reserva se canceló en el panel, pero Booking sigue ocupando las noches del '
                        || to_char(stay.check_in, 'DD/MM') || ' al ' || to_char(stay.check_out, 'DD/MM') || '. Cancélala también en el extranet.'
                   else 'La reserva cambió en el panel, pero Booking sigue ocupando las noches del '
                        || to_char(stay.check_in, 'DD/MM') || ' al ' || to_char(stay.check_out, 'DD/MM') || '. Haz el mismo cambio en el extranet.'
                 end, 400), new.code);
  end if;
  return null;
end;
$$;
revoke execute on function public.after_reservation_stay_change() from public, anon, authenticated;

create trigger reservations_stay_change after update of status, check_in, check_out, cabin_type_id, unit on public.reservations
  for each row execute function public.after_reservation_stay_change();

-- 4. Completar una noche de Booking: crea la reserva (importada: confirmada, sin pagos ni correos) y la enlaza, todo o nada.
--    La cabaña y las fechas las pone la noche de Booking. Si ya terminó, entra finalizada, para el historial.
create function public.complete_channel_stay(
  p_stay uuid,
  p_code text,
  p_ref text,
  p_adults integer,
  p_children integer,
  p_arrival text,
  p_guest jsonb,
  p_notes text,
  p_quote jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.channel_stays;
begin
  select * into s from public.channel_stays where id = p_stay for update;
  if not found or s.removed_at is not null or s.echo or s.reservation_code is not null then
    raise exception 'STAY_UNAVAILABLE' using errcode = 'P0001';
  end if;
  insert into public.reservations (
    code, source, external_ref, channel, commission, status, cabin_type_id, unit, check_in, check_out, adults, children,
    pet, decoration, estimated_arrival, guest_full_name, guest_doc_type, guest_doc_number, guest_email, guest_phone,
    guest_city, special_requests, consents, quote, deposit_due_at
  ) values (
    p_code, 'import', nullif(trim(p_ref), ''), 'Booking.com', 0,
    (case when s.check_out <= (now() at time zone 'America/Bogota')::date then 'completed' else 'confirmed' end)::public.reservation_status,
    s.cabin_type_id, s.unit, s.check_in, s.check_out, p_adults, p_children,
    '{"hasPet": false, "smallBreedConfirmed": false}'::jsonb, '{"requested": false, "occasion": "", "notes": ""}'::jsonb, p_arrival,
    p_guest ->> 'fullName', p_guest ->> 'docType', p_guest ->> 'docNumber', p_guest ->> 'email', p_guest ->> 'phone',
    p_guest ->> 'city', p_notes, '{"policies": false, "dataProcessing": false, "marketing": false}'::jsonb, p_quote, now()
  );
  update public.channel_stays set reservation_code = p_code where id = p_stay;
  return p_code;
end;
$$;
revoke execute on function public.complete_channel_stay(uuid, text, text, integer, integer, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.complete_channel_stay(uuid, text, text, integer, integer, text, jsonb, text, jsonb) to service_role;
