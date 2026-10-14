-- Panel v2: cabañas administrables, temporadas de tarifa, bloqueos con notas, pagos registrados,
-- clientes con valoración interna, comprobantes de pago privados, notificaciones del panel y Realtime.
-- Todo lo nuevo es solo para administradores (RLS con app_metadata.role = 'admin'); el rol anon no tiene acceso.

-- ───────────── Cabañas ─────────────
alter table public.cabin_types
  add column descripcion text not null default '' check (length(descripcion) <= 1200),
  add column caracteristicas text[] not null default '{}' check (cardinality(caracteristicas) <= 20),
  add column fotos text[] not null default '{}' check (cardinality(fotos) <= 12),
  add column activa boolean not null default true,
  add column created_at timestamptz not null default now(),
  add constraint cabin_types_id_format check (id ~ '^[a-z0-9-]{2,40}$');

-- ───────────── Temporadas de tarifa ─────────────
-- Precio por noche distinto en un rango de fechas (noches de from_date a to_date, inclusive).
create table public.rate_seasons (
  id uuid primary key default gen_random_uuid(),
  cabin_type_id text not null references public.cabin_types (id) on delete cascade,
  nombre text not null check (length(nombre) between 1 and 80),
  from_date date not null,
  to_date date not null,
  precio_pareja integer not null check (precio_pareja between 0 and 50000000),
  persona_adicional integer not null check (persona_adicional between 0 and 50000000),
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rate_seasons_dates_check check (to_date >= from_date),
  -- Dos temporadas activas de la misma cabaña no pueden cruzarse: el precio de cada noche es único.
  constraint rate_seasons_no_overlap exclude using gist (
    cabin_type_id with =,
    daterange(from_date, to_date, '[]') with &&
  ) where (activa)
);

create index rate_seasons_cabin_idx on public.rate_seasons (cabin_type_id, from_date);

create trigger rate_seasons_updated_at before update on public.rate_seasons
  for each row execute function public.set_updated_at();

-- ───────────── Bloqueos ─────────────
alter table public.blocks
  add column notes text not null default '' check (length(notes) <= 500),
  add column updated_at timestamptz not null default now(),
  drop constraint blocks_cabin_type_id_fkey,
  add constraint blocks_cabin_type_id_fkey foreign key (cabin_type_id) references public.cabin_types (id) on delete cascade,
  -- Una unidad no puede tener dos bloqueos que se crucen.
  add constraint blocks_no_overlap exclude using gist (
    cabin_type_id with =,
    unit with =,
    daterange(from_date, to_date, '[]') with &&
  );

create trigger blocks_updated_at before update on public.blocks
  for each row execute function public.set_updated_at();

-- ───────────── Reservas: pagos y cliente ─────────────
alter table public.reservations
  add column deposit_paid_at timestamptz,
  add column balance_paid_at timestamptz,
  -- Un cliente = tipo y número de documento.
  add column client_key text generated always as (guest_doc_type || ':' || upper(guest_doc_number)) stored;

create index reservations_client_key_idx on public.reservations (client_key);
create index reservations_created_at_idx on public.reservations (created_at);

-- Reservas que ya estaban confirmadas: el abono se dio por recibido en su última actualización.
update public.reservations set deposit_paid_at = updated_at
  where status in ('confirmed', 'rescheduled', 'checked_in', 'completed') and deposit_paid_at is null;
update public.reservations set balance_paid_at = updated_at
  where status in ('checked_in', 'completed') and balance_paid_at is null;

