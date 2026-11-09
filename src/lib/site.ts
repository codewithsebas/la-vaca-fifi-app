// Contenido editable del sitio (horarios, contacto, políticas, imágenes). Lo usan servidor y navegador.
import { config, type Policy } from "@/lib/config";
import { DEFAULT_SERVICES } from "@/lib/content";
import { DEFAULT_THEME, type SiteTheme } from "@/lib/theme";

export type SiteSettings = {
  checkInStart: string; // "HH:MM"
  checkInEnd: string;
  checkOutTime: string;
  depositPct: number; // abono para confirmar una reserva (% del total); lo cambian solo los administradores
  phones: string[];
  whatsapp: string; // con indicativo, solo dígitos: 573142374008
  rnt: string;
};

export type SitePolicy = Policy & { id: string };

// Textos editables desde el panel (columna site_settings.content). Vacío = se usa el valor por defecto. Las listas se
// guardan como texto, un elemento por línea (lines()).
export type SiteTexts = {
  // Título de la portada: title + highlight (en azul); words: frases que reemplazan a highlight una tras otra.
  hero: { title: string; highlight: string; words: string; badge: string; description: string };
  // Calificación de los huéspedes (insignia del mosaico, título, tarjeta de anfitriones y barra del celular).
  rating: { score: string; reviews: string; source: string };
  // Etiquetas de las cuatro fotos pequeñas del mosaico de la portada, en orden.
  mosaic: { labels: string };
  // «Lo que incluye tu estadía»: una línea por cosa (el ícono se elige por la palabra: desayuno, mascota, wifi…).
  stay: { highlights: string };
  // Sección del restaurante: título (title + highlight en rojo), texto y lista con viñetas.
  restaurant: { title: string; highlight: string; description: string; items: string };
  location: { note: string };
  payment: { instructions: string };
  social: { instagram: string; facebook: string; tiktok: string };
};

// Servicio de la sección «Servicios incluidos» (tabla site_services). icon: clave de lib/service-icons.ts;
// note: etiqueta opcional («Valor adicional») que lo destaca como extra. Ocultos: solo se ven en el panel.
export type SiteService = { id: string; title: string; description: string; icon: string; note: string; visible: boolean };
export const SERVICE_LIMITS = { title: 60, description: 160, note: 30, max: 40 };

export type SiteContent = {
  version?: number;
  settings: SiteSettings;
  policies: SitePolicy[];
  photos: Record<string, string>; // slot → URL pública
  texts: SiteTexts;
  services: SiteService[]; // en el orden en que se muestran
  theme: SiteTheme; // colores del sitio público
};

// Configuración del negocio con los campos editables ya aplicados (misma forma que `config`).
export type SiteConfig = Omit<typeof config, "policies"> & { policies: SitePolicy[] };

export const defaultTexts: SiteTexts = {
  hero: {
    title: "Duerme rico,",
    highlight: "come mejor",
    words: "despierta con vista\ndescansa en familia\ntrae a tu mascota",
    badge: "A 5 minutos de Murillo, Tolima",
    description:
      "Cabañas de colores con baño privado, balcón con vista a la montaña y desayuno americano incluido. Al lado, el restaurante y café de Fifí: comida casera, parque para los niños y atención familiar.",
  },
  rating: { score: "9,2", reviews: "242", source: "Booking.com" },
  mosaic: { labels: "Cabañas\nRestaurante\nDesayuno con vista\nJardines" },
  stay: { highlights: "Desayuno americano incluido\nMascotas sin costo\nParqueadero gratis\nWifi\nParque infantil" },
  restaurant: {
    title: "Restaurante y café: comida casera y café",
    highlight: "de la casa",
    description:
      "El restaurante de Fifí queda al lado de las cabañas y está abierto también para quienes pasan por la vía a Murillo. Con vista a la montaña, música de vez en cuando y la atención de la familia.",
    items:
      "Desayuno americano incluido para los huéspedes\nDesayunos, almuerzos y cenas de comida casera\nCafé caliente para las tardes frías de Murillo\nCelebraciones y eventos, con reserva",
  },
  location: { note: "A 5 minutos de Murillo por la vía Líbano – Murillo, en la vereda Pajonales. El Nevado del Ruiz queda a aproximadamente 1 hora en carro." },
  payment: { instructions: "" },
  social: { instagram: "https://www.instagram.com/la_vaca_fifi/", facebook: "https://www.facebook.com/profile.php?id=100083189417737", tiktok: "" },
};

// Límites de cada texto (los aplica la API al guardar). Las listas: cuántas líneas y cuántos caracteres por línea.
export const TEXT_LIMITS = {
  title: 40,
  highlight: 40,
  badge: 60,
  description: 320,
  note: 160,
  instructions: 600,
  url: 200,
  ratingScore: 6,
  ratingReviews: 8,
  ratingSource: 30,
  restaurantTitle: 70,
  restaurantHighlight: 30,
  restaurantDescription: 400,
};
export const LIST_LIMITS = {
  words: { lines: 5, chars: 40 },
  labels: { lines: 4, chars: 30 },
  highlights: { lines: 6, chars: 40 },
  items: { lines: 6, chars: 80 },
} as const;

