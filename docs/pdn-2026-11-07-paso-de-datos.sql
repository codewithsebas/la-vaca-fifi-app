-- PDN · paso de datos de la ventana de noviembre (docs/plan-pdn-2026-11-07.md §3).
-- Solo para PDN (menpgghjhztsswnmpzjk). No es una migración: no va en supabase/migrations ni se corre en QA.
--
-- Cuándo: después de 20261105000000 y 20261105010000, y antes de 20261105020000.
-- Cómo:   primero de ensayo, cambiando el «commit» del final por «rollback» y revisando el resultado; luego de verdad.
--
-- Qué hace, en una sola transacción:
--   1. Respalda en tablas aparte las reservas y las cabañas tal como estaban.
--   2. Corrige las reservas de Booking que se cancelaron y rehicieron a mano el 4 y 5 de noviembre: reactiva las originales
--      (confirmadas, de Booking) en la cabaña que eligió el equipo, cancela los duplicados y las que Booking canceló, y crea
--      la segunda cabaña de las reservas de Booking de 2 habitaciones (con valor 0: el valor ya está en la principal).
--   3. Deja las 12 cabañas físicas: la «Dos Camas» unidad 1 (Cabaña 9) pasa a ser la unidad 2 de «Familiar» y la unidad 2
--      (Cabaña 2) queda como única unidad de «Dos Camas». Los demás tipos conservan sus unidades; solo se les pone el número.
--   4. Comprueba conteos y que no quede ninguna reserva viva fuera de su cabaña; si algo no cuadra, falla y no cambia nada.
-- Ningún paso cambia fechas ni valores de las reservas existentes. Los correos y avisos se apagan durante la transacción.

begin;

alter table public.reservations disable trigger reservations_emails;
alter table public.reservations disable trigger reservations_notify;

-- 1. Respaldos dentro de la base (se borran a mano cuando todo esté validado).
create table public._respaldo_20261107_reservas as select * from public.reservations;
create table public._respaldo_20261107_cabanas as select * from public.cabin_types;

create temp table _antes on commit drop as
select count(*) as total,
       count(*) filter (where status in ('pending_deposit', 'confirmed', 'rescheduled', 'checked_in')) as vivas
from public.reservations;

-- 2a. Duplicados hechos a mano y reservas que Booking canceló: canceladas (primero, para liberar sus noches).
--     Duplicados: VF-HMQME, VF-LJ5UG, VF-TP3L3, VF-T5J9W, VF-JM64H, VF-SKQT2.
--     Segunda cabaña hecha a mano (se recrea en 2c): VF-AJF49, VF-DBEW9, VF-LPHUT.
--     Canceladas en Booking: VF-DHM7L, VF-YRCC4, VF-DFE7U.
do $$
declare n integer;
begin
  update public.reservations set status = 'cancelled'
  where code in ('VF-HMQME', 'VF-LJ5UG', 'VF-TP3L3', 'VF-T5J9W', 'VF-JM64H', 'VF-SKQT2',
                 'VF-AJF49', 'VF-DBEW9', 'VF-LPHUT',
                 'VF-DHM7L', 'VF-YRCC4', 'VF-DFE7U')
    and status in ('pending_deposit', 'confirmed', 'expired');
  get diagnostics n = row_count;
  if n <> 12 then raise exception 'Se esperaban 12 cancelaciones y fueron %', n; end if;
end $$;

