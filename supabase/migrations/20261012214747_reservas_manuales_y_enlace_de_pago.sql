-- Reservas creadas por el equipo desde el panel (WhatsApp, teléfono, en persona) y enlace de pago para el huésped.
-- source: de dónde vino la reserva. pay_token: secreto del enlace /pagar/<token> (abre el pago sin pedir código ni correo).
alter table public.reservations
  add column source text not null default 'web' constraint reservations_source_check check (source in ('web', 'panel')),
  add column pay_token text constraint reservations_pay_token_check check (pay_token ~ '^[A-Za-z0-9_-]{20,64}$');

create unique index reservations_pay_token_key on public.reservations (pay_token) where pay_token is not null;
