-- Pagos en línea (Wompi) con la reserva confirmada solo cuando el abono se aprueba, plazo de una hora para pagar el saldo
-- después del check-in, bandeja de salida de correos (envío desacoplado, idempotente y con fallos registrados) y avisos en tiempo real.
--
-- Estados (sin duplicar conceptos):
--   reservations.status       pending_deposit = fechas retenidas mientras se paga el abono (todavía NO es una reserva confirmada)
--                             confirmed       = abono aprobado (deposit_paid_at) → reserva confirmada
--                             checked_in      = check-in hecho (checked_in_at) → corre el plazo del saldo (balance_due_at)
--                             completed       = check-out (solo con el saldo pagado)
--   saldo                     pendiente  = checked_in, balance_paid_at nulo y balance_due_at futuro
--                             en proceso = además, un pago del saldo en estado pending
--                             vencido    = balance_overdue_at (se registra al pasar el plazo; no cancela nada)
--                             pagado     = balance_paid_at
--   payments.status           initiated (se abrió la pasarela) · pending (la pasarela lo procesa) · approved · declined · error · expired

-- ───────────── Reservas: lo pagado y los plazos ─────────────
alter table public.reservations
  add column paid_amount integer not null default 0 check (paid_amount >= 0),
  add column checked_in_at timestamptz,
  add column balance_due_at timestamptz,
  add column balance_overdue_at timestamptz;

-- Lo ya registrado con el flujo anterior (el abono al confirmar y el saldo en el check-in).
update public.reservations set paid_amount =
  (case when deposit_paid_at is not null then (quote ->> 'deposit')::integer else 0 end) +
  (case when balance_paid_at is not null then (quote ->> 'balance')::integer else 0 end)
where true;
update public.reservations set checked_in_at = coalesce(balance_paid_at, updated_at) where status in ('checked_in', 'completed');

create index reservations_balance_due_idx on public.reservations (balance_due_at)
  where status = 'checked_in' and balance_paid_at is null and balance_overdue_at is null;

-- ───────────── Pagos ─────────────
create type public.payment_kind as enum ('deposit', 'balance');
create type public.payment_status as enum ('initiated', 'pending', 'approved', 'declined', 'error', 'expired');

-- Un intento de pago (una referencia en la pasarela). Su estado sale de sus transacciones.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^[A-Z0-9-]{8,60}$'),
  reservation_code text not null references public.reservations (code) on delete cascade,
  kind public.payment_kind not null,
  amount integer not null check (amount > 0),
  currency text not null default 'COP' check (currency = 'COP'),
  provider text not null check (provider in ('wompi', 'simulado', 'manual')),
  status public.payment_status not null default 'initiated',
  status_detail text not null default '' check (length(status_detail) <= 300),
  method text not null default '' check (length(method) <= 40),
  -- Dinero recibido que no se pudo aplicar (pago duplicado o fechas ya ocupadas): el equipo debe reembolsarlo.
  needs_refund boolean not null default false,
  expires_at timestamptz, -- hasta cuándo se puede pagar este intento (fin de la retención o del plazo del saldo)
  approved_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una sola ventana de pago abierta por reserva y concepto (abrir otra reemplaza la anterior). Si la pasarela ya procesa
-- un pago (pending), start_payment no abre otro: así no se cobra dos veces el mismo abono desde dos pestañas.
create unique index payments_one_open on public.payments (reservation_code, kind) where status = 'initiated';
create index payments_reservation_idx on public.payments (reservation_code, created_at desc);
create index payments_created_by_idx on public.payments (created_by);
create index payments_initiated_expiry_idx on public.payments (expires_at) where status = 'initiated';

