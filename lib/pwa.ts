import type { MetadataRoute } from "next";
import { config } from "./config";

// Dos apps instalables: el sitio de reservas (huéspedes) y el panel (equipo), cada una con su manifiesto e ícono.
// Van como Route Handlers enlazados desde `metadata.manifest`: un app/manifest.ts tendría prioridad sobre el del panel.

const BG = "#22301C";
const png = (src: string, size: number, purpose: "any" | "maskable" = "any") => ({ src, sizes: `${size}x${size}`, type: "image/png", purpose });

export const siteManifest: MetadataRoute.Manifest = {
  id: "/",
  name: config.name,
  short_name: "La Vaca Fifí",
  description: "Reserva tu cabaña en La Vaca Fifí, a 5 minutos de Murillo, Tolima, y consulta tu reserva.",
  lang: "es-CO",
  dir: "ltr",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: BG,
  theme_color: BG,
  categories: ["travel"],
  icons: [
    png("/icons/icon-192.png", 192),
    png("/icons/icon-512.png", 512),
    png("/icons/maskable-512.png", 512, "maskable"),
  ],
  shortcuts: [
    { name: "Reservar", short_name: "Reservar", url: "/reservar", icons: [png("/icons/icon-192.png", 192)] },
    { name: "Consultar mi reserva", short_name: "Mi reserva", url: "/mi-reserva", icons: [png("/icons/icon-192.png", 192)] },
    // Acceso del equipo al panel (pide iniciar sesión). Ícono invertido, como la app del panel.
    { name: "Administrar", short_name: "Administrar", url: "/admin", icons: [png("/icons/panel-192.png", 192)] },
  ],
};

export const panelManifest: MetadataRoute.Manifest = {
  id: "/admin",
  name: `Panel de reservas · ${config.name}`,
  short_name: "Panel Vaca Fifí",
  description: "Reservas, pagos, calendario y contenido del sitio.",
  lang: "es-CO",
  dir: "ltr",
  start_url: "/admin",
  scope: "/admin",
  display: "standalone",
  background_color: BG,
  theme_color: BG,
  categories: ["business", "productivity"],
  icons: [png("/icons/panel-192.png", 192), png("/icons/panel-512.png", 512), png("/icons/panel-maskable-512.png", 512, "maskable")],
  shortcuts: [
    { name: "Reservas", url: "/admin/reservas", icons: [png("/icons/panel-192.png", 192)] },
    { name: "Calendario", url: "/admin/calendario", icons: [png("/icons/panel-192.png", 192)] },
  ],
};

export const manifestResponse = (m: MetadataRoute.Manifest) => Response.json(m, { headers: { "Content-Type": "application/manifest+json; charset=utf-8" } });
