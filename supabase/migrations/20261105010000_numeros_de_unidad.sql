-- Número propio de cada unidad de una cabaña, el que tiene en la finca: ['9', '2'] = la unidad 1 se llama 9 y la 2 se llama 2.
-- Solo se muestra: internamente las reservas, bloqueos y baños siguen usando la posición (1, 2, 3…) y no se tocan.
-- Vacío o en blanco: se muestra la posición. El formato y que no se repitan se validan en la API (invalidUnitLabels).
-- Aditiva: el código anterior ignora esta columna.
alter table public.cabin_types
  add column unit_labels text[] not null default '{}'
  constraint cabin_types_unit_labels_check check (cardinality(unit_labels) <= 20);
