-- Seguimiento en tiempo real de una reserva desde «Mi reserva».
-- Cada reserva tiene una clave aleatoria que solo recibe quien la consulta con código y correo. El canal público
-- «reserva:<clave>» recibe un aviso vacío (sin datos) cuando cambia algo que ve el huésped; la página vuelve a consultar la API.
alter table public.reservations add column live_key uuid not null default gen_random_uuid();

create or replace function public.broadcast_reservation_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k uuid;
begin
  if tg_table_name = 'reservations' then
    k := new.live_key;
  elsif tg_op = 'DELETE' then
    select r.live_key into k from public.reservations r where r.code = old.reservation_code;
  else
    select r.live_key into k from public.reservations r where r.code = new.reservation_code;
  end if;
  if k is not null then
    begin
      perform realtime.send('{}'::jsonb, 'reservation_changed', 'reserva:' || k::text, false);
    exception when others then
      -- El aviso es opcional: nunca debe impedir guardar la reserva o el comprobante.
      raise warning 'broadcast_reservation_change: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;

revoke execute on function public.broadcast_reservation_change() from public, anon, authenticated;

-- Solo los campos que ve el huésped en «Mi reserva» (la valoración interna o las notas del equipo no generan avisos).
create trigger reservations_broadcast_change
  after update on public.reservations
  for each row
  when (old.status is distinct from new.status
        or old.check_in is distinct from new.check_in
        or old.check_out is distinct from new.check_out
        or old.cabin_type_id is distinct from new.cabin_type_id
        or old.quote is distinct from new.quote
        or old.deposit_due_at is distinct from new.deposit_due_at)
  execute function public.broadcast_reservation_change();

create trigger payment_proofs_broadcast_change
  after insert or update or delete on public.payment_proofs
  for each row execute function public.broadcast_reservation_change();
