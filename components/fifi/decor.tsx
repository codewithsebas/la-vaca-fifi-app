import type { CSSProperties, ReactNode } from "react";

// Recursos gráficos de la identidad de Fifí, sacados de su letrero: la lengua que se relame (subrayado), los granos de
// la taza (viñetas), las flores del borde (guirnalda), el arete amarillo (etiquetas), las manchas de Holstein (bandas) y
// el pin de «¡Aquí es!». Contorno oscuro y colores planos, como la caricatura. Todos son decorativos.

const r1 = (n: number) => Math.round(n * 10) / 10;

// Números pseudoaleatorios repetibles: el servidor y el navegador dibujan lo mismo.
const random = (seed: number) => {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280), s / 233280);
};

// Mancha de vaca: un contorno cerrado y blando que pasa por `n` puntos alrededor de (cx, cy).
function spot(cx: number, cy: number, r: number, seed: number, n = 7): string {
  const rnd = random(seed);
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
    const rr = r * (0.68 + rnd() * 0.5);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.82] as const;
  });
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]];
    d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return `${d}Z`;
}

/* ───────────── La lengua: subrayado de las palabras que se antojan ───────────── */

export function Lick({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`relative inline-block whitespace-nowrap ${className}`}>
      <span className="relative z-1">{children}</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 300 40"
        preserveAspectRatio="none"
        className="absolute -bottom-[.16em] left-[-3%] z-0 h-[.44em] w-[106%] overflow-visible"
      >
        <path
          d="M6 20C40 6 92 28 142 18C192 8 244 24 294 12C300 20 294 32 280 32C232 34 190 27 142 33C92 39 40 35 12 32C3 30 1 25 6 20Z"
          className="fill-cta"
        />
        <path
          d="M30 20C64 12 100 24 140 18"
          fill="none"
          strokeWidth={4}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-[color-mix(in_srgb,var(--color-cta)_45%,white)]"
        />
      </svg>
    </span>
  );
}

/* ───────────── Grano de café ───────────── */

// light: sobre fondos oscuros (el café del restaurante), con el grano más claro y el contorno del color de las tarjetas.
export function Bean({ size = 16, light = false, className = "" }: { size?: number; light?: boolean; className?: string }) {
  const line = light ? "var(--color-card)" : "var(--color-on-dark)";
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className={`flex-none ${className}`}>
      <g transform="rotate(-30 12 12)">
        <ellipse cx={12} cy={12} rx={8} ry={10.5} fill={light ? "#c98a4b" : "#8a4b22"} stroke={line} strokeWidth={2} />
        <path d="M12 2.5C8.5 8 15.5 15 12 21.5" fill="none" stroke={line} strokeWidth={2} strokeLinecap="round" />
      </g>
    </svg>
  );
}

/* ───────────── La tabla de madera del letrero ───────────── */

// Tabla de madera con vetas y contorno de tinta, ladeada, como la del letrero del restaurante. El texto va encima.
export function WoodBoard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`relative inline-flex -rotate-2 items-center justify-center px-[1.1em] py-[.45em] ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 400 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <path
          d="M10 8C110 2 290 4 392 10C398 40 398 62 390 92C290 98 110 98 8 92C2 62 2 38 10 8Z"
          fill="#e39b54"
          stroke="var(--color-on-dark)"
          strokeWidth={4}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        <path
          d="M24 30C90 24 150 36 210 30S330 22 378 30M30 56C120 50 200 62 280 54S350 50 372 58M40 78C100 74 170 82 240 78"
          fill="none"
          stroke="#b86e2c"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        />
        <circle cx={18} cy={50} r={3.5} fill="#7a4a22" />
        <circle cx={382} cy={50} r={3.5} fill="#7a4a22" />
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}

/* ───────────── Flores del borde del letrero ───────────── */

const PETALS = ["#ff6fae", "#3d6fe0", "#ffc83d", "#ff8a2b", "#e8344a", "#9b5de5", "#ffffff"];
const CENTERS: Record<string, string> = {
  "#ff6fae": "#ffd23f",
  "#3d6fe0": "#ffffff",
  "#ffc83d": "#e8344a",
  "#ff8a2b": "#ffd23f",
  "#e8344a": "#ffd23f",
  "#9b5de5": "#ffd23f",
  "#ffffff": "#ff8a2b",
};

// Una flor de cinco pétalos centrada en (x, y).
function FlowerShape({ x, y, r, color, turn = 0 }: { x: number; y: number; r: number; color: string; turn?: number }) {
  return (
    <g transform={`translate(${r1(x)} ${r1(y)}) rotate(${r1(turn)})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx={0} cy={-r * 0.55} rx={r * 0.42} ry={r * 0.55} transform={`rotate(${a})`} fill={color} />
      ))}
      <circle r={r * 0.32} fill={CENTERS[color] ?? "#ffd23f"} />
    </g>
  );
}

