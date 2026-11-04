-- Reservas de Booking.com que llegan por correo. La propiedad está conectada a Booking a través de Ayenda (Room365), que
-- avisa cada reserva nueva, modificación o cancelación con un correo de no-responder@ayenda.co. La app lee ese buzón
-- (POST /api/booking/mail, src/lib/server/booking-mail.ts) y aplica cada correo con apply_booking_email().
--
-- · booking_inbox: una fila por reserva de Ayenda (ref = «Número Único de Reserva»). El correo no dice la cabaña, así que
--   entra 'pending' (por asignar) y el equipo elige la cabaña en el panel (Booking). Al asignarla se crea la reserva
--   (source 'import', external_ref 'ayenda:<ref>', canal Booking) y la fila pasa a 'assigned'. 'cancelled': Booking la
--   canceló antes de asignarla. 'dismissed': el equipo la descartó (por ejemplo, ya estaba en el panel).
-- · booking_emails: cada correo leído, una sola vez (message_id). Así QA y producción leen el mismo buzón sin pisarse:
--   cada base lleva su propio registro.
-- · Una modificación de una reserva ya asignada cambia sus fechas y su valor; una cancelación la cancela. Si las fechas
--   nuevas chocan con otra reserva en esa cabaña, no se cambian y queda un aviso.
-- · Silencio (p_quiet, en QA): los avisos se crean ya marcados como enviados, así no salen como push. En la misma
--   transacción alcanza, porque el despacho (pg_net) solo corre después de confirmarla.

create table public.booking_inbox (
  ref text primary key check (ref ~ '^[0-9]{1,20}$'),
  status text not null default 'pending' check (status in ('pending', 'assigned', 'cancelled', 'dismissed')),
  guest_full_name text not null check (length(guest_full_name) between 1 and 120),
  guest_email text not null default '' check (length(guest_email) <= 160),
  guest_phone text not null default '' check (length(guest_phone) <= 20),
  check_in date not null,
  check_out date not null,
  total integer not null check (total between 0 and 100000000),
  reservation_code text unique references public.reservations (code) on delete set null,
  last_email_at timestamptz not null, -- fecha del último correo aplicado: uno más viejo que llegue tarde no lo pisa
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_inbox_dates_check check (check_out > check_in)
);

create index booking_inbox_pending_idx on public.booking_inbox (check_in) where status = 'pending';

create table public.booking_emails (
  message_id text primary key check (length(message_id) between 1 and 300),
  ref text,
  kind text check (kind in ('new', 'modified', 'cancelled')),
  received_at timestamptz not null,
  -- applied: cambió la bandeja o la reserva · past: la estadía ya terminó · stale: llegó después de uno más nuevo ·
  -- failed: no se pudo aplicar (fechas ocupadas) · unreadable: el correo no se entendió
  result text not null check (result in ('applied', 'past', 'stale', 'failed', 'unreadable')),
  detail text not null default '' check (length(detail) <= 400),
  created_at timestamptz not null default now()
);

create index booking_emails_received_idx on public.booking_emails (received_at desc);

alter table public.booking_inbox enable row level security;
alter table public.booking_emails enable row level security;
create policy "Equipo lee reservas de Booking" on public.booking_inbox for select to authenticated using ((select public.is_staff()));
create policy "Equipo lee correos de Booking" on public.booking_emails for select to authenticated using ((select public.is_staff()));
-- Las escrituras van por la API (clave de servicio) y por apply_booking_email().
revoke all on public.booking_inbox, public.booking_emails from anon, authenticated;
grant select on public.booking_inbox, public.booking_emails to authenticated;
grant select, insert, update, delete on public.booking_inbox, public.booking_emails to service_role;

create trigger booking_inbox_updated_at before update on public.booking_inbox
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.booking_inbox;

-- ───────────── Avisos ─────────────
alter table public.admin_notifications drop constraint admin_notifications_kind_check;
alter table public.admin_notifications add constraint admin_notifications_kind_check check (kind in (
  'reservation_created', 'reservation_confirmed', 'reservation_cancelled', 'reservation_expired',
  'proof_uploaded', 'proof_approved', 'proof_rejected',
  'payment_declined', 'payment_refund', 'balance_paid', 'balance_overdue', 'email_failed',
  'channel_conflict', 'channel_moved', 'channel_sync_failed',
  'booking_pending', 'booking_modified', 'booking_cancelled', 'booking_failed'
));

