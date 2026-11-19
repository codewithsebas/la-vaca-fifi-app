import type { Viewport } from "next";
import { getSiteContent } from "@/lib/server/site";
import { DEFAULT_THEME, sameTheme, themeCss } from "@/lib/theme";

// Colores del sitio elegidos en el panel (Contenido del sitio › Colores, columna site_settings.theme). Con theme vacío
// (o igual a la paleta original de Fifí) no se agrega nada: el sitio usa los colores de su diseño (globals.css). Va en
// las páginas públicas y no en el layout raíz: el panel tiene sus propios colores. También en .site-ui, que aclara el
// fondo de los paneles suaves con un valor fijo.
export async function SiteTheme() {
  const { theme } = await getSiteContent();
  if (sameTheme(theme, DEFAULT_THEME)) return null;
  return <style dangerouslySetInnerHTML={{ __html: themeCss(theme).replace(/^:root\{/, ":root,.site-ui{") }} />;
}

// Color de la barra del navegador en el celular: el fondo del sitio (las tarjetas, en el diseño de Fifí).
export async function siteViewport(): Promise<Viewport> {
  const { theme } = await getSiteContent();
  return { themeColor: sameTheme(theme, DEFAULT_THEME) ? "#fffdf8" : theme.card };
}
