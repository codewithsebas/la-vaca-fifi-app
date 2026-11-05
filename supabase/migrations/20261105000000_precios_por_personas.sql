-- Precio por cantidad de personas: una cabaña, una temporada o un precio por día pueden cobrar un valor por noche distinto
-- según cuántas personas se alojan, cuando no sube parejo (por ejemplo 2 = 200.000, 3 = 210.000, 4 = 280.000):
--   { "2": 200000, "3": 210000, "4": 280000 }
-- Vacío ({}): se sigue cobrando «noche para 2 + persona adicional». Con menos personas que la primera fila se cobra esa fila.
-- En los precios por día va dentro de rate_seasons.day_rates (campo preciosPersonas). El cálculo vive en src/lib/booking.ts
-- (nightlyRate, computeQuote) y la validación completa en la API (invalidPersonRates); aquí se garantiza la forma básica.
-- Aditiva: el código anterior ignora estas columnas, y las reservas existentes conservan su cotización.
alter table public.cabin_types
  add column precios_personas jsonb not null default '{}'::jsonb
  constraint cabin_types_precios_personas_check check (jsonb_typeof(precios_personas) = 'object');

alter table public.rate_seasons
  add column precios_personas jsonb not null default '{}'::jsonb
  constraint rate_seasons_precios_personas_check check (jsonb_typeof(precios_personas) = 'object');
