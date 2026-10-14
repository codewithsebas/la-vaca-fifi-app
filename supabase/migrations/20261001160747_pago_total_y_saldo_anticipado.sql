-- Pago total y saldo anticipado.
-- · kind 'full': paga toda la estadía de una vez; confirma la reserva y deja el saldo en cero (mismas reglas que el abono).
-- · El saldo ya se puede pagar antes del check-in, sin plazo. Después del check-in sigue la hora límite.

create or replace function public.apply_approved_payment(p_payment_id uuid) returns text
language plpgsql
set search_path = ''
as $$
declare
  p public.payments;
  r public.reservations;
begin
  select * into p from public.payments where id = p_payment_id;
  select * into r from public.reservations where code = p.reservation_code for update;
  if p.kind in ('deposit', 'full') then
    if r.deposit_paid_at is not null then return 'duplicate'; end if;
    if r.status not in ('pending_deposit', 'expired') then return 'not_applicable'; end if;
    begin
      -- Una retención que venció pudo perder sus fechas: la restricción de exclusión impide la doble reserva.
      update public.reservations
        set status = 'confirmed',
            deposit_paid_at = now(),
            balance_paid_at = case when p.kind = 'full' then now() else balance_paid_at end,
            paid_amount = paid_amount + p.amount
        where code = r.code;
    exception when exclusion_violation then
      return 'no_availability';
    end;
    insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email)
    values ('reserva-confirmada:' || r.code, 'reservation_confirmed', r.code, r.guest_email)
    on conflict (dedupe_key) do nothing;
    -- Las demás ventanas de pago para confirmar (abono o total) ya no hacen falta.
    update public.payments set status = 'expired', status_detail = 'Ya no es necesario: el pago se completó con otro intento'
      where reservation_code = r.code and kind in ('deposit', 'full') and status = 'initiated' and id <> p.id;
    return 'confirmed';
  end if;
  if r.balance_paid_at is not null or r.paid_amount >= (r.quote ->> 'total')::integer then return 'duplicate'; end if;
  if r.status not in ('confirmed', 'rescheduled', 'checked_in') then return 'not_applicable'; end if;
  update public.reservations set balance_paid_at = now(), paid_amount = paid_amount + p.amount where code = r.code;
  update public.payments set status = 'expired', status_detail = 'Ya no es necesario: el pago se completó con otro intento'
    where reservation_code = r.code and kind = 'balance' and status = 'initiated' and id <> p.id;
  return 'balance_paid';
end;
$$;

create or replace function public.start_payment(p_code text, p_kind public.payment_kind, p_provider text, p_reference text)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reservations;
  p public.payments;
  total integer;
  amt integer;
  v_until timestamptz;
  confirming boolean := p_kind in ('deposit', 'full');
begin
  select * into r from public.reservations where code = p_code for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  total := (r.quote ->> 'total')::integer;
  -- Si la pasarela ya procesa un pago de la misma etapa (abono o total; o saldo), no se abre otro: no se cobra dos veces.
  if exists (
    select 1 from public.payments
    where reservation_code = r.code and status = 'pending'
      and (kind = p_kind or (confirming and kind in ('deposit', 'full')))
  ) then
    raise exception 'PAYMENT_IN_PROGRESS' using errcode = 'P0001';
  end if;
  if confirming then
    if r.deposit_paid_at is not null then raise exception 'ALREADY_PAID' using errcode = 'P0001'; end if;
    if r.status <> 'pending_deposit' then raise exception 'NOT_PAYABLE' using errcode = 'P0001'; end if;
    if r.deposit_due_at < now() + interval '1 minute' then raise exception 'HOLD_EXPIRED' using errcode = 'P0001'; end if;
    amt := case p_kind when 'full' then total else (r.quote ->> 'deposit')::integer end;
    v_until := r.deposit_due_at;
  else
    if r.status not in ('confirmed', 'rescheduled', 'checked_in') then raise exception 'NOT_PAYABLE' using errcode = 'P0001'; end if;
    if r.balance_paid_at is not null or r.paid_amount >= total then raise exception 'ALREADY_PAID' using errcode = 'P0001'; end if;
    if r.status = 'checked_in' then
      -- Después del check-in: solo dentro de la hora límite.
      if r.balance_overdue_at is not null or r.balance_due_at is null or r.balance_due_at < now() + interval '30 seconds' then
        raise exception 'BALANCE_DEADLINE_PASSED' using errcode = 'P0001';
      end if;
      v_until := r.balance_due_at;
    else
      -- Antes del check-in el saldo se puede pagar cuando quiera; cada ventana de pago dura una hora.
      v_until := now() + interval '1 hour';
    end if;
    amt := total - r.paid_amount;
  end if;
  -- Un intento nuevo reemplaza al anterior de la misma etapa que no se completó (el huésped volvió a abrir el pago).
  update public.payments set status = 'expired', status_detail = 'Reemplazado por un nuevo intento de pago'
    where reservation_code = r.code and status = 'initiated'
      and (kind = p_kind or (confirming and kind in ('deposit', 'full')));
  insert into public.payments (reference, reservation_code, kind, amount, provider, expires_at)
  values (p_reference, r.code, p_kind, amt, p_provider, v_until)
  returning * into p;
  return p;