-- 2b. Reservas originales de Booking: de nuevo confirmadas, en la cabaña (tipo y unidad actuales de PDN) que eligió el
--     equipo al rehacerlas, y con las personas que anotó el equipo.
do $$
declare n integer;
begin
  update public.reservations r
  set status = 'confirmed', cabin_type_id = v.tipo, unit = v.u, adults = coalesce(d.adults, r.adults), children = coalesce(d.children, r.children)
  from (values
    ('VF-SVWEY', 'doble', 6, 'VF-LNS2D'),          -- 14–15 nov
    ('VF-VLYHZ', 'dos-camas', 2, 'VF-7MNN4'),      -- 14–15 nov
    ('VF-V57WC', 'familiar-vista', 1, 'VF-J5HUW'), -- 14–15 nov
    ('VF-DXHNH', 'dos-camas', 2, 'VF-UQX7Q'),      -- 15–16 nov
    ('VF-K23J3', 'familiar', 1, 'VF-HMQME'),       -- 21–23 dic
    ('VF-DT7PU', 'familiar-vista', 1, 'VF-LJ5UG'), -- 25–27 dic
    ('VF-AFQGH', 'dos-camas', 2, 'VF-TP3L3'),      -- 25–26 dic
    ('VF-36APL', 'familiar-vista', 1, 'VF-T5J9W'), -- 30 dic–3 ene (cabaña 1 de 2)
    ('VF-K6CE5', 'familiar', 1, 'VF-JM64H'),       -- 31 dic–2 ene
    ('VF-9EMTY', 'dos-camas', 2, 'VF-SKQT2')       -- 2–3 ene
  ) as v(code, tipo, u, duplicado)
  left join public.reservations d on d.code = v.duplicado
  where r.code = v.code and r.status = 'cancelled' and r.source = 'import';
  get diagnostics n = row_count;
  if n <> 10 then raise exception 'Se esperaban 10 reactivaciones y fueron %', n; end if;
end $$;

-- 2c. Segunda cabaña de las reservas de Booking de 2 habitaciones: una reserva de Booking (confirmada, valor 0) copiada de la
--     que hizo el equipo a mano, con código nuevo. La principal conserva el valor total que cobró Booking.
do $$
declare
  cols text;
  n integer := 0;
  v record;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns where table_schema = 'public' and table_name = 'reservations' and is_generated = 'NEVER';
  for v in
    select * from (values
      ('VF-AJF49', 'VF-HDFFL'),  -- 26–28 dic
      ('VF-DBEW9', 'VF-MFXDK'),  -- 2–5 ene
      ('VF-LPHUT', 'VF-36APL')   -- 30 dic–3 ene
    ) as t(copia, principal)
  loop
    execute format(
      'insert into public.reservations (%s) select %s from jsonb_populate_record(null::public.reservations, $1)', cols, cols)
    using (
      select to_jsonb(c) || jsonb_build_object(
        'code', 'VF-' || upper(substr(md5(gen_random_uuid()::text), 1, 5)),
        'status', 'confirmed', 'source', 'import', 'channel', 'Booking',
        'external_ref', null, 'idempotency_key', null, 'live_key', null,
        'paid_amount', 0, 'deposit_paid_at', null, 'balance_paid_at', null, 'checked_in_at', null,
        'special_requests', left(trim(coalesce(c.special_requests, '') || ' Segunda cabaña de la reserva de Booking ' || v.principal || '.'), 1000),
        'quote', c.quote || jsonb_build_object('total', 0, 'deposit', 0, 'balance', 0, 'base', 0),
        'version', 1)
      from public.reservations c where c.code = v.copia);
    n := n + 1;
  end loop;
  if n <> 3 then raise exception 'Se esperaban 3 segundas cabañas y fueron %', n; end if;
end $$;

-- 3. Las 12 cabañas físicas. Equivalencias confirmadas por el responsable el 7 de noviembre de 2026:
--    doble 1…7 = Cabañas 1, 3, 4, 5, 6, 7, 8 · dos-camas 1 = Cabaña 9 → familiar 2 · dos-camas 2 = Cabaña 2 → dos-camas 1 ·
--    familiar 1 = Cabaña 12 · familiar-vista 1 y 2 = Cabañas 10 y 11.
create table public._mapa_cabanas_20261107 as
select code, cabin_type_id as tipo_antes, unit as unidad_antes,
       case when cabin_type_id = 'dos-camas' and unit = 1 then 'familiar' else cabin_type_id end as tipo_despues,
       case when cabin_type_id = 'dos-camas' and unit = 1 then 2
            when cabin_type_id = 'dos-camas' and unit = 2 then 1
            else unit end as unidad_despues
from public.reservations;

update public.cabin_types set units = 2 where id = 'familiar'; -- primero se agrega la unidad que recibe la Cabaña 9