// Cantero de flores (como el borde de abajo del letrero): una franja de pasto, hojas en dos verdes y dos filas de
// flores con tallo (atrás más pequeñas, adelante más grandes), todo con contorno de tinta para que se lea sobre una
// foto. Llena su contenedor apoyado abajo. side="left": un tramo más corto que termina a la derecha en una lomita de
// pasto (sin corte seco), para la esquina inferior izquierda de la portada.
const LEAF = ["#3f9a3a", "#2f7d2e"];

function garden(w: number, seed: number, taper = false) {
  const rnd = random(seed);
  const leaves: { d: string; fill: string }[] = [];
  const stems: string[] = [];
  const flowers: { x: number; y: number; r: number; color: string; turn: number }[] = [];
  let last = "";
  const pick = () => {
    let c = PETALS[Math.floor(rnd() * PETALS.length)];
    if (c === last) c = PETALS[(PETALS.indexOf(c) + 3) % PETALS.length];
    return (last = c);
  };
  // Con taper, todo termina antes del borde derecho y las hojas del final son más bajitas.
  const end = taper ? w - 26 : w + 20;
  for (let x = -14; x < end; x += 16 + rnd() * 14) {
    const h = (34 + rnd() * 44) * (taper ? Math.min(1, 0.45 + (w - x) / 160) : 1);
    const lean = (rnd() - 0.5) * 34;
    leaves.push({
      d: `M${r1(x)} 132C${r1(x - 12 + lean)} ${r1(132 - h * 0.5)} ${r1(x + lean)} ${r1(132 - h)} ${r1(x + lean * 0.6)} ${r1(132 - h)}C${r1(x + 12 + lean)} ${r1(132 - h * 0.6)} ${r1(x + 9)} 120 ${r1(x + 4)} 132Z`,
      fill: LEAF[Math.floor(rnd() * 2)],
    });
  }
  // Tres filas intercaladas (atrás, al medio y adelante).
  for (const [start, gap, yMin, yRange, rMin, rRange] of [
    [6, 40, 30, 20, 9, 4],
    [24, 46, 50, 18, 11, 5],
    [-4, 48, 70, 24, 14, 6],
  ]) {
    for (let x = start; x < (taper ? w - 60 + start / 2 : w + 20); x += gap + rnd() * 14) {
      const f = { x: x + rnd() * 10, y: yMin + rnd() * yRange, r: rMin + rnd() * rRange, color: pick(), turn: rnd() * 72 };
      stems.push(`M${r1(f.x)} ${r1(f.y)}Q${r1(f.x + (rnd() - 0.5) * 16)} ${r1((f.y + 130) / 2)} ${r1(f.x + (rnd() - 0.5) * 8)} 132`);
      flowers.push(f);
    }
  }
  // Pasto ondulado; con taper baja al final hasta el borde de abajo en una lomita.
  const grassEnd = taper ? w - 40 : w;
  let grass = "M0 118";
  for (let x = 0, i = 0; x < grassEnd; i++) {
    x = Math.min(grassEnd, x + 70 + rnd() * 30);
    grass += `S${r1(x - 30)} ${i % 2 ? 110 : 122} ${r1(x)} ${r1(113 + rnd() * 6)}`;
  }
  if (taper) grass += `C${w - 20} 116 ${w - 8} 122 ${w} 131`;
  return { w, leaves, stems: stems.join(""), flowers: flowers.sort((a, b) => a.y - b.y), grass: `${grass}V131H0Z` };
}

const GARDENS = { full: garden(1200, 17), left: garden(600, 23, true) };

