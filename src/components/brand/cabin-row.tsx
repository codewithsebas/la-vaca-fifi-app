// Fila de cabañas de La Vaca Fifí para el pie de página, dibujada como las reales (public/fotos/cabana-fachada-roja.jpg y
// cabanas-corredor.jpg): paredes crema, techo de teja ondulada rojiza con su filo blanco, corredor con postes de un color,
// puerta de madera, ventana con marco del mismo color y baranda de palos de colores. Detrás, la cordillera de Murillo
// (capas de crestas que se aclaran y se azulan con la distancia, con el nevado al fondo) y unos pinos; al pie, un prado con pasto en capas. Decorativa. Se dibuja igual en el servidor y en el navegador (todo es
// fijo: las posiciones «al azar» salen de una función con semilla).

const W = 1440;
const GROUND = 214;
const MEADOW = 34; // alto del prado bajo las cabañas

const RED = "#d2283f";
const GREEN = "#1f8a5b";
const YELLOW = "#f2b705";
const BLUE = "#1f6fc4";
const ORANGE = "#e2572b";

const WALL = "#f5ecd3";
const WALL_LINE = "#e2d6b6";
const ROOF = "#b4442f";
const ROOF_DARK = "#8f3322";
const WOOD = "#c98a4b";
const WOOD_DARK = "#9a6232";
const GLASS = "#bfe0f2";
const BASE = "#cfc6b5";

type CabinSpec = { x: number; w: number; h: number; trim: string; rails: string[] };

const CABINS: CabinSpec[] = [
  { x: 40, w: 190, h: 112, trim: ORANGE, rails: [ORANGE, "#fff", GREEN] },
  { x: 300, w: 170, h: 104, trim: GREEN, rails: [BLUE, "#fff", GREEN] },
  { x: 560, w: 214, h: 120, trim: YELLOW, rails: [YELLOW, "#fff", RED] },
  { x: 850, w: 176, h: 108, trim: RED, rails: [RED, "#fff", GREEN] },
  { x: 1110, w: 196, h: 114, trim: BLUE, rails: [BLUE, "#fff", YELLOW] },
];

const PINES = [262, 506, 528, 812, 1066, 1352, 1394];

// Filo ondulado de la teja: medios círculos a lo largo del borde del techo.
function wavyEdge(x0: number, x1: number, y0: number, y1: number, r = 5) {
  const n = Math.max(2, Math.round((x1 - x0) / (r * 2)));
  const dx = (x1 - x0) / n;
  const dy = (y1 - y0) / n;
  let d = `M${x0} ${y0}`;
  for (let i = 0; i < n; i++) d += ` q${dx / 2} ${r * 1.4} ${dx} ${dy}`;
  return `${d} L${x1} ${y1 - 4} L${x0} ${y0 - 4}Z`;
}

