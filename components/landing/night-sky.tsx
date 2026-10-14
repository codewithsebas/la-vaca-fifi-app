import type { CSSProperties } from "react";

// Cielo nocturno de la marca: una constelación que gira muy despacio y estrellas fugaces.
// Todo con motion-safe: con movimiento reducido la constelación queda quieta y las estrellas fugaces no aparecen.

// Constelaciones (viewBox 200×240): sus estrellas ([x, y, radio]), las más brillantes (se dibujan con destello de
// cuatro puntas) y los trazos entre ellas (índices de stars).
type Figure = { stars: [x: number, y: number, r: number][]; bright: number[]; lines: [from: number, to: number][] };
const FIGURES = {
  // Orión, reconocible por las tres estrellas del cinturón; las más brillantes son Betelgeuse y Rigel.
  orion: {
    stars: [
      [100, 18, 2.2], // cabeza
      [58, 42, 4.6], // hombro (Betelgeuse)
      [140, 54, 3], // hombro
      [88, 124, 2.6], // cinturón
      [102, 115, 2.8],
      [116, 106, 2.6],
      [70, 204, 3],
      [150, 190, 4.6], // pie (Rigel)
    ],
    bright: [1, 7],
    lines: [[1, 0], [0, 2], [1, 3], [2, 5], [3, 4], [4, 5], [3, 6], [5, 7]],
  },
  // La Cruz del Sur, que desde Murillo se ve sobre el horizonte sur; las más brillantes son Acrux y Mimosa.
  crux: {
    stars: [
      [104, 22, 3.4], // Gacrux
      [96, 214, 4.6], // Acrux
      [36, 104, 4.4], // Mimosa
      [160, 126, 2.8], // Delta
      [128, 164, 1.8], // Épsilon
    ],
    bright: [1, 2],
    lines: [[0, 1], [2, 3]],
  },
} satisfies Record<string, Figure>;
// Destello de cuatro puntas centrado en el origen (radio 1).
const SPARKLE = "M0 -1C.08 -.3 .3 -.08 1 0C.3 .08 .08 .3 0 1C-.08 .3 -.3 .08 -1 0C-.3 -.08 -.08 -.3 0 -1Z";

type ConstellationProps = {
  figure?: keyof typeof FIGURES;
  className?: string; // tamaño y posición (absolute…)
  opacity?: number; // transparencia de la constelación completa
  arrive?: boolean; // se enciende al cargar
  depth?: number; // cuánto sigue al mouse (--hx/--hy de HeroParallax; 0 = nada)
  // Desfase para que dos constelaciones no giren ni titilen sincronizadas.
  offset?: number;
  slow?: number; // multiplica la duración del giro (más lejos = más lento)
};

