-- Sincronización de disponibilidad con Booking.com por calendarios iCal (extranet → Sincronizar calendarios), en ambos sentidos.
-- · channel_calendars: un calendario por unidad enlazada a un tipo de alojamiento de Booking. import_url es el enlace de
--   exportación de Booking (la app lo lee cada pocos minutos); export_token forma el enlace que Booking importa
--   (/api/ical/<token>) con las reservas de la web y los bloqueos del panel. Solo lo gestiona el panel (RLS de administrador).
-- · channel_stays: noches ocupadas en Booking (reservas o cierres: el iCal no los distingue). Las escribe solo la
--   sincronización con la clave de servicio; el panel las lee. check_out es exclusivo, como en las reservas.
--   removed_at: la fecha dejó de venir en el calendario de Booking (se canceló); se conserva para el historial.
-- · request_channel_sync(): pg_cron la llama cada 5 minutos y, por pg_net, pide a la app que sincronice. La URL y el secreto
--   compartido viven en Vault ('channel_sync_url', 'channel_sync_secret'); sin ellos, o sin calendarios enlazados, no hace nada.

create table public.channel_calendars (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'booking' check (channel in ('booking')),
  label text not null default '' check (length(label) <= 80),
  cabin_type_id text not null references public.cabin_types (id) on delete cascade,
  unit integer not null check (unit >= 1),
  -- https; http solo hacia la propia máquina (pruebas en desarrollo).
  import_url text check (import_url is null or (length(import_url) <= 1000 and import_url ~ '^(https://|http://(localhost|127\.0\.0\.1)[:/])')),
  export_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  last_synced_at timestamptz, -- última lectura correcta
  last_fetched_at timestamptz, -- última vez que Booking descargó el enlace de la app (desde ahí ve las reservas de la web)
  sync_started_at timestamptz, -- inicio del último intento; también es el candado que evita dos lecturas a la vez
  last_status text check (last_status in ('ok', 'error')),
  last_error text not null default '' check (length(last_error) <= 500),
  last_event_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cabin_type_id, unit, channel)
);

create trigger channel_calendars_updated_at before update on public.channel_calendars
  for each row execute function public.set_updated_at();

create table public.channel_stays (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.channel_calendars (id) on delete cascade,
  cabin_type_id text not null references public.cabin_types (id) on delete cascade,
  unit integer not null check (unit >= 1),
  check_in date not null,
  check_out date not null,
  external_uid text not null check (length(external_uid) between 1 and 500),
  summary text not null default '' check (length(summary) <= 200),
  first_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint channel_stays_dates check (check_out > check_in),
  unique (calendar_id, external_uid)
);
create index channel_stays_occupancy_idx on public.channel_stays (cabin_type_id, unit, check_in, check_out);

alter table public.channel_calendars enable row level security;
alter table public.channel_stays enable row level security;

create policy "Administradores gestionan calendarios de canales" on public.channel_calendars
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Administradores leen fechas de canales" on public.channel_stays
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

-- Los cuatro tipos de habitación de La Vaca Fifí en Booking y su cabaña en la app (el enlace del calendario se pega en
-- el panel: Booking.com).
insert into public.channel_calendars (cabin_type_id, unit, label)
select v.cabin_type_id, v.unit, v.label
from (values
  ('doble', 1, 'Habitación Doble con baño privado'),
  ('dos-camas', 1, 'Habitación Doble - 2 camas'),
  ('familiar', 1, 'Habitación Familiar con baño privado'),
  ('familiar-vista', 1, 'Habitación Familiar con vistas a la montaña')
) as v (cabin_type_id, unit, label)
where exists (select 1 from public.cabin_types c where c.id = v.cabin_type_id and c.units >= v.unit);

-- Tiempo real: las fechas de Booking también avisan al sitio cuando cambia la disponibilidad.
create or replace function public.broadcast_availability() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active text[] := array['pending_deposit', 'confirmed', 'rescheduled', 'checked_in'];
  cabin text;
  first_night date;
  last_night date;
