// Colores del sitio, editables desde el panel (Contenido del sitio → Colores). Lo usan servidor y navegador.
// Cada clave reemplaza una variable de la paleta de app/globals.css. El panel usa la misma paleta: su zona de trabajo
// (fondo claro, textos, líneas, foco y gráficos) se deriva de ella en panelVars().

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
      { key: "bg", label: "Fondo principal", hint: "Fondo de todo el sitio y del menú." },
      { key: "surface", label: "Bloques", hint: "Portada, tarjetas oscuras y botones secundarios." },
      { key: "deep", label: "Fondo profundo", hint: "Sección «La finca» y cielo alto de la portada." },
      { key: "night", label: "Franja final", hint: "Última franja del pie de página." },
    ],
  },
  {
    label: "Tarjetas claras",
    fields: [
      { key: "card", label: "Tarjeta", hint: "Cabañas, formulario de reserva y botones claros." },
      { key: "cardMuted", label: "Tarjeta secundaria", hint: "Etiquetas, bordes de los campos y zonas suaves." },
    ],
  },
  {
    label: "Textos",
    fields: [
      { key: "onDark", label: "Texto sobre fondos oscuros", hint: "Títulos y párrafos sobre los fondos." },
      { key: "onLight", label: "Texto sobre tarjetas", hint: "Títulos y párrafos sobre las tarjetas claras." },
    ],
  },
  {
    label: "Acentos",
    fields: [
      { key: "accent", label: "Acento", hint: "Segunda línea de los títulos, ilustraciones y detalles." },
      { key: "highlight", label: "Resaltado", hint: "Etiquetas destacadas, marcas y contorno del foco." },
    ],
  },
  {
    label: "Botón principal",
    fields: [
      { key: "cta", label: "Botón", hint: "«Reservar», «Consultar» y las demás acciones principales." },
      { key: "ctaText", label: "Texto del botón", hint: "Letra de los botones principales." },
    ],
  },
];

export const themeField = (k: ThemeKey) => THEME_GROUPS.flatMap((g) => g.fields).find((f) => f.key === k)!;

