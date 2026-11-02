-- Porcentaje del abono para confirmar una reserva, configurable por los administradores (antes fijo en 30 % en el código).
--
-- · Lo editan solo los administradores (Contenido del sitio → Pagos): site_settings ya solo se puede modificar con is_admin().
-- · Aplica a las reservas nuevas y a las que se reprograman o reciben un precio especial. Las demás conservan el abono que
--   quedó en su cotización (quote ->> 'deposit').
-- No toca datos existentes: la columna nueva arranca en 30, el valor que se usaba.

alter table public.site_settings
  add column deposit_pct smallint not null default 30 check (deposit_pct between 1 and 100);
