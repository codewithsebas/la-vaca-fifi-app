-- Reservas de La Vaca Fifí.
-- Acceso: el servidor Next.js usa la clave secreta (service_role) para las rutas públicas;
-- el panel usa la sesión del administrador (authenticated + app_metadata.role = 'admin').
-- El rol anon no tiene acceso a ninguna tabla.

create extension if not exists btree_gist with schema extensions;

create type public.reservation_status as enum (
  'pending_deposit', 'confirmed', 'cancelled', 'expired', 'rescheduled', 'checked_in', 'completed'
);

create table public.cabin_types (
  id text primary key,
  nombre text not null,
  precio_pareja integer not null check (precio_pareja >= 0),
  persona_adicional integer not null check (persona_adicional >= 0),
  max_personas integer not null check (max_personas between 1 and 12),
  units integer not null check (units >= 0),
  badge text not null default '',
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.reservations (
  code text primary key,
  status public.reservation_status not null default 'pending_deposit',
  cabin_type_id text not null references public.cabin_types (id),
  unit integer not null check (unit >= 1),
  check_in date not null,
  check_out date not null,
  adults integer not null check (adults >= 1),
  children integer not null default 0 check (children >= 0),
  pet jsonb not null default '{"hasPet": false, "smallBreedConfirmed": false}',
  decoration jsonb not null default '{"requested": false, "occasion": "", "notes": ""}',
  estimated_arrival text not null,
  guest_full_name text not null,
  guest_doc_type text not null check (guest_doc_type in ('CC', 'CE', 'Pasaporte', 'PPT')),
  guest_doc_number text not null,
  guest_email text not null,
  guest_phone text not null,
  guest_city text not null,
  special_requests text not null default '',
  consents jsonb not null,
  quote jsonb not null,
  deposit_due_at timestamptz not null,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_dates_check check (check_out > check_in),
  -- Garantía en la base de datos: una unidad no puede tener dos reservas activas que se crucen.
  constraint reservations_no_overlap exclude using gist (
    cabin_type_id with =,
    unit with =,
    daterange(check_in, check_out) with &&
  ) where (status in ('pending_deposit', 'confirmed', 'rescheduled', 'checked_in'))
);

create index reservations_pending_due_idx on public.reservations (deposit_due_at) where status = 'pending_deposit';
create index reservations_check_in_idx on public.reservations (check_in);

create table public.reservation_notes (
  id bigint generated always as identity primary key,
  reservation_code text not null references public.reservations (code) on delete cascade,
  text text not null check (length(text) between 1 and 2000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index reservation_notes_code_idx on public.reservation_notes (reservation_code);
create index reservation_notes_created_by_idx on public.reservation_notes (created_by);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  cabin_type_id text not null references public.cabin_types (id),
  unit integer not null check (unit >= 1),
  from_date date not null,
  to_date date not null,
  reason text not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint blocks_dates_check check (to_date >= from_date)
);

create index blocks_cabin_idx on public.blocks (cabin_type_id, from_date);
create index blocks_created_by_idx on public.blocks (created_by);

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

create trigger cabin_types_updated_at before update on public.cabin_types
  for each row execute function public.set_updated_at();
create trigger reservations_updated_at before update on public.reservations
  for each row execute function public.set_updated_at();

-- Row Level Security: solo administradores (rol en app_metadata, que el usuario no puede editar).
alter table public.cabin_types enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_notes enable row level security;
alter table public.blocks enable row level security;

create policy "Administradores gestionan tipos de cabaña" on public.cabin_types
  for all to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Administradores gestionan reservas" on public.reservations
  for all to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Administradores gestionan notas" on public.reservation_notes
  for all to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Administradores gestionan bloqueos" on public.blocks
  for all to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Permisos de tabla (se evalúan antes que RLS).
revoke all on public.cabin_types, public.reservations, public.reservation_notes, public.blocks from anon;
grant select, insert, update, delete on public.cabin_types, public.reservations, public.reservation_notes, public.blocks to authenticated, service_role;
grant usage, select on sequence public.reservation_notes_id_seq to authenticated, service_role;

-- Cabañas iniciales: los cuatro tipos de habitación que La Vaca Fifí publica en Booking.com. Tarifas de referencia
-- (desde $160.000 la noche para 2 con desayuno); ajusta tarifas en el panel y `units` al número real de cabañas por tipo.
insert into public.cabin_types (id, nombre, precio_pareja, persona_adicional, max_personas, units, badge, sort) values
  ('doble', 'Cabaña Doble', 160000, 40000, 2, 1, 'Desayuno incluido', 1),
  ('dos-camas', 'Cabaña Dos Camas', 160000, 40000, 4, 1, 'Hasta 4 personas', 2),
  ('familiar', 'Cabaña Familiar', 160000, 40000, 6, 1, 'Hasta 6 personas', 3),
  ('familiar-vista', 'Cabaña Familiar con Vista', 160000, 40000, 4, 1, 'Vista a la montaña', 4);
