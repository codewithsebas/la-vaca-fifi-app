-- Registro de actividad del equipo del panel (solo lo leen los superadministradores, migración 20261119000000).
--
-- · activity_log: cada escritura del equipo en las tablas del panel (triggers), con quién, qué, cuándo y qué cambió. Los
--   inicios y cierres de sesión, las cuentas del equipo (Supabase Auth) y la lectura manual de los calendarios de Booking
--   los inserta el servidor con la clave secreta. Nadie la edita ni la borra desde la API.
-- · Quién: el usuario del JWT. Las rutas del panel que escriben con la clave secreta mandan el encabezado x-actor-id (solo
--   se le cree con la clave secreta). Lo que no hace nadie del equipo (reservas del sitio, correos de Booking/Ayenda que
--   llegan solos, calendarios automáticos, tareas programadas) no se registra.
-- · Cuándo: occurred_at es la hora real de la operación (encabezado x-occurred-at de la cola sin conexión, si es de los
--   últimos 30 días y no del futuro); received_at, cuando llegó al servidor.
-- · Los textos del sitio (portada, restaurante, cabañas, colores, condiciones de pago) viven en site_settings: su trigger
--   guarda el cambio campo por campo («content.restaurant», «theme.primary»…).

-- ───────────── Registro ─────────────
create table public.activity_log (
  id bigint generated always as identity primary key,
  actor_id uuid, -- sin llave foránea: el registro se conserva aunque se borre la cuenta
  actor_email text,
  actor_name text,
  actor_role text,
  action text not null check (action in ('insert', 'update', 'delete', 'login', 'logout', 'login_failed', 'sync')),
  entity text not null, -- tabla (reservations, cabin_types…), 'employees' o 'session'
  entity_id text,
  label text, -- con qué se reconoce lo afectado (huésped, cabaña, temporada…)
  changes jsonb, -- { campo: [antes, después] }
  refs jsonb, -- a qué más se refiere, para enlazarlo: { reservation, client, cabin }
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  op_id uuid, -- clave de idempotencia de la operación del panel
  tx_id bigint, -- transacción: agrupa lo que cambió una misma operación
  ip text,
  user_agent text
);

comment on table public.activity_log is 'Registro de actividad del equipo del panel. Solo lo leen los superadministradores.';

create index activity_log_occurred_idx on public.activity_log (occurred_at desc, id desc);
create index activity_log_actor_idx on public.activity_log (actor_id, occurred_at desc);
create index activity_log_entity_idx on public.activity_log (entity, entity_id, occurred_at desc);
create index activity_log_action_idx on public.activity_log (action, occurred_at desc);
create index activity_log_reservation_idx on public.activity_log ((refs ->> 'reservation'), occurred_at desc) where refs ? 'reservation';

alter table public.activity_log enable row level security;

create policy "Superadministradores leen la actividad" on public.activity_log for select to authenticated
  using ((select public.is_superadmin()));

-- Solo se agrega: nadie lo edita ni lo borra por la API (ni con la clave secreta).
revoke all on public.activity_log from anon, authenticated, service_role;
grant select on public.activity_log to authenticated;
grant select, insert on public.activity_log to service_role;

-- ───────────── Trigger ─────────────
-- Campos que no dicen nada del cambio (marcas de tiempo y versión) y campos secretos (se registra que cambiaron, no su valor).
create or replace function public.activity_value(p_key text, p_value jsonb) returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when p_key in ('import_url', 'export_token') and p_value is not null and p_value <> 'null'::jsonb then to_jsonb('•••'::text) else p_value end
$$;

-- Diferencia entre dos filas: { campo: [antes, después] }. Los objetos JSON (contenido del sitio) se comparan un nivel
-- adentro ("content.hero"), para no guardar el contenido entero por un cambio pequeño.
create or replace function public.activity_diff(p_old jsonb, p_new jsonb) returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  skip constant text[] := array['updated_at', 'version', 'created_at', 'status_updated_at', 'client_key'];
  out jsonb := '{}'::jsonb;
  k text;
  sub text;
  o jsonb;
  n jsonb;
begin
  for k in select jsonb_object_keys(coalesce(p_old, '{}'::jsonb) || coalesce(p_new, '{}'::jsonb)) loop
    continue when k = any (skip);
    o := p_old -> k;
    n := p_new -> k;
    continue when o is not distinct from n;
    if p_old is not null and p_new is not null and jsonb_typeof(o) = 'object' and jsonb_typeof(n) = 'object' then
      for sub in select jsonb_object_keys(o || n) loop
        continue when (o -> sub) is not distinct from (n -> sub);
        out := out || jsonb_build_object(k || '.' || sub, jsonb_build_array(o -> sub, n -> sub));
      end loop;
    else
      out := out || jsonb_build_object(k, jsonb_build_array(public.activity_value(k, o), public.activity_value(k, n)));
    end if;
  end loop;
  return out;
end;
$$;

-- TG_ARGV[0]: llave de la tabla; TG_ARGV[1..]: campos con los que se reconoce la fila (se unen con « · »).
create or replace function public.log_activity_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  hdrs jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  actor uuid;
  a_email text;
  a_name text;
  a_role text;
  old_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  row_data jsonb := coalesce(new_row, old_row);
  diff jsonb;
  label text;
  at timestamptz := now();
  sent text;
  op text;
  i int;