-- ───────────── Clientes: valoración interna ─────────────
-- Información exclusivamente administrativa: nunca se expone en rutas públicas.
create table public.client_profiles (
  client_key text primary key check (client_key ~ '^(CC|CE|Pasaporte|PPT):[A-Z0-9]{5,15}$'),
  rating smallint check (rating between 1 and 5),
  trust text not null default 'sin_evaluar' check (trust in ('sin_evaluar', 'alta', 'media', 'baja', 'no_recomendado')),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  preferences text not null default '' check (length(preferences) <= 2000),
  summary text not null default '' check (length(summary) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger client_profiles_updated_at before update on public.client_profiles
  for each row execute function public.set_updated_at();

create table public.client_entries (
  id bigint generated always as identity primary key,
  client_key text not null references public.client_profiles (client_key) on delete cascade,
  kind text not null check (kind in ('note', 'incident')),
  severity text check (severity in ('leve', 'moderada', 'grave')),
  text text not null check (length(text) between 1 and 2000),
  reservation_code text references public.reservations (code) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint client_entries_incident_severity check ((kind = 'incident') = (severity is not null))
);

create index client_entries_client_idx on public.client_entries (client_key, created_at desc);
create index client_entries_reservation_idx on public.client_entries (reservation_code);
create index client_entries_created_by_idx on public.client_entries (created_by);

-- ───────────── Comprobantes de pago ─────────────
create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  reservation_code text not null references public.reservations (code) on delete cascade,
  path text not null unique,
  file_name text not null check (length(file_name) between 1 and 200),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size integer not null check (size between 1 and 10485760),
  note text not null default '' check (length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text not null default '' check (length(review_note) <= 500),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index payment_proofs_reservation_idx on public.payment_proofs (reservation_code, created_at desc);
create index payment_proofs_reviewed_by_idx on public.payment_proofs (reviewed_by);
create index payment_proofs_pending_idx on public.payment_proofs (created_at) where status = 'pending';

-- Bucket privado: los archivos solo se ven con URL firmada de corta duración generada para un administrador.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

create policy "Administradores leen comprobantes" on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-proofs' and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

-- ───────────── Notificaciones del panel ─────────────
create table public.admin_notifications (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('reservation_created', 'reservation_cancelled', 'reservation_expired', 'proof_uploaded', 'proof_approved', 'proof_rejected')),
  title text not null check (length(title) <= 160),
  body text not null default '' check (length(body) <= 400),
  reservation_code text references public.reservations (code) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index admin_notifications_created_idx on public.admin_notifications (created_at desc);
create index admin_notifications_reservation_idx on public.admin_notifications (reservation_code);

-- Lo que hace el propio administrador (sesión con auth.uid()) queda en el historial ya leído;
-- lo que llega del sitio o del sistema (sin sesión) queda sin leer.
create function public.notify_reservation_change() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  seen timestamptz := case when auth.uid() is null then null else now() end;
  cabin text := coalesce((select c.nombre from public.cabin_types c where c.id = new.cabin_type_id), new.cabin_type_id);
  stay text := to_char(new.check_in, 'DD/MM') || ' → ' || to_char(new.check_out, 'DD/MM');
begin
  if tg_op = 'INSERT' then
    insert into public.admin_notifications (kind, title, body, reservation_code, read_at)
    values ('reservation_created', 'Nueva reserva de ' || new.guest_full_name, cabin || ' · ' || stay || ' · ' || new.code, new.code, seen);
  elsif new.status is distinct from old.status and new.status in ('cancelled', 'expired') then
    insert into public.admin_notifications (kind, title, body, reservation_code, read_at)
    values (
      'reservation_' || new.status,
      case new.status when 'cancelled' then 'Reserva cancelada · ' else 'Solicitud vencida sin abono · ' end || new.code,
      new.guest_full_name || ' · ' || cabin || ' · ' || stay,
      new.code,
      seen
    );
  end if;
  return new;
end;
$$;

create function public.notify_proof_change() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  seen timestamptz := case when auth.uid() is null then null else now() end;
  guest text := coalesce((select r.guest_full_name from public.reservations r where r.code = new.reservation_code), '');
begin
  if tg_op = 'INSERT' then
    insert into public.admin_notifications (kind, title, body, reservation_code, read_at)
    values ('proof_uploaded', 'Nuevo comprobante de pago · ' || new.reservation_code, guest || ' subió un comprobante para revisar.', new.reservation_code, seen);
  elsif new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    insert into public.admin_notifications (kind, title, body, reservation_code, read_at)
    values (
      'proof_' || new.status,
      case new.status when 'approved' then 'Comprobante aprobado · ' else 'Comprobante rechazado · ' end || new.reservation_code,
      guest,
      new.reservation_code,
      seen
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.notify_reservation_change() from public, anon, authenticated;
revoke execute on function public.notify_proof_change() from public, anon, authenticated;

create trigger reservations_notify after insert or update of status on public.reservations
  for each row execute function public.notify_reservation_change();
create trigger payment_proofs_notify after insert or update of status on public.payment_proofs
  for each row execute function public.notify_proof_change();

-- ───────────── Contenido del sitio ─────────────
-- Textos editables de la portada, nota de ubicación y redes sociales (validados en la API).
alter table public.site_settings add column content jsonb not null default '{}'::jsonb;

-- ───────────── Seguridad ─────────────
alter table public.rate_seasons enable row level security;
alter table public.client_profiles enable row level security;
alter table public.client_entries enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.admin_notifications enable row level security;

create policy "Administradores gestionan temporadas" on public.rate_seasons
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Administradores gestionan perfiles de clientes" on public.client_profiles
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Administradores gestionan registros de clientes" on public.client_entries
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Administradores gestionan comprobantes" on public.payment_proofs
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Administradores gestionan notificaciones" on public.admin_notifications
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

revoke all on public.rate_seasons, public.client_profiles, public.client_entries, public.payment_proofs, public.admin_notifications from anon;
grant select, insert, update, delete on public.rate_seasons, public.client_profiles, public.client_entries, public.payment_proofs, public.admin_notifications to authenticated, service_role;
grant usage, select on sequence public.client_entries_id_seq, public.admin_notifications_id_seq to authenticated, service_role;

-- ───────────── Tiempo real ─────────────
-- El panel escucha estos cambios con la sesión del administrador (Realtime aplica RLS a cada suscriptor).
alter publication supabase_realtime add table public.reservations, public.payment_proofs, public.admin_notifications, public.blocks;
