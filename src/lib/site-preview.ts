// Vista previa del sitio en el panel: la página real (app/vista-previa) dentro de un iframe, alimentada por mensajes.
import type { Cabin } from "@/lib/config";
import type { SiteContent } from "@/lib/site";

// Zonas de la página (atributo data-zone) y la pestaña de Contenido del sitio en la que se editan.
export const ZONE_TAB = {
  hero: "portada",
  mosaico: "portada",
  calificacion: "portada",
  incluye: "portada",
  descripcion: "portada",
  restaurante: "restaurante",
  finca: "experiencias",
  servicios: "servicios",
  horarios: "horarios",
  politicas: "politicas",
  contacto: "contacto",
  ubicacion: "contacto",
  redes: "redes",
} as const;

export type PreviewZone = keyof typeof ZONE_TAB;
export const isPreviewZone = (z: unknown): z is PreviewZone => typeof z === "string" && z in ZONE_TAB;

export type PreviewData = { content: SiteContent; cabins: Cabin[] };

// Del panel a la página: el borrador y la zona que se está editando.
export type ToPreview = { type: "vf-preview-data"; data: PreviewData } | { type: "vf-preview-zone"; zone: PreviewZone };
// De la página al panel: ya puede recibir datos, o tocaron una zona para editarla.
export type FromPreview = { type: "vf-preview-ready" } | { type: "vf-preview-edit"; zone: PreviewZone };
