-- Equipo con roles, baños y reservas importadas desde Excel.
--
-- · Roles del panel (app_metadata.role, que el usuario no puede editar): 'admin' hace todo y 'recepcion' opera el día a
--   día. panel_role(), is_staff() e is_admin() los leen del JWT. Leer y operar (reservas, notas, bloqueos, clientes,
--   comprobantes, avisos, baños) pasa a is_staff(); borrar y lo que define el negocio (tarifas, cabañas, contenido del
--   sitio) sigue siendo de is_admin(). Recepción no cancela reservas: lo impide un trigger, también fuera del panel.
-- · Baños: estado (disponible, no disponible, en mantenimiento), opcionalmente asignados a una cabaña (tipo y unidad),
--   con bloqueos por fechas. Solo informan: no cambian la disponibilidad de las cabañas.
-- · Reservas importadas (source 'import'): referencia externa única (el mismo archivo no se importa dos veces), canal y
--   comisión. Entran confirmadas, finalizadas o canceladas, sin pagos registrados.
-- · Documento opcional: tipo 'SD' (sin documento); el número es el teléfono, así el cliente se agrupa por teléfono.

-- ───────────── Roles ─────────────
create or replace function public.panel_role() returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '')
$$;

create or replace function public.is_staff() returns boolean
language sql
stable
set search_path = ''
as $$
  select public.panel_role() in ('admin', 'recepcion')
$$;

create or replace function public.is_admin() returns boolean
language sql
stable
set search_path = ''
as $$
  select public.panel_role() = 'admin'
$$;

-- Reservas: el equipo las ve, las crea y las opera; solo un administrador las borra.
drop policy if exists "Administradores gestionan reservas" on public.reservations;
create policy "Equipo lee reservas" on public.reservations for select to authenticated using ((select public.is_staff()));
create policy "Equipo crea reservas" on public.reservations for insert to authenticated with check ((select public.is_staff()));
create policy "Equipo actualiza reservas" on public.reservations for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "Administradores borran reservas" on public.reservations for delete to authenticated using ((select public.is_admin()));

drop policy if exists "Administradores gestionan notas" on public.reservation_notes;
create policy "Equipo gestiona notas" on public.reservation_notes for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists "Administradores gestionan bloqueos" on public.blocks;
create policy "Equipo lee bloqueos" on public.blocks for select to authenticated using ((select public.is_staff()));
create policy "Equipo crea bloqueos" on public.blocks for insert to authenticated with check ((select public.is_staff()));
create policy "Equipo actualiza bloqueos" on public.blocks for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "Administradores borran bloqueos" on public.blocks for delete to authenticated using ((select public.is_admin()));

drop policy if exists "Administradores gestionan perfiles de clientes" on public.client_profiles;
create policy "Equipo lee perfiles de clientes" on public.client_profiles for select to authenticated using ((select public.is_staff()));
create policy "Equipo crea perfiles de clientes" on public.client_profiles for insert to authenticated with check ((select public.is_staff()));
create policy "Equipo actualiza perfiles de clientes" on public.client_profiles for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "Administradores borran perfiles de clientes" on public.client_profiles for delete to authenticated using ((select public.is_admin()));

drop policy if exists "Administradores gestionan registros de clientes" on public.client_entries;
create policy "Equipo lee registros de clientes" on public.client_entries for select to authenticated using ((select public.is_staff()));
create policy "Equipo crea registros de clientes" on public.client_entries for insert to authenticated with check ((select public.is_staff()));
create policy "Equipo actualiza registros de clientes" on public.client_entries for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "Administradores borran registros de clientes" on public.client_entries for delete to authenticated using ((select public.is_admin()));

drop policy if exists "Administradores gestionan comprobantes" on public.payment_proofs;
create policy "Equipo lee comprobantes" on public.payment_proofs for select to authenticated using ((select public.is_staff()));
create policy "Equipo revisa comprobantes" on public.payment_proofs for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "Administradores gestionan comprobantes" on public.payment_proofs for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Administradores gestionan notificaciones" on public.admin_notifications;
create policy "Equipo gestiona notificaciones" on public.admin_notifications for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists "Administradores leen pagos" on public.payments;
create policy "Equipo lee pagos" on public.payments for select to authenticated using ((select public.is_staff()));

drop policy if exists "Administradores leen correos" on public.email_outbox;
create policy "Equipo lee correos" on public.email_outbox for select to authenticated using ((select public.is_staff()));

drop policy if exists "Administradores leen comprobantes" on storage.objects;
create policy "Equipo lee comprobantes" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and (select public.is_staff()));

-- Lo que define el negocio: el equipo lo lee (el panel lo muestra) y solo un administrador lo cambia.
create policy "Equipo lee tipos de cabaña" on public.cabin_types for select to authenticated using ((select public.is_staff()));
create policy "Equipo lee temporadas" on public.rate_seasons for select to authenticated using ((select public.is_staff()));
create policy "Equipo lee la configuración" on public.site_settings for select to authenticated using ((select public.is_staff()));
create policy "Equipo lee las políticas" on public.site_policies for select to authenticated using ((select public.is_staff()));
create policy "Equipo lee las fotos" on public.site_photos for select to authenticated using ((select public.is_staff()));
create policy "Equipo lee los servicios" on public.site_services for select to authenticated using ((select public.is_staff()));

