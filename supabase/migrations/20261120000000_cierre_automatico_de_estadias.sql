-- Cierre automático de estadías (decisión del responsable, 19 de noviembre de 2026).
--
-- Quien maneja el panel a veces olvida registrar el check-in, el pago del saldo o el check-out, y la reserva se queda
-- «Confirmada» o «En estadía» para siempre. Desde ahora, a la hora del check-out automático (30 minutos después de la hora
-- de salida del día de salida), toda reserva confirmada, reprogramada o con check-in se cierra sola:
--
-- · Si no tenía check-in, queda con la hora de llegada de ese día (checked_in_at).
-- · Si le faltaba dinero, se registra un pago por lo que faltaba con provider 'auto' («sin confirmar»): se da por pagado.
-- · Queda «Completada» y con auto_closed_at, para distinguirla en el panel de las que cerró una persona.
--
-- No escribe al huésped (sería un correo de «pago total» de una estadía que ya terminó) ni manda un aviso por reserva:
-- deja un solo aviso «auto_closed» por pasada. Las reservas sin abono siguen venciendo al final de su día de llegada.
-- Reemplaza el aviso «checkout_pending» (la estadía ya no queda abierta por el saldo).
--
-- También: las reservas de Booking asignadas desde la bandeja de correo guardaban el canal «Booking» y no «Booking.com»,
-- y el panel no las reconocía como de Booking.

-- ───────────── Columnas ─────────────
alter table public.reservations add column auto_closed_at timestamptz;
comment on column public.reservations.auto_closed_at is 'Cuándo la cerró el sistema por haber pasado la fecha de salida sin check-out.';

alter table public.payments drop constraint payments_provider_check;
alter table public.payments add constraint payments_provider_check check (provider in ('wompi', 'simulado', 'manual', 'auto'));

alter table public.admin_notifications drop constraint admin_notifications_kind_check;
alter table public.admin_notifications add constraint admin_notifications_kind_check check (kind in (
  'reservation_created', 'reservation_confirmed', 'reservation_cancelled', 'reservation_expired',
  'proof_uploaded', 'proof_approved', 'proof_rejected',
  'payment_declined', 'payment_refund', 'balance_paid', 'balance_overdue', 'email_failed',
  'channel_conflict', 'channel_moved', 'channel_cancelled', 'channel_sync_failed',
  'booking_pending', 'booking_modified', 'booking_cancelled', 'booking_failed',
  'checkout_pending', 'reservation_moved', 'auto_closed'
));

-- ───────────── Sin correos ni avisos por reserva durante el cierre ─────────────
-- run_auto_checkouts marca la transacción con app.auto_close = 'on'.
create or replace function public.auto_closing() returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('app.auto_close', true), '') = 'on'
$$;

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
  -- El cierre automático deja un solo aviso por pasada (run_auto_checkouts).
  if public.auto_closing() then return new; end if;
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
  -- El cierre automático es de estadías que ya terminaron: no se le escribe al huésped.
  if public.auto_closing() then return null; end if;
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

-- ───────────── Cierre automático ─────────────
-- La corre el cron «check-out-automatico» cada 5 minutos (migración 20261105040000). Devuelve cuántas cerró.
create or replace function public.run_auto_checkouts() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  out_time time := coalesce((select s.check_out_time from public.site_settings s limit 1), '12:00'::time);
  in_time time := coalesce((select s.check_in_start from public.site_settings s limit 1), '15:00'::time);
  local_now timestamp := now() at time zone 'America/Bogota';
  n integer := 0;
  filled integer := 0;
  money bigint := 0;
  one text;
begin
  perform set_config('app.auto_close', 'on', true);

  -- Bloqueo primero: un pago registrado desde el panel al mismo tiempo espera y no se cobra dos veces.
  perform 1
     from public.reservations r
    where r.status in ('confirmed', 'rescheduled', 'checked_in')
      and local_now >= r.check_out + out_time + interval '30 minutes'
      for update;

  create temporary table auto_close_due on commit drop as
  select r.code,
         r.guest_full_name,
         greatest((r.quote ->> 'total')::integer - r.paid_amount, 0) as owed,
         r.deposit_paid_at,
         ((r.check_out + out_time) at time zone 'America/Bogota') as closed_at,
         ((r.check_in + in_time) at time zone 'America/Bogota') as arrived_at
    from public.reservations r
   where r.status in ('confirmed', 'rescheduled', 'checked_in')
     and local_now >= r.check_out + out_time + interval '30 minutes'
   order by r.code;

  select count(*), count(*) filter (where owed > 0), coalesce(sum(owed), 0), min(code)
    into n, filled, money, one
    from auto_close_due;
  if n = 0 then
    drop table auto_close_due;
    perform set_config('app.auto_close', 'off', true);
    return 0;
  end if;

  -- Lo que faltaba, como un pago «sin confirmar» del día de salida.
  insert into public.payments (reference, reservation_code, kind, amount, provider, status, status_detail, approved_at)
  select d.code || '-' || case when d.deposit_paid_at is null then 'T' else 'S' end || '-AUTO',
         d.code,
         case when d.deposit_paid_at is null then 'full' else 'balance' end::public.payment_kind,
         d.owed,
         'auto',
         'approved',
         'Registrado automáticamente al cerrar la estadía (sin confirmar)',
         d.closed_at
    from auto_close_due d
   where d.owed > 0
  on conflict (reference) do nothing;

  update public.reservations r
     set paid_amount = r.paid_amount + d.owed,
         deposit_paid_at = coalesce(r.deposit_paid_at, d.closed_at),
         balance_paid_at = coalesce(r.balance_paid_at, d.closed_at),
         checked_in_at = coalesce(r.checked_in_at, d.arrived_at),
         status = 'completed',
         auto_closed_at = now()
    from auto_close_due d
   where r.code = d.code;

  insert into public.admin_notifications (kind, title, body, reservation_code)
  values (
    'auto_closed',
    case when n = 1 then 'Estadía cerrada automáticamente · ' || one
         else 'Se cerraron ' || n || ' estadías automáticamente' end,
    left(
      'Pasó la fecha de salida sin check-out.' ||
      case when filled > 0
           then ' Se dio por pagado $' || replace(to_char(money, 'FM999,999,999,999'), ',', '.') ||
                case when filled = 1 then ' de 1 reserva' else ' de ' || filled || ' reservas' end ||
                ' (sin confirmar). Revísalo en Pagos.'
           else ' Ya estaban pagadas.' end,
      400),
    case when n = 1 then one end
  );

  drop table auto_close_due;
  perform set_config('app.auto_close', 'off', true);
  return n;
end;
$$;
revoke execute on function public.run_auto_checkouts() from public, anon, authenticated;
grant execute on function public.run_auto_checkouts() to service_role;
-- auto_closing() queda ejecutable por todos: la llama notify_reservation_change, que corre con el rol de quien escribe.

-- ───────────── Canal de Booking ─────────────
update public.reservations set channel = 'Booking.com' where source = 'import' and channel = 'Booking';
