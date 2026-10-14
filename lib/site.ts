// Contenido editable del sitio (horarios, contacto, políticas, imágenes). Lo usan servidor y navegador.
import { config, type Policy } from "./config";
import { DEFAULT_SERVICES } from "./content";
import { DEFAULT_THEME, type SiteTheme } from "./theme";

export type SiteSettings = {
  checkInStart: string; // "HH:MM"
  checkInEnd: string;
  checkOutTime: string;
  phones: string[];
  whatsapp: string; // con indicativo, solo dígitos: 573155918577
  rnt: string;
};

export type SitePolicy = Policy & { id: string };

// Textos editables desde el panel (columna site_settings.content). Vacío = se usa el valor por defecto.
export type SiteTexts = {
  // rotating: otras frases que se alternan con el título resaltado en la portada (una por línea).
  hero: { title: string; highlight: string; rotating: string; badge: string; description: string };
  location: { note: string };
  payment: { instructions: string };
  social: { instagram: string; facebook: string; tiktok: string };
};

// Servicio de la sección «Servicios incluidos» (tabla site_services). icon: clave de lib/service-icons.ts;
// note: etiqueta opcional («Valor adicional») que lo destaca como extra. Ocultos: solo se ven en el panel.
export type SiteService = { id: string; title: string; description: string; icon: string; note: string; visible: boolean };
export const SERVICE_LIMITS = { title: 60, description: 160, note: 30, max: 40 };

export type SiteContent = {
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
    title: "Duerme bajo",
    highlight: "las estrellas",
    rotating: "la Vía Láctea\nel cielo andino",
    badge: "Murillo, Tolima · A 2.950 m de altura",
    description: "Domos geodésicos con jacuzzi privado y desayuno servido en la terraza, a 2.950 metros de altura. Rodeado de montañas y acompañado por las estrellas.",
  },
  location: { note: "A pocos minutos de Murillo. El Nevado del Ruiz queda a aproximadamente 1 hora en carro." },
  payment: { instructions: "" },
  social: { instagram: "https://www.instagram.com/stellariumglamping/", facebook: "https://www.facebook.com/StellariumGlampingMurillo", tiktok: "" },
};

// Límites de cada texto (los aplica la API al guardar).
export const TEXT_LIMITS = { title: 40, highlight: 40, rotating: 200, rotatingLines: 5, badge: 60, description: 320, note: 160, instructions: 600, url: 200 };

// Frases que se alternan con el título resaltado: líneas no vacías del campo «rotating», con el mismo límite por línea.
export const rotatingPhrases = (hero: { highlight: string; rotating: string }) =>
  [hero.highlight, ...hero.rotating.split("\n")].map((x) => x.trim()).filter(Boolean).slice(0, TEXT_LIMITS.rotatingLines + 1);

// Mezcla lo guardado con los valores por defecto; ignora claves desconocidas o que no sean texto.
export function mergeTexts(raw: unknown): SiteTexts {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const pick = <T extends Record<string, string>>(group: keyof SiteTexts, defs: T): T =>
    Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, typeof r[group]?.[k] === "string" ? (r[group]![k] as string) : v])) as T;
  return {
    hero: pick("hero", defaultTexts.hero),
    location: pick("location", defaultTexts.location),
    payment: pick("payment", defaultTexts.payment),
    social: pick("social", defaultTexts.social),
  };
}

// `hint`: orientación sugerida; `min`: resolución mínima (px) para que la foto se vea nítida en pantallas de alta densidad.
export type PhotoSlotDef = { id: string; group: string; label: string; alt: string; placeholder: string; aspect: string; hint: string; min: readonly [width: number, height: number] };

