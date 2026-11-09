import type { Viewport } from "next";

// El sitio público usa los colores fijos de su diseño (globals.css): los colores que se guardaban desde el panel ya no
// se aplican. Se conserva el componente para no tocar cada página que lo incluye.
export function SiteTheme() {
  return null;
}

// Color de la barra del navegador en el celular: el fondo del sitio.
export function siteViewport(): Viewport {
  return { themeColor: "#fffdf8" };
}