-- Recepción no cancela reservas (ni desde el panel ni con la API de la base de datos).
create function public.reservation_role_rules() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.panel_role() = 'recepcion' and new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.reservation_role_rules() from public, anon, authenticated;

create trigger reservations_role_rules before update on public.reservations
  for each row execute function public.reservation_role_rules();

-- Registrar un pago: todo el equipo (antes, solo administradores).
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
  if not public.is_staff() then
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

revoke execute on function public.register_manual_payment(text, public.payment_kind, text) from public, anon;
grant execute on function public.register_manual_payment(text, public.payment_kind, text) to authenticated;

-- ───────────── Baños ─────────────
create table public.bathrooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  status text not null default 'available' check (status in ('available', 'unavailable', 'maintenance')),
  cabin_type_id text references public.cabin_types (id) on delete set null,
  unit integer check (unit >= 1),
  notes text not null default '' check (length(notes) <= 300),
  status_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bathrooms_unit_needs_cabin check (unit is null or cabin_type_id is not null)
);

create index bathrooms_cabin_idx on public.bathrooms (cabin_type_id, unit);

create trigger bathrooms_updated_at before update on public.bathrooms
  for each row execute function public.set_updated_at();

create table public.bathroom_blocks (
  id uuid primary key default gen_random_uuid(),
  bathroom_id uuid not null references public.bathrooms (id) on delete cascade,
  from_date date not null,
  to_date date not null, -- incluido, como en los bloqueos de cabañas
  reason text not null check (length(reason) between 1 and 60),
  notes text not null default '' check (length(notes) <= 500),
  created_at timestamptz not null default now(),
  constraint bathroom_blocks_dates check (to_date >= from_date),
  constraint bathroom_blocks_no_overlap exclude using gist (bathroom_id with =, daterange(from_date, to_date, '[]') with &&)
);

create index bathroom_blocks_bathroom_idx on public.bathroom_blocks (bathroom_id, from_date);

alter table public.bathrooms enable row level security;
alter table public.bathroom_blocks enable row level security;

create policy "Equipo lee baños" on public.bathrooms for select to authenticated using ((select public.is_staff()));
create policy "Equipo actualiza baños" on public.bathrooms for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "Administradores crean baños" on public.bathrooms for insert to authenticated with check ((select public.is_admin()));
create policy "Administradores borran baños" on public.bathrooms for delete to authenticated using ((select public.is_admin()));

create policy "Equipo lee bloqueos de baños" on public.bathroom_blocks for select to authenticated using ((select public.is_staff()));
create policy "Equipo crea bloqueos de baños" on public.bathroom_blocks for insert to authenticated with check ((select public.is_staff()));
create policy "Equipo actualiza bloqueos de baños" on public.bathroom_blocks for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "Administradores borran bloqueos de baños" on public.bathroom_blocks for delete to authenticated using ((select public.is_admin()));

revoke all on public.bathrooms, public.bathroom_blocks from anon;
grant select, insert, update, delete on public.bathrooms, public.bathroom_blocks to authenticated, service_role;

alter publication supabase_realtime add table public.bathrooms, public.bathroom_blocks;

-- ───────────── Reservas importadas y documento opcional ─────────────
alter table public.reservations
  add column external_ref text check (external_ref is null or length(external_ref) between 1 and 80),
  add column channel text not null default '' check (length(channel) <= 40),
  add column commission integer not null default 0 check (commission >= 0);

create unique index reservations_external_ref_key on public.reservations (external_ref) where external_ref is not null;

alter table public.reservations drop constraint reservations_source_check;
alter table public.reservations add constraint reservations_source_check check (source in ('web', 'panel', 'import'));

alter table public.reservations drop constraint reservations_guest_doc_type_check;
alter table public.reservations add constraint reservations_guest_doc_type_check check (guest_doc_type in ('CC', 'CE', 'Pasaporte', 'PPT', 'SD'));

alter table public.client_profiles drop constraint client_profiles_client_key_check;
alter table public.client_profiles add constraint client_profiles_client_key_check check (client_key ~ '^(CC|CE|Pasaporte|PPT|SD):[A-Z0-9]{5,15}$');

-- Reglas de pago: una reserva importada entra ya confirmada, finalizada o cancelada, sin pagos registrados.
create or replace function public.reservation_payment_rules() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  total integer := (new.quote ->> 'total')::integer;
begin
  if tg_op = 'INSERT' then
    if new.source = 'import' then
      if new.status not in ('confirmed', 'completed', 'cancelled') or new.deposit_paid_at is not null or new.paid_amount <> 0 then
        raise exception 'INVALID_IMPORT' using errcode = 'P0001';
      end if;
      return new;
    end if;
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
