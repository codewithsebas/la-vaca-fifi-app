-- Panel sin conexión: lo que el servidor necesita para sincronizar sin perder ni duplicar nada (docs/plan-offline-first.md).
-- Todo es aditivo: columnas con valor por defecto, tablas nuevas y disparadores. La aplicación anterior sigue funcionando igual.
--
-- · version: sube con cada cambio de la fila. Permite detectar que alguien más la modificó (control de concurrencia).
-- · sync_changes: registro de cambios y de borrados (tombstones), de cualquier origen: panel, sitio público o cron.
-- · sync_pull: los cambios desde un cursor. El cursor nunca avanza más allá de las transacciones aún abiertas.
-- · sync_ops: operaciones ya aplicadas: repetir una operación del mismo usuario no la aplica dos veces.
-- · client_op_id: atomicidad en lo aditivo; un pago o una nota no se duplican ni si el servidor cae a mitad de camino.

-- ───────────── Versiones ─────────────
alter table public.reservations add column version bigint not null default 1;
alter table public.blocks add column version bigint not null default 1;
alter table public.cabin_types add column version bigint not null default 1;
alter table public.rate_seasons add column version bigint not null default 1;
alter table public.client_profiles add column version bigint not null default 1;
alter table public.bathrooms add column version bigint not null default 1;
alter table public.bathroom_blocks add column version bigint not null default 1;
alter table public.payment_proofs add column version bigint not null default 1;
alter table public.site_settings add column version bigint not null default 1;
alter table public.site_services add column version bigint not null default 1;

create function public.bump_version() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;
revoke execute on function public.bump_version() from public, anon, authenticated;

create trigger reservations_version before update on public.reservations for each row execute function public.bump_version();
create trigger blocks_version before update on public.blocks for each row execute function public.bump_version();
create trigger cabin_types_version before update on public.cabin_types for each row execute function public.bump_version();
create trigger rate_seasons_version before update on public.rate_seasons for each row execute function public.bump_version();
create trigger client_profiles_version before update on public.client_profiles for each row execute function public.bump_version();
create trigger bathrooms_version before update on public.bathrooms for each row execute function public.bump_version();
create trigger bathroom_blocks_version before update on public.bathroom_blocks for each row execute function public.bump_version();
create trigger payment_proofs_version before update on public.payment_proofs for each row execute function public.bump_version();
create trigger site_settings_version before update on public.site_settings for each row execute function public.bump_version();
create trigger site_services_version before update on public.site_services for each row execute function public.bump_version();

-- ───────────── Registro de cambios ─────────────
create table public.sync_changes (
  seq bigint generated always as identity primary key,
  -- Transacción que hizo el cambio: ordena el cursor sin saltarse las que aún no terminan.
  tx xid8 not null default pg_current_xact_id(),
  collection text not null,
  row_key text not null,
  op text not null check (op in ('U', 'D')),
  changed_at timestamptz not null default now()
);

create index sync_changes_cursor_idx on public.sync_changes (tx, seq);
create index sync_changes_changed_at_idx on public.sync_changes (changed_at);

alter table public.sync_changes enable row level security;
create policy "Equipo lee los cambios" on public.sync_changes for select to authenticated using ((select public.is_staff()));

-- Argumentos: colección del panel, columna con la clave y, en tablas hijas, 'parent' (borrar un hijo cambia a su padre).
create function public.log_sync_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.sync_changes (collection, row_key, op)
  values (tg_argv[0], rec ->> tg_argv[1], case when tg_op = 'DELETE' and tg_nargs < 3 then 'D' else 'U' end);
  return null;
end;
$$;
revoke execute on function public.log_sync_change() from public, anon, authenticated;

