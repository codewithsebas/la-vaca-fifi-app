-- Aviso al equipo cuando una estadía no se puede finalizar sola porque tiene saldo pendiente: a la hora del check-out
-- automático (30 minutos después de la hora de salida), un aviso «Check-out pendiente» por reserva, una sola vez.
-- Va al grupo «Pagos» de las notificaciones push (lib/notification-groups.ts).

alter table public.admin_notifications drop constraint admin_notifications_kind_check;
alter table public.admin_notifications add constraint admin_notifications_kind_check check (kind in (
  'reservation_created', 'reservation_confirmed', 'reservation_cancelled', 'reservation_expired',
  'proof_uploaded', 'proof_approved', 'proof_rejected',
  'payment_declined', 'payment_refund', 'balance_paid', 'balance_overdue', 'email_failed',
  'channel_conflict', 'channel_moved', 'channel_sync_failed',
  'booking_pending', 'booking_modified', 'booking_cancelled', 'booking_failed',
  'checkout_pending'
));

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

  -- Las que quedan «En estadía» por el saldo: un aviso por reserva.
  insert into public.admin_notifications (kind, title, body, reservation_code)
  select 'checkout_pending',
         left('Check-out pendiente · ' || r.guest_full_name, 160),
         left(coalesce(c.nombre, r.cabin_type_id) || ' · ' || r.code || ' · saldo por cobrar $' ||
              replace(to_char((r.quote ->> 'total')::integer - r.paid_amount, 'FM999,999,999'), ',', '.') ||
              '. Regístralo y marca el check-out.', 400),
         r.code
    from public.reservations r
    left join public.cabin_types c on c.id = r.cabin_type_id
   where r.status = 'checked_in'
     and local_now >= r.check_out + out_time + interval '30 minutes'
     and not exists (select 1 from public.admin_notifications a where a.kind = 'checkout_pending' and a.reservation_code = r.code);
  return n;
end;
$$;
revoke execute on function public.run_auto_checkouts() from public, anon, authenticated;
grant execute on function public.run_auto_checkouts() to service_role;
