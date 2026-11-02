// Colores del sitio, editables desde el panel (Contenido del sitio → Colores). Lo usan servidor y navegador.
// Cada clave reemplaza una variable de la paleta de app/globals.css. El panel tiene sus propios colores (app/globals.css).
// Las claves vienen del sistema de colores del panel; en la identidad de Fifí el fondo es claro (leche) y «onDark» es la
// tinta: el texto sobre el fondo y el contorno de las calcomanías. «night» es el café de las secciones oscuras.

export type ThemeKey = "bg" | "surface" | "deep" | "night" | "card" | "cardMuted" | "onDark" | "onLight" | "accent" | "highlight" | "cta" | "ctaText";
export type SiteTheme = Record<ThemeKey, string>; // "#rrggbb"

const VARS: Record<ThemeKey, string> = {
  bg: "--color-bg",
  surface: "--color-surface",
  deep: "--color-deep",
  night: "--color-night",
  card: "--color-card",
  cardMuted: "--color-card-muted",
  onDark: "--color-on-dark",
  onLight: "--color-on-light",
  accent: "--color-accent",
  highlight: "--color-highlight",
  cta: "--color-cta",
  ctaText: "--color-cta-text",
};

export const THEME_KEYS = Object.keys(VARS) as ThemeKey[];

// Campos del panel, agrupados por el papel que cumple cada color en el sitio.
export const THEME_GROUPS: { label: string; fields: { key: ThemeKey; label: string; hint: string }[] }[] = [
  {
    label: "Fondos",
    fields: [
      { key: "bg", label: "Leche", hint: "Fondo general del sitio y del menú." },
      { key: "surface", label: "Crema", hint: "Secciones alternas (cabañas, antes de venir) y bloques suaves." },
      { key: "deep", label: "Cielo claro", hint: "Sección de servicios y fondos suaves de las fotos." },
      { key: "night", label: "Café", hint: "Sección del restaurante. Su texto va en el color de las tarjetas." },
    ],
  },
  {
    label: "Tarjetas",
    fields: [
      { key: "card", label: "Tarjeta", hint: "Cabañas, formulario de reserva, globos de Fifí y texto sobre el café." },
      { key: "cardMuted", label: "Tarjeta secundaria", hint: "Campos del formulario y zonas suaves dentro de las tarjetas." },
    ],
  },
  {
    label: "Tinta",
    fields: [
      { key: "onDark", label: "Tinta", hint: "Títulos, textos, contornos y sombras de las calcomanías, y fondo del pie de página." },
      { key: "onLight", label: "Texto sobre tarjetas", hint: "Títulos y párrafos sobre las tarjetas y las etiquetas." },
    ],
  },
  {
    label: "Acentos",
    fields: [
      { key: "accent", label: "Azul del letrero", hint: "El cielo de la portada, enlaces y detalles." },
      { key: "highlight", label: "Amarillo del arete", hint: "Etiquetas de precio, insignias, la franja final y el foco." },
    ],
  },
  {
    label: "Botón principal",
    fields: [
      { key: "cta", label: "Rojo lengua", hint: "«Reservar» y las demás acciones principales; también el trazo que subraya los títulos." },
      { key: "ctaText", label: "Texto del botón", hint: "Letra de los botones principales." },
    ],
  },
];

export const themeField = (k: ThemeKey) => THEME_GROUPS.flatMap((g) => g.fields).find((f) => f.key === k)!;

// Paletas listas para usar (contraste de textos ≥ 4.5:1 y de acentos ≥ 3:1). La primera es la del diseño.
export const THEME_PRESETS: { id: string; label: string; description: string; theme: SiteTheme }[] = [
  {
    // De Fifí y su letrero: leche de fondo, la tinta del contorno, el azul del cielo, el amarillo del arete y el rojo de
    // la lengua en los botones; café para el restaurante.
    id: "fifi",
    label: "Fifí",
    description: "Leche, azul del letrero, amarillo del arete y rojo lengua. La paleta original.",
    theme: {
      bg: "#fff8eb",
      surface: "#fcebcb",
      deep: "#d9f0fb",
      night: "#3b2416",
      card: "#fffdf8",
      cardMuted: "#f3e6d2",
      onDark: "#241a14",
      onLight: "#241a14",
      accent: "#157ab8",
      highlight: "#ffd23f",
      cta: "#d2283f",
      ctaText: "#ffffff",
    },
  },
  {
    id: "cafe",
    label: "Café de la casa",
    description: "Crema, caramelo y café tostado.",
    theme: {
      bg: "#fbf4ea",
      surface: "#f2e1c8",
      deep: "#efe3d3",
      night: "#2d1b10",
      card: "#fffdf8",
      cardMuted: "#eedfc9",
      onDark: "#2a1b12",
      onLight: "#2a1b12",
      accent: "#9a4f1c",
      highlight: "#f4b942",
      cta: "#5a2e17",
      ctaText: "#fff6ea",
    },
  },
  {
    id: "rosa",
    label: "Hocico rosado",
    description: "Rosado suave con azul y rojo lengua.",
    theme: {
      bg: "#fff6f4",
      surface: "#fde3e0",
      deep: "#e2f2fb",
      night: "#3a1d25",
      card: "#ffffff",
      cardMuted: "#f5e0dd",
      onDark: "#2a1a1e",
      onLight: "#2a1a1e",
      accent: "#1874b0",
      highlight: "#ffd23f",
      cta: "#c21f3d",
      ctaText: "#ffffff",
    },
  },
];

