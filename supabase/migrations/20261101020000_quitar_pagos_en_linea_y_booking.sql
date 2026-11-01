-- Se retiran los pagos en línea (Wompi y la pasarela simulada) y la sincronización con Booking.com (iCal y Beds24).
-- Los pagos los registra el equipo (register_manual_payment) y el plazo del abono sigue vigente (run_payment_deadlines).
--
-- Se conserva: la tabla payments (historial de pagos, también los aprobados por la pasarela antes de este cambio),
-- payment_proofs, el plazo del abono (deposit_due_at y el cron plazos-de-pago) y los tipos de aviso antiguos en
-- admin_notifications (los avisos ya guardados siguen siendo válidos).
--
-- Se elimina: payment_transactions, start_payment, settle_payment, el aviso de pagos rechazados o por reembolsar
-- (payments.needs_refund), el enlace de pago (reservations.pay_token), el plazo de una hora para pagar el saldo en línea
-- (balance_due_at, balance_overdue_at) y todo lo de canales (tablas channel_*, triggers, cron y secretos de Vault).

-- ───────────── Booking.com ─────────────
select cron.unschedule(jobid) from cron.job where jobname = 'sincronizar-canales';

drop trigger if exists reservations_channel_changes on public.reservations;
drop trigger if exists blocks_channel_changes on public.blocks;
drop function if exists public.channel_changes();
drop function if exists public.request_channel_sync(text);

do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'channel_stays') then
    alter publication supabase_realtime drop table public.channel_stays;
  end if;
end;
$$;

drop table if exists public.channel_bookings;
drop table if exists public.channel_stays;
drop table if exists public.channel_credentials;
drop table if exists public.channel_calendars;

delete from vault.secrets where name in ('channel_sync_url', 'channel_sync_secret');

-- La disponibilidad en tiempo real ya no recibe fechas de Booking.
create or replace function public.broadcast_availability() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active text[] := array['pending_deposit', 'confirmed', 'rescheduled', 'checked_in'];
  cabin text;
  first_night date;
  last_night date;
begin
  if tg_table_name = 'reservations' then
    if tg_op = 'INSERT' then
      if not (new.status::text = any (active)) then return null; end if;
      cabin := new.cabin_type_id;
      first_night := new.check_in;
      last_night := new.check_out - 1;
    elsif tg_op = 'DELETE' then
      if not (old.status::text = any (active)) then return null; end if;
      cabin := old.cabin_type_id;
      first_night := old.check_in;
      last_night := old.check_out - 1;
    else
      -- Solo cambia la ocupación si la reserva entra o sale de los estados activos, o si cambian sus fechas, unidad o cabaña.
      if not (old.status::text = any (active)) and not (new.status::text = any (active)) then return null; end if;
      if (old.status::text = any (active)) and (new.status::text = any (active))
         and new.check_in = old.check_in and new.check_out = old.check_out and new.unit = old.unit and new.cabin_type_id = old.cabin_type_id then
        return null;
      end if;
      cabin := case when new.cabin_type_id = old.cabin_type_id then new.cabin_type_id end;
      first_night := least(old.check_in, new.check_in);
      last_night := greatest(old.check_out, new.check_out) - 1;
    end if;
  elsif tg_table_name = 'blocks' then
    if tg_op = 'INSERT' then
      cabin := new.cabin_type_id;
      first_night := new.from_date;
      last_night := new.to_date;
    elsif tg_op = 'DELETE' then
      cabin := old.cabin_type_id;
      first_night := old.from_date;
      last_night := old.to_date;
    else
      cabin := case when new.cabin_type_id = old.cabin_type_id then new.cabin_type_id end;
      first_night := least(old.from_date, new.from_date);
      last_night := greatest(old.to_date, new.to_date);
    end if;
  else
    -- cabin_types: nueva cabaña, eliminada, cambio de unidades o activada/desactivada (todas sus fechas).
    if tg_op = 'UPDATE' and new.units = old.units and new.activa = old.activa then return null; end if;
    cabin := case when tg_op = 'DELETE' then old.id else new.id end;
  end if;
  perform realtime.send(
    jsonb_build_object('cabinTypeId', cabin, 'from', first_night, 'to', last_night),
    'availability_changed',
    'availability',
    false
  );
  return null;
end;
$$;

revoke execute on function public.broadcast_availability() from public, anon, authenticated;

-- ───────────── Pagos en línea ─────────────
drop function if exists public.settle_payment(text, text, public.payment_status, text, text);
drop function if exists public.start_payment(text, public.payment_kind, text, text);
drop table if exists public.payment_transactions;