// Las líneas no vacías de un texto de lista.
export const lines = (v: string) =>
  v
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

// Errores de una lista frente a su límite (texto para mostrar), o null si está bien.
export function listIssue(v: string, k: keyof typeof LIST_LIMITS) {
  const l = lines(v);
  const { lines: n, chars } = LIST_LIMITS[k];
  return l.length > n || l.some((x) => x.length > chars) ? `Hasta ${n} líneas, de máximo ${chars} caracteres cada una.` : null;
}

// Mezcla lo guardado con los valores por defecto; ignora claves desconocidas o que no sean texto.
export function mergeTexts(raw: unknown): SiteTexts {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const pick = <T extends Record<string, string>>(group: keyof SiteTexts, defs: T): T =>
    Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, typeof r[group]?.[k] === "string" ? (r[group]![k] as string) : v])) as T;
  return {
    hero: pick("hero", defaultTexts.hero),
    rating: pick("rating", defaultTexts.rating),
    mosaic: pick("mosaic", defaultTexts.mosaic),
    stay: pick("stay", defaultTexts.stay),
    restaurant: pick("restaurant", defaultTexts.restaurant),
    location: pick("location", defaultTexts.location),
    payment: pick("payment", defaultTexts.payment),
    social: pick("social", defaultTexts.social),
  };
}

// `hint`: orientación sugerida; `min`: resolución mínima (px) para que la foto se vea nítida en pantallas de alta densidad.
export type PhotoSlotDef = {
  id: string;
  group: string;
  label: string;
  alt: string;
  placeholder: string;
  aspect: string;
  hint: string;
  min: readonly [width: number, height: number];
};

// Huecos de imagen del sitio, en el orden en que aparecen en el panel. Las fotos de cada cabaña se administran en su ficha.
export const PHOTO_SLOTS: PhotoSlotDef[] = [
  {
    id: "portada-1",
    group: "Mosaico de la portada",
    label: "Foto grande",
    alt: "Entrada de La Vaca Fifí con su letrero",
    placeholder: "Foto real: la entrada con el letrero",
    aspect: "6/5",
    hint: "Casi cuadrada 6:5",
    min: [1440, 1200],
  },
  {
    id: "portada-2",
    group: "Mosaico de la portada",
    label: "Foto pequeña 1",
    alt: "Foto de La Vaca Fifí",
    placeholder: "Foto real de la finca",
    aspect: "6/5",
    hint: "Casi cuadrada 6:5",
    min: [720, 600],
  },
  {
    id: "portada-3",
    group: "Mosaico de la portada",
    label: "Foto pequeña 2",
    alt: "Foto de La Vaca Fifí",
    placeholder: "Foto real de la finca",
    aspect: "6/5",
    hint: "Casi cuadrada 6:5",
    min: [720, 600],
  },
  {
    id: "portada-4",
    group: "Mosaico de la portada",
    label: "Foto pequeña 3",
    alt: "Foto de La Vaca Fifí",
    placeholder: "Foto real de la finca",
    aspect: "6/5",
    hint: "Casi cuadrada 6:5",
    min: [720, 600],
  },
  {
    id: "portada-5",
    group: "Mosaico de la portada",
    label: "Foto pequeña 4",
    alt: "Foto de La Vaca Fifí",
    placeholder: "Foto real de la finca",
    aspect: "6/5",
    hint: "Casi cuadrada 6:5",
    min: [720, 600],
  },
  {
    id: "exp-restaurante",
    group: "Restaurante",
    label: "Foto del restaurante 1",
    alt: "Restaurante y café de La Vaca Fifí",
    placeholder: "Foto real: el restaurante por dentro",
    aspect: "4/3",
    hint: "Horizontal 4:3",
    min: [1200, 900],
  },
  {
    id: "restaurante-2",
    group: "Restaurante",
    label: "Foto del restaurante 2",
    alt: "El restaurante de La Vaca Fifí por fuera",
    placeholder: "Foto real: el restaurante por fuera",
    aspect: "4/3",
    hint: "Horizontal 4:3",
    min: [1200, 900],
  },
  {
    id: "exp-desayuno",
    group: "La finca",
    label: "Desayuno con vista",
    alt: "Desayuno con vista a la montaña",
    placeholder: "Foto real: desayuno o balcón con vista",
    aspect: "3/4.1",
    hint: "Vertical 3:4",
    min: [900, 1230],
  },
  {
    id: "exp-parque",
    group: "La finca",
    label: "Parque infantil",
    alt: "Parque infantil",
    placeholder: "Foto real: el parque infantil",
    aspect: "3/4.1",
    hint: "Vertical 3:4",
    min: [900, 1230],
  },
  {
    id: "exp-jardines",
    group: "La finca",
    label: "Jardines y flores",
    alt: "Jardines y flores",
    placeholder: "Foto real: los jardines",
    aspect: "3/4.1",
    hint: "Vertical 3:4",
    min: [900, 1230],
  },
  {
    id: "exp-finca",
    group: "La finca",
    label: "Ambiente de finca",
    alt: "Ambiente de finca tradicional",
    placeholder: "Foto real: los caminos y zonas verdes de la finca",
    aspect: "3/4.1",
    hint: "Vertical 3:4",
    min: [900, 1230],
  },
  {
    id: "contact",
    group: "Contacto",
    label: "Imagen de contacto",
    alt: "Entrada de La Vaca Fifí",
    placeholder: "Foto real: la entrada o los anfitriones",
    aspect: "4/3",
    hint: "Horizontal 4:3",
    min: [1200, 900],
  },
];

