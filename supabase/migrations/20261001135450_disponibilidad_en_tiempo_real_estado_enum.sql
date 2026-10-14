-- reservations.status es el enum reservation_status: se compara como texto con la lista de estados activos.
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
