-- Check-out automático: una estadía «En estadía» (checked_in) pasa a «Finalizada» (completed) 30 minutos después de la
-- hora de salida (site_settings.check_out_time, hora de Colombia) de su día de salida.
-- · Solo con el saldo pagado: la base de datos no deja finalizar con saldo pendiente (BALANCE_PENDING). Esas siguen
--   «En estadía» hasta que el equipo registre el pago y marque el check-out.
-- · No toca reservas que nunca hicieron check-in (confirmadas sin llegada): las decide el equipo.
-- · Finalizar no envía correos ni avisos; el panel lo ve por la sincronización y el tiempo real.
-- pg_cron la corre cada 5 minutos.

create or replace function public.run_auto_checkouts() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  out_time time := coalesce((select s.check_out_time from public.site_settings s limit 1), '12:00'::time);
  local_now timestamp := now() at time zone 'America/Bogota';
  n integer;
begin
  update public.reservations r
     set status = 'completed'
   where r.status = 'checked_in'
     and (r.balance_paid_at is not null or r.paid_amount >= (r.quote ->> 'total')::integer)
     and local_now >= r.check_out + out_time + interval '30 minutes';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.run_auto_checkouts() from public, anon, authenticated;
grant execute on function public.run_auto_checkouts() to service_role;

select cron.schedule('check-out-automatico', '*/5 * * * *', $$select public.run_auto_checkouts()$$);
