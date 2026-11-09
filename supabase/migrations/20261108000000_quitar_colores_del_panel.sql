-- El panel pasa a tener un tema fijo (src/components/admin/panel-theme.ts): ya no se guardan sus colores.
-- Los colores del sitio web siguen en site_settings.theme.
update public.site_settings set theme = theme - 'panel' where theme ? 'panel';
