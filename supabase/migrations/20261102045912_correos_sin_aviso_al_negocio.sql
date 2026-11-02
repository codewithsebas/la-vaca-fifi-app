-- Sin aviso al negocio por cada reserva nueva: el equipo ya las ve en el panel (avisos y push) y no hace falta que
-- hospedaje@ se escriba a sí mismo. El resto de correos automáticos sigue igual (20261102043211).
-- 'new_reservation' sigue permitido en email_outbox para conservar el historial de los avisos que ya salieron; los que
-- aún no se enviaron se descartan.

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
  elsif new.status is distinct from old.status and new.status in ('cancelled', 'expired') then
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

delete from public.email_outbox where kind = 'new_reservation' and status <> 'sent';
