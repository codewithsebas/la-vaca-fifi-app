-- Dos correos automáticos más al huésped (la app los envía con Resend, lib/server/mailer.ts):
-- · balance_paid: cuando un pago completa el saldo de una reserva ya confirmada. Si un solo pago confirma y cubre todo, basta
--   el correo de confirmación, que ya lo dice. Si la reprogramación reabre el saldo y se vuelve a completar, sale otro correo.
-- · reservation_rescheduled: cada vez que cambian las fechas. payload guarda las fechas de ese cambio, porque al enviarse la
--   reserva pudo cambiar otra vez.
-- Sigue igual: las reservas importadas y las que no tienen correo válido no generan correos.

alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'reservation_confirmed', 'team_message', 'reservation_received', 'new_reservation',
  'reservation_cancelled', 'reservation_expired', 'arrival_reminder',
  'balance_paid', 'reservation_rescheduled'
));

create or replace function public.enqueue_reservation_emails() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_email boolean := position('@' in coalesce(new.guest_email, '')) > 1 and length(new.guest_email) between 3 and 160;
begin
  if new.source = 'import' or not has_email then return null; end if;
  if tg_op = 'INSERT' then
    if new.status = 'pending_deposit' then
      insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email)
      values ('reserva-recibida:' || new.code, 'reservation_received', new.code, new.guest_email)
      on conflict (dedupe_key) do nothing;
    end if;
    return null;
  end if;

  if new.status is distinct from old.status and new.status in ('cancelled', 'expired') then
    insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email)
    values (
      case new.status when 'cancelled' then 'reserva-cancelada:' else 'reserva-vencida:' end || new.code,
      case new.status when 'cancelled' then 'reservation_cancelled' else 'reservation_expired' end,
      new.code,
      new.guest_email
    )
    on conflict (dedupe_key) do nothing;
  end if;

  if new.balance_paid_at is not null and old.balance_paid_at is null and old.deposit_paid_at is not null then
    insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email)
    values ('pago-total:' || new.code || ':' || new.paid_amount, 'balance_paid', new.code, new.guest_email)
    on conflict (dedupe_key) do nothing;
  end if;

  if (new.check_in, new.check_out) is distinct from (old.check_in, old.check_out) then
    insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email, payload)
    values (
      'reprogramada:' || new.code || ':' || extract(epoch from now()),
      'reservation_rescheduled',
      new.code,
      new.guest_email,
      jsonb_build_object('checkInAnterior', old.check_in, 'checkOutAnterior', old.check_out, 'checkIn', new.check_in, 'checkOut', new.check_out)
    )
    on conflict (dedupe_key) do nothing;
  end if;
  return null;
end;
$$;

drop trigger reservations_emails on public.reservations;
create trigger reservations_emails
  after insert or update of status, balance_paid_at, check_in, check_out on public.reservations
  for each row execute function public.enqueue_reservation_emails();