export function FlowerBorder({ side = "full", className = "" }: { side?: keyof typeof GARDENS; className?: string }) {
  const g = GARDENS[side];
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${g.w} 130`}
      preserveAspectRatio={side === "full" ? "xMidYMax slice" : "xMinYMax meet"}
      className={`block ${className}`}
    >
      <path d={g.stems} fill="none" stroke="#2f7d2e" strokeWidth={3.5} strokeLinecap="round" />
      <g stroke="var(--color-on-dark)" strokeWidth={2} strokeLinejoin="round">
        {g.leaves.map((l, i) => (
          <path key={i} d={l.d} fill={l.fill} />
        ))}
        {g.flowers.map((f, i) => (
          <FlowerShape key={i} {...f} />
        ))}
      </g>
      {/* Franja de pasto donde se apoya el cantero. */}
      <path d={g.grass} fill="#3f9a3a" stroke="var(--color-on-dark)" strokeWidth={2.5} strokeLinejoin="round" />
    </svg>
  );
}

// Flor suelta, como una calcomanía (con contorno), para acompañar títulos y fotos.
export function Flower({ color = "#ff6fae", size = 34, className = "", style }: { color?: string; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="-20 -20 40 40" className={`flex-none overflow-visible ${className}`} style={style}>
      <g stroke="var(--color-on-dark)" strokeWidth={2.2}>
        <FlowerShape x={0} y={0} r={16} color={color} />
      </g>
    </svg>
  );
}

/* ───────────── El arete: etiqueta amarilla con su agujero ───────────── */

// Etiqueta en forma de arete de ganado: punta a la izquierda con el agujero y cuerpo redondeado a la derecha.
// tone: "tag" (amarillo del arete), "card" (claro) o "accent" (azul, con texto claro).
export function Tag({ children, tone = "tag", className = "" }: { children: ReactNode; tone?: "tag" | "card" | "accent"; className?: string }) {
  const fill = tone === "tag" ? "var(--color-highlight)" : tone === "accent" ? "var(--color-accent)" : "var(--color-card)";
  const text = tone === "accent" ? "text-card" : "text-on-light";
  return (
    <span className={`inline-flex items-stretch drop-shadow-[2px_2px_0_var(--color-on-dark)] ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 18 40" preserveAspectRatio="none" className="w-[18px] flex-none self-stretch">
        <path d="M18.5 1.25H17L1.6 20L17 38.75H18.5Z" fill={fill} />
        <path
          d="M18.5 1.25H17L1.6 20L17 38.75H18.5"
          fill="none"
          stroke="var(--color-on-dark)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className={`relative -ml-px flex items-center gap-2 rounded-r-[10px] border-y-[2.5px] border-r-[2.5px] border-on-dark py-1 pr-3.5 pl-2 leading-tight font-extrabold ${text}`}
        style={{ background: fill }}
      >
        <span aria-hidden="true" className="absolute top-1/2 -left-[9px] size-[7px] -translate-y-1/2 rounded-full bg-bg ring-2 ring-on-dark" />
        {children}
      </span>
    </span>
  );
}

/* ───────────── Manchas de Holstein ───────────── */

// Baldosa de manchas (240 × 150) que se repite: llena su contenedor posicionado. `id` distingue cada uso en la página.
const HIDE = [spot(40, 36, 30, 3), spot(150, 22, 22, 5), spot(208, 92, 34, 7), spot(92, 112, 26, 11), spot(10, 128, 14, 13), spot(160, 140, 12, 19)];

export function CowHide({ id, className = "", style }: { id: string; className?: string; style?: CSSProperties }) {
  return (
    <svg aria-hidden="true" className={`pointer-events-none absolute inset-0 size-full ${className}`} style={style}>
      <defs>
        <pattern id={id} width={240} height={150} patternUnits="userSpaceOnUse">
          {HIDE.map((d, i) => (
            <path key={i} d={d} fill="currentColor" />
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

// Borde de manchas: una franja con el filo de abajo ondulado, como el lomo de Fifí. Para la cabecera del pie de página.
export function SpotEdge({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 1200 60" preserveAspectRatio="none" className={`block w-full ${className}`}>
      <path
        d="M0 0H1200V30C1140 52 1080 18 1010 34C940 50 880 58 810 40C740 22 690 50 610 46C530 42 490 18 410 30C330 42 290 58 210 44C130 30 70 50 0 36Z"
        fill="currentColor"
      />
    </svg>
  );
}

/* ───────────── Pin de «¡Aquí es!» ───────────── */

export function Pin({ size = 44, className = "" }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size * 1.25} viewBox="0 0 40 50" className={`flex-none overflow-visible ${className}`}>
      <ellipse cx={20} cy={47} rx={9} ry={2.6} fill="var(--color-on-dark)" opacity={0.25} />
      <path
        d="M20 46C20 46 4 30 4 18A16 16 0 0 1 36 18C36 30 20 46 20 46Z"
        className="fill-cta"
        stroke="var(--color-on-dark)"
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      <circle cx={20} cy={18} r={6.5} fill="#ffffff" stroke="var(--color-on-dark)" strokeWidth={2.2} />
    </svg>
  );
}
