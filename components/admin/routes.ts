// Mapa del panel: cada módulo es una página con su ruta. Lo usan el menú, las migas de pan, los títulos y los enlaces.
// Sin "use client": las páginas del servidor también lo leen (validación de segmentos dinámicos).
import type { ComponentType } from "react";
import { BanIcon, BellIcon, CalendarIcon, FileTextIcon, GridIcon, HomeIcon, ListIcon, ReceiptIcon, RefreshIcon, SlidersIcon, TagIcon, TrendIcon, UsersIcon } from "@/components/icons";

export type ModuleId = "dashboard" | "calendario" | "reservas" | "pagos" | "clientes" | "bloqueos" | "booking" | "finanzas" | "cabanas" | "tarifas" | "contenido" | "notificaciones" | "configuracion";

type Module = { label: string; href: string; icon: ComponentType<{ size?: number; className?: string }>; group: string; description: string };

export const MODULES: Record<ModuleId, Module> = {
  dashboard: { label: "Dashboard", href: "/admin", icon: GridIcon, group: "General", description: "Lo que pasa hoy, cómo viene la semana y las cifras del negocio." },
  calendario: { label: "Calendario", href: "/admin/calendario", icon: CalendarIcon, group: "Operación", description: "Ocupación por cabaña y por día." },
  reservas: { label: "Reservas", href: "/admin/reservas", icon: ListIcon, group: "Operación", description: "Busca, filtra y gestiona cualquier reserva." },
  pagos: { label: "Pagos", href: "/admin/pagos", icon: ReceiptIcon, group: "Operación", description: "Transacciones en línea, pagos recibidos y lo que falta por cobrar." },
  clientes: { label: "Clientes", href: "/admin/clientes", icon: UsersIcon, group: "Operación", description: "Historial, valor y valoración interna de cada huésped." },
  bloqueos: { label: "Bloqueos", href: "/admin/bloqueos", icon: BanIcon, group: "Operación", description: "Fechas cerradas por mantenimiento, uso propio u otros motivos." },
  booking: { label: "Booking.com", href: "/admin/booking", icon: RefreshIcon, group: "Operación", description: "Calendarios sincronizados con Booking.com: lo que se vende allá bloquea la web y lo que se vende aquí cierra Booking." },
  finanzas: { label: "Finanzas", href: "/admin/finanzas", icon: TrendIcon, group: "Negocio", description: "Ingresos, ocupación y su evolución por periodo." },
  cabanas: { label: "Cabañas", href: "/admin/cabanas", icon: HomeIcon, group: "Sitio web", description: "Cabañas que se ofrecen en el sitio: información, capacidad y fotos." },
  tarifas: { label: "Tarifas", href: "/admin/tarifas", icon: TagIcon, group: "Sitio web", description: "Precio base por cabaña y temporadas con precio especial." },
  contenido: { label: "Contenido del sitio", href: "/admin/contenido/portada", icon: FileTextIcon, group: "Sitio web", description: "Textos, imágenes, colores y datos que ven los huéspedes en el sitio." },
  notificaciones: { label: "Notificaciones", href: "/admin/notificaciones", icon: BellIcon, group: "Sistema", description: "Historial de avisos del panel." },
  configuracion: { label: "Configuración", href: "/admin/configuracion", icon: SlidersIcon, group: "Sistema", description: "Sonido, tiempo real, preferencias del panel y sesión." },
};

export const MODULE_IDS = Object.keys(MODULES) as ModuleId[];
export const NAV_GROUPS = [...new Set(MODULE_IDS.map((id) => MODULES[id].group))];

// Módulo al que pertenece una ruta del panel ("/admin/reservas/VF-1" → "reservas").
export function moduleOf(pathname: string): ModuleId | null {
  const seg = pathname.replace(/^\/admin\/?/, "").split("/")[0];
  if (!seg) return "dashboard";
  return seg !== "dashboard" && (MODULE_IDS as string[]).includes(seg) ? (seg as ModuleId) : null;
}

/* ───────────── Contenido del sitio: una ruta por zona ───────────── */

export type ContentSectionId = "portada" | "experiencias" | "servicios" | "horarios" | "politicas" | "contacto" | "pagos" | "redes" | "colores";

// Las zonas van agrupadas por lo que son, y así se muestran en las pestañas: lo que se ve en la página de inicio, lo que
// el huésped necesita saber para reservar y quedarse, los datos del negocio y la apariencia.
export const CONTENT_GROUPS = ["Página de inicio", "Reservas y estadía", "Datos del negocio", "Apariencia"] as const;

