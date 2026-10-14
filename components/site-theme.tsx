import type { Viewport } from "next";
import { getSiteContent } from "@/lib/server/site";
import { DEFAULT_THEME, sameTheme, themeCss } from "@/lib/theme";

// Colores del sitio elegidos en el panel. Va en las páginas públicas y no en el layout raíz: el panel declara los suyos
// (la misma paleta más su zona de trabajo, components/admin/shell.tsx) y, al pasar del sitio al panel, la etiqueta se va
// con la página. Con los colores del diseño no hace falta.
export async function SiteTheme() {
  const { theme } = await getSiteContent();
  if (sameTheme(theme, DEFAULT_THEME)) return null;
  return <style dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />;
}

// Color de la barra del navegador en el celular: el fondo del sitio.
export async function siteViewport(): Promise<Viewport> {
  const { theme } = await getSiteContent();
  return { themeColor: theme.bg };
}