function Cabin({ x, w, h, trim, rails }: CabinSpec) {
  const top = GROUND - h;
  const over = 18;
  // El techo baja un poco hacia la derecha, como en las fotos.
  const roofL = top - 6;
  const roofR = top + 4;
  const wallTop = top + 14;
  const porch = Math.round(w * 0.46); // corredor a la derecha, con la baranda
  const doorX = x + Math.round(w * 0.14);
  const doorW = Math.round(w * 0.17);
  const winX = x + Math.round(w * 0.62);
  const winW = Math.round(w * 0.22);
  const railTop = GROUND - 40;
  const balusters = Math.floor((porch - 16) / 9);
  return (
    <g>
      {/* Pared con las líneas del revestimiento */}
      <rect x={x} y={wallTop} width={w} height={GROUND - wallTop} fill={WALL} />
      {[0.32, 0.58, 0.82].map((f) => (
        <line key={f} x1={x} x2={x + w} y1={wallTop + (GROUND - wallTop) * f} y2={wallTop + (GROUND - wallTop) * f} stroke={WALL_LINE} strokeWidth={1.5} />
      ))}
      {/* Puerta con su marco */}
      <rect x={doorX - 5} y={wallTop + 16} width={doorW + 10} height={GROUND - wallTop - 22} fill={trim} />
      <rect x={doorX} y={wallTop + 21} width={doorW} height={GROUND - wallTop - 27} fill={WOOD} />
      <rect x={doorX + 5} y={wallTop + 28} width={doorW - 10} height={(GROUND - wallTop) * 0.3} fill="none" stroke={WOOD_DARK} strokeWidth={1.5} />
      <circle cx={doorX + doorW - 6} cy={wallTop + (GROUND - wallTop) * 0.58} r={1.8} fill={WOOD_DARK} />
      {/* Ventana con marco de color y travesaños de madera */}
      <rect x={winX - 5} y={wallTop + 16} width={winW + 10} height={46} fill={trim} />
      <rect x={winX} y={wallTop + 21} width={winW} height={36} fill={GLASS} />
      <path d={`M${winX + winW / 2} ${wallTop + 21}v36M${winX} ${wallTop + 39}h${winW}`} stroke={WOOD} strokeWidth={3} />
      <rect x={winX} y={wallTop + 21} width={winW} height={36} fill="none" stroke={WOOD} strokeWidth={2.5} />
      {/* Piso del corredor y base */}
      <rect x={x - 6} y={GROUND - 8} width={w + 12} height={8} fill={BASE} />
      {/* Baranda: pasamanos blanco y palos de colores */}
      {Array.from({ length: balusters }, (_, i) => (
        <rect key={i} x={x + w - porch + 10 + i * 9} y={railTop} width={5} height={GROUND - 8 - railTop} fill={rails[i % rails.length]} />
      ))}
      <rect x={x + w - porch + 4} y={railTop - 3} width={porch - 8} height={5} fill="#fff" stroke={WALL_LINE} strokeWidth={1} />
      {/* Postes del corredor */}
      {[x - 2, x + w - porch - 4, x + w - 6].map((px) => (
        <rect key={px} x={px} y={roofL + 10} width={9} height={GROUND - 8 - roofL - 10} fill={trim} />
      ))}
      {/* Techo de teja ondulada */}
      <path d={`M${x - over} ${roofL}L${x + w + over} ${roofR}L${x + w + over} ${roofR + 10}L${x - over} ${roofL + 10}Z`} fill={ROOF} />
      <path d={`M${x - over} ${roofL}L${x + w + over} ${roofR}`} stroke={ROOF_DARK} strokeWidth={2} />
      <path d={wavyEdge(x - over, x + w + over, roofL + 15, roofR + 15)} fill="#fff" />
    </g>
  );
}

/* ───────────── Pasto ───────────── */

