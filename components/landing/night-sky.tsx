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
