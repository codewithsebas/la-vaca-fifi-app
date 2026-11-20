-- Quita el cierre automático de estadías (20261120000000), por decisión del responsable (20 de noviembre de 2026), y
-- deshace lo que alcanzó a hacer: las reservas vuelven a como estaban antes de que el sistema las cerrara.
--
-- · Se borran los pagos «sin confirmar» (provider 'auto') y se descuentan de lo pagado.
-- · El abono y el saldo que el cierre marcó (con la hora del cierre) vuelven a quedar sin pagar; el check-in que puso (con la
--   hora de llegada) se quita. Lo que ya estaba registrado antes no se toca.
-- · La reserva vuelve a «Confirmada» o, si tenía un check-in registrado por el equipo, a «En estadía». (Una reprogramada
--   queda «Confirmada»: el cierre no guardaba el estado anterior.)
-- · Se borran los avisos «auto_closed».
-- · run_auto_checkouts, notify_reservation_change y enqueue_reservation_emails vuelven a sus versiones anteriores
--   (20261105050000 y 20261105020000), y se quitan auto_closing(), reservations.auto_closed_at, el proveedor 'auto' y el
--   tipo de aviso 'auto_closed'.
--
-- Deshacer no escribe al huésped ni deja avisos: ningún cambio pasa a cancelada, vencida ni a saldo pagado.
-- Se conserva de 20261120000000 el canal «Booking.com» de las reservas de la bandeja.

-- ───────────── Funciones anteriores ─────────────
create or replace function public.run_auto_checkouts() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  out_time time := coalesce((select s.check_out_time from public.site_settings s limit 1), '12:00'::time);
  local_now timestamp := now() at time zone 'America/Bogota';
  n integer;
begin
  update public.reservations r
     set status = 'completed'
   where r.status = 'checked_in'
     and (r.balance_paid_at is not null or r.paid_amount >= (r.quote ->> 'total')::integer)
     and local_now >= r.check_out + out_time + interval '30 minutes';
  get diagnostics n = row_count;

  -- Las que quedan «En estadía» por el saldo: un aviso por reserva.
  insert into public.admin_notifications (kind, title, body, reservation_code)
  select 'checkout_pending',
         left('Check-out pendiente · ' || r.guest_full_name, 160),
         left(coalesce(c.nombre, r.cabin_type_id) || ' · ' || r.code || ' · saldo por cobrar $' ||
              replace(to_char((r.quote ->> 'total')::integer - r.paid_amount, 'FM999,999,999'), ',', '.') ||
              '. Regístralo y marca el check-out.', 400),
         r.code
    from public.reservations r
    left join public.cabin_types c on c.id = r.cabin_type_id
   where r.status = 'checked_in'
     and local_now >= r.check_out + out_time + interval '30 minutes'
     and not exists (select 1 from public.admin_notifications a where a.kind = 'checkout_pending' and a.reservation_code = r.code);
  return n;
end;
$$;
revoke execute on function public.run_auto_checkouts() from public, anon, authenticated;
grant execute on function public.run_auto_checkouts() to service_role;

create or replace function public.notify_reservation_change() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  seen timestamptz := case when auth.uid() is null then null else now() end;
  cabins integer := case when new.group_code is null then 1
                         else (select count(*) from public.reservations g where g.group_code = new.group_code) end;
  cabin text := case when cabins > 1 then cabins || ' cabañas'
                     else coalesce((select c.nombre from public.cabin_types c where c.id = new.cabin_type_id), new.cabin_type_id) end;
  stay text := to_char(new.check_in, 'DD/MM') || ' → ' || to_char(new.check_out, 'DD/MM');
  money text;
  paid integer := case when new.group_code is null then new.paid_amount
                       else (select sum(g.paid_amount) from public.reservations g where g.group_code = new.group_code) end;
  confirming boolean := false;
begin
  if tg_op = 'INSERT' then return new; end if;
  -- Un grupo avisa una vez, por la principal.
  if new.group_code is not null and new.group_code <> new.code then return new; end if;
  if new.status is distinct from old.status then
    if new.status = 'confirmed' and old.status in ('pending_deposit', 'expired') then
      confirming := true;
      money := replace(to_char(paid, 'FM999,999,999'), ',', '.');
      insert into public.admin_notifications (kind, title, body, reservation_code, read_at)
      values ('reservation_confirmed', left('Nueva reserva confirmada · ' || new.guest_full_name, 160),
              left(cabin || ' · ' || stay || ' · ' || new.code || case when new.balance_paid_at is not null then ' · pago total $' else ' · abono $' end || money, 400), new.code, seen);
    elsif new.status = 'cancelled' then
      insert into public.admin_notifications (kind, title, body, reservation_code, read_at)
      values ('reservation_cancelled', 'Reserva cancelada · ' || new.code, left(new.guest_full_name || ' · ' || cabin || ' · ' || stay, 400), new.code, seen);
    end if;
  end if;
  if new.balance_paid_at is not null and old.balance_paid_at is null and not confirming then
    money := replace(to_char(paid, 'FM999,999,999'), ',', '.');
    insert into public.admin_notifications (kind, title, body, reservation_code, read_at)
    values ('balance_paid', 'Saldo pagado · ' || new.code,
            left(new.guest_full_name || ' · ' || cabin || ' · total pagado $' || money || case when new.status = 'checked_in' then '. Ya puedes hacer el check-out.' else '. Pagado antes de llegar.' end, 400), new.code, seen);
  end if;
  return new;
