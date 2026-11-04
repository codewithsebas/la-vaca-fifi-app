-- Precios por día dentro de una temporada: ciertas noches de la semana (por ejemplo, viernes y sábado) o fechas puntuales
-- (24 y 31 de diciembre) se cobran distinto que el resto de la temporada. Cada regla:
--   { "weekdays": [5, 6], "dates": [], "precioPareja": 220000, "personaAdicional": 50000 }
-- weekdays: 0 = domingo … 6 = sábado. Una regla usa días o fechas (dentro de la temporada). Una fecha puntual gana sobre un
-- día de la semana; sin regla, se cobra el precio de la temporada. El cálculo vive en src/lib/booking.ts (nightlyRate) y
-- la validación completa en la API (invalidDayRates); aquí se garantiza la forma básica.
alter table public.rate_seasons
  add column day_rates jsonb not null default '[]'::jsonb
  constraint rate_seasons_day_rates_check check (jsonb_typeof(day_rates) = 'array' and jsonb_array_length(day_rates) <= 10);
