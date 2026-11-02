-- Correos automáticos de la reserva. La base de datos los encola en email_outbox y la app los envía con Resend
-- (lib/server/mailer.ts), igual que la confirmación:
-- · reservation_received: al huésped, cuando nace una reserva con las fechas retenidas (web o panel): abono, plazo y datos
--   de pago.
-- · new_reservation: al negocio, por cada reserva nueva. La dirección la pone la app al enviar (EMAIL_REPLY_TO); aquí
--   queda el marcador 'negocio'.
-- · reservation_cancelled / reservation_expired: al huésped, cuando el equipo cancela o vence el plazo del abono.
-- · arrival_reminder: al huésped, dos días antes de llegar (cron diario a las 9:00 de Colombia).
-- Las reservas importadas (source = 'import') no generan correos: vienen de otro sistema y en QA son los datos de prueba.
-- Sin correo válido del huésped no se encola nada (la reserva nunca falla por eso).
--
-- Envío inmediato: al encolarse correos, la base de datos avisa a la app (pg_net → POST /api/email/dispatch). La URL sale
-- de la de push en Vault ('push_dispatch_url'): misma app, otra ruta; sin ella no hay aviso y la app envía en la siguiente
-- solicitud del panel. Un cron cada 10 minutos vuelve a avisar mientras haya correos pendientes o fallidos en su turno.

alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'reservation_confirmed', 'team_message', 'reservation_received', 'new_reservation',
  'reservation_cancelled', 'reservation_expired', 'arrival_reminder'
));

-- Encolado al crear la reserva o al cancelarse / vencerse.
create or replace function public.enqueue_reservation_emails() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_email boolean := position('@' in coalesce(new.guest_email, '')) > 1 and length(new.guest_email) between 3 and 160;
begin
  if new.source = 'import' then return null; end if;
  if tg_op = 'INSERT' then
    if new.status = 'pending_deposit' and has_email then
      insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email)
      values ('reserva-recibida:' || new.code, 'reservation_received', new.code, new.guest_email)
      on conflict (dedupe_key) do nothing;
    end if;
    insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email)
    values ('reserva-nueva:' || new.code, 'new_reservation', new.code, 'negocio')
    on conflict (dedupe_key) do nothing;
  elsif new.status is distinct from old.status and new.status in ('cancelled', 'expired') and has_email then
    insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email)
    values (
      case new.status when 'cancelled' then 'reserva-cancelada:' else 'reserva-vencida:' end || new.code,
      case new.status when 'cancelled' then 'reservation_cancelled' else 'reservation_expired' end,
      new.code,
      new.guest_email
    )
    on conflict (dedupe_key) do nothing;
  end if;
  return null;
end;
$$;
revoke execute on function public.enqueue_reservation_emails() from public, anon, authenticated;

create trigger reservations_emails
  after insert or update of status on public.reservations
  for each row execute function public.enqueue_reservation_emails();

-- Recordatorio de llegada: reservas confirmadas que llegan en dos días (hora de Colombia). Si se reprograma, la fecha
-- nueva tiene su propio recordatorio.
create or replace function public.enqueue_arrival_reminders() returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.email_outbox (dedupe_key, kind, reservation_code, to_email)
  select 'recordatorio:' || r.code || ':' || r.check_in, 'arrival_reminder', r.code, r.guest_email
  from public.reservations r
  where r.status in ('confirmed', 'rescheduled')
    and r.source <> 'import'
    and r.check_in = (now() at time zone 'America/Bogota')::date + 2
    and position('@' in r.guest_email) > 1
  on conflict (dedupe_key) do nothing;
$$;
revoke execute on function public.enqueue_arrival_reminders() from public, anon, authenticated;
grant execute on function public.enqueue_arrival_reminders() to service_role;

-- Aviso a la app para que envíe la bandeja.
create or replace function public.request_email_dispatch() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text;
begin
  select replace(decrypted_secret, '/api/push/dispatch', '/api/email/dispatch') into url
  from vault.decrypted_secrets where name = 'push_dispatch_url' limit 1;
  if url is null or url not like '%/api/email/dispatch' then return; end if;
  perform net.http_post(url := url, body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 5000);
exception when others then
  -- El correo queda en la bandeja aunque falle el aviso: lo envía el cron o la siguiente solicitud del panel.
  return;
end;
$$;
revoke execute on function public.request_email_dispatch() from public, anon, authenticated;

create or replace function public.email_outbox_dispatch() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.request_email_dispatch();
  return null;
end;
$$;
revoke execute on function public.email_outbox_dispatch() from public, anon, authenticated;

-- Una sola llamada por instrucción (el recordatorio diario puede encolar varios a la vez).
create trigger email_outbox_dispatch
  after insert on public.email_outbox
  for each statement execute function public.email_outbox_dispatch();

select cron.schedule('recordatorio-de-llegada', '0 14 * * *', $$select public.enqueue_arrival_reminders()$$);
select cron.schedule(
  'correos-pendientes',
  '*/10 * * * *',
  $$select public.request_email_dispatch()
    where exists (select 1 from public.email_outbox where status in ('pending', 'failed') and next_attempt_at <= now() and attempts < 5)$$
);
