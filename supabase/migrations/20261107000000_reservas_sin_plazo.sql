-- Reservas sin abono: ya no tienen plazo para pagar ni apartan fechas.
-- · Una reserva pendiente de abono (pending_deposit) queda guardada con una cabaña tentativa, pero no ocupa: esas fechas
--   siguen libres para todos. Al registrar el abono o el pago total toma su cabaña si sigue libre, o la primera libre de
--   su tipo (si no hay ninguna, NO_AVAILABILITY, como antes).
-- · Si otra reserva ocupa sus fechas (se confirma con un pago, se reprograma, un bloqueo o una noche de Booking) y ya no
--   queda cabaña libre para la pendiente, se corre a las próximas fechas libres: mismas noches, mismo tipo de cabaña y el
--   mismo valor. El huésped recibe un correo y el equipo un aviso. Un grupo se mueve completo.
-- · Sin plazo: la pendiente sigue así hasta el final del día de llegada; si no pagó, el cron de plazos la vence.

-- 1. Solo apartan fechas las reservas confirmadas, reprogramadas o en estadía.
alter table public.reservations drop constraint reservations_no_overlap;
alter table public.reservations add constraint reservations_no_overlap exclude using gist (
  cabin_type_id with =,
  unit with =,
  daterange(check_in, check_out) with &&
) where (status in ('confirmed', 'rescheduled', 'checked_in'));

-- 2. El "plazo" de una pendiente es el final de su día de llegada (hora de Colombia).
create function public.unpaid_until_arrival() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'pending_deposit' then
    new.deposit_due_at := ((new.check_in + 1)::timestamp at time zone 'America/Bogota');
  end if;
  return new;
end;
$$;
revoke execute on function public.unpaid_until_arrival() from public, anon, authenticated;

create trigger reservations_unpaid_until_arrival before insert or update of status, check_in, deposit_due_at on public.reservations
  for each row execute function public.unpaid_until_arrival();

update public.reservations set deposit_due_at = deposit_due_at where status = 'pending_deposit';

-- 3. Primera cabaña libre de un tipo todas las noches [p_ci, p_co): sin reservas que aparten, bloqueos ni noches de
--    Booking. p_taken: cabañas ya elegidas en esta misma pasada ('tipo:unidad'); p_prefer: la que se prueba primero.
create function public.free_unit(
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
      where s.cabin_type_id = p_type and s.unit = u and s.removed_at is null and not s.echo
        and s.check_in < p_co and s.check_out > p_ci);
    return u;
  end loop;
  return 0;
end;
$$;
revoke execute on function public.free_unit(text, date, date, text, text[], integer) from public, anon, authenticated;

-- Cabañas para todas las de una reserva (o un grupo) corridas p_shift días; null si alguna no cabe.
create function public.place_unpaid(p_members public.reservations[], p_shift integer)
returns integer[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.reservations;
  u integer;
  taken text[] := '{}';
  placed integer[] := '{}';
begin
  foreach m in array p_members loop
    u := public.free_unit(m.cabin_type_id, m.check_in + p_shift, m.check_out + p_shift, m.code, taken, m.unit);
    if u = 0 then return null; end if;
    taken := taken || (m.cabin_type_id || ':' || u);
    placed := placed || u;
  end loop;
  return placed;
end;
$$;
revoke execute on function public.place_unpaid(public.reservations[], integer) from public, anon, authenticated;

-- 4. Pendientes de un tipo que se cruzan con [p_from, p_to): si ya no caben, a las próximas fechas libres.
create function public.bump_unpaid(p_type text, p_from date, p_to date) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k record;
  members public.reservations[];
  lead public.reservations;
  units_now integer[];
  units_new integer[];
  shift integer;
  moved_by integer;
  i integer;
  moved boolean;
  cabin text;
  old_stay text;
  new_stay text;
begin
  for k in
    select coalesce(r.group_code, r.code) as key, min(r.created_at) as at
    from public.reservations r
    where r.status = 'pending_deposit' and r.cabin_type_id = p_type and r.check_in < p_to and r.check_out > p_from
    group by 1
    order by 2
  loop
    members := array(
      select r from public.reservations r
      where (r.code = k.key or r.group_code = k.key) and r.status <> 'cancelled'
      order by (r.code = k.key) desc, r.code
    );
    continue when coalesce(array_length(members, 1), 0) = 0;
    continue when exists (select 1 from unnest(members) x where x.status <> 'pending_deposit');
    lead := members[1];

    -- Todavía cabe: solo se ajusta la cabaña tentativa si la suya quedó tomada.
    units_now := public.place_unpaid(members, 0);
    if units_now is not null then
      for i in 1..array_length(members, 1) loop
        if members[i].unit <> units_now[i] then
          update public.reservations set unit = units_now[i] where code = members[i].code;
        end if;
      end loop;
      continue;
    end if;

    moved := false;
    for shift in 1..365 loop
      units_new := public.place_unpaid(members, shift);
      continue when units_new is null;
      for i in 1..array_length(members, 1) loop
        update public.reservations
          set check_in = members[i].check_in + shift, check_out = members[i].check_out + shift, unit = units_new[i]
          where code = members[i].code;
      end loop;
      moved := true;
      moved_by := shift; -- la variable del for no existe fuera del ciclo
      exit;
    end loop;

    cabin := coalesce((select c.nombre from public.cabin_types c where c.id = lead.cabin_type_id), lead.cabin_type_id);
    old_stay := to_char(lead.check_in, 'DD/MM') || ' → ' || to_char(lead.check_out, 'DD/MM');
    if moved then
      new_stay := to_char(lead.check_in + moved_by, 'DD/MM') || ' → ' || to_char(lead.check_out + moved_by, 'DD/MM');
      insert into public.admin_notifications (kind, title, body, reservation_code)
      values ('reservation_moved', left('Reserva sin abono movida · ' || lead.guest_full_name, 160),
              left(cabin || ' · ' || old_stay || ' pasó a ' || new_stay || ' · ' || lead.code || '. Otra reserva pagó esas fechas.', 400), lead.code);
      if lead.source <> 'import' and position('@' in coalesce(lead.guest_email, '')) > 1 then
        insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email, payload)
        values (
          left('reserva-movida:' || lead.code || ':' || (lead.check_in + moved_by), 120), 'reservation_moved', lead.code, lead.guest_email,
          jsonb_build_object('checkInAnterior', lead.check_in, 'checkOutAnterior', lead.check_out,
                             'checkIn', lead.check_in + moved_by, 'checkOut', lead.check_out + moved_by)
        )
        on conflict (dedupe_key) do nothing;
      end if;
    else
      insert into public.admin_notifications (kind, title, body, reservation_code)
      values ('reservation_moved', left('Reserva sin abono sin fechas libres · ' || lead.guest_full_name, 160),
              left(cabin || ' · ' || old_stay || ' · ' || lead.code || '. Otra reserva pagó esas fechas y no hay otras libres en el próximo año: acuerda con el huésped.', 400), lead.code);
    end if;
  end loop;
