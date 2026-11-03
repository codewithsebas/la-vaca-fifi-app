-- Comprobación de la migración de sincronización en una transacción que siempre se revierte: no deja datos ni envía correos o
-- push (pg_net encola dentro de la misma transacción). Solo para QA: npx supabase db query --linked --yes --file scripts/qa-sync-check.sql
-- Un fallo aparece como error; si termina sin error, todo pasó.
begin;

do $$
declare
  claims text;
  v_cabin text;
  v_block uuid := gen_random_uuid();
  v_code text := 'VF-ZZ' || upper(substr(md5(random()::text), 1, 3));
  v_op uuid := gen_random_uuid();
  v_at timestamptz := now() - interval '3 days';
  v_cursor text := pg_snapshot_xmin(pg_current_snapshot())::text || ':0';
  n bigint;
  res jsonb;
  denied boolean := false;
begin
  select id into v_cabin from public.cabin_types order by sort limit 1;

  -- Versión y registro de cambios.
  insert into public.blocks (id, cabin_type_id, unit, from_date, to_date, reason) values (v_block, v_cabin, 1, '2099-01-01', '2099-01-02', 'Otro');
  update public.blocks set notes = 'x' where id = v_block;
  select version into n from public.blocks where id = v_block;
  if n <> 2 then raise exception 'version esperada 2, hay %', n; end if;
  select count(*) into n from public.sync_changes where collection = 'blocks' and row_key = v_block::text and op = 'U';
  if n <> 2 then raise exception 'cambios U esperados 2, hay %', n; end if;

  -- Tombstone.
  delete from public.blocks where id = v_block;
  select count(*) into n from public.sync_changes where collection = 'blocks' and row_key = v_block::text and op = 'D';
  if n <> 1 then raise exception 'tombstone esperado 1, hay %', n; end if;

  -- Reserva importada: no encola correos.
  insert into public.reservations (code, source, external_ref, status, cabin_type_id, unit, check_in, check_out, adults, children, pet, decoration, estimated_arrival,
    guest_full_name, guest_doc_type, guest_doc_number, guest_email, guest_phone, guest_city, special_requests, consents, quote, deposit_due_at)
  values (v_code, 'import', 'chk-' || v_code, 'confirmed', v_cabin, 1, '2099-02-01', '2099-02-03', 2, 0, '{"hasPet":false,"smallBreedConfirmed":false}',
    '{"requested":false,"occasion":"","notes":""}', '15:00', 'Prueba Sincronización', 'SD', '3000000000', '', '+573000000000', '', '',
    '{"policies":false,"dataProcessing":false,"marketing":false}',
    '{"base":1000,"extraGuests":0,"extraAmount":0,"total":1000,"deposit":300,"balance":700,"pricePerNight":500,"extraPerNight":0,"nights":2}', now());

  -- Sin rol de equipo: sync_pull y el pago se niegan.
  begin
    perform public.sync_pull(v_cursor);
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then raise exception 'sync_pull debió negarse sin rol de equipo'; end if;

  select jsonb_build_object('sub', id, 'role', 'authenticated', 'app_metadata', jsonb_build_object('role', 'admin'))::text into claims from auth.users order by created_at limit 1;
  perform set_config('request.jwt.claims', claims, true);

  -- Pago idempotente, con su fecha real.
  res := public.register_manual_payment(v_code, 'deposit', 'prueba', 300, v_op, v_at);
  if res ->> 'outcome' = 'duplicate' then raise exception 'el primer pago no es duplicado'; end if;
  res := public.register_manual_payment(v_code, 'deposit', 'prueba', 300, v_op, v_at);
  if res ->> 'outcome' <> 'duplicate' then raise exception 'el pago repetido debió detectarse: %', res; end if;
  select paid_amount into n from public.reservations where code = v_code;
  if n <> 300 then raise exception 'pagado esperado 300, hay %', n; end if;
  select count(*) into n from public.payments where reservation_code = v_code;
  if n <> 1 then raise exception 'pagos esperados 1, hay %', n; end if;
  select count(*) into n from public.payments where reservation_code = v_code and approved_at = v_at;
  if n <> 1 then raise exception 'la fecha del pago debe ser la real'; end if;

  -- Fecha futura: se limita a ahora.
  res := public.register_manual_payment(v_code, 'balance', 'prueba', 100, gen_random_uuid(), now() + interval '5 days');
  select count(*) into n from public.payments where reservation_code = v_code and approved_at > now();
  if n <> 0 then raise exception 'un pago no puede quedar con fecha futura'; end if;

  -- Una nota cambia a su reserva, sin tombstone.
  insert into public.reservation_notes (reservation_code, text, client_op_id) values (v_code, 'nota', v_op);
  begin
    insert into public.reservation_notes (reservation_code, text, client_op_id) values (v_code, 'nota', v_op);
    raise exception 'la nota repetida debió rechazarse';
  exception when unique_violation then
    null;
  end;
  delete from public.reservation_notes where reservation_code = v_code;
  select count(*) into n from public.sync_changes where collection = 'reservations' and row_key = v_code and op = 'D';
  if n <> 0 then raise exception 'borrar una nota no es borrar la reserva'; end if;

  -- El cursor entrega lo de esta transacción (aún abierta) y no avanza más allá de ella.
  res := public.sync_pull(v_cursor);
  if not (res -> 'changes') @> jsonb_build_array(jsonb_build_object('collection', 'blocks', 'key', v_block::text, 'op', 'D')) then
    raise exception 'sync_pull no entregó el tombstone';
  end if;
  if (split_part(res ->> 'cursor', ':', 1))::xid8 > pg_current_xact_id() then raise exception 'el cursor pasó una transacción abierta'; end if;
  res := public.sync_pull(res ->> 'cursor');
  if not (res -> 'changes') @> jsonb_build_array(jsonb_build_object('collection', 'blocks', 'key', v_block::text, 'op', 'D')) then
    raise exception 'un cambio de una transacción abierta debe volver a entregarse';
  end if;

  raise notice 'ok';
end;
$$;

select 'comprobación de sincronización: ok' as resultado;
rollback;
