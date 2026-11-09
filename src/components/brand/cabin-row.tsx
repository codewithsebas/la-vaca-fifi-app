// Fila de cabañas de La Vaca Fifí para el pie de página, dibujada como las reales (public/fotos/cabana-fachada-roja.jpg y
// cabanas-corredor.jpg): paredes crema, techo de teja ondulada rojiza con su filo blanco, corredor con postes de un color,
// puerta de madera, ventana con marco del mismo color y baranda de palos de colores. Detrás, las montañas de Murillo y
// unos pinos. Decorativa. Se dibuja igual en el servidor y en el navegador (todo es fijo).

const W = 1440;
const GROUND = 214;

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
    <svg aria-hidden="true" viewBox={`0 0 ${W} ${GROUND + 6}`} preserveAspectRatio="xMidYMax slice" className={`block w-full ${className}`}>
      {/* Montañas: dos capas que se aclaran con la distancia */}
      <path
        d={`M0 120C120 70 220 96 330 60C450 22 560 88 690 70C820 52 900 8 1030 40C1160 72 1260 30 1440 66V${GROUND}H0Z`}
        fill="color-mix(in srgb, var(--color-accent) 16%, var(--color-card))"
      />
      <path
        d={`M0 150C150 118 250 140 380 112C520 84 610 132 760 118C900 104 980 86 1120 110C1260 134 1330 104 1440 116V${GROUND}H0Z`}
        fill="color-mix(in srgb, #2f6b45 22%, var(--color-card))"
      />
      {PINES.map((p) => (
        <Pine key={p} x={p} />
      ))}
      {CABINS.map((c) => (
        <Cabin key={c.x} {...c} />
      ))}
      {/* Suelo de gravilla */}
      <rect x={0} y={GROUND} width={W} height={6} fill="#bdb3a1" />
    </svg>
  );
}