// Huecos de imagen del sitio, en el orden en que aparecen en el panel. Las fotos de cada domo se administran en su ficha.
export const PHOTO_SLOTS: PhotoSlotDef[] = [
  { id: "hero-main", group: "Portada · banner grande", label: "Banner grande", alt: "Domo iluminado de noche junto al jacuzzi", placeholder: "Foto real (4:5): domo de noche bajo el cielo estrellado", aspect: "4/5", hint: "Vertical 4:5", min: [1200, 1500] },
  { id: "hero-thumb-1", group: "Portada · banners pequeños", label: "Banner pequeño 1", alt: "Exterior del domo geodésico", placeholder: "Foto real: exterior del domo", aspect: "1/1.1", hint: "Casi cuadrada", min: [600, 660] },
  { id: "hero-thumb-2", group: "Portada · banners pequeños", label: "Banner pequeño 2", alt: "Interior del domo", placeholder: "Foto real: interior del domo", aspect: "1/1.1", hint: "Casi cuadrada", min: [600, 660] },
  { id: "hero-thumb-3", group: "Portada · banners pequeños", label: "Banner pequeño 3", alt: "Zona de fogata", placeholder: "Foto real: fogata", aspect: "1/1.1", hint: "Casi cuadrada", min: [600, 660] },
  { id: "hero-thumb-4", group: "Portada · banners pequeños", label: "Banner pequeño 4", alt: "Desayuno con vista a las montañas", placeholder: "Foto real: desayuno o jacuzzi", aspect: "1/1.1", hint: "Casi cuadrada", min: [600, 660] },
  { id: "exp-jacuzzi", group: "Alta montaña bajo las estrellas", label: "Jacuzzi al aire libre", alt: "Jacuzzi al aire libre", placeholder: "Foto real: jacuzzi en la terraza", aspect: "3/4.1", hint: "Vertical 3:4", min: [900, 1230] },
  { id: "exp-estrellas", group: "Alta montaña bajo las estrellas", label: "Noches bajo las estrellas", alt: "Noches bajo las estrellas", placeholder: "Foto real: el domo de noche o el cielo estrellado", aspect: "3/4.1", hint: "Vertical 3:4", min: [900, 1230] },
  { id: "exp-desayuno", group: "Alta montaña bajo las estrellas", label: "Desayuno con vista", alt: "Desayuno con vista a las montañas", placeholder: "Foto real: desayuno en la terraza", aspect: "3/4.1", hint: "Vertical 3:4", min: [900, 1230] },
  { id: "exp-fogata", group: "Alta montaña bajo las estrellas", label: "Fogata y vino", alt: "Fogata y vino", placeholder: "Foto real: zona de fogata de noche", aspect: "3/4.1", hint: "Vertical 3:4", min: [900, 1230] },
  { id: "exp-nevado", group: "Alta montaña bajo las estrellas", label: "Nevado del Ruiz", alt: "Nevado del Ruiz", placeholder: "Foto real: el Nevado del Ruiz", aspect: "3/4.1", hint: "Vertical 3:4", min: [900, 1230] },
  { id: "contact", group: "Contacto", label: "Imagen de contacto", alt: "Stellarium Glamping", placeholder: "Foto real: anfitriones o el glamping", aspect: "4/3", hint: "Horizontal 4:3", min: [1200, 900] },
];

export const photoSlot = (id: string) => PHOTO_SLOTS.find((s) => s.id === id);

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

// Foto de domo: lado mayor y mínimo (horizontal 4:3), igual que los huecos del sitio.
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
    policies,
  };
}

// Fotos del diseño (public/fotos): se ven en el modo simulado o si Supabase no responde. Con Supabase, cada hueco
// muestra la foto que se sube desde el panel.
export const DEFAULT_PHOTOS: Record<string, string> = {
  "hero-main": "/fotos/domo-noche-jacuzzi.webp",
  "hero-thumb-1": "/fotos/domo-detalle.webp",
  "hero-thumb-2": "/fotos/domo-interior-familiar.jpg",
  "hero-thumb-3": "/fotos/fogata-vino.jpg",
  "hero-thumb-4": "/fotos/desayuno-vista.jpg",
  "exp-jacuzzi": "/fotos/domo-jacuzzi-terraza.webp",
  "exp-estrellas": "/fotos/fogata-vino.jpg",
  "exp-desayuno": "/fotos/desayuno-terraza.webp",
  "exp-fogata": "/fotos/vino-noche.webp",
  "exp-nevado": "/fotos/nevado-del-ruiz.jpg",
  contact: "/fotos/domo-exterior.webp",
};

// Valores del diseño, para el modo simulado o si Supabase no responde.
export const defaultContent: SiteContent = {
  settings: { checkInStart: "15:00", checkInEnd: "19:00", checkOutTime: "12:00", phones: [...config.phones], whatsapp: config.whatsapp, rnt: config.rnt },
  policies: config.policies.map((p, i) => ({ ...p, id: `default-${i}` })),
  photos: DEFAULT_PHOTOS,
  texts: defaultTexts,
  services: DEFAULT_SERVICES.map((x, i) => ({ id: `default-${i}`, title: x.title, description: x.description ?? "", icon: x.icon, note: x.note ?? "", visible: true })),
  theme: DEFAULT_THEME,
};
