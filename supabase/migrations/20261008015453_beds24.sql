-- Booking.com en tiempo real a través de Beds24 (channel manager, API v2). Reemplaza la sincronización por iCal en las
-- unidades enlazadas: Booking ya no lee calendarios, recibe la disponibilidad de Beds24 al instante.
-- · channel_calendars.beds24_room_id: habitación de Beds24 (y de Booking) que corresponde a la unidad.
-- · channel_credentials: token de la API y estado de la conexión. Sin políticas: solo la clave de servicio la lee.
-- · channel_bookings: lo que la app tiene reservado en Beds24 (reservas activas de la web y bloqueos del panel en unidades
--   enlazadas). La app crea cada reserva en Beds24 con «checkAvailability» antes de confirmarla: si Booking ya vendió esas
--   noches, Beds24 la rechaza y la web no la vende. pending: se está creando; active: existe en Beds24; cancelled: liberada.
--   La reserva de Booking que llega de Beds24 se guarda en channel_stays (external_uid 'beds24:<id>'), como las del iCal.
-- · channel_changes(): al cambiar una reserva o un bloqueo de una unidad enlazada, la base de datos pide a la app que
--   ajuste Beds24 de inmediato (request_channel_sync('push')); el cron de cada 5 minutos repasa todo por si algo falló.

alter table public.channel_calendars add column beds24_room_id integer unique check (beds24_room_id > 0);

create table public.channel_credentials (
  provider text primary key check (provider in ('beds24')),
  refresh_token text not null,
  access_token text,
  access_expires_at timestamptz,
  -- Va en la URL del webhook que se configura en Beds24 (Propiedades → Acceso): sin ella, el aviso se rechaza.
  webhook_key text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  last_pull_at timestamptz, -- última lectura completa de las reservas de Beds24
  last_push_at timestamptz, -- último repaso de lo que la app tiene reservado en Beds24
  last_webhook_at timestamptz,
  last_error text not null default '' check (length(last_error) <= 500),
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger channel_credentials_updated_at before update on public.channel_credentials
  for each row execute function public.set_updated_at();
alter table public.channel_credentials enable row level security;

create table public.channel_bookings (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.channel_calendars (id) on delete cascade,
  source text not null check (source in ('reservation', 'block')),
  source_id text not null check (length(source_id) between 1 and 100), -- código de la reserva o id del bloqueo
  check_in date not null,
  check_out date not null, -- exclusivo, como en las reservas
  beds24_id bigint unique,
  state text not null default 'pending' check (state in ('pending', 'active', 'cancelled')),
  last_error text not null default '' check (length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channel_bookings_dates check (check_out > check_in)
);
-- Una reserva o bloqueo vivo por habitación (al cambiar de unidad conviven un momento la nueva y la anterior).
create unique index channel_bookings_live on public.channel_bookings (source, source_id, calendar_id) where state in ('pending', 'active');
create index channel_bookings_state_idx on public.channel_bookings (state) where state in ('pending', 'active');
create trigger channel_bookings_updated_at before update on public.channel_bookings
  for each row execute function public.set_updated_at();
alter table public.channel_bookings enable row level security;
create policy "Administradores leen reservas enviadas a canales" on public.channel_bookings
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

-- La petición a la app lleva el modo: 'push' (solo ajustar Beds24 tras un cambio) o 'all' (cron: todo).
drop function public.request_channel_sync();
create function public.request_channel_sync(mode text default 'all') returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text;
  secret text;
begin
  if not exists (select 1 from public.channel_calendars where import_url is not null or beds24_room_id is not null) then return; end if;
  select decrypted_secret into url from vault.decrypted_secrets where name = 'channel_sync_url' limit 1;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'channel_sync_secret' limit 1;
  if coalesce(url, '') = '' or coalesce(secret, '') = '' then return; end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object('mode', mode),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 30000
  );
end;
$$;
revoke execute on function public.request_channel_sync(text) from public, anon, authenticated;

create or replace function public.channel_changes() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active text[] := array['pending_deposit', 'confirmed', 'rescheduled', 'checked_in'];
  old_type text;
  old_unit integer;
  new_type text;
  new_unit integer;
begin
  if tg_op <> 'INSERT' then old_type := old.cabin_type_id; old_unit := old.unit; end if;
  if tg_op <> 'DELETE' then new_type := new.cabin_type_id; new_unit := new.unit; end if;
  if tg_op = 'UPDATE' then
    if tg_table_name = 'reservations' then
      if (old.status::text = any (active)) = (new.status::text = any (active))
         and new.check_in = old.check_in and new.check_out = old.check_out and new_unit = old_unit and new_type = old_type then
        return null;
      end if;
    elsif new.from_date = old.from_date and new.to_date = old.to_date and new_unit = old_unit and new_type = old_type then
      return null;
    end if;
  end if;
  if not exists (
    select 1 from public.channel_calendars c
    where c.beds24_room_id is not null
      and ((c.cabin_type_id = old_type and c.unit = old_unit) or (c.cabin_type_id = new_type and c.unit = new_unit))
  ) then
    return null;
  end if;
  perform public.request_channel_sync('push');
  return null;
end;
$$;
revoke execute on function public.channel_changes() from public, anon, authenticated;

create trigger reservations_channel_changes
  after insert or update or delete on public.reservations
  for each row execute function public.channel_changes();
create trigger blocks_channel_changes
  after insert or update or delete on public.blocks
  for each row execute function public.channel_changes();
