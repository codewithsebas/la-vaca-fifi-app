-- Precios por día de la semana en la tarifa base de cada cabaña (p. ej. la Doble: $160.000 de lunes a jueves y $170.000
-- viernes, sábado y domingo). Mismo formato que rate_seasons.day_rates, solo con días de la semana (sin fechas puntuales):
-- [{ weekdays: [5, 6, 0], dates: [], precioPareja, personaAdicional, preciosPersonas }]. Vacío: la tarifa base de siempre.
-- Una temporada activa reemplaza la tarifa base (y estos precios) en sus fechas. Lo valida la API (invalidBaseDayRates).
-- Aditiva: el código anterior ignora la columna.
alter table public.cabin_types
  add column day_rates jsonb not null default '[]'::jsonb
  constraint cabin_types_day_rates_check check (jsonb_typeof(day_rates) = 'array' and jsonb_array_length(day_rates) <= 7);