end;
$$;
revoke execute on function public.bump_unpaid(text, date, date) from public, anon, authenticated;

-- Disparadores: al final de la transacción (diferidos), cuando ya se aplicó todo el pago o el cambio de un grupo.
create function public.bump_unpaid_after_reservation() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('confirmed', 'rescheduled', 'checked_in')
     and (tg_op = 'INSERT' or old.status not in ('confirmed', 'rescheduled', 'checked_in')
          or new.check_in <> old.check_in or new.check_out <> old.check_out
          or new.unit <> old.unit or new.cabin_type_id <> old.cabin_type_id) then
    perform public.bump_unpaid(new.cabin_type_id, new.check_in, new.check_out);
  end if;
  return null;
end;
$$;
revoke execute on function public.bump_unpaid_after_reservation() from public, anon, authenticated;

create constraint trigger reservations_bump_unpaid after insert or update on public.reservations
  deferrable initially deferred for each row execute function public.bump_unpaid_after_reservation();

create function public.bump_unpaid_after_block() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.bump_unpaid(new.cabin_type_id, new.from_date, new.to_date + 1);
  return null;
end;
$$;
revoke execute on function public.bump_unpaid_after_block() from public, anon, authenticated;

create constraint trigger blocks_bump_unpaid after insert or update on public.blocks
  deferrable initially deferred for each row execute function public.bump_unpaid_after_block();

create function public.bump_unpaid_after_channel_stay() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.removed_at is null and not new.echo then
    perform public.bump_unpaid(new.cabin_type_id, new.check_in, new.check_out);
  end if;
  return null;
end;
$$;
revoke execute on function public.bump_unpaid_after_channel_stay() from public, anon, authenticated;

create constraint trigger channel_stays_bump_unpaid after insert or update on public.channel_stays
  deferrable initially deferred for each row execute function public.bump_unpaid_after_channel_stay();

-- 5. Aviso al equipo y correo al huésped cuando se mueve.
alter table public.admin_notifications drop constraint admin_notifications_kind_check;
alter table public.admin_notifications add constraint admin_notifications_kind_check check (kind in (
  'reservation_created', 'reservation_confirmed', 'reservation_cancelled', 'reservation_expired',
  'proof_uploaded', 'proof_approved', 'proof_rejected',
  'payment_declined', 'payment_refund', 'balance_paid', 'balance_overdue', 'email_failed',
  'channel_conflict', 'channel_moved', 'channel_sync_failed',
  'booking_pending', 'booking_modified', 'booking_cancelled', 'booking_failed',
  'checkout_pending', 'reservation_moved'
));

alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'reservation_confirmed', 'team_message', 'reservation_received', 'new_reservation',
  'reservation_cancelled', 'reservation_expired', 'arrival_reminder',
  'balance_paid', 'reservation_rescheduled', 'reservation_moved'
));

-- 6. Registrar un pago: la pendiente toma una cabaña libre al confirmarse.
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
  u integer;
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
      -- Sin abono no apartaba: al confirmarse toma su cabaña si sigue libre, o la primera libre de su tipo.
      u := grp_rows[i].unit;
      if pending then
        u := public.free_unit(grp_rows[i].cabin_type_id, grp_rows[i].check_in, grp_rows[i].check_out, grp_rows[i].code, '{}', grp_rows[i].unit);
        if u = 0 then raise exception 'NO_AVAILABILITY' using errcode = 'P0001'; end if;
      end if;
      update public.reservations
        set unit = u,
            status = case when pending then 'confirmed'::public.reservation_status else status end,
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
