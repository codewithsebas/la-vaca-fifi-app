-- Notificaciones push para el equipo (Web Push con llaves VAPID).
-- · push_subscriptions: un registro por dispositivo de un administrador, con los grupos de avisos que quiere recibir.
--   Solo la usa el servidor (clave secreta) después de verificar la sesión de administrador: RLS activo y sin políticas.
-- · admin_notifications.pushed_at: marca de envío; quien despacha "reclama" los avisos con un UPDATE, así nunca salen dos veces.
-- · Al insertarse un aviso sin leer, la base de datos avisa a la app (pg_net → POST /api/push/dispatch) para que lo envíe:
--   cubre también los avisos que nacen del cron (saldos vencidos, retenciones). La URL vive en Vault ('push_dispatch_url')
--   porque cambia por entorno; sin ella el disparador no hace nada y la app despacha por su cuenta al recibir solicitudes.

create extension if not exists pg_net with schema extensions;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 8 and 100),
  groups text[] not null default array['reservas', 'pagos', 'cambios'] check (groups <@ array['reservas', 'pagos', 'cambios']),
  device text not null default '' check (length(device) <= 120),
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

alter table public.admin_notifications add column pushed_at timestamptz;
-- Los avisos que ya existían no se envían.
update public.admin_notifications set pushed_at = created_at where true;
create index admin_notifications_unpushed_idx on public.admin_notifications (created_at) where pushed_at is null and read_at is null;

create or replace function public.request_push_dispatch() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text;
begin
  -- Un aviso que nace leído lo generó el propio equipo desde el panel: no se notifica.
  if new.read_at is not null then return null; end if;
  select decrypted_secret into url from vault.decrypted_secrets where name = 'push_dispatch_url' limit 1;
  if url is null or url = '' then return null; end if;
  perform net.http_post(url := url, body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 5000);
  return null;
exception when others then
  -- El aviso se guarda aunque falle la llamada; la app lo despacha en la siguiente solicitud.
  return null;
end;
$$;
revoke execute on function public.request_push_dispatch() from public, anon, authenticated;

create trigger admin_notifications_push
  after insert on public.admin_notifications
  for each row execute function public.request_push_dispatch();
