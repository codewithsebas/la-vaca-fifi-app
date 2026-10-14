-- Paleta de colores del sitio público, editable desde el panel (Contenido del sitio → Colores).
-- Objeto { clave: "#rrggbb" } validado en la API; vacío = colores originales del diseño.
alter table public.site_settings
  add column theme jsonb not null default '{}'::jsonb
  constraint site_settings_theme_object check (jsonb_typeof(theme) = 'object');
