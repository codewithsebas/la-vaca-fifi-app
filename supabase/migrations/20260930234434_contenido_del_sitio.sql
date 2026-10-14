-- Contenido editable desde el panel: horarios, contacto, políticas e imágenes del sitio.

-- Una sola fila con la configuración general.
create table public.site_settings (
  id boolean primary key default true check (id),
  check_in_start time not null,
  check_in_end time not null,
  check_out_time time not null,
  phones text[] not null check (cardinality(phones) between 1 and 5),
  whatsapp text not null check (whatsapp ~ '^[0-9]{10,15}$'),
  rnt text not null default '',
  updated_at timestamptz not null default now(),
  constraint site_settings_check_in_window check (check_in_end > check_in_start)
);

create table public.site_policies (
  id uuid primary key default gen_random_uuid(),
  question text not null check (length(question) between 1 and 120),
  answer text not null check (length(answer) between 1 and 2000),
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.site_photos (
  slot text primary key check (slot ~ '^[a-z0-9-]{2,40}$'),
  path text not null,
  updated_at timestamptz not null default now()
);

create trigger site_settings_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();
create trigger site_policies_updated_at before update on public.site_policies
  for each row execute function public.set_updated_at();
create trigger site_photos_updated_at before update on public.site_photos
  for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;
alter table public.site_policies enable row level security;
alter table public.site_photos enable row level security;

create policy "Administradores gestionan la configuración" on public.site_settings
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Administradores gestionan las políticas" on public.site_policies
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Administradores gestionan las fotos" on public.site_photos
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

revoke all on public.site_settings, public.site_policies, public.site_photos from anon;
grant select, insert, update, delete on public.site_settings, public.site_policies, public.site_photos to authenticated, service_role;

-- Bucket público de lectura (las fotos se muestran en la web); solo administradores escriben.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-images', 'site-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Administradores leen imágenes del sitio" on storage.objects
  for select to authenticated
  using (bucket_id = 'site-images' and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Administradores suben imágenes del sitio" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-images' and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Administradores actualizan imágenes del sitio" on storage.objects
  for update to authenticated
  using (bucket_id = 'site-images' and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (bucket_id = 'site-images' and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Administradores borran imágenes del sitio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-images' and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

-- Valores iniciales (los que traía el diseño).
insert into public.site_settings (check_in_start, check_in_end, check_out_time, phones, whatsapp, rnt)
values ('14:00', '22:00', '12:00', array['314 237 4008'], '573142374008', '208820');

insert into public.site_policies (question, answer, sort) values
  ('Confirmación de la reserva', 'Para confirmar tu reserva se requiere un abono del 30 % del valor total. Este abono no es reembolsable.', 1),
  ('Documento de identidad', 'Todo huésped debe presentar su documento de identidad físico al llegar.', 2),
  ('Cambios de fecha', '– Con 5 días o más: reprogramación hasta 3 meses (según disponibilidad).  – Con menos de 120 horas: no se permiten cambios.', 3),
  ('Clima de montaña', 'Murillo está a casi 3.000 metros de altura y las noches son frías: trae ropa abrigada.', 4),
  ('Niños', 'Los niños de cualquier edad son bienvenidos. Las cabañas no tienen cunas ni camas supletorias: elige una con capacidad para todos.', 5),
  ('Mascotas', 'Tu mascota es bienvenida, sin costo adicional. Cuéntanos de ella al reservar.', 6),
  ('Espacios sin humo', 'No se permite fumar dentro de las cabañas.', 7),
  ('Daños', 'Los daños, las manchas en la lencería o cualquier afectación a la cabaña generan un cobro adicional.', 8),
  ('Responsabilidad', 'No nos hacemos responsables por condiciones climáticas, objetos personales ni vehículos.', 9);
