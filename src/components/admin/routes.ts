// Mapa del panel: cada módulo es una página con su ruta. Lo usan el menú, las migas de pan, los títulos y los enlaces.
// Sin "use client": las páginas del servidor también lo leen (validación de segmentos dinámicos).
import type { ComponentType } from "react";
import {
  BanIcon,
  BellIcon,
  CalendarIcon,
  FileTextIcon,
  GridIcon,
  HomeIcon,
  IdCardIcon,
  ListIcon,
  ReceiptIcon,
  SlidersIcon,
  SpreadsheetIcon,
  TagIcon,
  TrendIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/ui/icons";
import { can, type Permission } from "@/lib/permissions";
import type { PanelRole } from "@/lib/types";

export type ModuleId =
  | "dashboard"
  | "calendario"
  | "notificaciones"
  | "reservas"
  | "pagos"
  | "clientes"
  | "importar"
  | "cabanas"
  | "bloqueos"
  | "tarifas"
  | "finanzas"
  | "condiciones"
  | "contenido"
  | "empleados"
  | "configuracion"
  | "perfil";

// `perm`: el permiso que exige (sin él, el módulo no aparece en el menú y su página muestra «sin acceso»).
// `nav: false`: página sin lugar en el menú (se llega desde el menú de la cuenta).
// `off: true`: módulo desactivado por ahora (no aparece en el menú y su página lo indica).
type Module = {
  label: string;
  href: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  group: string;
  description: string;
  perm?: Permission;
  nav?: false;
  off?: true;
};

// El menú va del día a día a la administración: lo de hoy, las reservas y su gestión, el alojamiento, el negocio y el
// equipo. El orden de este objeto es el del menú.
export const MODULES: Record<ModuleId, Module> = {
  dashboard: {
    label: "Dashboard",
    href: "/admin",
    icon: GridIcon,
    group: "Principal",
    description: "Lo que pasa hoy, lo que falta por cobrar y las próximas llegadas.",
  },
  calendario: { label: "Calendario", href: "/admin/calendario", icon: CalendarIcon, group: "Principal", description: "Ocupación por cabaña y por día." },
  notificaciones: { label: "Notificaciones", href: "/admin/notificaciones", icon: BellIcon, group: "Principal", description: "Historial de avisos del panel." },
  reservas: { label: "Reservas", href: "/admin/reservas", icon: ListIcon, group: "Reservas", description: "Busca, filtra y gestiona cualquier reserva." },
  pagos: {
    label: "Pagos",
    href: "/admin/pagos",
    icon: ReceiptIcon,
    group: "Reservas",
    description: "Pagos recibidos, comprobantes y lo que falta por cobrar.",
  },
  clientes: {
    label: "Clientes",
    href: "/admin/clientes",
    icon: UsersIcon,
    group: "Reservas",
    description: "Historial, valor y valoración interna de cada huésped.",
  },
  importar: {
    label: "Importar reservas",
    href: "/admin/importar",
    icon: SpreadsheetIcon,
    group: "Reservas",
    description: "Carga reservas desde un archivo de Excel exportado de otro sistema.",
    perm: "import",
  },
  cabanas: {
    label: "Cabañas",
    href: "/admin/cabanas",
    icon: HomeIcon,
    group: "Alojamiento",
    description: "Cabañas que se ofrecen en el sitio: información, capacidad, fotos y baños.",
    perm: "cabins",
  },
  bloqueos: {
    label: "Bloqueos y baños",
    href: "/admin/bloqueos",
    icon: BanIcon,
    group: "Alojamiento",
    description: "Fechas cerradas de las cabañas, baños y su estado.",
  },
  tarifas: {
    label: "Tarifas",
    href: "/admin/tarifas",
    icon: TagIcon,
    group: "Alojamiento",
    description: "Precio base por cabaña y temporadas con precio especial.",
    perm: "rates",
  },
  finanzas: {
    label: "Finanzas",
    href: "/admin/finanzas",
    icon: TrendIcon,
    group: "Negocio",
    description: "Ingresos, ocupación y su evolución por periodo.",
    perm: "finance",
  },
  condiciones: {
    label: "Condiciones de pago",
    href: "/admin/condiciones",
    icon: WalletIcon,
    group: "Negocio",
    description: "El abono para confirmar las reservas y los datos de pago que ve el huésped.",
    perm: "rates",
  },
  contenido: {
    label: "Contenido del sitio",
    href: "/admin/contenido/portada",
    icon: FileTextIcon,
    group: "Negocio",
    description: "Textos, imágenes, colores y datos que ven los huéspedes en el sitio.",
    perm: "content",
    off: true,
  },
  empleados: {
    label: "Empleados",
    href: "/admin/empleados",
    icon: IdCardIcon,
    group: "Administración",
    description: "Cuentas del equipo, su rol y su acceso al panel.",
    perm: "employees",
  },
  configuracion: {
    label: "Configuración",
    href: "/admin/configuracion",
    icon: SlidersIcon,
    group: "Administración",
    description: "Apariencia, sonido, tiempo real y preferencias de este navegador.",
  },
  perfil: {
    label: "Mi perfil",
    href: "/admin/perfil",
    icon: UserIcon,
    group: "Cuenta",
    description: "Tu nombre, tu contraseña y lo que puede hacer tu rol.",
    nav: false,
  },
};

export const MODULE_IDS = Object.keys(MODULES) as ModuleId[];
export const NAV_GROUPS = [...new Set(MODULE_IDS.filter((id) => MODULES[id].nav !== false).map((id) => MODULES[id].group))];

// Si el rol puede abrir el módulo (los desactivados no los abre nadie).
export const canOpen = (role: PanelRole | null | undefined, id: ModuleId) => !MODULES[id].off && (!MODULES[id].perm || can(role, MODULES[id].perm));

// Módulo al que pertenece una ruta del panel ("/admin/reservas/VF-1" → "reservas").
export function moduleOf(pathname: string): ModuleId | null {
  const seg = pathname.replace(/^\/admin\/?/, "").split("/")[0];
  if (!seg) return "dashboard";
  return seg !== "dashboard" && (MODULE_IDS as string[]).includes(seg) ? (seg as ModuleId) : null;
}

/* ───────────── Contenido del sitio: una ruta por zona ───────────── */

export type ContentSectionId = "portada" | "experiencias" | "servicios" | "horarios" | "politicas" | "contacto" | "redes" | "colores";

// Las zonas van agrupadas por lo que son, y así se muestran en las pestañas: lo que se ve en la página de inicio, lo que
// el huésped necesita saber para reservar y quedarse, los datos del negocio y la apariencia.
export const CONTENT_GROUPS = ["Página de inicio", "Reservas y estadía", "Datos del negocio", "Apariencia"] as const;

export const CONTENT_SECTIONS: { id: ContentSectionId; label: string; group: (typeof CONTENT_GROUPS)[number]; where: string; href: string }[] = [
  {
    id: "portada",
    label: "Portada",
    group: "Página de inicio",
    where: "Lo primero que ven los visitantes: título, descripción y fotos principales.",
    href: "/#top",
  },
  { id: "experiencias", label: "La finca", group: "Página de inicio", where: "Sección «La finca», con una foto por experiencia.", href: "/#experiencias" },
  { id: "servicios", label: "Servicios", group: "Página de inicio", where: "Sección «Servicios incluidos» de la página de inicio.", href: "/#servicios" },
  {
    id: "horarios",
    label: "Horarios",
    group: "Reservas y estadía",
    where: "Sección «Antes de venir» (horarios), el pie de página y las horas de llegada del formulario de reserva.",
    href: "/#antes-de-venir",
  },
  {
    id: "politicas",
    label: "Políticas y preguntas",
    group: "Reservas y estadía",
    where: "Sección «Reservas y políticas», la página de políticas y el resumen antes de enviar una reserva.",
    href: "/politicas",
  },
  {
    id: "contacto",
    label: "Contacto y ubicación",
    group: "Datos del negocio",
    where: "Botones de WhatsApp, teléfonos del pie de página y secciones «Ubicación» y «Contacto».",
    href: "/#contacto",
  },
  { id: "redes", label: "Redes y datos legales", group: "Datos del negocio", where: "Pie de página: redes sociales y número de RNT.", href: "/#contacto" },
  {
    id: "colores",
    label: "Colores",
    group: "Apariencia",
    where:
      "Todo el sitio público: portada, secciones, cabañas, formulario de reserva, consulta de reservas y pie de página. Este panel usa los mismos colores.",
    href: "/",
  },
];

export const isContentSection = (s: string): s is ContentSectionId => CONTENT_SECTIONS.some((x) => x.id === s);

/* ───────────── Rutas ───────────── */

// Clave de cliente ("CC:12345678") ↔ segmento legible de la URL ("cc-12345678").
const DOC_SLUG: Record<string, string> = { CC: "cc", CE: "ce", Pasaporte: "pasaporte", PPT: "ppt", SD: "sd" };

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
  finanzas: (q?: Query) => withQuery("/admin/finanzas", q),
  condiciones: "/admin/condiciones",
  cabanas: "/admin/cabanas",
  nuevaCabana: "/admin/cabanas/nueva",
  cabana: (id: string) => `/admin/cabanas/${encodeURIComponent(id)}`,
  tarifas: (q?: Query) => withQuery("/admin/tarifas", q),
  contenido: (section?: ContentSectionId) => (section ? `/admin/contenido/${section}` : "/admin/contenido"),
  notificaciones: (q?: Query) => withQuery("/admin/notificaciones", q),
  configuracion: "/admin/configuracion",
  importar: "/admin/importar",
  empleados: "/admin/empleados",
  perfil: "/admin/perfil",
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