-- Dos pasos para que la restricción de exclusión no choque con estados intermedios.
update public.reservations r set unit = m.unidad_despues + 100, cabin_type_id = m.tipo_despues
from public._mapa_cabanas_20261107 m
where r.code = m.code and (m.tipo_antes, m.unidad_antes) is distinct from (m.tipo_despues, m.unidad_despues);
update public.reservations r set unit = r.unit - 100
from public._mapa_cabanas_20261107 m
where r.code = m.code and (m.tipo_antes, m.unidad_antes) is distinct from (m.tipo_despues, m.unidad_despues);

update public.blocks b set cabin_type_id = 'familiar', unit = 2 where b.cabin_type_id = 'dos-camas' and b.unit = 1;

update public.cabin_types set units = 7, unit_labels = '{1,3,4,5,6,7,8}', max_personas = 2 where id = 'doble';
update public.cabin_types set units = 1, unit_labels = '{2}', max_personas = 4 where id = 'dos-camas';
update public.cabin_types set units = 2, unit_labels = '{12,9}', max_personas = 4 where id = 'familiar';
update public.cabin_types set units = 2, unit_labels = '{10,11}', max_personas = 6 where id = 'familiar-vista';

-- 4. Comprobaciones: si alguna falla, la transacción se deshace entera.
do $$
declare
  a record;
  total integer;
  vivas integer;
  fuera integer;
begin
  select * into a from _antes;
  select count(*), count(*) filter (where status in ('pending_deposit', 'confirmed', 'rescheduled', 'checked_in'))
    into total, vivas from public.reservations;
  -- Solo se agregan las 3 segundas cabañas; nada se borra.
  if total <> a.total + 3 then raise exception 'Reservas: antes %, ahora %', a.total, total; end if;
  if (select count(*) from public.reservations where status = 'confirmed' and source = 'import' and code in
        ('VF-SVWEY', 'VF-VLYHZ', 'VF-V57WC', 'VF-DXHNH', 'VF-K23J3', 'VF-DT7PU', 'VF-AFQGH', 'VF-36APL', 'VF-K6CE5', 'VF-9EMTY')) <> 10 then
    raise exception 'No quedaron confirmadas las 10 reservas de Booking reactivadas';
  end if;
  if (select count(*) from public.reservations where status = 'cancelled' and code in
        ('VF-HMQME', 'VF-LJ5UG', 'VF-TP3L3', 'VF-T5J9W', 'VF-JM64H', 'VF-SKQT2', 'VF-AJF49', 'VF-DBEW9', 'VF-LPHUT',
         'VF-DHM7L', 'VF-YRCC4', 'VF-DFE7U')) <> 12 then
    raise exception 'No quedaron canceladas las 12 reservas previstas';
  end if;
  raise notice 'Vivas: antes %, ahora %', a.vivas, vivas;
  select count(*) into fuera from public.reservations r join public.cabin_types c on c.id = r.cabin_type_id where r.unit > c.units;
  if fuera > 0 then raise exception '% reservas quedaron en una unidad que no existe', fuera; end if;
  select count(*) into fuera from public.blocks b join public.cabin_types c on c.id = b.cabin_type_id where b.unit > c.units;
  if fuera > 0 then raise exception '% bloqueos quedaron en una unidad que no existe', fuera; end if;
  if exists (select 1 from public.reservations r join public._respaldo_20261107_reservas o using (code)
             where (r.check_in, r.check_out, r.quote) is distinct from (o.check_in, o.check_out, o.quote)) then
    raise exception 'Alguna reserva cambió de fechas o de valor';
  end if;
end $$;

alter table public.reservations enable trigger reservations_notify;
alter table public.reservations enable trigger reservations_emails;

-- Resumen para revisar antes del commit (en el ensayo, antes del rollback).
select r.cabin_type_id, r.unit, c.unit_labels[r.unit] as cabana, r.code, r.status, r.check_in, r.check_out, r.source
from public.reservations r join public.cabin_types c on c.id = r.cabin_type_id
where r.check_out >= current_date and r.status in ('pending_deposit', 'confirmed', 'rescheduled', 'checked_in')
order by c.unit_labels[r.unit]::integer, r.check_in;

commit; -- en el ensayo: rollback;