drop trigger if exists payments_notify on public.payments;
drop function if exists public.notify_payment_change();
alter table public.payments drop column if exists needs_refund;

drop index if exists public.reservations_pay_token_key;
alter table public.reservations drop column if exists pay_token;

-- Los triggers que nombran las columnas del saldo en línea se recrean antes de quitarlas.
drop trigger if exists reservations_notify on public.reservations;
drop trigger if exists reservations_broadcast_change on public.reservations;

-- Reglas de pago: el check-in ya no abre un plazo para pagar el saldo en línea.
create or replace function public.reservation_payment_rules() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  total integer := (new.quote ->> 'total')::integer;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending_deposit' or new.deposit_paid_at is not null or new.paid_amount <> 0 then
      raise exception 'NEW_RESERVATION_MUST_BE_PENDING' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'confirmed' and old.status in ('pending_deposit', 'expired') and new.deposit_paid_at is null then
      raise exception 'DEPOSIT_REQUIRED' using errcode = 'P0001';
    end if;
    if new.status = 'checked_in' then
      new.checked_in_at := now();
    end if;
    if new.status = 'completed' and new.balance_paid_at is null and new.paid_amount < total then
      raise exception 'BALANCE_PENDING' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- Plazo del abono: las retenciones sin abono se liberan al vencer.
create or replace function public.run_payment_deadlines() returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reservations set status = 'expired'
    where status = 'pending_deposit' and deposit_due_at < now();
end;
$$;

revoke execute on function public.run_payment_deadlines() from public, anon, authenticated;
grant execute on function public.run_payment_deadlines() to service_role;

-- Avisos de reservas: sin el aviso de saldo vencido.
create or replace function public.notify_reservation_change() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  seen timestamptz := case when auth.uid() is null then null else now() end;
  cabin text := coalesce((select c.nombre from public.cabin_types c where c.id = new.cabin_type_id), new.cabin_type_id);
  stay text := to_char(new.check_in, 'DD/MM') || ' → ' || to_char(new.check_out, 'DD/MM');
  money text;
  confirming boolean := false;
begin
  if tg_op = 'INSERT' then return new; end if;
  if new.status is distinct from old.status then
    if new.status = 'confirmed' and old.status in ('pending_deposit', 'expired') then
      confirming := true;
      money := replace(to_char(new.paid_amount, 'FM999,999,999'), ',', '.');
      insert into public.admin_notifications (kind, title, body, reservation_code, read_at)
      values ('reservation_confirmed', left('Nueva reserva confirmada · ' || new.guest_full_name, 160),
              left(cabin || ' · ' || stay || ' · ' || new.code || case when new.balance_paid_at is not null then ' · pago total $' else ' · abono $' end || money, 400), new.code, seen);
    elsif new.status = 'cancelled' then
      insert into public.admin_notifications (kind, title, body, reservation_code, read_at)
      values ('reservation_cancelled', 'Reserva cancelada · ' || new.code, left(new.guest_full_name || ' · ' || cabin || ' · ' || stay, 400), new.code, seen);
    end if;
  end if;
  if new.balance_paid_at is not null and old.balance_paid_at is null and not confirming then
    money := replace(to_char(new.paid_amount, 'FM999,999,999'), ',', '.');
    insert into public.admin_notifications (kind, title, body, reservation_code, read_at)
    values ('balance_paid', 'Saldo pagado · ' || new.code,
            left(new.guest_full_name || ' · ' || cabin || ' · total pagado $' || money || case when new.status = 'checked_in' then '. Ya puedes hacer el check-out.' else '. Pagado antes de llegar.' end, 400), new.code, seen);
  end if;
  return new;
end;
$$;

alter table public.reservations
  drop column if exists balance_due_at,
  drop column if exists balance_overdue_at;

create trigger reservations_notify after insert or update of status, balance_paid_at on public.reservations
  for each row execute function public.notify_reservation_change();

create trigger reservations_broadcast_change
  after update on public.reservations
  for each row
  when (old.status is distinct from new.status
        or old.check_in is distinct from new.check_in
        or old.check_out is distinct from new.check_out
        or old.cabin_type_id is distinct from new.cabin_type_id
        or old.quote is distinct from new.quote
        or old.deposit_due_at is distinct from new.deposit_due_at
        or old.paid_amount is distinct from new.paid_amount)
  execute function public.broadcast_reservation_change();