-- Al crear la reserva de una fila de la bandeja (el panel la asigna), la fila queda enlazada.
create function public.link_booking_inbox() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.external_ref like 'ayenda:%' then
    update public.booking_inbox set status = 'assigned', reservation_code = new.code
    where ref = substr(new.external_ref, 8) and status = 'pending';
  end if;
  return null;
end;
$$;
revoke execute on function public.link_booking_inbox() from public, anon, authenticated;

create trigger reservations_link_booking after insert on public.reservations
  for each row execute function public.link_booking_inbox();

-- ───────────── Aplicar un correo ─────────────
-- Un correo que no se entendió llega solo con p_error (los datos de la reserva quedan en null).
create function public.apply_booking_email(
  p_message_id text,
  p_received_at timestamptz,
  p_quiet boolean,
  p_kind text default null,
  p_ref text default null,
  p_guest text default null,
  p_email text default null,
  p_phone text default null,
  p_check_in date default null,
  p_check_out date default null,
  p_total integer default null,
  p_error text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'America/Bogota')::date;
  item public.booking_inbox;
  res public.reservations;
  stay text := to_char(p_check_in, 'DD/MM') || ' → ' || to_char(p_check_out, 'DD/MM');
  money text := replace(to_char(coalesce(p_total, 0), 'FM999,999,999'), ',', '.');
  nights integer := p_check_out - p_check_in;
  deposit integer;
  outcome text := 'applied';
  v_detail text := '';