export const CONTENT_SECTIONS: { id: ContentSectionId; label: string; group: (typeof CONTENT_GROUPS)[number]; where: string; href: string }[] = [
  { id: "portada", label: "Portada", group: "Página de inicio", where: "Lo primero que ven los visitantes: título, descripción y fotos principales.", href: "/#top" },
  { id: "experiencias", label: "La finca", group: "Página de inicio", where: "Sección «La finca», con una foto por experiencia.", href: "/#experiencias" },
  { id: "servicios", label: "Servicios", group: "Página de inicio", where: "Sección «Servicios incluidos» de la página de inicio.", href: "/#servicios" },
  { id: "horarios", label: "Horarios", group: "Reservas y estadía", where: "Sección «Antes de venir» (horarios), el pie de página y las horas de llegada del formulario de reserva.", href: "/#antes-de-venir" },
  { id: "politicas", label: "Políticas y preguntas", group: "Reservas y estadía", where: "Sección «Reservas y políticas», la página de políticas y el resumen antes de enviar una reserva.", href: "/politicas" },
  { id: "pagos", label: "Pagos", group: "Reservas y estadía", where: "Página de confirmación de la reserva: cómo pagar el abono.", href: "/reservar" },
  { id: "contacto", label: "Contacto y ubicación", group: "Datos del negocio", where: "Botones de WhatsApp, teléfonos del pie de página y secciones «Ubicación» y «Contacto».", href: "/#contacto" },
  { id: "redes", label: "Redes y datos legales", group: "Datos del negocio", where: "Pie de página: redes sociales y número de RNT.", href: "/#contacto" },
  { id: "colores", label: "Colores", group: "Apariencia", where: "Todo el sitio público: portada, secciones, cabañas, formulario de reserva, consulta de reservas y pie de página. Este panel usa los mismos colores.", href: "/" },
];

export const isContentSection = (s: string): s is ContentSectionId => CONTENT_SECTIONS.some((x) => x.id === s);

/* ───────────── Rutas ───────────── */

// Clave de cliente ("CC:12345678") ↔ segmento legible de la URL ("cc-12345678").
const DOC_SLUG: Record<string, string> = { CC: "cc", CE: "ce", Pasaporte: "pasaporte", PPT: "ppt" };

function clientSlug(key: string) {
  const i = key.indexOf(":");
  return `${DOC_SLUG[key.slice(0, i)] ?? key.slice(0, i).toLowerCase()}-${key.slice(i + 1)}`;
}

export function clientKeyOf(slug: string) {
  const i = slug.indexOf("-");
  const type = Object.keys(DOC_SLUG).find((k) => DOC_SLUG[k] === slug.slice(0, i).toLowerCase());
  return type && i > 0 ? `${type}:${slug.slice(i + 1).toUpperCase()}` : null;
}

type Query = Record<string, string | number | null | undefined>;

const withQuery = (path: string, q?: Query) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q ?? {})) if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `${path}?${s}` : path;
};

export const paths = {
  dashboard: "/admin",
  calendario: (q?: Query) => withQuery("/admin/calendario", q),
  reservas: (q?: Query) => withQuery("/admin/reservas", q),
  reserva: (code: string) => `/admin/reservas/${encodeURIComponent(code)}`,
  pagos: (q?: Query) => withQuery("/admin/pagos", q),
  clientes: (q?: Query) => withQuery("/admin/clientes", q),
  cliente: (key: string) => `/admin/clientes/${clientSlug(key)}`,
  bloqueos: (q?: Query) => withQuery("/admin/bloqueos", q),
  booking: "/admin/booking",
  finanzas: (q?: Query) => withQuery("/admin/finanzas", q),
  cabanas: "/admin/cabanas",
  nuevaCabana: "/admin/cabanas/nueva",
  cabana: (id: string) => `/admin/cabanas/${encodeURIComponent(id)}`,
  tarifas: (q?: Query) => withQuery("/admin/tarifas", q),
  contenido: (section?: ContentSectionId) => (section ? `/admin/contenido/${section}` : "/admin/contenido"),
  notificaciones: (q?: Query) => withQuery("/admin/notificaciones", q),
  configuracion: "/admin/configuracion",
};

// Enlaces del panel anterior (/admin?s=reservas&r=CODIGO) → rutas actuales.
export function legacyPath(search: URLSearchParams): string | null {
  const r = search.get("r");
  if (r) return paths.reserva(r);
  const s = search.get("s");
  const id = search.get("id");
  if (!s) return null;
  if (s === "resumen") return paths.dashboard;
  if (s === "clientes" && id) return paths.cliente(id);
  if (s === "cabanas" && id) return id === "nueva" ? paths.nuevaCabana : paths.cabana(id);
  if (s === "contenido" && id && isContentSection(id)) return paths.contenido(id);
  return (MODULE_IDS as string[]).includes(s) ? MODULES[s as ModuleId].href : null;
}
