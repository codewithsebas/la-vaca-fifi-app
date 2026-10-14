-- Revisión del panel.
-- 1) El vencimiento de una solicitud lo detecta el sistema aunque la consulta la haga el panel
--    (expirePending corre con la sesión del administrador): esa notificación siempre llega sin leer.
create or replace function public.notify_reservation_change() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  seen timestamptz := case when auth.uid() is null or new.status = 'expired' then null else now() end;
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

revoke execute on function public.notify_reservation_change() from public, anon, authenticated;

-- 2) rls_auto_enable() es la función del event trigger ensure_rls (activa RLS en tablas nuevas).
--    Nadie debe llamarla por la API; el event trigger se sigue ejecutando sin este permiso.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