// Paletas listas para usar (contraste de textos ≥ 4.5:1 y de acentos ≥ 3:1). La primera es la del diseño.
export const THEME_PRESETS: { id: string; label: string; description: string; theme: SiteTheme }[] = [
  {
    // Del letrero de la entrada: el verde oscuro de sus franjas, el dorado de las letras, el coral de sus flores y el
    // terracota del fondo en los botones.
    id: "letrero",
    label: "Letrero",
    description: "Verde de finca, dorado de las letras y terracota del letrero. La paleta original.",
    theme: { bg: "#22301c", surface: "#2c3d25", deep: "#1a2516", night: "#0a0f08", card: "#f6ead2", cardMuted: "#e9d8b4", onDark: "#f6ead2", onLight: "#22301c", accent: "#e3a64f", highlight: "#ef8a6a", cta: "#8a3518", ctaText: "#f6ead2" },
  },
  {
    // El letrero al revés: fondos del terracota, botones del verde y resaltado del verde claro de las hojas.
    id: "terracota",
    label: "Letrero terracota",
    description: "Terracota del letrero con dorado y verde de hojas.",
    theme: { bg: "#5c2410", surface: "#6d2e16", deep: "#4a1c0b", night: "#1e0b04", card: "#f6ead2", cardMuted: "#e9d8b4", onDark: "#f6ead2", onLight: "#3a1708", accent: "#e8b25e", highlight: "#9fc27a", cta: "#22301c", ctaText: "#f6ead2" },
  },
  {
    id: "bosque",
    label: "Bosque",
    description: "Verde de montaña, crema y dorado.",
    theme: { bg: "#163a2a", surface: "#1d4633", deep: "#11301f", night: "#07140d", card: "#f2ebd3", cardMuted: "#e6dcbe", onDark: "#f2ebd3", onLight: "#163a2a", accent: "#7fae84", highlight: "#d9a441", cta: "#163a2a", ctaText: "#f2ebd3" },
  },
  {
    id: "nevado",
    label: "Nevado",
    description: "Azul glaciar con blanco hielo.",
    theme: { bg: "#1b3445", surface: "#24445a", deep: "#152a38", night: "#08121a", card: "#eef2f3", cardMuted: "#dbe4e8", onDark: "#eef2f3", onLight: "#1b3445", accent: "#8fb8cf", highlight: "#e0b04a", cta: "#1b3445", ctaText: "#eef2f3" },
  },
  {
    id: "paramo",
    label: "Páramo",
    description: "Verde oliva de frailejón y amarillo de flor.",
    theme: { bg: "#2f3a2a", surface: "#3a4734", deep: "#262f22", night: "#0f130d", card: "#f1eedf", cardMuted: "#e2dcc6", onDark: "#f1eedf", onLight: "#2f3a2a", accent: "#b5c27a", highlight: "#e3b23c", cta: "#2f3a2a", ctaText: "#f1eedf" },
  },
  {
    id: "cafe",
    label: "Café de montaña",
    description: "Madera, arena y naranja de fogata.",
    theme: { bg: "#3b2a20", surface: "#4a3528", deep: "#2f2119", night: "#140d09", card: "#f4ead8", cardMuted: "#e8d9bf", onDark: "#f4ead8", onLight: "#3b2a20", accent: "#c9a27a", highlight: "#d98c3f", cta: "#3b2a20", ctaText: "#f4ead8" },
  },
  {
    id: "cascada",
    label: "Cascada",
    description: "Verde azulado de agua de montaña con blanco de espuma.",
    theme: { bg: "#0f3d3e", surface: "#165052", deep: "#0a2f30", night: "#041516", card: "#ecf4f0", cardMuted: "#d6e6df", onDark: "#ecf4f0", onLight: "#0f3d3e", accent: "#7cc4bd", highlight: "#e7b74c", cta: "#0f3d3e", ctaText: "#ecf4f0" },
  },
  {
    id: "niebla",
    label: "Niebla",
    description: "Gris pizarra, sobrio, con blanco de neblina.",
    theme: { bg: "#2c3b40", surface: "#384b51", deep: "#212d31", night: "#0d1214", card: "#f0f3f1", cardMuted: "#dde4e0", onDark: "#f0f3f1", onLight: "#2c3b40", accent: "#a5c4c0", highlight: "#dcb45c", cta: "#2c3b40", ctaText: "#f0f3f1" },
  },
  {
    id: "orquidea",
    label: "Orquídea",
    description: "Morado profundo con lila, como la flor.",
    theme: { bg: "#33204a", surface: "#42295f", deep: "#27173a", night: "#100917", card: "#f4eef6", cardMuted: "#e4d9ea", onDark: "#f4eef6", onLight: "#33204a", accent: "#c6a5e3", highlight: "#e9b85a", cta: "#33204a", ctaText: "#f4eef6" },
  },
  {
    id: "atardecer",
    label: "Atardecer",
    description: "Vino tinto, durazno y dorado del sol que cae.",
    theme: { bg: "#4a1d2b", surface: "#5d2838", deep: "#3a1520", night: "#17080d", card: "#f7eadf", cardMuted: "#ecd8c8", onDark: "#f7eadf", onLight: "#4a1d2b", accent: "#e9a48c", highlight: "#f0b64e", cta: "#4a1d2b", ctaText: "#f7eadf" },
  },
  {
    id: "arcilla",
    label: "Arcilla",
    description: "Terracota, arena y ocre de los caminos.",
    theme: { bg: "#6b2f1d", surface: "#7d3a25", deep: "#552415", night: "#220d07", card: "#f6ebdc", cardMuted: "#ead9c2", onDark: "#f6ebdc", onLight: "#6b2f1d", accent: "#e6b48a", highlight: "#f0bd4f", cta: "#6b2f1d", ctaText: "#f6ebdc" },
  },
  {
    id: "volcan",
    label: "Volcán",
    description: "Roca oscura, ceniza y naranja de lava.",
    theme: { bg: "#2b2a2c", surface: "#39373a", deep: "#201f21", night: "#0c0b0c", card: "#f2ede6", cardMuted: "#e2d9cc", onDark: "#f2ede6", onLight: "#2b2a2c", accent: "#d9a88a", highlight: "#ee7b3c", cta: "#2b2a2c", ctaText: "#f2ede6" },
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
  { fg: "onDark", bg: "bg", min: 4.5, label: "Texto sobre el fondo principal" },
  { fg: "onDark", bg: "surface", min: 4.5, label: "Texto sobre los bloques" },
  { fg: "onDark", bg: "deep", min: 4.5, label: "Texto sobre el fondo profundo" },
  { fg: "onDark", bg: "night", min: 4.5, label: "Texto de la franja final" },
  { fg: "onLight", bg: "card", min: 4.5, label: "Texto sobre las tarjetas" },
  { fg: "onLight", bg: "cardMuted", min: 4.5, label: "Texto sobre la tarjeta secundaria" },
  { fg: "onLight", bg: "highlight", min: 4.5, label: "Etiquetas resaltadas" },
  { fg: "ctaText", bg: "cta", min: 4.5, label: "Texto del botón principal" },
  { fg: "accent", bg: "bg", min: 3, label: "Acento sobre el fondo principal" },
  { fg: "accent", bg: "surface", min: 3, label: "Títulos con acento en la portada" },
  { fg: "highlight", bg: "bg", min: 3, label: "Resaltado sobre el fondo principal" },
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
  // Color de marca: el fondo del sitio; si es gris (sin matiz), el acento o el resaltado. Más vivo que el fondo, dentro
  // de un margen: en un gráfico un color apagado se confunde con gris.
  const brands = [t.bg, t.accent, t.highlight].filter((c) => chromaOf(c)[0] >= 0.012);
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
