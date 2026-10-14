// Colores del sitio, editables desde el panel (Contenido del sitio → Colores). Lo usan servidor y navegador.
// Cada clave reemplaza una variable de la paleta de app/globals.css. El panel usa la misma paleta: su zona de trabajo
// (fondo claro, textos, líneas, foco y gráficos) se deriva de ella en panelVars().
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
    theme: { bg: "#fff8eb", surface: "#fcebcb", deep: "#d9f0fb", night: "#3b2416", card: "#fffdf8", cardMuted: "#f3e6d2", onDark: "#241a14", onLight: "#241a14", accent: "#157ab8", highlight: "#ffd23f", cta: "#d2283f", ctaText: "#ffffff" },
  },
  {
    id: "cafe",
    label: "Café de la casa",
    description: "Crema, caramelo y café tostado.",
    theme: { bg: "#fbf4ea", surface: "#f2e1c8", deep: "#efe3d3", night: "#2d1b10", card: "#fffdf8", cardMuted: "#eedfc9", onDark: "#2a1b12", onLight: "#2a1b12", accent: "#9a4f1c", highlight: "#f4b942", cta: "#5a2e17", ctaText: "#fff6ea" },
  },
  {
    id: "rosa",
    label: "Hocico rosado",
    description: "Rosado suave con azul y rojo lengua.",
    theme: { bg: "#fff6f4", surface: "#fde3e0", deep: "#e2f2fb", night: "#3a1d25", card: "#ffffff", cardMuted: "#f5e0dd", onDark: "#2a1a1e", onLight: "#2a1a1e", accent: "#1874b0", highlight: "#ffd23f", cta: "#c21f3d", ctaText: "#ffffff" },
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

export function contrast(a: string, b: string) {
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

export const themeIssues = (t: SiteTheme): ThemeIssue[] =>
  CHECKS.map((c) => ({ ...c, ratio: contrast(t[c.fg], t[c.bg]) })).filter((c) => c.ratio < c.min);

/* ───────────── Panel de administración ───────────── */

const WHITE = "#ffffff";
const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hexOf = (c: number[]) => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
// t = 0 → a; t = 1 → b.
const mix = (a: string, b: string, t: number) => hexOf(rgbOf(a).map((v, i) => v + (rgbOf(b)[i] - v) * t));

// Los colores del panel se calculan en OKLab (luminosidad, croma y matiz perceptuales), a partir del RGB lineal.
const linear = (hex: string) => rgbOf(hex).map((v) => (v <= 10 ? v / 3294.6 : ((v / 255 + 0.055) / 1.055) ** 2.4));

function labOf([r, g, b]: number[]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

// [croma, matiz en radianes]
function chromaOf(hex: string) {
  const [, a, b] = labOf(linear(hex));
  return [Math.hypot(a, b), Math.atan2(b, a)];
}

// null si el color no existe en pantalla (fuera de sRGB).
function fromLch(L: number, C: number, h: number) {
  const [a, b] = [C * Math.cos(h), C * Math.sin(h)];
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  if (rgb.some((v) => v < -0.0005 || v > 1.0005)) return null;
  return hexOf(rgb.map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055) * 255));
}

// El matiz de `color`, con el croma pedido (o el mayor que exista) y la luminosidad que da ese contraste sobre blanco,
// el fondo de las tarjetas del panel.
function tone(color: string, target: number, chroma: number) {
  const h = chromaOf(color)[1];
  const at = (L: number) => {
    for (let c = chroma; c > 0; c -= 0.005) {
      const x = fromLch(L, c, h);
      if (x) return x;
    }
    return fromLch(L, 0, h) ?? WHITE;
  };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const L = (lo + hi) / 2;
    if (contrast(at(L), WHITE) > target) lo = L;
    else hi = L;
  }
  return at(lo);
}

// Daltonismo (protanopía y deuteranopía) simulado sobre RGB lineal: matrices de Machado, Oliveira y Fernandes (2009).
const CVD = [
  [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
];
const deltaE = (a: number[], b: number[]) => Math.hypot(...labOf(a).map((v, i) => v - labOf(b)[i])) * 100;

// Dos series de un gráfico se distinguen: a simple vista (ΔE ≥ 15 en OKLab × 100) y con daltonismo (ΔE ≥ 8).
function apart(x: string, y: string) {
  const [a, b] = [linear(x), linear(y)];
  const seen = (m: number[], c: number[]) => [0, 3, 6].map((i) => Math.min(1, Math.max(0, m[i] * c[0] + m[i + 1] * c[1] + m[i + 2] * c[2])));
  return deltaE(a, b) >= 15 && CVD.every((m) => deltaE(seen(m, a), seen(m, b)) >= 8);
}

// Zona de trabajo del panel a partir de la paleta del sitio: el papel sale de las tarjetas, la tinta del texto sobre
// ellas, y el color de foco y de los gráficos, del fondo. Los contrastes se fijan aquí (texto ≥ 9:1, foco 5:1, gráficos
// ≥ 3:1 sobre blanco y con color suficiente para no verse grises), así que el panel se lee con cualquier paleta, también
// con una personalizada poco afortunada. Con la paleta del diseño da los valores de app/globals.css.
export function panelVars(t: SiteTheme): Record<string, string> {
  const ink = contrast(t.onLight, WHITE) >= 9 ? t.onLight : tone(t.onLight, 11, chromaOf(t.onLight)[0]);
  // Si alguien elige tarjetas oscuras, el panel sigue siendo claro.
  const paper = (c: string) => (luminance(c) >= 0.55 ? c : mix(c, WHITE, 0.88));
  // Color de marca: el fondo del sitio si es oscuro; si es claro (leche) o gris (sin matiz), el acento o el resaltado.
  // Más vivo que el fondo, dentro de un margen: en un gráfico un color apagado se confunde con gris.
  const brands = [...(luminance(t.bg) < 0.3 ? [t.bg] : []), t.accent, t.highlight].filter((c) => chromaOf(c)[0] >= 0.012);
  const brand = brands[0] ?? t.bg;
  const vivid = (c: string) => Math.min(0.15, Math.max(0.11, chromaOf(c)[0] * 2.2));
  // Dos series (abonos y saldos): la marca y el resaltado. Si se parecen, la primera cambia de luminosidad o de matiz
  // (el acento) hasta distinguirse; en último caso, se oscurece del todo.
  const series2 = tone(t.highlight, 3.4, Math.min(0.16, Math.max(0.11, chromaOf(t.highlight)[0])));
  const options = [...brands.flatMap((c) => [tone(c, 5, vivid(c)), tone(c, 7.2, vivid(c))]), tone(brand, 9.5, vivid(brand))];
  return {
    "--color-canvas": mix(paper(t.card), "#f6f6f6", 0.714),
    "--color-line": mix(paper(t.cardMuted), "#e4e4e4", 0.5),
    "--color-line-strong": mix(paper(t.cardMuted), "#939393", 0.3),
    "--color-ink": ink,
    "--color-ink-muted": mix(ink, "#8a8a8a", 0.61),
    "--color-ink-subtle": mix(ink, "#bebebe", 0.69),
    "--color-focus": tone(brand, 5, vivid(brand)),
    "--color-chart": tone(brand, 4.1, vivid(brand)),
    "--color-series-1": options.find((c) => apart(c, series2)) ?? options[options.length - 1],
    "--color-series-2": series2,
  };
}

// Hoja de estilos del panel: la paleta del sitio (barra lateral, botones, etiquetas) y su zona de trabajo.
export const panelCss = (t: SiteTheme) =>
  `:root{${Object.entries({ ...themeVars(t), ...panelVars(t) })
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;