create trigger reservations_sync after insert or update or delete on public.reservations for each row execute function public.log_sync_change('reservations', 'code');
create trigger reservation_notes_sync after insert or update or delete on public.reservation_notes for each row execute function public.log_sync_change('reservations', 'reservation_code', 'parent');
create trigger blocks_sync after insert or update or delete on public.blocks for each row execute function public.log_sync_change('blocks', 'id');
create trigger cabin_types_sync after insert or update or delete on public.cabin_types for each row execute function public.log_sync_change('cabinTypes', 'id');
create trigger rate_seasons_sync after insert or update or delete on public.rate_seasons for each row execute function public.log_sync_change('seasons', 'id');
create trigger client_profiles_sync after insert or update or delete on public.client_profiles for each row execute function public.log_sync_change('clients', 'client_key');
create trigger client_entries_sync after insert or update or delete on public.client_entries for each row execute function public.log_sync_change('clients', 'client_key', 'parent');
create trigger payment_proofs_sync after insert or update or delete on public.payment_proofs for each row execute function public.log_sync_change('proofs', 'id');
create trigger payments_sync after insert or update or delete on public.payments for each row execute function public.log_sync_change('payments', 'id');
create trigger email_outbox_sync after insert or update or delete on public.email_outbox for each row execute function public.log_sync_change('emails', 'id');
create trigger admin_notifications_sync after insert or update or delete on public.admin_notifications for each row execute function public.log_sync_change('notifications', 'id');
create trigger bathrooms_sync after insert or update or delete on public.bathrooms for each row execute function public.log_sync_change('bathrooms', 'id');
create trigger bathroom_blocks_sync after insert or update or delete on public.bathroom_blocks for each row execute function public.log_sync_change('bathroomBlocks', 'id');
-- El contenido del sitio se sincroniza como un solo documento.
create trigger site_settings_sync after insert or update or delete on public.site_settings for each row execute function public.log_sync_change('site', 'id', 'parent');
create trigger site_policies_sync after insert or update or delete on public.site_policies for each row execute function public.log_sync_change('site', 'id', 'parent');
create trigger site_photos_sync after insert or update or delete on public.site_photos for each row execute function public.log_sync_change('site', 'slot', 'parent');
create trigger site_services_sync after insert or update or delete on public.site_services for each row execute function public.log_sync_change('site', 'id', 'parent');

-- Cursor: «transacción:secuencia». El cursor de la carga inicial se pide ANTES de leer los datos.
create function public.sync_cursor() returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_staff() then pg_snapshot_xmin(pg_current_snapshot())::text || ':0' end;
$$;
revoke execute on function public.sync_cursor() from public, anon;
grant execute on function public.sync_cursor() to authenticated;

-- Devuelve los cambios visibles después del cursor y el cursor siguiente. Un cambio de una transacción más reciente que la
-- más antigua aún abierta se entrega de inmediato, pero el cursor no lo pasa: se entrega otra vez y la aplicación lo funde sin
-- efecto. Así nunca se pierde el de la transacción abierta, que al confirmarse tendrá un número menor.
create function public.sync_pull(p_cursor text, p_limit integer default 500) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe xid8 := pg_snapshot_xmin(pg_current_snapshot());
  after_tx xid8 := split_part(p_cursor, ':', 1)::xid8;
  after_seq bigint := split_part(p_cursor, ':', 2)::bigint;
  page integer := least(greatest(coalesce(p_limit, 500), 1), 1000);
  items jsonb;
  total integer;
  last_tx xid8;
  last_seq bigint;
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('collection', c.collection, 'key', c.row_key, 'op', c.op) order by c.tx, c.seq), '[]'::jsonb), count(*)
  into items, total
  from (
    select s.tx, s.seq, s.collection, s.row_key, s.op
    from public.sync_changes s
    where (s.tx, s.seq) > (after_tx, after_seq)
    order by s.tx, s.seq
    limit page
  ) c;

  if total < page then
    return jsonb_build_object('changes', items, 'cursor', safe::text || ':0', 'hasMore', false);
  end if;

  select s.tx, s.seq into last_tx, last_seq
  from (
    select x.tx, x.seq
    from public.sync_changes x
    where (x.tx, x.seq) > (after_tx, after_seq)
    order by x.tx, x.seq
    limit page
  ) s
  where s.tx < safe
  order by s.tx desc, s.seq desc
  limit 1;

  if last_tx is null then
    return jsonb_build_object('changes', items, 'cursor', safe::text || ':0', 'hasMore', false);
  end if;
  return jsonb_build_object('changes', items, 'cursor', last_tx::text || ':' || last_seq::text, 'hasMore', true);
end;
$$;
revoke execute on function public.sync_pull(text, integer) from public, anon;
grant execute on function public.sync_pull(text, integer) to authenticated;

