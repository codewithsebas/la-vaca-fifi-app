// Colores del panel, editables desde Configuración → Colores. Lo usan servidor y navegador. Se guardan con los del sitio
// (site_settings.theme.panel) y solo se escriben los que difieren del diseño: con la paleta original, app/globals.css
// sigue mandando tal cual, también en modo oscuro.
import { contrast, normalizeHex } from "@/lib/theme";

export type PanelColorKey = "ink" | "sidebar" | "paper" | "canvas" | "panel" | "line" | "pink" | "yellow" | "green" | "blue" | "red";
export type PanelColors = Record<PanelColorKey, string>; // "#rrggbb"

export const DEFAULT_PANEL_COLORS: PanelColors = {
  ink: "#171614",
  sidebar: "#171614",
  paper: "#fffdf9",
  canvas: "#f7f2e8",
  panel: "#efe9dd",
  line: "#e2dacb",
  pink: "#f4b8d6",
  yellow: "#f5d462",
  green: "#a8b874",
  blue: "#b6c8ef",
  red: "#9b2c1a",
};

export const PANEL_COLOR_KEYS = Object.keys(DEFAULT_PANEL_COLORS) as PanelColorKey[];

export const PANEL_COLOR_GROUPS: { label: string; note?: string; fields: { key: PanelColorKey; label: string; hint: string }[] }[] = [
  {
    label: "Negros",
    fields: [
      { key: "ink", label: "Negro principal", hint: "Textos, botones principales, bordes de las reservas y día de hoy." },
      { key: "sidebar", label: "Menú lateral", hint: "Fondo del menú. Su texto es blanco: conviene un color oscuro." },
    ],
  },
  {
    label: "Fondos",
    note: "El modo oscuro conserva sus propios fondos.",
    fields: [
      { key: "canvas", label: "Fondo", hint: "Fondo general de las páginas del panel." },
      { key: "panel", label: "Tarjetas", hint: "Tarjetas, tablas y calendario." },
      { key: "paper", label: "Papel", hint: "Campos, ventanas y el texto de los botones principales." },
      { key: "line", label: "Líneas", hint: "Bordes y separadores." },
    ],
  },
  {
    label: "Estados y acentos",
    fields: [
      { key: "green", label: "Verde", hint: "Reservas confirmadas y avisos de éxito." },
      { key: "yellow", label: "Amarillo", hint: "Reservas sin pagar y advertencias." },
      { key: "blue", label: "Azul", hint: "Reservas reprogramadas y avisos informativos." },
      { key: "pink", label: "Rosado", hint: "Reservas en estadía, acento del menú e indicadores." },
      { key: "red", label: "Rojo", hint: "Errores y acciones peligrosas." },
    ],
  },
];

// Paletas listas (contraste comprobado en panel-colors.test.ts). La primera es la del diseño.
export const PANEL_PRESETS: { id: string; label: string; description: string; colors: PanelColors }[] = [
  { id: "original", label: "Original", description: "Crema y negro, con los pasteles de siempre.", colors: DEFAULT_PANEL_COLORS },
  {
    // De las fotos de las cabañas: el azul cobalto de los pilares en el menú, las paredes crema de fondo y, en los estados,
    // el verde, el amarillo y el naranja de las fachadas. Los acentos van un poco más claros para que el texto se lea encima.
    id: "cabanas",
    label: "La vaca fifí",
    description: "Azul cobalto, paredes crema y los colores de las fachadas.",
    colors: {
      ink: "#10244a",
      sidebar: "#123f9c",
      paper: "#fffdf2",
      canvas: "#f8f4dd",
      panel: "#f0e9c9",
      line: "#dfd6ad",
      pink: "#f58e68",
      yellow: "#f7cf1f",
      green: "#5cc46f",
      blue: "#74a9f4",
      red: "#c41e2a",
    },
  },
  {
    id: "azul",
    label: "Azul noche",
    description: "Azul marino en lugar de negro, sobre un fondo frío.",
    colors: {
      ink: "#12233f",
      sidebar: "#12233f",
      paper: "#fdfeff",
      canvas: "#f2f6fb",
      panel: "#e4ecf5",
      line: "#d3dde9",
      pink: "#f2bcd0",
      yellow: "#f5d462",
      green: "#a9c59a",
      blue: "#a9c6f2",
      red: "#a82a2a",
    },
  },
  {
    id: "verde",
    label: "Verde finca",
    description: "Verde muy oscuro y fondos de hoja clara.",
    colors: {
      ink: "#16261c",
      sidebar: "#1b3325",
      paper: "#fdfefb",
      canvas: "#f3f6ee",
      panel: "#e6ecdd",
      line: "#d6dec9",
      pink: "#eebfb3",
      yellow: "#efd26a",
      green: "#a3c07f",
      blue: "#aac9d9",
      red: "#9b2c1a",
    },
  },
  {
    id: "grafito",
    label: "Grafito",
    description: "Grises neutros, sin tonos crema.",
    colors: {
      ink: "#1c1f24",
      sidebar: "#24272d",
      paper: "#ffffff",
      canvas: "#f4f4f5",
      panel: "#e8e8ea",
      line: "#d9d9dd",
      pink: "#e9b9d2",
      yellow: "#f0d264",
      green: "#afc08a",
      blue: "#b3c4e6",
      red: "#a32a1d",
    },
  },
];

