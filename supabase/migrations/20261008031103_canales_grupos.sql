-- Un tipo de alojamiento de Booking puede cubrir varias cabañas del mismo tipo en la app (p. ej. «Cabaña 1» de Booking =
-- Estándar 1 y 2). Booking solo sincroniza calendarios con una unidad por tipo, así que vende una por noche: una reserva
-- suya ocupa una cabaña libre del grupo y el enlace de la app lo cierra allá solo cuando todas las del grupo están
-- ocupadas. `unit` es la primera cabaña del grupo; `extra_units`, las demás. Una cabaña solo puede estar en un grupo
-- (lo valida el panel).
alter table public.channel_calendars
  add column extra_units integer[] not null default '{}' check (array_position(extra_units, null) is null and 1 <= all (extra_units));
