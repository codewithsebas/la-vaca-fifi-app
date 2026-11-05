-- Una reserva con varias cabañas (docs/plan-reservas-en-grupo.md).
-- Cada cabaña sigue siendo una fila de reservations; las de un grupo comparten group_code = código de la principal
-- (la principal tiene group_code = code). Sin grupo: null. Las filas del grupo se insertan en una sola sentencia,
-- así que la restricción de exclusión las acepta todas o ninguna.
-- · Correos: la principal habla por el grupo (recibida, confirmada, vencida, cancelada, reprogramada, pago total).
-- · Avisos del panel: uno por grupo.
-- · register_manual_payment: con cualquier código del grupo, reparte el pago entre sus cabañas en una transacción.
-- · Cancelar una sola cabaña la saca del grupo (group_code = null) y se avisa como reserva suelta. La principal no se
--   cancela sola: se cancela todo el grupo (lo valida la API).
-- Aditiva: el código anterior ignora la columna y las funciones se comportan igual sin grupos.

alter table public.reservations
  add column group_code text check (group_code is null or group_code ~ '^VF-[A-Z0-9]{5}$');
create index reservations_group_code_idx on public.reservations (group_code) where group_code is not null;

-- ───────────── Correos ─────────────
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

-- ───────────── Avisos del panel ─────────────
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