// Capas (cada una anima una sola cosa para que no se pisen): parallax › aparición › giro lento › estrellas que titilan.
export function Constellation({ figure = "orion", className = "", opacity = 0.25, arrive = false, depth = 1, offset = 0, slow = 1 }: ConstellationProps) {
  const { stars, bright, lines }: Figure = FIGURES[figure];
  const drift: CSSProperties = { animationDuration: `${38 * slow}s`, animationDelay: `${-offset * 38}s` };
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none transition-[translate] duration-700 ease-out ${className}`}
      style={{ translate: `calc(var(--hx, 0) * ${-26 * depth}px) calc(var(--hy, 0) * ${-14 * depth}px)` }}
    >
      <div className={arrive ? "motion-safe:animate-sky-arrive" : ""}>
        <div className="motion-safe:animate-sky-drift" style={drift}>
          <svg viewBox="0 0 200 240" className="block h-auto w-full overflow-visible fill-on-dark stroke-on-dark" style={{ opacity }}>
            {lines.map(([a, b]) => (
              <line key={`${a}-${b}`} x1={stars[a][0]} y1={stars[a][1]} x2={stars[b][0]} y2={stars[b][1]} strokeWidth={1.1} strokeDasharray="1 6" strokeLinecap="round" opacity={0.7} />
            ))}
            {stars.map(([x, y, r], i) => (
              <g key={i} className="motion-safe:animate-star" style={{ animationDelay: `${-((i * 0.73 + offset * 4.5) % 4.5)}s` }} stroke="none">
                {bright.includes(i) ? <path d={SPARKLE} transform={`translate(${x} ${y}) scale(${r * 2.4})`} /> : <circle cx={x} cy={y} r={r} />}
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

type ShootingStarProps = {
  className?: string; // posición del punto de partida (absolute…)
  angle?: number; // dirección del recorrido en grados (150 = hacia abajo y a la izquierda)
  travel?: number; // distancia que recorre (px)
  every?: number; // segundos entre una y otra
  delay?: number; // segundos antes de la primera
};

// Estrella fugaz: cruza en un instante y descansa el resto del ciclo. El contenedor fija la dirección; la estela solo
// se desplaza sobre su eje.
export function ShootingStar({ className = "", angle = 150, travel = 240, every = 9, delay = 2 }: ShootingStarProps) {
  return (
    <span aria-hidden="true" className={`pointer-events-none block w-0 ${className}`} style={{ rotate: `${angle}deg` }}>
      <span
        className="block h-0.5 w-[clamp(60px,9vw,110px)] rounded-full bg-linear-to-r from-transparent to-card opacity-0 motion-safe:animate-shooting-star"
        style={{ animationDuration: `${every}s`, animationDelay: `${delay}s`, "--travel": `${travel}px` } as CSSProperties}
      />
    </span>
  );
}

// Estrellas en posiciones fijas (pseudoaleatorias pero iguales en servidor y navegador), para un cielo de `count` puntos
// repartidos en el ancho y en la fracción `height` (%) del alto de su contenedor.
export const starField = (count: number, height: number) =>
  Array.from({ length: count }, (_, i) => ({
    x: (i * 37.7 + 11) % 100,
    y: (i * 23.3 + 5) % height,
    size: i % 9 === 0 ? 3 : i % 3 === 0 ? 2 : 1.4,
    delay: (i * 0.73) % 4.5,
  }));

// Cielo de estrellas que titilan. Llena su contenedor (posicionado).
export function Stars({ count = 60, height = 60, className = "" }: { count?: number; height?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`}>
      {starField(count, height).map((s, i) => (
        <span key={i} className="absolute rounded-full bg-card motion-safe:animate-star" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, opacity: 0.75, animationDelay: `${-s.delay}s` }} />
      ))}
    </div>
  );
}

// Números pseudoaleatorios con semilla (mulberry32): el cielo sale igual en cada render.
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Polvo de estrellas solo con CSS (sin un elemento por estrella): `n` puntos de luz en una baldosa de `tile` px que se
// repite. Superpuestas, baldosas de tamaños distintos no dejan ver la repetición.
function dust(tile: number, n: number, seed: number): CSSProperties {
  const r = random(seed);
  const dots = Array.from({ length: n }, () => {
    const [x, y, size, alpha] = [r() * tile, r() * tile, r() < 0.2 ? 1.1 : 0.7, Math.round(30 + r() * 55)];
    return `radial-gradient(circle at ${x.toFixed(1)}px ${y.toFixed(1)}px, color-mix(in srgb, var(--color-card) ${alpha}%, transparent) ${size}px, transparent ${size + 0.6}px)`;
  });
  return { backgroundImage: dots.join(","), backgroundSize: `${tile}px ${tile}px` };
}

const tint = (color: string, pct: number) => `color-mix(in srgb, var(--color-${color}) ${pct}%, transparent)`;

// Vía Láctea: una banda que cruza en diagonal de la esquina de abajo a la izquierda a la de arriba a la derecha (así se
// adapta a cualquier proporción), con nubes de luz a lo largo y una franja oscura de polvo. La primera capa va encima.
const MILKY_WAY = [
  `linear-gradient(to bottom right, transparent 47%, ${tint("night", 30)} 50%, transparent 53.5%)`,
  `radial-gradient(34% 15% at 14% 85%, ${tint("accent", 24)}, transparent 70%)`,
  `radial-gradient(24% 11% at 37% 62%, ${tint("highlight", 14)}, transparent 70%)`,
  `radial-gradient(32% 13% at 61% 38%, ${tint("accent", 22)}, transparent 70%)`,
  `radial-gradient(26% 11% at 85% 14%, ${tint("card", 11)}, transparent 70%)`,
  `linear-gradient(to bottom right, transparent 31%, ${tint("accent", 9)} 42%, ${tint("accent", 17)} 50%, ${tint("accent", 9)} 58%, transparent 69%)`,
].join(",");
const DUST = [dust(167, 14, 1), dust(263, 20, 2)];
const BAND_DUST = [dust(97, 16, 3), dust(139, 18, 4)];