-- Transacciones de la pasarela (una referencia puede tener varias: tarjeta rechazada y luego aprobada en la misma ventana).
create table public.payment_transactions (
  id text primary key check (length(id) between 3 and 80),
  payment_id uuid not null references public.payments (id) on delete cascade,
  status public.payment_status not null check (status in ('pending', 'approved', 'declined', 'error')),
  method text not null default '' check (length(method) <= 40),
  detail text not null default '' check (length(detail) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payment_transactions_payment_idx on public.payment_transactions (payment_id);

create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
create trigger payment_transactions_updated_at before update on public.payment_transactions
  for each row execute function public.set_updated_at();

-- ───────────── Bandeja de salida de correos ─────────────
-- El servidor encola y luego envía: un fallo del proveedor nunca deshace la reserva, queda registrado y se puede reintentar.
-- dedupe_key evita encolar dos veces el mismo correo (p. ej. la confirmación de una reserva).
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique check (length(dedupe_key) between 3 and 120),
  kind text not null check (kind in ('reservation_confirmed', 'team_message')),
  reservation_code text references public.reservations (code) on delete set null,
  to_email text not null check (length(to_email) between 3 and 160),
  subject text not null default '' check (length(subject) <= 200),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text not null default '' check (length(last_error) <= 500),
  provider_id text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_outbox_due_idx on public.email_outbox (next_attempt_at) where status in ('pending', 'failed');
create index email_outbox_reservation_idx on public.email_outbox (reservation_code);
create index email_outbox_created_by_idx on public.email_outbox (created_by);

create trigger email_outbox_updated_at before update on public.email_outbox
  for each row execute function public.set_updated_at();

-- ───────────── Reglas de pago en la base de datos ─────────────
-- Ninguna ruta puede saltárselas: una reserva solo se confirma con el abono pagado, el check-in abre el plazo del saldo
-- y el check-out exige el saldo pagado.
create function public.reservation_payment_rules() returns trigger
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
      new.balance_due_at := case when new.balance_paid_at is null and new.paid_amount < total then now() + interval '1 hour' end;
      new.balance_overdue_at := null;
    end if;
    if new.status = 'completed' and new.balance_paid_at is null and new.paid_amount < total then
      raise exception 'BALANCE_PENDING' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger reservations_payment_rules before insert or update on public.reservations
  for each row execute function public.reservation_payment_rules();

-- Aplica a la reserva un pago aprobado. Devuelve: confirmed, balance_paid, duplicate, no_availability o not_applicable.
-- Bloquea la reserva; quien la llama ya bloqueó antes la reserva y luego el pago (siempre en ese orden).
create function public.apply_approved_payment(p_payment_id uuid) returns text
language plpgsql
set search_path = ''
as $$
declare
  p public.payments;
  r public.reservations;
begin
  select * into p from public.payments where id = p_payment_id;
  select * into r from public.reservations where code = p.reservation_code for update;
  if p.kind = 'deposit' then
    if r.deposit_paid_at is not null then return 'duplicate'; end if;
    if r.status not in ('pending_deposit', 'expired') then return 'not_applicable'; end if;
    begin
      -- Una retención que venció pudo perder sus fechas: la restricción de exclusión impide la doble reserva.
      update public.reservations set status = 'confirmed', deposit_paid_at = now(), paid_amount = paid_amount + p.amount where code = r.code;
    exception when exclusion_violation then
      return 'no_availability';
    end;
    insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email)
    values ('reserva-confirmada:' || r.code, 'reservation_confirmed', r.code, r.guest_email)
    on conflict (dedupe_key) do nothing;
  else
    if r.balance_paid_at is not null or r.paid_amount >= (r.quote ->> 'total')::integer then return 'duplicate'; end if;
    if r.status <> 'checked_in' then return 'not_applicable'; end if;
    update public.reservations set balance_paid_at = now(), paid_amount = paid_amount + p.amount where code = r.code;
  end if;
  -- Las demás ventanas de pago del mismo concepto ya no hacen falta.
  update public.payments set status = 'expired', status_detail = 'Ya no es necesario: el pago se completó con otro intento'
    where reservation_code = r.code and kind = p.kind and status = 'initiated' and id <> p.id;
  return case p.kind when 'deposit' then 'confirmed' else 'balance_paid' end;
end;
$$;

-- Abre un intento de pago. Valida en el servidor el estado de la reserva y los plazos (la interfaz no es la fuente de verdad).
create function public.start_payment(p_code text, p_kind public.payment_kind, p_provider text, p_reference text)
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
begin
  select * into r from public.reservations where code = p_code for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  total := (r.quote ->> 'total')::integer;
  if exists (select 1 from public.payments where reservation_code = r.code and kind = p_kind and status = 'pending') then
    raise exception 'PAYMENT_IN_PROGRESS' using errcode = 'P0001';
  end if;
  if p_kind = 'deposit' then
    if r.deposit_paid_at is not null then raise exception 'ALREADY_PAID' using errcode = 'P0001'; end if;
    if r.status <> 'pending_deposit' then raise exception 'NOT_PAYABLE' using errcode = 'P0001'; end if;
    if r.deposit_due_at < now() + interval '1 minute' then raise exception 'HOLD_EXPIRED' using errcode = 'P0001'; end if;
    amt := (r.quote ->> 'deposit')::integer;
    v_until := r.deposit_due_at;
  else
    if r.status <> 'checked_in' then raise exception 'NOT_PAYABLE' using errcode = 'P0001'; end if;
    if r.balance_paid_at is not null or r.paid_amount >= total then raise exception 'ALREADY_PAID' using errcode = 'P0001'; end if;
    if r.balance_overdue_at is not null or r.balance_due_at is null or r.balance_due_at < now() + interval '30 seconds' then
      raise exception 'BALANCE_DEADLINE_PASSED' using errcode = 'P0001';
    end if;
    amt := total - r.paid_amount;
    v_until := r.balance_due_at;
  end if;
  -- Un intento nuevo reemplaza al anterior que no se completó (el huésped volvió a abrir el pago).
  update public.payments set status = 'expired', status_detail = 'Reemplazado por un nuevo intento de pago'
    where reservation_code = r.code and kind = p_kind and status = 'initiated';
  insert into public.payments (reference, reservation_code, kind, amount, provider, expires_at)
  values (p_reference, r.code, p_kind, amt, p_provider, v_until)
  returning * into p;
  return p;
end;
$$;

-- Registra el resultado de una transacción de la pasarela (webhook, consulta al volver del pago o simulador).
-- Idempotente y tolerante al desorden: una transacción solo avanza (pending → approved / declined / error) y un pago aprobado es definitivo.
create function public.settle_payment(p_reference text, p_tx_id text, p_status public.payment_status, p_method text default '', p_detail text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  p public.payments;
  tx public.payment_transactions;
  pick public.payment_transactions;
  outcome text;
begin
  if p_status not in ('pending', 'approved', 'declined', 'error') then raise exception 'INVALID_STATUS' using errcode = '22023'; end if;
  select reservation_code into v_code from public.payments where reference = p_reference;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  perform 1 from public.reservations where code = v_code for update;
  select * into p from public.payments where reference = p_reference for update;

  select * into tx from public.payment_transactions where id = p_tx_id for update;
  if found then
    if tx.payment_id <> p.id then raise exception 'TX_MISMATCH' using errcode = 'P0001'; end if;
    if (case p_status when 'pending' then 1 when 'approved' then 3 else 2 end) > (case tx.status when 'pending' then 1 when 'approved' then 3 else 2 end) then
      update public.payment_transactions
        set status = p_status, method = coalesce(nullif(left(p_method, 40), ''), method), detail = coalesce(nullif(left(p_detail, 300), ''), detail)
        where id = p_tx_id;
    end if;
  else
    insert into public.payment_transactions (id, payment_id, status, method, detail)
    values (p_tx_id, p.id, p_status, left(coalesce(p_method, ''), 40), left(coalesce(p_detail, ''), 300));
  end if;

  if p.status = 'approved' then
    return jsonb_build_object('code', p.reservation_code, 'kind', p.kind, 'status', p.status, 'changed', false);
  end if;

  -- Estado del intento: aprobado si alguna transacción se aprobó; si no, en proceso si alguna sigue pendiente; si no, la última.
  select * into pick from public.payment_transactions where payment_id = p.id
    order by case status when 'approved' then 0 when 'pending' then 1 else 2 end, updated_at desc
    limit 1;
  if pick.status = p.status and pick.method = p.method then
    return jsonb_build_object('code', p.reservation_code, 'kind', p.kind, 'status', p.status, 'changed', false);
  end if;

  update public.payments
    set status = pick.status,
        method = coalesce(nullif(pick.method, ''), method),
        status_detail = pick.detail,
        approved_at = case when pick.status = 'approved' then now() end
    where id = p.id;

  if pick.status = 'approved' then
    outcome := public.apply_approved_payment(p.id);
    if outcome not in ('confirmed', 'balance_paid') then
      update public.payments
        set needs_refund = true,
            status_detail = case outcome
              when 'duplicate' then 'Pago duplicado: la reserva ya tenía este pago. Requiere reembolso.'
              when 'no_availability' then 'Las fechas ya no estaban disponibles. Requiere reembolso.'
              else 'La reserva ya no admitía este pago. Requiere reembolso.'
            end
        where id = p.id;
    end if;
  end if;
  return jsonb_build_object('code', p.reservation_code, 'kind', p.kind, 'status', pick.status, 'changed', true, 'outcome', outcome);
end;
$$;

-- El equipo registra un pago recibido por fuera de la pasarela (efectivo o transferencia en recepción).
-- Solo administradores; aplica las mismas reglas que un pago en línea (y encola el mismo correo de confirmación).
create function public.register_manual_payment(p_code text, p_kind public.payment_kind, p_note text default '')
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
    r.code || '-' || case p_kind when 'deposit' then 'A' else 'S' end || '-M' || upper(substr(md5(gen_random_uuid()::text), 1, 6)),
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

-- Plazos: intentos de pago sin completar, retenciones sin abono y saldos sin pagar una hora después del check-in.
-- Lo corre pg_cron cada minuto y la API antes de leer (mismo resultado, idempotente).
create function public.run_payment_deadlines() returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Retenciones sin abono: se liberan al vencer, salvo que la pasarela esté procesando un pago (como máximo 2 horas más).
  update public.reservations r set status = 'expired'
    where r.status = 'pending_deposit' and r.deposit_due_at < now()
      and (r.deposit_due_at < now() - interval '2 hours'
           or not exists (select 1 from public.payments p where p.reservation_code = r.code and p.kind = 'deposit' and p.status = 'pending'));
  -- Saldo sin pagar al terminar la hora: se registra el vencimiento (no cancela la estadía; el equipo decide).
  update public.reservations set balance_overdue_at = now()
    where status = 'checked_in' and balance_paid_at is null and balance_due_at < now() and balance_overdue_at is null;
  update public.payments set status = 'expired', status_detail = 'Venció sin completar el pago'
    where status = 'initiated' and expires_at < now();
end;
$$;

select cron.unschedule('vencer-solicitudes-sin-abono');
select cron.schedule('plazos-de-pago', '* * * * *', $$select public.run_payment_deadlines()$$);

-- ───────────── Notificaciones del panel ─────────────
alter table public.admin_notifications drop constraint admin_notifications_kind_check;
alter table public.admin_notifications add constraint admin_notifications_kind_check check (kind in (
  'reservation_created', 'reservation_confirmed', 'reservation_cancelled', 'reservation_expired',
  'proof_uploaded', 'proof_approved', 'proof_rejected',
  'payment_declined', 'payment_refund', 'balance_paid', 'balance_overdue', 'email_failed'
));

-- Una retención sin abono no es una reserva todavía: el aviso llega cuando se confirma (y no cuando vence sin pago).
create or replace function public.notify_reservation_change() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  seen timestamptz := case when auth.uid() is null then null else now() end;
  cabin text := coalesce((select c.nombre from public.cabin_types c where c.id = new.cabin_type_id), new.cabin_type_id);
  stay text := to_char(new.check_in, 'DD/MM') || ' → ' || to_char(new.check_out, 'DD/MM');
  money text;
begin
  if tg_op = 'INSERT' then return new; end if;
  if new.status is distinct from old.status then
    if new.status = 'confirmed' and old.status in ('pending_deposit', 'expired') then
      money := replace(to_char(new.paid_amount, 'FM999,999,999'), ',', '.');
      insert into public.admin_notifications (kind, title, body, reservation_code, read_at)
      values ('reservation_confirmed', left('Nueva reserva confirmada · ' || new.guest_full_name, 160), left(cabin || ' · ' || stay || ' · ' || new.code || ' · abono $' || money, 400), new.code, seen);
    elsif new.status = 'cancelled' then
      insert into public.admin_notifications (kind, title, body, reservation_code, read_at)
      values ('reservation_cancelled', 'Reserva cancelada · ' || new.code, left(new.guest_full_name || ' · ' || cabin || ' · ' || stay, 400), new.code, seen);
    end if;
  end if;
  if new.balance_paid_at is not null and old.balance_paid_at is null then
    money := replace(to_char(new.paid_amount, 'FM999,999,999'), ',', '.');
    insert into public.admin_notifications (kind, title, body, reservation_code, read_at)
    values ('balance_paid', 'Saldo pagado · ' || new.code, left(new.guest_full_name || ' · ' || cabin || ' · total pagado $' || money || '. Ya puedes hacer el check-out.', 400), new.code, seen);
  end if;
  if new.balance_overdue_at is not null and old.balance_overdue_at is null then
    money := replace(to_char((new.quote ->> 'total')::integer - new.paid_amount, 'FM999,999,999'), ',', '.');
    insert into public.admin_notifications (kind, title, body, reservation_code, read_at)
    values ('balance_overdue', 'Saldo vencido sin pagar · ' || new.code, left(new.guest_full_name || ' · ' || cabin || ' · pendiente $' || money || '. Pasó la hora para pagarlo en línea.', 400), new.code, null);
  end if;
  return new;
end;
$$;

drop trigger reservations_notify on public.reservations;
create trigger reservations_notify after insert or update of status, balance_paid_at, balance_overdue_at on public.reservations
  for each row execute function public.notify_reservation_change();

create function public.notify_payment_change() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  guest text := coalesce((select r.guest_full_name from public.reservations r where r.code = new.reservation_code), '');
  what text := case new.kind when 'deposit' then 'abono' else 'saldo' end;
  money text := replace(to_char(new.amount, 'FM999,999,999'), ',', '.');
begin
  if new.status in ('declined', 'error') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into public.admin_notifications (kind, title, body, reservation_code)
    values ('payment_declined', 'Pago rechazado · ' || new.reservation_code,
            left(guest || ' · ' || what || ' de $' || money || case when new.status_detail <> '' then ' · ' || new.status_detail else '' end, 400), new.reservation_code);
  end if;
  if new.needs_refund and (tg_op = 'INSERT' or not old.needs_refund) then
    insert into public.admin_notifications (kind, title, body, reservation_code)
    values ('payment_refund', 'Pago por reembolsar · ' || new.reservation_code, left(guest || ' · ' || what || ' de $' || money || ' · ' || new.status_detail, 400), new.reservation_code);
  end if;
  return new;
end;
$$;

create trigger payments_notify after insert or update of status, needs_refund on public.payments
  for each row execute function public.notify_payment_change();

-- El primer fallo de un correo automático avisa al equipo (los siguientes reintentos no repiten el aviso).
create function public.notify_email_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'reservation_confirmed' and new.status = 'failed' and old.status is distinct from 'failed' and new.attempts = 1 then
    insert into public.admin_notifications (kind, title, body, reservation_code)
    values ('email_failed', left('No se pudo enviar la confirmación · ' || coalesce(new.reservation_code, new.to_email), 160),
            left('Para ' || new.to_email || ' · ' || new.last_error || ' · Reinténtalo desde la reserva.', 400), new.reservation_code);
  end if;
  return new;
end;
$$;

create trigger email_outbox_notify after update of status on public.email_outbox
  for each row execute function public.notify_email_change();

-- ───────────── Tiempo real para el huésped («Mi reserva» y la página del pago) ─────────────
drop trigger reservations_broadcast_change on public.reservations;
create trigger reservations_broadcast_change
  after update on public.reservations
  for each row
  when (old.status is distinct from new.status
        or old.check_in is distinct from new.check_in
        or old.check_out is distinct from new.check_out
        or old.cabin_type_id is distinct from new.cabin_type_id
        or old.quote is distinct from new.quote
        or old.deposit_due_at is distinct from new.deposit_due_at
        or old.paid_amount is distinct from new.paid_amount
        or old.balance_due_at is distinct from new.balance_due_at
        or old.balance_overdue_at is distinct from new.balance_overdue_at)
  execute function public.broadcast_reservation_change();

create trigger payments_broadcast_change
  after insert or update on public.payments
  for each row execute function public.broadcast_reservation_change();

-- ───────────── Seguridad ─────────────
alter table public.payments enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.email_outbox enable row level security;

-- El panel solo lee; los cambios pasan por las funciones de arriba o por el servidor (clave secreta).
create policy "Administradores leen pagos" on public.payments
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "Administradores leen transacciones" on public.payment_transactions
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "Administradores leen correos" on public.email_outbox
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

revoke all on public.payments, public.payment_transactions, public.email_outbox from anon, authenticated;
grant select on public.payments, public.payment_transactions, public.email_outbox to authenticated;
grant select, insert, update, delete on public.payments, public.payment_transactions, public.email_outbox to service_role;

revoke execute on function public.reservation_payment_rules() from public, anon, authenticated;
revoke execute on function public.apply_approved_payment(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.start_payment(text, public.payment_kind, text, text) from public, anon, authenticated;
revoke execute on function public.settle_payment(text, text, public.payment_status, text, text) from public, anon, authenticated;
revoke execute on function public.register_manual_payment(text, public.payment_kind, text) from public, anon;
revoke execute on function public.run_payment_deadlines() from public, anon;
revoke execute on function public.notify_payment_change() from public, anon, authenticated;
revoke execute on function public.notify_email_change() from public, anon, authenticated;
grant execute on function public.start_payment(text, public.payment_kind, text, text) to service_role;
grant execute on function public.settle_payment(text, text, public.payment_status, text, text) to service_role;
grant execute on function public.register_manual_payment(text, public.payment_kind, text) to authenticated;
grant execute on function public.run_payment_deadlines() to authenticated, service_role;

alter publication supabase_realtime add table public.payments, public.email_outbox;