-- ───────────── Pagos ─────────────
-- Mismo contrato que antes. Con un código de grupo, el monto es del grupo y se reparte:
-- abono → el abono de cada cabaña; sin monto en pago completo → lo que debe cada una; monto libre → en proporción a lo
-- que debe cada una. Mientras el grupo no quede pagado, ninguna cabaña queda «pagada» por redondeo.
create or replace function public.register_manual_payment(
  p_code text,
  p_kind public.payment_kind,
  p_note text default '',
  p_amount integer default null,
  p_op_id uuid default null,
  p_occurred_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reservations;
  principal public.reservations;
  grp text;
  rec public.reservations;
  grp_rows public.reservations[] := '{}';
  pass integer;
  n integer;
  owed_i integer[];
  dep_i integer[];
  share integer[];
  group_owed integer := 0;
  group_dep integer := 0;
  amt integer;
  left_over integer;
  pending boolean;
  covered boolean;
  k public.payment_kind;
  paid_at timestamptz := least(now(), greatest(coalesce(p_occurred_at, now()), now() - interval '30 days'));
  i integer;
  first_payment boolean := true;
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into r from public.reservations where code = p_code;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  grp := r.group_code;

  -- Bloqueo de todas las cabañas del grupo; la principal queda primera.
  for rec in
    select * from public.reservations
      where (grp is null and code = p_code) or (grp is not null and group_code = grp and status <> 'cancelled')
      order by (code = coalesce(grp, code)) desc, code
      for update
  loop
    grp_rows := grp_rows || rec;
  end loop;
  n := coalesce(array_length(grp_rows, 1), 0);
  if n = 0 then raise exception 'NOT_APPLICABLE' using errcode = 'P0001'; end if;
  principal := grp_rows[1];

  if p_op_id is not null and exists (select 1 from public.payments where client_op_id = p_op_id) then
    return jsonb_build_object('code', principal.code, 'outcome', 'duplicate', 'amount', 0);
  end if;

  pending := principal.status in ('pending_deposit', 'expired');
  for i in 1..n loop
    if (grp_rows[i].status in ('pending_deposit', 'expired')) <> pending
       or (not pending and grp_rows[i].status not in ('confirmed', 'rescheduled', 'checked_in')) then
      raise exception 'NOT_APPLICABLE' using errcode = 'P0001';
    end if;
    owed_i[i] := greatest((grp_rows[i].quote ->> 'total')::integer - grp_rows[i].paid_amount, 0);
    dep_i[i] := least((grp_rows[i].quote ->> 'deposit')::integer, owed_i[i]);
    group_owed := group_owed + owed_i[i];
    group_dep := group_dep + dep_i[i];
  end loop;
  if group_owed <= 0 or (n = 1 and principal.balance_paid_at is not null) then raise exception 'ALREADY_PAID' using errcode = 'P0001'; end if;

  amt := coalesce(p_amount, case when p_kind = 'deposit' then group_dep else group_owed end);
  if amt <= 0 or amt > group_owed then raise exception 'INVALID_AMOUNT' using errcode = 'P0001'; end if;
  covered := amt >= group_owed;

  -- Reparto.
  if covered then
    share := owed_i;
  elsif p_amount is null and p_kind = 'deposit' then
    share := dep_i;
  else
    left_over := amt;
    for i in 1..n loop
      share[i] := floor(owed_i[i]::numeric * amt / group_owed);
      left_over := left_over - share[i];
    end loop;
    -- El sobrante del redondeo es de menos de un peso por cabaña.
    -- Primero a las que sigan debiendo después de recibirlo; si no alcanza, a cualquiera que deba.
    for pass in 1..2 loop
      for i in 1..n loop
        exit when left_over = 0;
        if share[i] < owed_i[i] - (2 - pass) then
          share[i] := share[i] + 1;
          left_over := left_over - 1;
        end if;
      end loop;
    end loop;
  end if;

  for i in 1..n loop
    continue when share[i] <= 0;
    k := case when grp_rows[i].deposit_paid_at is not null then 'balance' when share[i] >= owed_i[i] then 'full' else 'deposit' end;
    insert into public.payments (reference, reservation_code, kind, amount, provider, status, status_detail, approved_at, client_op_id)
    values (
      grp_rows[i].code || '-' || case k when 'deposit' then 'A' when 'full' then 'T' else 'S' end || '-M' || upper(substr(md5(gen_random_uuid()::text), 1, 6)),
      grp_rows[i].code, k, share[i], 'manual', 'approved',
      left(coalesce(nullif(trim(p_note), ''), 'Registrado por el equipo') || case when n > 1 then ' (pago del grupo ' || principal.code || ')' else '' end, 300),
      paid_at,
      case when first_payment then p_op_id end
    );
    first_payment := false;
  end loop;

  begin
    -- Una retención que venció pudo perder sus fechas: la restricción de exclusión impide la doble reserva.
    -- La principal al final: su aviso suma lo pagado por todo el grupo.
    for i in reverse n..1 loop
      update public.reservations
        set status = case when pending then 'confirmed'::public.reservation_status else status end,
            deposit_paid_at = case when share[i] > 0 or pending then coalesce(deposit_paid_at, paid_at) else deposit_paid_at end,
            balance_paid_at = case when covered then paid_at else balance_paid_at end,
            paid_amount = paid_amount + share[i]
        where code = grp_rows[i].code;
    end loop;
  exception when exclusion_violation then
    raise exception 'NO_AVAILABILITY' using errcode = 'P0001';
  end;

  if pending then
    insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email)
    values ('reserva-confirmada:' || principal.code, 'reservation_confirmed', principal.code, principal.guest_email)
    on conflict (dedupe_key) do nothing;
  elsif covered and grp is not null and principal.source <> 'import' and position('@' in coalesce(principal.guest_email, '')) > 1 then
    insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email)
    values ('pago-total:' || principal.code || ':' || (principal.paid_amount + share[1]), 'balance_paid', principal.code, principal.guest_email)
    on conflict (dedupe_key) do nothing;
  end if;

  return jsonb_build_object(
    'code', principal.code,
    'outcome', case when pending then 'confirmed' when covered then 'balance_paid' else 'partial' end,
    'amount', amt
  );
end;
$$;
revoke execute on function public.register_manual_payment(text, public.payment_kind, text, integer, uuid, timestamptz) from public, anon;
grant execute on function public.register_manual_payment(text, public.payment_kind, text, integer, uuid, timestamptz) to authenticated, service_role;

-- ───────────── Recordatorio de llegada ─────────────
-- Uno por grupo, con el código principal.
create or replace function public.enqueue_arrival_reminders() returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email)
  select 'recordatorio:' || coalesce(r.group_code, r.code) || ':' || r.check_in, 'arrival_reminder', coalesce(r.group_code, r.code), r.guest_email
  from public.reservations r
  where r.status in ('confirmed', 'rescheduled')
    and r.source <> 'import'
    and r.check_in = (now() at time zone 'America/Bogota')::date + 2
    and position('@' in r.guest_email) > 1
  on conflict (dedupe_key) do nothing;
$$;
revoke execute on function public.enqueue_arrival_reminders() from public, anon, authenticated;
grant execute on function public.enqueue_arrival_reminders() to service_role;