// Estrellas que titilan, cada una a su ritmo: [x %, y %, tamaño px, desfase s, duración s].
const TWINKLES = (() => {
  const r = random(9);
  return Array.from({ length: 110 }, () => [r() * 100, r() * 100, r() < 0.12 ? 2.6 : r() < 0.4 ? 1.8 : 1.2, r() * 4.5, 3 + r() * 3]);
})();
// Estrellas brillantes, con destello de cuatro puntas y halo: [x %, y %, tamaño px, color]. Casi todas cerca de los
// bordes, por fuera del contenido; en el celular, donde el contenido ocupa todo el ancho, no se muestran.
const BRIGHT: [x: number, y: number, size: number, tone: "card" | "highlight" | "accent"][] = [
  [6, 7, 15, "card"], [93, 12, 12, "highlight"], [27, 23, 8, "accent"], [96, 31, 10, "card"], [3, 39, 11, "accent"],
  [51, 47, 7, "card"], [91, 54, 14, "card"], [8, 66, 9, "highlight"], [97, 74, 9, "accent"], [4, 86, 12, "card"],
];
const BRIGHT_FILL = { card: "fill-card", highlight: "fill-highlight", accent: "fill-accent" };

// Cielo nocturno para el fondo de una sección entera (llena su contenedor posicionado): una noche más honda que la
// página, la Vía Láctea, polvo de estrellas, estrellas que titilan, unas pocas brillantes con destello, dos
// constelaciones (Orión y la Cruz del Sur, desde pantallas anchas) y estrellas fugaces. Aparece en degradado arriba y
// la noche se aclara al pie, donde va el paisaje de la sección.
export function NightSky({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-deep/80 [mask-image:linear-gradient(to_bottom,transparent,black_160px,black_calc(100%_-_420px),transparent_calc(100%_-_120px))]" />
      <div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,transparent,black_110px)]">
        <div className="absolute inset-0" style={{ background: MILKY_WAY }} />
        {DUST.map((s, i) => (
          <div key={i} className="absolute inset-0 opacity-70" style={s} />
        ))}
        {BAND_DUST.map((s, i) => (
          <div key={i} className="absolute inset-0 [mask-image:linear-gradient(to_bottom_right,transparent_37%,black_50%,transparent_63%)]" style={s} />
        ))}
        {TWINKLES.map(([x, y, size, delay, duration], i) => (
          <span
            key={i}
            className="absolute rounded-full bg-card motion-safe:animate-star"
            style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, animationDelay: `${-delay}s`, animationDuration: `${duration}s` }}
          />
        ))}
        {BRIGHT.map(([x, y, size, tone], i) => (
          <svg
            key={i}
            viewBox="-1 -1 2 2"
            className={`absolute hidden sm:block ${BRIGHT_FILL[tone]} motion-safe:animate-twinkle`}
            style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, filter: `drop-shadow(0 0 ${size / 2}px var(--color-${tone}))`, animationDelay: `${-i * 0.9}s`, animationDuration: `${3.2 + (i % 4) * 0.7}s` }}
          >
            <path d={SPARKLE} />
          </svg>
        ))}
        <Constellation className="absolute top-[clamp(120px,16svh,180px)] left-[3%] hidden w-[clamp(120px,11vw,190px)] xl:block" opacity={0.55} depth={0} />
        <Constellation figure="crux" className="absolute top-[clamp(150px,22svh,240px)] right-[4%] hidden w-[clamp(100px,8.5vw,150px)] xl:block" opacity={0.6} depth={0} offset={0.5} slow={1.3} />
        <ShootingStar className="absolute top-[6%] right-[16%]" every={9} delay={2} />
        <ShootingStar className="absolute top-[38%] left-[12%]" angle={160} travel={200} every={13} delay={6} />
        <ShootingStar className="absolute top-[62%] right-[8%]" angle={145} travel={260} every={11} delay={10} />
      </div>
    </div>
  );
}

// Vaca de estrellas (viewBox 320×200): La Vaca Fifí hecha constelación cruza el cielo caminando despacio, con su corona
// de flores. El cuerpo apenas se insinúa; lo que se ve son sus estrellas y los trazos que las unen. La cola va aparte
// para poder moverla.
const COW_BODY =
  "M78 74C110 62 200 60 236 64C248 56 258 46 270 44C286 46 300 72 306 88C308 98 298 104 288 100C276 96 262 100 250 108C246 120 244 130 240 136L238 182L228 182L226 140C200 144 150 146 110 140L104 182L94 182L90 140C80 130 72 110 74 92C74 84 75 78 78 74Z";