// Mezcla lo guardado con los colores por defecto; ignora claves desconocidas o valores que no sean colores.
export function mergePanelColors(raw: unknown): PanelColors {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(PANEL_COLOR_KEYS.map((k) => [k, normalizeHex(r[k]) ?? DEFAULT_PANEL_COLORS[k]])) as PanelColors;
}

export const samePanelColors = (a: PanelColors, b: PanelColors) => PANEL_COLOR_KEYS.every((k) => a[k] === b[k]);

const mix = (color: string, pct: number, other: string) => `color-mix(in srgb, ${color} ${pct}%, ${other})`;
const DARK_CANVAS = "#121110"; // fondo del modo oscuro (app/globals.css)

// Texto legible sobre el «soft» de cada acento, derivado de él; en oscuro, el mismo acento aclarado.
const TEXT_OF: Partial<Record<PanelColorKey, string>> = { yellow: "warning", green: "success", blue: "info" };

// Hoja con los colores que difieren del diseño. Un solo valor por papel: el resto (tonos suaves y profundos, modo oscuro)
// se deriva de él. No lleva capa: gana a las de app/globals.css. Solo lleva valores ya validados (#rrggbb).
export function panelColorsCss(c: PanelColors) {
  const light: string[] = [];
  const dark: string[] = [];
  const changed = (k: PanelColorKey) => c[k] !== DEFAULT_PANEL_COLORS[k];

  if (changed("ink")) {
    for (const v of ["ink", "focus", "chart", "series-1"]) light.push(`--color-${v}:${c.ink}`);
    light.push(`--color-ink-muted:${mix(c.ink, 66, "var(--color-canvas)")}`, `--color-ink-subtle:${mix(c.ink, 52, "var(--color-canvas)")}`);
  }
  if (changed("sidebar")) {
    light.push(`--color-sidebar:${c.sidebar}`);
    dark.push(`--color-sidebar:${c.sidebar}`);
  }
  for (const k of ["canvas", "panel", "paper"] as const) if (changed(k)) light.push(`--color-${k}:${c[k]}`);
  if (changed("line")) light.push(`--color-line:${c.line}`, `--color-line-strong:${mix(c.line, 88, "#000")}`);

  for (const k of ["pink", "yellow", "green", "blue"] as const) {
    if (!changed(k)) continue;
    light.push(`--color-${k}:${c[k]}`, `--color-${k}-soft:${mix(c[k], 55, "#fff")}`, `--color-${k}-deep:${mix(c[k], 86, "#000")}`);
    dark.push(`--color-${k}:${mix(c[k], 48, "#000")}`, `--color-${k}-soft:${mix(c[k], 20, DARK_CANVAS)}`, `--color-${k}-deep:${mix(c[k], 68, "#000")}`);
    const text = TEXT_OF[k];
    if (text) {
      light.push(`--color-${text}:${mix(c[k], 38, "#000")}`, `--color-${text}-soft:${mix(c[k], 55, "#fff")}`);
      dark.push(`--color-${text}:${mix(c[k], 70, "#fff")}`, `--color-${text}-soft:${mix(c[k], 20, DARK_CANVAS)}`);
    }
  }
  if (changed("pink")) {
    light.push(`--color-series-2:${mix(c.pink, 60, "#000")}`);
    dark.push(`--color-series-2:${c.pink}`);
  }
  if (changed("red")) {
    light.push(`--color-error:${c.red}`, `--color-error-soft:${mix(c.red, 20, "#fff")}`);
    dark.push(`--color-error:${mix(c.red, 55, "#fff")}`, `--color-error-soft:${mix(c.red, 28, DARK_CANVAS)}`);
  }

  return [
    light.length ? `:root:not([data-admin-theme="dark"]){${light.join(";")}}` : "",
    dark.length ? `:root[data-admin-theme="dark"]{${dark.join(";")}}` : "",
  ].join("");
}

// Combinaciones que se leen en el panel (modo claro). Texto: 4.5:1. Se advierte, no se bloquea.
const CHECKS: { fg: PanelColorKey | "white"; bg: PanelColorKey; label: string }[] = [
  { fg: "ink", bg: "canvas", label: "Texto sobre el fondo" },
  { fg: "ink", bg: "panel", label: "Texto sobre las tarjetas" },
  { fg: "ink", bg: "paper", label: "Texto sobre el papel" },
  { fg: "paper", bg: "ink", label: "Texto de los botones principales" },
  { fg: "white", bg: "sidebar", label: "Texto del menú lateral" },
  { fg: "ink", bg: "green", label: "Texto sobre el verde" },
  { fg: "ink", bg: "yellow", label: "Texto sobre el amarillo" },
  { fg: "ink", bg: "blue", label: "Texto sobre el azul" },
  { fg: "ink", bg: "pink", label: "Texto sobre el rosado" },
  { fg: "red", bg: "canvas", label: "Rojo sobre el fondo" },
];

export type PanelColorIssue = { label: string; ratio: number; fg: string; bg: string };

export const panelColorIssues = (c: PanelColors): PanelColorIssue[] =>
  CHECKS.map((x) => {
    const fg = x.fg === "white" ? "#ffffff" : c[x.fg];
    return { label: x.label, fg, bg: c[x.bg], ratio: contrast(fg, c[x.bg]) };
  }).filter((x) => x.ratio < 4.5);