-- Señal en tiempo real de que hay cambios (el contenido se pide con sync_pull).
alter publication supabase_realtime add table public.sync_changes;

-- ───────────── Operaciones aplicadas ─────────────
-- No guarda el contenido de la operación ni su respuesta: solo que ya se aplicó, sin datos de huéspedes.
create table public.sync_ops (
  op_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  op_type text not null default '' check (length(op_type) <= 60),
  status text not null default 'running' check (status in ('running', 'done')),
  http_status integer,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index sync_ops_user_idx on public.sync_ops (user_id);
create index sync_ops_started_at_idx on public.sync_ops (started_at);

alter table public.sync_ops enable row level security;
create policy "Cada usuario lee sus operaciones" on public.sync_ops for select to authenticated using (user_id = (select auth.uid()));
create policy "Cada usuario registra sus operaciones" on public.sync_ops for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_staff()));
create policy "Cada usuario actualiza sus operaciones" on public.sync_ops for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Cada usuario libera sus operaciones" on public.sync_ops for delete to authenticated using (user_id = (select auth.uid()));

-- Limpieza diaria. La aplicación vuelve a descargar todo si su cursor tiene más de 60 días.
create function public.purge_sync_log() returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.sync_changes where changed_at < now() - interval '90 days';
  delete from public.sync_ops where started_at < now() - interval '90 days';
$$;
revoke execute on function public.purge_sync_log() from public, anon, authenticated;
select cron.schedule('limpiar-registro-de-sincronizacion', '30 8 * * *', $$select public.purge_sync_log()$$);

-- ───────────── Altas sin duplicados ─────────────
alter table public.payments add column client_op_id uuid;
alter table public.reservation_notes add column client_op_id uuid;
alter table public.client_entries add column client_op_id uuid;
create unique index payments_client_op_idx on public.payments (client_op_id) where client_op_id is not null;
create unique index reservation_notes_client_op_idx on public.reservation_notes (client_op_id) where client_op_id is not null;
create unique index client_entries_client_op_idx on public.client_entries (client_op_id) where client_op_id is not null;

-- ───────────── Pago manual idempotente y con su fecha real ─────────────
-- p_op_id: repetir la operación no registra otro pago. p_occurred_at: cuándo se recibió el dinero (lo registró un dispositivo
-- sin conexión); hasta 30 días atrás y nunca en el futuro. Finanzas lo cuenta ese día. Compatible con las llamadas anteriores.
drop function if exists public.register_manual_payment(text, public.payment_kind, text, integer);

create function public.register_manual_payment(
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
  total integer;
  owed integer;
  amt integer;
  k public.payment_kind;
  pending boolean;
  covered boolean;
  paid_at timestamptz := least(now(), greatest(coalesce(p_occurred_at, now()), now() - interval '30 days'));
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into r from public.reservations where code = p_code for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;

  -- Después del bloqueo: dos intentos simultáneos de la misma operación se turnan y el segundo ve el pago del primero.
  if p_op_id is not null and exists (select 1 from public.payments where client_op_id = p_op_id) then
    return jsonb_build_object('code', r.code, 'outcome', 'duplicate', 'amount', 0);
  end if;

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

  insert into public.payments (reference, reservation_code, kind, amount, provider, status, status_detail, approved_at, client_op_id)
  values (
    r.code || '-' || case k when 'deposit' then 'A' when 'full' then 'T' else 'S' end || '-M' || upper(substr(md5(gen_random_uuid()::text), 1, 6)),
    r.code, k, amt, 'manual', 'approved', left(coalesce(nullif(trim(p_note), ''), 'Registrado por el equipo'), 300), paid_at, p_op_id
  );

  begin
    -- Una retención que venció pudo perder sus fechas: la restricción de exclusión impide la doble reserva.
    update public.reservations
      set status = case when pending then 'confirmed'::public.reservation_status else status end,
          deposit_paid_at = coalesce(deposit_paid_at, paid_at),
          balance_paid_at = case when covered then paid_at else balance_paid_at end,
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

revoke execute on function public.register_manual_payment(text, public.payment_kind, text, integer, uuid, timestamptz) from public, anon;
grant execute on function public.register_manual_payment(text, public.payment_kind, text, integer, uuid, timestamptz) to authenticated, service_role;