// Las patas del otro lado, más tenues.
const COW_FAR_LEGS = "M216 140L214 180L222 180L224 140ZM112 140L116 180L124 180L122 141Z";
const COW_HORN = "M266 46C262 34 268 26 276 24C272 32 272 40 274 46Z";
const COW_EAR = "M258 56C246 50 236 52 230 58C240 62 250 62 258 60Z";
// Manchas de Holstein, apenas marcadas.
const COW_SPOTS = "M120 70C140 64 160 70 158 86C156 100 132 102 122 92C114 84 112 76 120 70ZM190 66C206 64 220 72 216 86C210 96 194 92 188 84C184 76 184 70 190 66ZM272 52C280 50 288 56 286 64C280 68 272 66 270 60Z";
const COW_TAIL = "M77 80C64 92 60 116 58 136C52 140 50 150 56 152C60 150 64 146 62 138C64 118 68 96 80 86Z";
// [x, y, radio]: hocico, punta del cuerno, cruz, lomo, cadera, pezuña delantera, pezuña trasera y panza.
const COW_STARS: [x: number, y: number, r: number][] = [[306, 90, 2.6], [276, 24, 2.2], [236, 64, 2.8], [156, 62, 2.2], [78, 76, 2.6], [233, 182, 2.4], [99, 182, 2.2], [160, 142, 2]];
const COW_LINES: [from: number, to: number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [4, 6], [6, 7], [7, 5]];
// La corona de flores: destellos dorados entre la oreja y el cuerno.
const COW_CROWN: [x: number, y: number, r: number][] = [[254, 44, 4.5], [262, 34, 5.5], [246, 34, 4]];

type StarCowProps = {
  className?: string; // tamaño y posición de partida (absolute…)
  opacity?: number;
  delay?: number; // segundos ya caminados al cargar (para que aparezca dentro de la pantalla)
};

// Capas: travesía de lado a lado › vaivén del paso › cola. Con movimiento reducido queda quieta donde se la pone.
export function StarCow({ className = "", opacity = 0.9, delay = 26 }: StarCowProps) {
  return (
    <div aria-hidden="true" className={`pointer-events-none ${className}`}>
      <div className="motion-safe:animate-cow-walk" style={{ animationDelay: `${-delay}s` }}>
        <div className="motion-safe:animate-cow-bob">
          <svg viewBox="0 0 320 200" className="block h-auto w-full overflow-visible" style={{ opacity }}>
            <g className="motion-safe:animate-cow-tail" style={{ transformBox: "view-box", transformOrigin: "78px 80px" }}>
              <path d={COW_TAIL} className="fill-on-dark/8 stroke-on-dark/25" strokeWidth={1} />
              <path d="M78 80L56 150" className="stroke-on-dark/55" strokeWidth={1.1} strokeDasharray="1 6" strokeLinecap="round" fill="none" />
              <circle cx={56} cy={150} r={2.4} className="fill-on-dark motion-safe:animate-star" style={{ animationDelay: "-1.3s" }} />
            </g>
            <path d={COW_FAR_LEGS} className="fill-on-dark/5 stroke-on-dark/15" strokeWidth={1} />
            <path d={COW_BODY} className="fill-on-dark/8 stroke-on-dark/25" strokeWidth={1} />
            <path d={COW_SPOTS} className="fill-on-dark/10" />
            <path d={COW_EAR} className="fill-on-dark/10 stroke-on-dark/25" strokeWidth={1} />
            <path d={COW_HORN} className="fill-on-dark/12 stroke-on-dark/30" strokeWidth={1} />
            {COW_LINES.map(([a, b]) => (
              <line key={`${a}-${b}`} x1={COW_STARS[a][0]} y1={COW_STARS[a][1]} x2={COW_STARS[b][0]} y2={COW_STARS[b][1]} className="stroke-on-dark/55" strokeWidth={1.1} strokeDasharray="1 6" strokeLinecap="round" />
            ))}
            {COW_STARS.map(([x, y, rad], i) => (
              <circle key={i} cx={x} cy={y} r={rad} className="fill-on-dark motion-safe:animate-star" style={{ animationDelay: `${-((i * 0.73) % 4.5)}s` }} />
            ))}
            {/* El ojo y la corona de flores: destellos dorados. */}
            <path d={SPARKLE} transform="translate(284 66) scale(5.5)" className="fill-highlight" />
            {COW_CROWN.map(([x, y, rad], i) => (
              <g key={i} className="motion-safe:animate-star" style={{ animationDelay: `${-i * 1.4}s` }}>
                <path d={SPARKLE} transform={`translate(${x} ${y}) scale(${rad})`} className="fill-highlight" />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
