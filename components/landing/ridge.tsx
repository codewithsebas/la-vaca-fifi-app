import type { CSSProperties } from "react";
import { forest, frailejon, heightAt, hills, ridge, shrubs, type Pt } from "./scenery";

// Cierre de una sección: el paisaje en capas de la imagen de la montaña, en pequeño. Tres hileras de silueta, de la
// lejana (más clara, entre la bruma) a la cercana (exactamente el fondo de la sección siguiente, así el paisaje es el
// borde entre las dos aunque tengan distinto color), con un resplandor detrás y una franja de niebla que se corre. Cada sección tiene su tramo del descenso:
// las cumbres nevadas, el páramo con frailejones, el bosque de pinos, el valle y el monte. Al hacer scroll las capas
// lejanas se desplazan menos que la página (profundidad). Va detrás del contenido, apoyada en el borde inferior; en
// pantallas angostas se recorta por los lados (la ilustración mide 1600 × 240).

export type RidgeKind = "peaks" | "paramo" | "forest" | "valley" | "woods";

const W = 1600;
const H = 240;

type Layer = { d: string; snow?: string };
type Scene = [far: Layer, mid: Layer, near: Layer];

// Casquetes de nieve en las cumbres más altas de una línea de picos: un triángulo con el borde de abajo quebrado.
function snowCaps(points: Pt[], below: number): string {
  let d = "";
  points.forEach(([x, y], i) => {
    const [px, py] = points[i - 1] ?? [x, y];
    const [nx, ny] = points[i + 1] ?? [x, y];
    if (y > below || y > py || y > ny) return;
    const f = 0.32;
    const [lx, ly, rx, ry] = [x + (px - x) * f, y + (py - y) * f, x + (nx - x) * f, y + (ny - y) * f];
    d += `M${lx} ${ly}L${x} ${y}L${rx} ${ry}L${(x + rx) / 2} ${(y + ry) / 2 + 6}L${x} ${y + (ly + ry - 2 * y) / 2 - 4}L${(x + lx) / 2} ${(y + ly) / 2 + 6}Z`;
  });
  return d;
}

function peaks(): Scene {
  const far: Pt[] = [[0, 150], [90, 118], [150, 134], [230, 82], [300, 126], [360, 108], [440, 140], [520, 94], [590, 58], [650, 96], [720, 122], [800, 104], [880, 136], [960, 90], [1030, 66], [1090, 102], [1170, 124], [1250, 96], [1320, 118], [1400, 78], [1470, 116], [1540, 100], [1600, 126]];
  const mid = hills(41, { w: W, base: 182, amp: 38, count: 9 });
  const near = hills(43, { w: W, base: 222, amp: 22, count: 11 });
  return [
    { d: ridge(far, H, true), snow: snowCaps(far, 100) },
    { d: ridge(mid, H) + forest(mid, { from: 20, to: 1580, gap: 70, min: 16, max: 30, seed: 2 }) },
    { d: ridge(near, H) },
  ];
}

function paramo(): Scene {
  const far = hills(51, { w: W, base: 132, amp: 40, count: 7 });
  const mid = hills(53, { w: W, base: 176, amp: 30, count: 8 });
  const near = hills(57, { w: W, base: 216, amp: 20, count: 10 });
  const plants = (pts: Pt[], xs: number[], h: number, sink: number) => xs.map((x, i) => frailejon(x, heightAt(pts, x) + sink, h * (0.75 + ((i * 37) % 10) / 20), i + 3)).join("");
  return [
    { d: ridge(far, H) },
    { d: ridge(mid, H) + plants(mid, [90, 150, 420, 470, 760, 1010, 1060, 1330, 1380, 1520], 46, 3) },
    { d: ridge(near, H) + plants(near, [40, 250, 300, 610, 900, 1180, 1230, 1460], 84, 4) },
  ];
}

function pines(): Scene {
  const far = hills(61, { w: W, base: 150, amp: 34, count: 8 });
  const mid = hills(63, { w: W, base: 190, amp: 26, count: 9 });
  const near = hills(67, { w: W, base: 226, amp: 12, count: 10 });
  return [
    { d: ridge(far, H) + forest(far, { from: 6, to: 1594, gap: 13, min: 18, max: 40, seed: 7, sink: 3 }) },
    { d: ridge(mid, H) + forest(mid, { from: 10, to: 1590, gap: 30, min: 34, max: 70, seed: 9 }) },
    { d: ridge(near, H) + forest(near, { from: 10, to: 260, gap: 50, min: 60, max: 110, seed: 13 }) + forest(near, { from: 1330, to: 1590, gap: 50, min: 60, max: 110, seed: 19 }) },
  ];
}