end;
$$;

create or replace function public.enqueue_reservation_emails() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_email boolean := position('@' in coalesce(new.guest_email, '')) > 1 and length(new.guest_email) between 3 and 160;
  -- En un grupo solo escribe la principal; el pago total del grupo lo encola register_manual_payment.
  in_group boolean := new.group_code is not null;
  principal boolean := new.group_code is null or new.group_code = new.code;
begin
  if new.source = 'import' or not has_email then return null; end if;
  if tg_op = 'INSERT' then
    if new.status = 'pending_deposit' and principal then
      insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email)
      values ('reserva-recibida:' || new.code, 'reservation_received', new.code, new.guest_email)
      on conflict (dedupe_key) do nothing;
    end if;
    return null;
  end if;

  if new.status is distinct from old.status and new.status in ('cancelled', 'expired') and principal then
    insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email)
    values (
      case new.status when 'cancelled' then 'reserva-cancelada:' else 'reserva-vencida:' end || new.code,
      case new.status when 'cancelled' then 'reservation_cancelled' else 'reservation_expired' end,
      new.code,
      new.guest_email
    )
    on conflict (dedupe_key) do nothing;
  end if;

  if new.balance_paid_at is not null and old.balance_paid_at is null and old.deposit_paid_at is not null and not in_group then
    insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email)
    values ('pago-total:' || new.code || ':' || new.paid_amount, 'balance_paid', new.code, new.guest_email)
    on conflict (dedupe_key) do nothing;
  end if;

  -- now() es fijo en la transacción: un cambio de fechas de todo el grupo deja un solo correo, con el código principal.
  if (new.check_in, new.check_out) is distinct from (old.check_in, old.check_out) then
    insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email, payload)
    values (
      'reprogramada:' || coalesce(new.group_code, new.code) || ':' || extract(epoch from now()),
      'reservation_rescheduled',
      coalesce(new.group_code, new.code),
      new.guest_email,
      jsonb_build_object('checkInAnterior', old.check_in, 'checkOutAnterior', old.check_out, 'checkIn', new.check_in, 'checkOut', new.check_out)
    )
    on conflict (dedupe_key) do nothing;
  end if;
  return null;
end;
$$;

drop function public.auto_closing();

-- ───────────── Deshacer los cierres ─────────────
-- closed_at: la hora que el cierre puso en el abono, el saldo y su pago (la salida a la hora de check-out); arrived_at: la del
-- check-in que puso (la llegada a la hora de inicio del check-in).
create temporary table undo_auto_close on commit drop as
select r.code,
       coalesce((select sum(p.amount) from public.payments p where p.reservation_code = r.code and p.provider = 'auto'), 0)::integer as auto_amount,
       coalesce((select min(p.approved_at) from public.payments p where p.reservation_code = r.code and p.provider = 'auto'),
                (r.check_out + s.check_out_time) at time zone 'America/Bogota') as closed_at,
       (r.check_in + s.check_in_start) at time zone 'America/Bogota' as arrived_at,
       r.checked_in_at
  from public.reservations r
 cross join (select check_out_time, check_in_start from public.site_settings limit 1) s
 where r.auto_closed_at is not null;

delete from public.payments where provider = 'auto';

update public.reservations r
   set paid_amount = r.paid_amount - u.auto_amount,
       deposit_paid_at = case when r.deposit_paid_at = u.closed_at then null else r.deposit_paid_at end,
       balance_paid_at = case when r.balance_paid_at = u.closed_at then null else r.balance_paid_at end,
       checked_in_at = case when r.checked_in_at = u.arrived_at then null else r.checked_in_at end,
       status = case when r.checked_in_at is null or r.checked_in_at = u.arrived_at then 'confirmed' else 'checked_in' end::public.reservation_status
  from undo_auto_close u
 where r.code = u.code;

-- Al pasar a «En estadía», reservation_payment_rules pone checked_in_at = now(): se devuelve la hora real del check-in.
update public.reservations r
   set checked_in_at = u.checked_in_at
  from undo_auto_close u
 where r.code = u.code and r.status = 'checked_in' and r.checked_in_at is distinct from u.checked_in_at;

delete from public.admin_notifications where kind = 'auto_closed';

-- ───────────── Columna y restricciones ─────────────
alter table public.reservations drop column auto_closed_at;

alter table public.payments drop constraint payments_provider_check;
alter table public.payments add constraint payments_provider_check check (provider in ('wompi', 'simulado', 'manual'));

alter table public.admin_notifications drop constraint admin_notifications_kind_check;
alter table public.admin_notifications add constraint admin_notifications_kind_check check (kind in (
  'reservation_created', 'reservation_confirmed', 'reservation_cancelled', 'reservation_expired',
  'proof_uploaded', 'proof_approved', 'proof_rejected',
  'payment_declined', 'payment_refund', 'balance_paid', 'balance_overdue', 'email_failed',
  'channel_conflict', 'channel_moved', 'channel_cancelled', 'channel_sync_failed',
  'booking_pending', 'booking_modified', 'booking_cancelled', 'booking_failed',
  'checkout_pending', 'reservation_moved'
));
