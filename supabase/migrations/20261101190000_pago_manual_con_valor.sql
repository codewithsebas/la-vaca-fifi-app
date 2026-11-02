-- Pagos que registra el equipo con el valor que realmente recibió: el abono (30 %), todo lo que falta o un valor a elección.
--
-- · p_amount (opcional): el valor recibido; sin él se calcula como antes (abono o lo que falta). Nunca más de lo que falta.
-- · Cualquier pago confirma una reserva pendiente (o vencida, si sus fechas siguen libres): el equipo ya recibió dinero.
--   El primer pago queda como abono (o como pago total, si cubre todo) y los siguientes como saldo.
-- · El saldo queda pagado cuando lo cobrado llega al total; un valor menor queda como pago parcial.
-- · p_note: medio y detalle (efectivo, transferencia y su referencia); se guarda en el pago.
-- Compatible con las llamadas anteriores (p_code, p_kind, p_note por nombre). No toca datos existentes.

drop function if exists public.register_manual_payment(text, public.payment_kind, text);

create function public.register_manual_payment(
  p_code text,
  p_kind public.payment_kind,
  p_note text default '',
  p_amount integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reservations;
  total integer;
  owed integer;
  amt integer;
  k public.payment_kind;
  pending boolean;
  covered boolean;
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into r from public.reservations where code = p_code for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;

  total := (r.quote ->> 'total')::integer;
  owed := total - r.paid_amount;
  if owed <= 0 or r.balance_paid_at is not null then raise exception 'ALREADY_PAID' using errcode = 'P0001'; end if;
  pending := r.status in ('pending_deposit', 'expired');
  if not pending and r.status not in ('confirmed', 'rescheduled', 'checked_in') then
    raise exception 'NOT_APPLICABLE' using errcode = 'P0001';
  end if;

  amt := coalesce(p_amount, case when p_kind = 'deposit' then least((r.quote ->> 'deposit')::integer, owed) else owed end);
  if amt <= 0 or amt > owed then raise exception 'INVALID_AMOUNT' using errcode = 'P0001'; end if;
  covered := amt >= owed;
  k := case when r.deposit_paid_at is not null then 'balance' when covered then 'full' else 'deposit' end;

  insert into public.payments (reference, reservation_code, kind, amount, provider, status, status_detail, approved_at)
  values (
    r.code || '-' || case k when 'deposit' then 'A' when 'full' then 'T' else 'S' end || '-M' || upper(substr(md5(gen_random_uuid()::text), 1, 6)),
    r.code, k, amt, 'manual', 'approved', left(coalesce(nullif(trim(p_note), ''), 'Registrado por el equipo'), 300), now()
  );

  begin
    -- Una retención que venció pudo perder sus fechas: la restricción de exclusión impide la doble reserva.
    update public.reservations
      set status = case when pending then 'confirmed'::public.reservation_status else status end,
          deposit_paid_at = coalesce(deposit_paid_at, now()),
          balance_paid_at = case when covered then now() else balance_paid_at end,
          paid_amount = paid_amount + amt
      where code = r.code;
  exception when exclusion_violation then
    raise exception 'NO_AVAILABILITY' using errcode = 'P0001';
  end;

  if pending then
    insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email)
    values ('reserva-confirmada:' || r.code, 'reservation_confirmed', r.code, r.guest_email)
    on conflict (dedupe_key) do nothing;
  end if;

  return jsonb_build_object(
    'code', r.code,
    'outcome', case when pending then 'confirmed' when covered then 'balance_paid' else 'partial' end,
    'amount', amt
  );
end;
$$;

revoke execute on function public.register_manual_payment(text, public.payment_kind, text, integer) from public, anon;
grant execute on function public.register_manual_payment(text, public.payment_kind, text, integer) to authenticated, service_role;