export const photoSlot = (id: string) => PHOTO_SLOTS.find((s) => s.id === id);

// Fotos pequeñas del mosaico sin foto propia: qué foto del sitio se muestra en su lugar (hueco y cómo se llama en el
// panel). La pequeña 1 usa la primera foto de la primera cabaña.
export const MOSAIC_FALLBACK: Record<string, { slot?: string; label: string }> = {
  "portada-2": { label: "la primera foto de la primera cabaña" },
  "portada-3": { slot: "exp-restaurante", label: "la foto 1 del restaurante" },
  "portada-4": { slot: "exp-desayuno", label: "la foto «Desayuno con vista» de La finca" },
  "portada-5": { slot: "exp-jardines", label: "la foto «Jardines y flores» de La finca" },
};

// "15:00" → "3:00 p. m."; "12:00" → "12:00 del mediodía".
export function fmtTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  if (h === 12 && m === 0) return "12:00 del mediodía";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
}

// Horas de llegada cada 30 minutos dentro de la ventana de check-in.
export function arrivalOptions(start: string, end: string): [value: string, label: string][] {
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const out: [string, string][] = [];
  for (let t = toMin(start); t <= toMin(end); t += 30) {
    const v = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    out.push([v, fmtTime(v)]);
  }
  return out;
}

// Foto de cabaña: lado mayor y mínimo (horizontal 4:3), igual que los huecos del sitio.
export const CABIN_PHOTO = { aspect: "4/3", hint: "Horizontal 4:3", min: [1600, 1200] as const };

export function mergeSite(s: SiteSettings, policies: SitePolicy[], texts: SiteTexts = defaultTexts): SiteConfig {
  return {
    ...config,
    datosPagoAbono: texts.payment.instructions.trim() || config.datosPagoAbono,
    phones: s.phones,
    whatsapp: s.whatsapp,
    rnt: s.rnt,
    checkIn: `${fmtTime(s.checkInStart)} a ${fmtTime(s.checkInEnd)}`,
    checkOut: fmtTime(s.checkOutTime),
    checkInStart: s.checkInStart,
    checkInEnd: s.checkInEnd,
    checkOutTime: s.checkOutTime,
    depositPct: s.depositPct,
    policies,
  };
}

// Fotos del diseño (public/fotos): se ven en el modo simulado o si Supabase no responde. Con Supabase, cada hueco
// muestra la foto que se sube desde el panel.
export const DEFAULT_PHOTOS: Record<string, string> = {
  // Mosaico de la portada: la grande; las pequeñas sin foto propia usan otra del sitio (MOSAIC_FALLBACK).
  "portada-1": "/fotos/entrada-letrero.jpg",
  "exp-restaurante": "/fotos/restaurante-musica-en-vivo.jpg",
  "restaurante-2": "/fotos/restaurante-techo-colores.jpg",
  "exp-desayuno": "/fotos/balcon-vista-montanas.jpg",
  "exp-parque": "/fotos/parque-infantil.jpg",
  "exp-jardines": "/fotos/jardin-flores.jpg",
  "exp-finca": "/fotos/escaleras-parque.jpg",
  contact: "/fotos/entrada-letrero.jpg",
};

// Valores del diseño, para el modo simulado o si Supabase no responde.
export const defaultContent: SiteContent = {
  settings: {
    checkInStart: "14:00",
    checkInEnd: "22:00",
    checkOutTime: "12:00",
    depositPct: config.depositPct,
    phones: [...config.phones],
    whatsapp: config.whatsapp,
    rnt: config.rnt,
  },
  policies: config.policies.map((p, i) => ({ ...p, id: `default-${i}` })),
  photos: DEFAULT_PHOTOS,
  texts: defaultTexts,
  services: DEFAULT_SERVICES.map((x, i) => ({
    id: `default-${i}`,
    title: x.title,
    description: x.description ?? "",
    icon: x.icon,
    note: x.note ?? "",
    visible: true,
  })),
  theme: DEFAULT_THEME,
};