// Pseudoaleatorio fijo (igual en servidor y navegador).
const rnd = (i: number) => {
  const v = Math.sin(i * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};
const f1 = (n: number) => n.toFixed(1);
// Brizna curva: base ancha, punta fina, inclinada hacia un lado.
const blade = (x: number, y: number, h: number, lean: number, w: number) =>
  `M${f1(x - w)} ${f1(y)}Q${f1(x + lean * 0.3)} ${f1(y - h * 0.55)} ${f1(x + lean)} ${f1(y - h)}Q${f1(x + lean * 0.2 + w * 0.3)} ${f1(y - h * 0.5)} ${f1(x + w)} ${f1(y)}Z`;
// Una capa de briznas a lo largo del borde del prado: `dy` la baja (las de adelante, más abajo), y de vez en cuando una
// mata más alta.
function grassLayer(step: number, minH: number, maxH: number, w: number, dy: number, seed: number) {
  let d = "";
  for (let i = 0; i * step < W + 40; i++) {
    const x = -20 + i * step + rnd(seed + i) * step;
    const h = (minH + rnd(seed + i + 7) * (maxH - minH)) * (rnd(seed + i + 13) > 0.92 ? 1.5 : 1);
    d += blade(x, GROUND + dy, h, (rnd(seed + i + 3) - 0.45) * 8, w);
  }
  return d;
}
// Detrás de las cabañas: dos capas oscuras y bajas en el borde del prado.
const GRASS_BACK = [grassLayer(3.2, 7, 14, 1.6, 1, 0), grassLayer(2.7, 9, 18, 1.5, 3, 400)];
// Delante: briznas cortas y claras que tapan apenas la base de las cabañas, como pasto de verdad.
const GRASS_FRONT = grassLayer(3.6, 5, 12, 1.4, 7, 900);
// Matas sueltas y florecitas repartidas en el prado.
const TUFTS = Array.from({ length: 110 }, (_, i) => {
  const x = rnd(i + 50) * W;
  const y = GROUND + 12 + rnd(i + 90) * (MEADOW - 14);
  return [-3, 0, 3].map((o, k) => blade(x + o, y, 4 + rnd(i * 3 + k) * 5, (o + (rnd(i + k) - 0.5) * 3) * 0.8, 0.9)).join("");
}).join("");
const FLOWERS = Array.from({ length: 34 }, (_, i) => {
  const x = rnd(i + 300) * W;
  return { x, y: GROUND + 10 + rnd(i + 310) * (MEADOW - 14), c: [YELLOW, "#ffffff", "#f4b8d6"][Math.floor(rnd(i + 320) * 3)] };
});

/* ───────────── Cordillera ───────────── */

// Las montañas van en su propio dibujo, estirado al ancho y al alto de la franja: la fila de cabañas se recorta por
// arriba en pantallas anchas (preserveAspectRatio slice) y las cumbres quedarían cortadas en recto.
const MW = 2400;
const MH = 300;

// Cresta por desplazamiento del punto medio: cada nivel agrega detalle más fino y más bajo (`rough` < 1), como las
// crestas reales; luego se suman los cerros principales (`peaks`: [x, alto, ancho]) para darle forma de cordillera.
function ridge(seed: number, base: number, amp: number, rough: number, peaks: [number, number, number][], levels = 8) {
  const n = 2 ** levels;
  const ys = new Array<number>(n + 1).fill(0);
  ys[0] = (rnd(seed) - 0.5) * amp;
  ys[n] = (rnd(seed + 1) - 0.5) * amp;
  let k = 2;
  for (let step = n; step > 1; step /= 2, k++) {
    const scale = amp * rough ** k;
    for (let i = step / 2; i < n; i += step) ys[i] = (ys[i - step / 2] + ys[i + step / 2]) / 2 + (rnd(seed + i * 31 + k * 977) - 0.5) * scale;
  }
  return ys.map((y, i) => {
    const x = (i / n) * MW;
    const lift = peaks.reduce((h, [px, ph, pw]) => h + ph * Math.exp(-(((x - px) / pw) ** 2)), 0);
    return [x, base + y - lift] as const;
  });
}
const pathOf = (pts: readonly (readonly [number, number])[]) => `M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join("L")}V${MH}H0Z`;

// De atrás hacia adelante: el nevado y las cumbres lejanas (gris azulado), dos cordones intermedios (verde azulado) y
// las lomas cercanas (verde, con borde de monte).
const FAR = ridge(11, 118, 72, 0.62, [
  [520, 64, 260],
  [1180, 110, 190],
  [1900, 72, 300],
]);
const RANGES = [
  { pts: FAR, top: "#9fb3c6", bottom: "#dfe6ec" },
  {
    pts: ridge(23, 146, 60, 0.6, [
      [260, 40, 240],
      [900, 52, 260],
      [1600, 38, 220],
      [2250, 46, 200],
    ]),
    top: "#87a1a3",
    bottom: "#cbd8d3",
  },
  {
    pts: ridge(41, 182, 46, 0.58, [
      [560, 34, 280],
      [1350, 42, 300],
      [2100, 30, 240],
    ]),
    top: "#6c8f6e",
    bottom: "#adc4a6",
  },
  {
    pts: ridge(
      57,
      224,
      24,
      0.68,
      [
        [300, 18, 260],
        [1050, 24, 320],
        [1800, 20, 280],
      ],
      9,
    ),
    top: "#5e8350",
    bottom: "#93ae80",
  },
];
// Nieve del nevado: lo que de la cresta lejana queda por encima de la línea de nieve, con borde irregular.
const SNOW_LINE = Math.min(...FAR.map(([, y]) => y)) + 26;
const SNOW = (() => {
  const top = FAR.filter(([, y]) => y < SNOW_LINE + 14);
  if (!top.length) return "";
  const x0 = top[0][0];
  const x1 = top[top.length - 1][0];
  const edge = Array.from({ length: 24 }, (_, i) => {
    const x = x1 - ((x1 - x0) * i) / 23;
    return `${f1(x)} ${f1(SNOW_LINE + (rnd(700 + i) - 0.5) * 16)}`;
  });
  return `M${f1(x0)} 0H${f1(x1)}L${edge.join("L")}Z`;
})();

function Mountains() {
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${MW} ${MH}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
      <defs>
        {RANGES.map((r, i) => (
          // Cada capa se aclara hacia abajo: la bruma de los valles.
          <linearGradient key={i} id={`cr-monte-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={r.top} />
            <stop offset="1" stopColor={r.bottom} />
          </linearGradient>
        ))}
        <clipPath id="cr-nevado">
          <path d={pathOf(FAR)} />
        </clipPath>
      </defs>
      {RANGES.map((r, i) => (
        <g key={i}>
          <path d={pathOf(r.pts)} fill={`url(#cr-monte-${i})`} />
          {i === 0 && <path d={SNOW} clipPath="url(#cr-nevado)" fill="#f7f9fb" opacity=".92" />}
        </g>
      ))}
    </svg>
  );
}

function Pine({ x }: { x: number }) {
  const h = 70 + ((x * 7) % 30);
  return (
    <g>
      <rect x={x - 3} y={GROUND - 16} width={6} height={16} fill="#6b4a2b" />
      <path d={`M${x} ${GROUND - h}L${x + 22} ${GROUND - 14}H${x - 22}Z`} fill="#2f6b45" />
      <path d={`M${x} ${GROUND - h}L${x + 22} ${GROUND - 14}H${x}Z`} fill="#285c3b" />
    </g>
  );
}

export function CabinRow({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`relative block w-full overflow-hidden ${className}`}>
      <Mountains />
      <svg viewBox={`0 0 ${W} ${GROUND + MEADOW}`} preserveAspectRatio="xMidYMax slice" className="absolute inset-0 size-full">
        <defs>
          {/* Briznas: oscuras en la base y claras en la punta; las de atrás más oscuras que las de adelante. */}
          {[
            ["#2f4a26", "#4f7a3a"],
            ["#355a2b", "#6b9a4a"],
            ["#3f6a30", "#8fbf5e"],
          ].map(([a, b], i) => (
            <linearGradient key={i} id={`cr-pasto-${i}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor={a} />
              <stop offset="1" stopColor={b} />
            </linearGradient>
          ))}
          {/* Prado: más claro arriba (le da el sol) y más oscuro hacia abajo. */}
          <linearGradient id="cr-prado" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5f8f42" />
            <stop offset="1" stopColor="#3f6a2e" />
          </linearGradient>
        </defs>
        {/* Prado con matas sueltas y florecitas */}
        <rect x={0} y={GROUND - 2} width={W} height={MEADOW + 2} fill="url(#cr-prado)" />
        <path d={TUFTS} fill="#365b28" opacity=".8" />
        {FLOWERS.map((f, i) => (
          <circle key={i} cx={f1(f.x)} cy={f1(f.y)} r="1.7" fill={f.c} opacity=".9" />
        ))}
        {/* Pasto del borde, detrás de pinos y cabañas */}
        {GRASS_BACK.map((d, i) => (
          <path key={i} d={d} fill={`url(#cr-pasto-${i})`} />
        ))}
        {PINES.map((p) => (
          <Pine key={p} x={p} />
        ))}
        {CABINS.map((c) => (
          <Cabin key={c.x} {...c} />
        ))}
        {/* Pasto de adelante, sobre la base de las cabañas */}
        <path d={GRASS_FRONT} fill="url(#cr-pasto-2)" />
      </svg>
    </div>
  );
}