export const DEFAULT_THEME: SiteTheme = THEME_PRESETS[0].theme;

const HEX = /^#[0-9a-f]{6}$/;

// "#ABC", "abc", "#AABBCC" → "#aabbcc"; cualquier otra cosa → null.
export function normalizeHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase().replace(/^#?/, "#");
  if (/^#[0-9a-f]{3}$/.test(s)) return "#" + [...s.slice(1)].map((c) => c + c).join("");
  return HEX.test(s) ? s : null;
}

// Mezcla lo guardado con los colores por defecto; ignora claves desconocidas o valores que no sean colores.
export function mergeTheme(raw: unknown): SiteTheme {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(THEME_KEYS.map((k) => [k, normalizeHex(r[k]) ?? DEFAULT_THEME[k]])) as SiteTheme;
}

export const sameTheme = (a: SiteTheme, b: SiteTheme) => THEME_KEYS.every((k) => a[k] === b[k]);

export const presetOf = (t: SiteTheme) => THEME_PRESETS.find((p) => sameTheme(p.theme, t));

// Variables CSS de la paleta, con las que se derivan de ella (textos atenuados, sombra de las ventanas). Se declaran
// juntas para que funcionen igual en :root (sitio) que en un contenedor (vista previa del panel).
export function themeVars(t: SiteTheme): Record<string, string> {
  return {
    ...Object.fromEntries(THEME_KEYS.map((k) => [VARS[k], t[k]])),
    "--color-on-dark-muted": "color-mix(in srgb, var(--color-on-dark) 85%, var(--color-bg))",
    "--color-on-light-muted": "color-mix(in srgb, var(--color-on-light) 75%, var(--color-card-muted))",
    "--color-footer": "color-mix(in srgb, var(--color-bg) 72%, #000)",
    "--shadow-pop": "0 30px 60px -24px rgb(0 0 0 / 0.6), 0 0 0 1px var(--color-card-muted)",
  };
}

// Hoja de estilos con la paleta para las páginas públicas. Solo lleva valores ya validados (#rrggbb).
export const themeCss = (t: SiteTheme) =>
  `:root{${Object.entries(themeVars(t))
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;

/* ───────────── Contraste (WCAG 2.1) ───────────── */

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Combinaciones que se leen en el sitio. Texto normal: 4.5:1; títulos grandes y detalles: 3:1.
const CHECKS: { fg: ThemeKey; bg: ThemeKey; min: number; label: string }[] = [
  { fg: "onDark", bg: "bg", min: 4.5, label: "Tinta sobre la leche" },
  { fg: "onDark", bg: "surface", min: 4.5, label: "Tinta sobre la crema" },
  { fg: "onDark", bg: "deep", min: 4.5, label: "Tinta sobre el cielo claro" },
  { fg: "card", bg: "night", min: 4.5, label: "Texto sobre el café" },
  { fg: "onLight", bg: "card", min: 4.5, label: "Texto sobre las tarjetas" },
  { fg: "onLight", bg: "cardMuted", min: 4.5, label: "Texto sobre la tarjeta secundaria" },
  { fg: "onLight", bg: "highlight", min: 4.5, label: "Etiquetas amarillas" },
  { fg: "ctaText", bg: "cta", min: 4.5, label: "Texto del botón principal" },
  { fg: "accent", bg: "bg", min: 3, label: "Azul sobre la leche" },
  { fg: "accent", bg: "surface", min: 3, label: "Azul sobre la crema" },
  { fg: "highlight", bg: "night", min: 3, label: "Amarillo sobre el café" },
];

export type ThemeIssue = { fg: ThemeKey; bg: ThemeKey; label: string; ratio: number; min: number };

export const themeIssues = (t: SiteTheme): ThemeIssue[] => CHECKS.map((c) => ({ ...c, ratio: contrast(t[c.fg], t[c.bg]) })).filter((c) => c.ratio < c.min);
