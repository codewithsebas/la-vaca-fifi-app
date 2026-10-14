-- Disponibilidad en tiempo real para el sitio público.
-- Los visitantes no tienen acceso a reservas ni bloqueos (RLS). Cuando cambia la ocupación se publica un aviso en el
-- canal público de Realtime "availability" con la cabaña y el rango de noches afectado (sin datos personales);
-- el navegador lo usa solo como señal para volver a consultar la API, que sigue siendo la que valida.
create function public.broadcast_availability() returns trigger
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
      if not (new.status = any (active)) then return null; end if;
      cabin := new.cabin_type_id;
      first_night := new.check_in;
      last_night := new.check_out - 1;
    elsif tg_op = 'DELETE' then
      if not (old.status = any (active)) then return null; end if;
      cabin := old.cabin_type_id;
      first_night := old.check_in;
      last_night := old.check_out - 1;
    else
      -- Solo cambia la ocupación si la reserva entra o sale de los estados activos, o si cambian sus fechas, unidad o cabaña.
      if not (old.status = any (active)) and not (new.status = any (active)) then return null; end if;
      if (old.status = any (active)) and (new.status = any (active))
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

create trigger reservations_broadcast_availability after insert or update or delete on public.reservations
  for each row execute function public.broadcast_availability();
create trigger blocks_broadcast_availability after insert or update or delete on public.blocks
  for each row execute function public.broadcast_availability();
create trigger cabin_types_broadcast_availability after insert or delete or update of units, activa on public.cabin_types
  for each row execute function public.broadcast_availability();

-- Las solicitudes sin abono vencen solas cada minuto: así sus fechas se liberan (y se avisa) aunque nadie consulte la API.
-- La API sigue venciéndolas también antes de calcular disponibilidad (expirePending).
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'vencer-solicitudes-sin-abono',
  '* * * * *',
  $$update public.reservations set status = 'expired' where status = 'pending_deposit' and deposit_due_at < now()$$
);