begin
  -- Solo lo que hace alguien directamente (no lo que otro trigger escribe como consecuencia).
  if pg_trigger_depth() > 1 or claims is null then return null; end if;

  if claims ->> 'role' = 'authenticated' then
    actor := nullif(claims ->> 'sub', '')::uuid;
    a_email := claims ->> 'email';
    a_name := nullif(btrim(claims -> 'user_metadata' ->> 'full_name'), '');
    a_role := claims -> 'app_metadata' ->> 'role';
  elsif claims ->> 'role' = 'service_role' and coalesce(hdrs ->> 'x-actor-id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    actor := (hdrs ->> 'x-actor-id')::uuid;
    select u.email, nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.raw_app_meta_data ->> 'role'
      into a_email, a_name, a_role
      from auth.users u where u.id = actor;
  end if;
  if actor is null then return null; end if;

  diff := case tg_op
    when 'UPDATE' then public.activity_diff(old_row, new_row)
    when 'INSERT' then public.activity_diff(null, jsonb_strip_nulls(new_row))
    else public.activity_diff(jsonb_strip_nulls(old_row), null)
  end;
  if tg_op = 'UPDATE' and diff = '{}'::jsonb then return null; end if;

  for i in 1 .. tg_nargs - 1 loop
    if nullif(row_data ->> tg_argv[i], '') is not null then
      label := concat_ws(' · ', label, row_data ->> tg_argv[i]);
    end if;
  end loop;

  -- Hora real de la operación hecha sin conexión: de los últimos 30 días y nunca del futuro.
  sent := hdrs ->> 'x-occurred-at';
  if sent ~ '^\d{4}-\d{2}-\d{2}T[0-9:.]+(Z|[+-]\d{2}:?\d{2})$' then
    begin
      if sent::timestamptz between now() - interval '30 days' and now() + interval '1 minute' then at := least(sent::timestamptz, now()); end if;
    exception when others then null;
    end;
  end if;
  op := hdrs ->> 'idempotency-key';

  insert into public.activity_log (actor_id, actor_email, actor_name, actor_role, action, entity, entity_id, label, changes, refs, occurred_at, op_id, tx_id)
  values (
    actor, a_email, a_name, a_role,
    lower(tg_op), tg_table_name, row_data ->> tg_argv[0], left(label, 200), diff,
    nullif(jsonb_strip_nulls(jsonb_build_object(
      'reservation', case when tg_table_name = 'reservations' then row_data ->> 'code' else row_data ->> 'reservation_code' end,
      'client', row_data ->> 'client_key',
      'cabin', case when tg_table_name = 'cabin_types' then row_data ->> 'id' else row_data ->> 'cabin_type_id' end
    )), '{}'::jsonb),
    at,
    case when op ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then op::uuid end,
    pg_current_xact_id()::text::bigint
  );
  return null;
end;
$$;

revoke execute on function public.log_activity_change() from public, anon, authenticated;
revoke execute on function public.activity_diff(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.activity_value(text, jsonb) from public, anon, authenticated;

-- Tablas que el equipo escribe desde el panel. Fuera: notificaciones, suscripciones push, la cola de sincronización y lo
-- que solo escribe el sistema (correos de Booking, cambios para sincronizar).
create trigger reservations_activity after insert or update or delete on public.reservations
  for each row execute function public.log_activity_change('code', 'guest_full_name');
create trigger reservation_notes_activity after insert or update or delete on public.reservation_notes
  for each row execute function public.log_activity_change('id', 'reservation_code');
create trigger payments_activity after insert or update or delete on public.payments
  for each row execute function public.log_activity_change('id', 'reservation_code', 'reference');
create trigger payment_proofs_activity after insert or update or delete on public.payment_proofs
  for each row execute function public.log_activity_change('id', 'reservation_code', 'file_name');
create trigger blocks_activity after insert or update or delete on public.blocks
  for each row execute function public.log_activity_change('id', 'cabin_type_id', 'from_date');
create trigger bathrooms_activity after insert or update or delete on public.bathrooms
  for each row execute function public.log_activity_change('id', 'name');
create trigger bathroom_blocks_activity after insert or update or delete on public.bathroom_blocks
  for each row execute function public.log_activity_change('id', 'reason', 'from_date');
create trigger cabin_types_activity after insert or update or delete on public.cabin_types
  for each row execute function public.log_activity_change('id', 'nombre');
create trigger rate_seasons_activity after insert or update or delete on public.rate_seasons
  for each row execute function public.log_activity_change('id', 'nombre', 'cabin_type_id');
create trigger client_profiles_activity after insert or update or delete on public.client_profiles
  for each row execute function public.log_activity_change('client_key', 'client_key');
create trigger client_entries_activity after insert or update or delete on public.client_entries
  for each row execute function public.log_activity_change('id', 'client_key');
create trigger site_settings_activity after insert or update or delete on public.site_settings
  for each row execute function public.log_activity_change('id');
create trigger site_policies_activity after insert or update or delete on public.site_policies
  for each row execute function public.log_activity_change('id', 'question');
create trigger site_photos_activity after insert or update or delete on public.site_photos
  for each row execute function public.log_activity_change('slot', 'slot');
create trigger site_services_activity after insert or update or delete on public.site_services
  for each row execute function public.log_activity_change('id', 'title');
create trigger channel_calendars_activity after insert or update or delete on public.channel_calendars
  for each row execute function public.log_activity_change('id', 'label');
create trigger channel_stays_activity after insert or update or delete on public.channel_stays
  for each row execute function public.log_activity_change('id', 'cabin_type_id', 'check_in');
create trigger booking_inbox_activity after insert or update or delete on public.booking_inbox
  for each row execute function public.log_activity_change('ref', 'guest_full_name');
create trigger email_outbox_activity after insert or update or delete on public.email_outbox
  for each row execute function public.log_activity_change('id', 'to_email', 'subject');
