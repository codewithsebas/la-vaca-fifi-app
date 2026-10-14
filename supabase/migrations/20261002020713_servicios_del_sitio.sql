-- Servicios de la sección «Servicios incluidos»: se crean, editan, ocultan, ordenan y eliminan desde el panel.
-- icon: clave de un ícono de lib/service-icons.ts; note: etiqueta opcional («Valor adicional»).
create table public.site_services (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 60),
  description text not null default '' check (length(description) <= 160),
  icon text not null default 'check' check (icon ~ '^[a-z0-9-]{2,30}$'),
  note text not null default '' check (length(note) <= 30),
  visible boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index site_services_sort_idx on public.site_services (sort);

create trigger site_services_updated_at before update on public.site_services
  for each row execute function public.set_updated_at();

alter table public.site_services enable row level security;
create policy "Administradores gestionan los servicios" on public.site_services
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
revoke all on public.site_services from anon;
grant select, insert, update, delete on public.site_services to authenticated, service_role;

-- Los servicios que ya mostraba el sitio, en el mismo orden.
insert into public.site_services (title, icon, note, sort) values
  ('Domo geodésico', 'domo', '', 1),
  ('Jacuzzi privado al aire libre', 'jacuzzi', '', 2),
  ('Cielo estrellado', 'estrellas', '', 3),
  ('Cama king', 'cama', '', 4),
  ('Baño privado con ducha', 'ducha', '', 5),
  ('Calefacción', 'calefaccion', '', 6),
  ('Desayuno en tu domo', 'desayuno', '', 7),
  ('Terraza con vista a las montañas', 'montana', '', 8),
  ('Zona de fogata', 'fogata', '', 9),
  ('Minibar', 'minibar', '', 10),
  ('Juegos de mesa', 'juegos', '', 11),
  ('Parqueadero privado', 'parqueadero', '', 12),
  ('Pet friendly, sin costo', 'mascota', '', 13),
  ('Vino y decoración para ocasiones', 'corazon', 'Valor adicional', 14);