function valley(): Scene {
  const far: Pt[] = [[0, 130], [160, 112], [320, 126], [480, 104], [620, 90], [720, 60], [780, 46], [830, 50], [880, 68], [990, 98], [1120, 110], [1280, 96], [1440, 118], [1600, 104]];
  const slopes: Pt[] = [[0, 96], [200, 120], [400, 150], [600, 182], [760, 200], [900, 194], [1080, 166], [1280, 132], [1450, 106], [1600, 96]];
  const near = hills(71, { w: W, base: 226, amp: 14, count: 10 });
  return [
    { d: ridge(far, H), snow: snowCaps(far, 70) },
    { d: ridge(slopes, H) + forest(slopes, { from: 6, to: 700, gap: 16, min: 18, max: 36, seed: 23 }) + forest(slopes, { from: 940, to: 1594, gap: 16, min: 18, max: 36, seed: 29 }) },
    { d: ridge(near, H) },
  ];
}

function woods(): Scene {
  const far = hills(81, { w: W, base: 150, amp: 30, count: 8 });
  const mid = hills(83, { w: W, base: 196, amp: 22, count: 10 });
  return [
    { d: ridge(far, H) + forest(far, { from: 6, to: 1594, gap: 18, min: 26, max: 56, seed: 31, sink: 3 }) },
    { d: ridge(mid, H) + forest(mid, { from: 30, to: 1570, gap: 120, min: 50, max: 90, seed: 37 }) },
    { d: shrubs(43, { from: 0, to: W, base: 222, h: 18, bottom: H }) },
  ];
}

const SCENES: Record<RidgeKind, Scene> = { peaks: peaks(), paramo: paramo(), forest: pines(), valley: valley(), woods: woods() };

// Colores de las capas: de la lejana (más acento sobre el fondo de la sección, --r-base) a la cercana (el fondo de la
// sección siguiente, --r-next).
const TONES = ["fill-[color-mix(in_srgb,var(--color-accent)_30%,var(--r-base))]", "fill-[color-mix(in_srgb,var(--color-accent)_16%,var(--r-base))]", "fill-(--r-next)"];
// Cuánto se desplaza cada capa con el scroll (las lejanas, más: así suben más lento que la página).
const DEPTH = [18, 8, 0];

function Svg({ layer, tone }: { layer: Layer; tone: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="absolute inset-0 size-full">
      <path d={layer.d} className={tone} />
      {layer.snow && <path d={layer.snow} className="fill-[color-mix(in_srgb,var(--color-card)_42%,var(--r-base))]" />}
    </svg>
  );
}

type RidgeProps = {
  kind: RidgeKind;
  base?: string; // fondo de la sección (color CSS)
  next?: string; // fondo de la sección siguiente
  glow?: "left" | "center" | "right";
  className?: string;
};

export function Ridge({ kind, base = "var(--color-bg)", next = base, glow = "center", className = "" }: RidgeProps) {
  const at = { left: "26%", center: "50%", right: "74%" }[glow];
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 -bottom-1 -z-1 h-[clamp(130px,17vw,300px)] overflow-hidden ${className}`}
      style={{ "--r-base": base, "--r-next": next } as CSSProperties}
    >
      {/* Resplandor del cielo detrás de las montañas */}
      <div className="absolute inset-0" style={{ background: `radial-gradient(46% 80% at ${at} 78%, color-mix(in srgb, var(--color-accent) 20%, transparent), transparent 72%)` }} />
      {SCENES[kind].map((layer, i) => (
        // Cada capa sobra por abajo lo mismo que su recorrido con el scroll (y un poco más, por el redondeo), para no
        // dejar ver la de atrás bajo su borde.
        <div key={i} className={`absolute inset-x-0 top-0 ${DEPTH[i] ? "parallax-on-scroll" : ""}`} style={{ bottom: -DEPTH[i] - 3, "--parallax": `${DEPTH[i]}px` } as CSSProperties}>
          <Svg layer={layer} tone={TONES[i]} />
          {/* Niebla entre la capa lejana y la del medio */}
          {i === 0 && (
            <div className="absolute -inset-x-[10%] top-[38%] h-[46%] bg-[linear-gradient(to_bottom,transparent,color-mix(in_srgb,var(--color-card)_9%,transparent)_55%,transparent)] motion-safe:animate-fog-drift" />
          )}
        </div>
      ))}
    </div>
  );
}