begin
  -- Cada correo una sola vez (también si QA y producción leen el mismo buzón a la vez: cada base tiene su registro).
  insert into public.booking_emails (message_id, ref, kind, received_at, result)
  values (p_message_id, p_ref, p_kind, p_received_at, 'applied')
  on conflict (message_id) do nothing;
  if not found then return 'duplicate'; end if;

  if p_error is not null then
    update public.booking_emails set result = 'unreadable', detail = left(p_error, 400) where message_id = p_message_id;
    insert into public.admin_notifications (kind, title, body)
    values ('booking_failed', 'Correo de Booking sin leer', left('Llegó un correo de Ayenda que el panel no entendió (' || p_error || '). Revísalo en el correo y regístralo a mano.', 400));
    outcome := 'unreadable';
  else
    select * into item from public.booking_inbox where ref = p_ref for update;
    if item.ref is not null and p_received_at < item.last_email_at then
      outcome := 'stale';
    elsif item.ref is null and p_check_out < today then
      outcome := 'past';
    elsif p_kind = 'cancelled' then
      if item.ref is null then
        insert into public.booking_inbox (ref, status, guest_full_name, guest_email, guest_phone, check_in, check_out, total, last_email_at)
        values (p_ref, 'cancelled', p_guest, p_email, p_phone, p_check_in, p_check_out, p_total, p_received_at);
      else
        update public.booking_inbox set status = case when status = 'assigned' then status else 'cancelled' end, last_email_at = p_received_at
        where ref = p_ref;
        if item.status = 'pending' then
          insert into public.admin_notifications (kind, title, body)
          values ('booking_cancelled', left('Booking canceló · ' || p_guest, 160), left(stay || ' · sin cabaña asignada, no hay nada que liberar', 400));
        end if;
        if item.status = 'assigned' and item.reservation_code is not null then
          -- El aviso de la cancelación lo crea notify_reservation_change.
          update public.reservations set status = 'cancelled'
          where code = item.reservation_code and status in ('pending_deposit', 'confirmed', 'rescheduled');
        end if;
      end if;
    elsif item.ref is null then
      -- Nueva, o una modificación de una reserva cuyo correo de «nueva» no se leyó: entra por asignar.
      insert into public.booking_inbox (ref, guest_full_name, guest_email, guest_phone, check_in, check_out, total, last_email_at)
      values (p_ref, p_guest, p_email, p_phone, p_check_in, p_check_out, p_total, p_received_at);
      insert into public.admin_notifications (kind, title, body)
      values ('booking_pending', left('Reserva de Booking por asignar · ' || p_guest, 160), left(stay || ' · $' || money || ' · elige la cabaña en Booking', 400));
    elsif p_kind = 'new' then
      -- Un «nueva» repetido: solo se actualizan los datos.
      update public.booking_inbox set guest_full_name = p_guest, guest_email = p_email, guest_phone = p_phone,
        check_in = p_check_in, check_out = p_check_out, total = p_total, last_email_at = p_received_at
      where ref = p_ref;
    else
      -- Modificación.
      update public.booking_inbox set guest_full_name = p_guest, guest_email = p_email, guest_phone = p_phone,
        check_in = p_check_in, check_out = p_check_out, total = p_total, last_email_at = p_received_at,
        status = case when status in ('cancelled', 'dismissed') then 'pending' else status end
      where ref = p_ref;
      if item.status = 'assigned' and item.reservation_code is not null then
        select * into res from public.reservations where code = item.reservation_code;
        if res.status in ('pending_deposit', 'confirmed', 'rescheduled')
           and (res.check_in, res.check_out, (res.quote ->> 'total')::integer) is distinct from (p_check_in, p_check_out, p_total) then
          select round(p_total * s.deposit_pct / 100.0)::integer into deposit from public.site_settings s limit 1;
          deposit := coalesce(deposit, round(p_total * 0.3)::integer);
          begin
            update public.reservations set
              check_in = p_check_in,
              check_out = p_check_out,
              quote = res.quote || jsonb_build_object('base', p_total, 'total', p_total, 'deposit', deposit, 'balance', p_total - deposit,
                                                      'pricePerNight', round(p_total::numeric / nights)::integer, 'nights', nights)
            where code = res.code;
            insert into public.admin_notifications (kind, title, body, reservation_code)
            values ('booking_modified', left('Booking modificó · ' || p_guest, 160), left(stay || ' · $' || money || ' · ' || res.code, 400), res.code);
          exception when exclusion_violation then
            outcome := 'failed';
            v_detail := 'Las fechas nuevas chocan con otra reserva en esa cabaña.';
            insert into public.admin_notifications (kind, title, body, reservation_code)
            values ('booking_failed', left('Booking cambió fechas que están ocupadas · ' || p_guest, 160),
                    left('Las fechas nuevas (' || stay || ') chocan con otra reserva en esa cabaña. Cámbiala de cabaña o de fechas en ' || res.code || '.', 400), res.code);
          end;
        end if;
      else
        insert into public.admin_notifications (kind, title, body)
        values ('booking_modified', left('Booking modificó · ' || p_guest, 160),
                left(stay || ' · $' || money || case when item.status = 'pending' then ' · sigue por asignar' else ' · vuelve a estar por asignar' end, 400));
      end if;
    end if;

    update public.booking_emails set result = outcome, detail = v_detail where message_id = p_message_id;
  end if;

  -- now() es el mismo en toda la transacción: son exactamente los avisos de este correo.
  if p_quiet then
    update public.admin_notifications set pushed_at = now() where created_at = now() and pushed_at is null;
  end if;
  return outcome;
end;
$$;
revoke execute on function public.apply_booking_email(text, timestamptz, boolean, text, text, text, text, text, date, date, integer, text) from public, anon, authenticated;
grant execute on function public.apply_booking_email(text, timestamptz, boolean, text, text, text, text, text, date, date, integer, text) to service_role;

-- ───────────── Lectura periódica ─────────────
-- Aviso a la app para que lea el buzón (la misma URL base que el despacho de push, guardada en Vault).
create function public.request_booking_mail_sync() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text;
begin
  select replace(decrypted_secret, '/api/push/dispatch', '/api/booking/mail') into url
  from vault.decrypted_secrets where name = 'push_dispatch_url' limit 1;
  if url is null or url not like '%/api/booking/mail' then return; end if;
  perform net.http_post(url := url, body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 5000);
exception when others then
  return;
end;
$$;
revoke execute on function public.request_booking_mail_sync() from public, anon, authenticated;

select cron.schedule('correos-de-booking', '*/2 * * * *', $$select public.request_booking_mail_sync()$$);