end;
$$;

create or replace function public.register_manual_payment(p_code text, p_kind public.payment_kind, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reservations;
  amt integer;
  pid uuid;
  outcome text;
begin
  if coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') <> 'admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into r from public.reservations where code = p_code for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  amt := case p_kind when 'deposit' then (r.quote ->> 'deposit')::integer else (r.quote ->> 'total')::integer - r.paid_amount end;
  if amt <= 0 then raise exception 'ALREADY_PAID' using errcode = 'P0001'; end if;
  insert into public.payments (reference, reservation_code, kind, amount, provider, status, status_detail, approved_at)
  values (
    r.code || '-' || case p_kind when 'deposit' then 'A' when 'full' then 'T' else 'S' end || '-M' || upper(substr(md5(gen_random_uuid()::text), 1, 6)),
    r.code, p_kind, amt, 'manual', 'approved', left(coalesce(nullif(trim(p_note), ''), 'Registrado por el equipo'), 300), now()
  )
  returning id into pid;
  outcome := public.apply_approved_payment(pid);
  if outcome not in ('confirmed', 'balance_paid') then
    raise exception '%', upper(outcome) using errcode = 'P0001';
  end if;
  return jsonb_build_object('code', r.code, 'outcome', outcome);
end;
$$;

create or replace function public.run_payment_deadlines() returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Retenciones sin pago: se liberan al vencer, salvo que la pasarela esté procesando el abono o el total (como máximo 2 horas más).
  update public.reservations r set status = 'expired'
    where r.status = 'pending_deposit' and r.deposit_due_at < now()
      and (r.deposit_due_at < now() - interval '2 hours'
           or not exists (select 1 from public.payments p where p.reservation_code = r.code and p.kind in ('deposit', 'full') and p.status = 'pending'));
  -- Saldo sin pagar al terminar la hora: se registra el vencimiento (no cancela la estadía; el equipo decide).
  update public.reservations set balance_overdue_at = now()
    where status = 'checked_in' and balance_paid_at is null and balance_due_at < now() and balance_overdue_at is null;
  update public.payments set status = 'expired', status_detail = 'Venció sin completar el pago'
    where status = 'initiated' and expires_at < now();
end;
$$;

-- Avisos: la confirmación dice si llegó el abono o el pago total; un pago total no genera además el aviso de «saldo pagado».
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
  if new.balance_overdue_at is not null and old.balance_overdue_at is null then
    money := replace(to_char((new.quote ->> 'total')::integer - new.paid_amount, 'FM999,999,999'), ',', '.');
    insert into public.admin_notifications (kind, title, body, reservation_code, read_at)
    values ('balance_overdue', 'Saldo vencido sin pagar · ' || new.code, left(new.guest_full_name || ' · ' || cabin || ' · pendiente $' || money || '. Pasó la hora para pagarlo en línea.', 400), new.code, null);
  end if;
  return new;
end;
$$;

revoke execute on function public.apply_approved_payment(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.start_payment(text, public.payment_kind, text, text) from public, anon, authenticated;
revoke execute on function public.register_manual_payment(text, public.payment_kind, text) from public, anon;
revoke execute on function public.run_payment_deadlines() from public, anon, authenticated;
grant execute on function public.start_payment(text, public.payment_kind, text, text) to service_role;
grant execute on function public.register_manual_payment(text, public.payment_kind, text) to authenticated;
grant execute on function public.run_payment_deadlines() to service_role;