begin
  if tg_table_name = 'reservations' then
    if tg_op = 'INSERT' then
      if not (new.status::text = any (active)) then return null; end if;
      cabin := new.cabin_type_id;
      first_night := new.check_in;
      last_night := new.check_out - 1;
    elsif tg_op = 'DELETE' then
      if not (old.status::text = any (active)) then return null; end if;
      cabin := old.cabin_type_id;
      first_night := old.check_in;
      last_night := old.check_out - 1;
    else
      -- Solo cambia la ocupación si la reserva entra o sale de los estados activos, o si cambian sus fechas, unidad o cabaña.
      if not (old.status::text = any (active)) and not (new.status::text = any (active)) then return null; end if;
      if (old.status::text = any (active)) and (new.status::text = any (active))
         and new.check_in = old.check_in and new.check_out = old.check_out and new.unit = old.unit and new.cabin_type_id = old.cabin_type_id then
        return null;
      end if;
      cabin := case when new.cabin_type_id = old.cabin_type_id then new.cabin_type_id end;
      first_night := least(old.check_in, new.check_in);
      last_night := greatest(old.check_out, new.check_out) - 1;
    end if;
  elsif tg_table_name = 'blocks' then
    if tg_op = 'INSERT' then
      cabin := new.cabin_type_id;
      first_night := new.from_date;
      last_night := new.to_date;
    elsif tg_op = 'DELETE' then
      cabin := old.cabin_type_id;
      first_night := old.from_date;
      last_night := old.to_date;
    else
      cabin := case when new.cabin_type_id = old.cabin_type_id then new.cabin_type_id end;
      first_night := least(old.from_date, new.from_date);
      last_night := greatest(old.to_date, new.to_date);
    end if;
  elsif tg_table_name = 'channel_stays' then
    -- Fechas de Booking: cuentan mientras no tengan removed_at.
    if tg_op = 'INSERT' then
      if new.removed_at is not null then return null; end if;
      cabin := new.cabin_type_id;
      first_night := new.check_in;
      last_night := new.check_out - 1;
    elsif tg_op = 'DELETE' then
      if old.removed_at is not null then return null; end if;
      cabin := old.cabin_type_id;
      first_night := old.check_in;
      last_night := old.check_out - 1;
    else
      if old.removed_at is not null and new.removed_at is not null then return null; end if;
      if old.removed_at is null and new.removed_at is null
         and new.check_in = old.check_in and new.check_out = old.check_out and new.unit = old.unit and new.cabin_type_id = old.cabin_type_id then
        return null;
      end if;
      cabin := case when new.cabin_type_id = old.cabin_type_id then new.cabin_type_id end;
      first_night := least(old.check_in, new.check_in);
      last_night := greatest(old.check_out, new.check_out) - 1;
    end if;
  else
    -- cabin_types: nueva cabaña, eliminada, cambio de unidades o activada/desactivada (todas sus fechas).
    if tg_op = 'UPDATE' and new.units = old.units and new.activa = old.activa then return null; end if;
    cabin := case when tg_op = 'DELETE' then old.id else new.id end;
  end if;

  perform realtime.send(
    jsonb_build_object('cabinTypeId', cabin, 'from', first_night, 'to', last_night),
    'availability_changed',
    'availability',
    false
  );
  return null;
end;
$$;

revoke execute on function public.broadcast_availability() from public, anon, authenticated;

create trigger channel_stays_broadcast_availability
  after insert or update or delete on public.channel_stays
  for each row execute function public.broadcast_availability();

-- El panel recarga al cambiar las fechas de Booking. channel_calendars no se publica: su estado cambia en cada lectura.
alter publication supabase_realtime add table public.channel_stays;

-- Avisos del panel: posible sobreventa con Booking, reservas reacomodadas a otra unidad y calendarios que no se pudieron leer.
alter table public.admin_notifications drop constraint admin_notifications_kind_check;
alter table public.admin_notifications add constraint admin_notifications_kind_check check (kind in (
  'reservation_created', 'reservation_confirmed', 'reservation_cancelled', 'reservation_expired',
  'proof_uploaded', 'proof_approved', 'proof_rejected',
  'payment_declined', 'payment_refund', 'balance_paid', 'balance_overdue', 'email_failed',
  'channel_conflict', 'channel_moved', 'channel_sync_failed'
));

-- Cada 5 minutos la base de datos pide a la app que lea los calendarios de Booking (POST /api/channels/sync).
create or replace function public.request_channel_sync() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text;
  secret text;
begin
  if not exists (select 1 from public.channel_calendars where import_url is not null) then return; end if;
  select decrypted_secret into url from vault.decrypted_secrets where name = 'channel_sync_url' limit 1;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'channel_sync_secret' limit 1;
  if coalesce(url, '') = '' or coalesce(secret, '') = '' then return; end if;
  perform net.http_post(
    url := url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 30000
  );
end;
$$;
revoke execute on function public.request_channel_sync() from public, anon, authenticated;

select cron.schedule('sincronizar-canales', '*/5 * * * *', 'select public.request_channel_sync()');
