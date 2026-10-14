import type { CSSProperties, ReactNode } from "react";
import { Wordmark } from "../brand";
import { AndeanDeer, Condor, Cotinga, FAUNA, FAUNA_TONES, Hummingbird, MountainEagle, MountainTapir, Redstart, SpectacledBear, WhiteTailedEagle } from "./fauna";
import { forest, frailejon, frailejonFlowers, pine, ridge, shrubs, type Pt } from "./scenery";

// Paisaje del pie de página: el bosque andino de Murillo en capas, como se ve al caer la tarde desde la montaña. Al
// fondo, el resplandor del cielo y la cordillera con el Nevado del Ruiz; después, laderas de pinos que bajan hacia un
// valle entre franjas de niebla, las lomas cercanas, los pinos grandes del frente y el matorral con frailejones, cada
// capa más oscura que la anterior (la perspectiva de la bruma). En él viven los animales de la zona.
// Es una sola ilustración (1440 × 560) que llena su contenedor apoyada en el borde inferior: en pantallas angostas se
// recorta por los lados, así que los animales que caminan van entre x 240 y 1200. Las aves van fuera del SVG, en
// posiciones relativas al contenedor, para que siempre se vean. Sobre la cordillera va escrito el nombre, como en el
// logo: su tamaño y su posición siguen la escala de la ilustración (--s, px por unidad), así queda a la misma altura
// en cualquier pantalla y el nevado asoma justo entre las dos palabras.

export const SCENE_TONES = {
  "--fs-glow": "color-mix(in srgb, var(--color-accent) 52%, var(--color-surface))",
  "--fs-glow-warm": "color-mix(in srgb, var(--color-highlight) 38%, color-mix(in srgb, var(--color-accent) 52%, var(--color-surface)))",
  "--fs-1": "color-mix(in srgb, var(--color-accent) 40%, var(--color-bg))",
  "--fs-2": "color-mix(in srgb, var(--color-accent) 30%, var(--color-bg))",
  "--fs-3": "color-mix(in srgb, var(--color-accent) 20%, var(--color-bg))",
  "--fs-4": "color-mix(in srgb, var(--color-accent) 11%, var(--color-bg))",
  "--fs-5": "color-mix(in srgb, var(--color-bg) 56%, var(--color-night))",
  "--fs-ground": "color-mix(in srgb, var(--color-bg) 38%, var(--color-night))",
  "--fs-snow": "color-mix(in srgb, var(--color-card) 84%, var(--color-accent))",
} as CSSProperties;

const W = 1440;
const H = 560;
// Alto del paisaje y su escala: la ilustración cubre el contenedor, así que la escala es la mayor de las dos. En
// pantallas muy anchas el alto sigue creciendo (36vw), para que quede cielo sobre la cordillera donde escribir el nombre.
const SIZE = {
  "--scene-h": "max(clamp(240px, 40vw, 620px), 36vw)",
  "--s": `max(calc(100cqw / ${W}), calc(var(--scene-h) / ${H}))`,
} as CSSProperties;

// Cordillera del fondo, con el Nevado del Ruiz (ancho y de cima plana) en el centro, entre las dos palabras del nombre.
const FAR: Pt[] = [[0, 300], [110, 274], [210, 266], [310, 288], [410, 280], [510, 262], [600, 256], [690, 246], [740, 228], [766, 218], [790, 217], [814, 226], [866, 246], [950, 252], [1040, 254], [1130, 246], [1220, 258], [1320, 246], [1440, 270]];
// Nieve: cubre la cumbre con el borde de abajo en picos; se recorta con la forma de la cordillera, igual que la sombra
// de la ladera derecha.
const NEVADO_X = 778;
// Línea de base del nombre, un poco por encima del filo de la cordillera.
const NAME_Y = 240;
const SNOW = "M690 190H870V238L858 244L846 236L832 248L818 238L804 250L790 238L776 250L762 238L748 248L734 238L720 246L706 238L690 242Z";
const SNOW_SHADE = "M790 217C806 220 834 234 866 246L912 254L800 258Z";
const RANGE: Pt[] = [[0, 330], [120, 312], [240, 318], [360, 306], [470, 322], [560, 344], [640, 366], [720, 378], [790, 374], [870, 352], [960, 328], [1060, 312], [1160, 318], [1270, 304], [1360, 314], [1440, 306]];
// Laderas de pinos que bajan desde los dos lados hacia el valle del centro.
const SLOPES: Pt[] = [[0, 262], [110, 272], [220, 296], [330, 330], [440, 366], [540, 398], [630, 424], [700, 440], [760, 446], [820, 440], [900, 414], [990, 378], [1080, 342], [1180, 306], [1290, 280], [1440, 262]];
// Lomas cercanas: un rellano a la izquierda (donde camina el oso) y otro a la derecha (el venado).
const NEAR: Pt[] = [[0, 432], [80, 414], [180, 402], [300, 399], [420, 402], [500, 414], [580, 440], [660, 462], [740, 470], [820, 462], [900, 442], [970, 426], [1050, 419], [1140, 420], [1230, 424], [1330, 412], [1440, 404]];

const RANGE_PINES = forest(RANGE, { from: 6, to: 600, gap: 10, min: 9, max: 20, seed: 3, sink: 3 }) + forest(RANGE, { from: 880, to: 1436, gap: 10, min: 9, max: 20, seed: 8, sink: 3 });
const SLOPE_PINES = forest(SLOPES, { from: 4, to: 660, gap: 15, min: 24, max: 50, seed: 5 }) + forest(SLOPES, { from: 860, to: 1436, gap: 15, min: 24, max: 50, seed: 12 });
const NEAR_PINES = forest(NEAR, { from: 6, to: 140, gap: 26, min: 46, max: 84, seed: 17, sink: 6 }) + forest(NEAR, { from: 1270, to: 1436, gap: 26, min: 46, max: 84, seed: 21, sink: 6 });
// Pinos grandes del frente: [x, alto] con la base en el borde inferior. La cotinga se posa en la punta del primero de
// la derecha.
const BIG_PINES: [x: number, h: number][] = [[46, 380], [134, 290], [214, 196], [1236, 214], [1318, 330], [1404, 410]];
const BIG = BIG_PINES.map(([x, h]) => pine(x, H, h, h * 0.23, 7)).join("");
// Frailejones del matorral: [x, alto, semilla]; dos tienen las varas en flor.
const FRAILEJONES: [x: number, h: number, seed: number][] = [[318, 84, 2], [356, 62, 5], [1018, 76, 7], [1062, 106, 3], [1112, 70, 9]];
const BLOOMS = [frailejonFlowers(1062, 536, 106), frailejonFlowers(318, 536, 84)];
const GROUND = shrubs(4, { from: 0, to: W, base: 528, h: 24, bottom: H });
const SCRUB = FRAILEJONES.map(([x, h, s]) => frailejon(x, 536, h, s)).join("");
// Matas delante del tapir (le tapan las patas).
const FRONT_SCRUB = shrubs(9, { from: 560, to: 900, base: 540, h: 22, bottom: H });

const ARIA = `Ilustración del bosque andino de Murillo al atardecer, con el Nevado del Ruiz al fondo y su fauna: ${FAUNA.join(", ").toLowerCase()}.`;

// Franja de niebla que se corre despacio.
function Mist({ y, h, back = false }: { y: number; h: number; back?: boolean }) {
  return <rect x={-120} y={y} width={W + 240} height={h} fill="url(#forest-mist)" className={back ? "motion-safe:animate-fog-drift-back" : "motion-safe:animate-fog-drift"} />;
}

// Ave que vuela en círculos: el contenedor la ubica, y dos vaivenes desfasados dibujan la elipse.
function Circling({ className, rx, ry, period, children }: { className: string; rx: number; ry: number; period: number; children: ReactNode }) {
  return (
    <div className={`absolute ${className}`}>
      <div className="motion-safe:animate-orbit-x" style={{ "--orbit-x": `${rx}px`, animationDuration: `${period}s` } as CSSProperties}>
        <div className="motion-safe:animate-orbit-y" style={{ "--orbit-y": `${ry}px`, animationDuration: `${period}s`, animationDelay: `${-period / 2}s` } as CSSProperties}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function ForestScene({ title = false, className = "" }: { title?: boolean; className?: string }) {
  return (
    <div role="img" aria-label={ARIA} className={`@container pointer-events-none relative h-(--scene-h) overflow-hidden [content-visibility:auto] ${className}`} style={{ ...SIZE, ...FAUNA_TONES }}>
      {/* Resplandor del cielo detrás de la cordillera, más cálido sobre el valle. */}
      <div className="absolute inset-0 bg-[radial-gradient(52%_46%_at_54%_58%,var(--fs-glow-warm),transparent_72%),radial-gradient(90%_62%_at_50%_62%,var(--fs-glow),transparent_78%)] opacity-80" />
      {/* El nombre, con la letra y la S de estrellas del logo. El hueco entre las dos palabras cae sobre el nevado
          (--dx desde el centro) y la línea de base (--base desde abajo) queda sobre la cordillera, que solo tapa las
          colas de las letras. El tamaño es el menor de cuatro: 96 unidades de la ilustración (el nombre queda entre
          los pinos grandes), lo que cabe a lo ancho («Stellarium» más medio hueco, 6.9em, hasta el borde izquierdo y
          medio hueco más «glamping», 5.52em, hasta el derecho) y lo que cabe a lo alto (las ramas de la S, 1.52em
          sobre la línea de base). El degradado va del tono claro, a la altura de las minúsculas, al de la cordillera. */}
      {title && (
        <p
          className="font-wordmark absolute -translate-x-[6.9em] bg-linear-to-b from-[color-mix(in_srgb,var(--color-accent)_62%,var(--color-card))] from-35% via-accent/75 via-76% to-(--fs-1) bg-clip-text pb-[.12em] leading-none font-normal whitespace-nowrap text-transparent [&_svg]:[fill:url(#forest-name)] [&_svg]:[stroke:url(#forest-name)]"
          style={{ "--dx": `calc(var(--s) * ${NEVADO_X - W / 2})`, "--base": `calc(var(--s) * ${H - NAME_Y})`, "--font": `min(calc(var(--s) * 96), calc((50cqw + var(--dx) - 16px) / 6.9), calc((50cqw - var(--dx) - 8px) / 5.52), calc((var(--scene-h) - var(--base) - 40px) / 1.52))`, fontSize: "var(--font)", left: "calc(50% + var(--dx))", bottom: "calc(var(--base) - 0.265 * var(--font))" } as CSSProperties}
        >
          <Wordmark />
          <span className="ml-[1.44em]">glamping</span>
        </p>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true" className="absolute inset-0 size-full">
        <defs>
          <clipPath id="forest-far">
            <path d={ridge(FAR, H)} />
          </clipPath>
          {/* El degradado del nombre para la S, en sus unidades (213 de alto): los mismos tres tonos que las letras, a
              las mismas alturas. */}
          <linearGradient id="forest-name" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="213">
            <stop offset="0.57" style={{ stopColor: "color-mix(in srgb, var(--color-accent) 62%, var(--color-card))" }} />
            <stop offset="0.82" style={{ stopColor: "var(--color-accent)", stopOpacity: 0.75 }} />
            <stop offset="0.965" style={{ stopColor: "var(--fs-1)" }} />
          </linearGradient>
          <linearGradient id="forest-mist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--color-card)", stopOpacity: 0 }} />
            <stop offset="0.55" style={{ stopColor: "var(--color-card)", stopOpacity: 0.16 }} />
            <stop offset="1" style={{ stopColor: "var(--color-card)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        {/* Cordillera y nevado, con la fumarola */}
        <g className="fill-(--fs-snow)">
          {[0, 2.6, 5.2].map((d) => (
            <ellipse key={d} cx={778} cy={208} rx={12} ry={8} opacity={0} className="svg-pivot motion-safe:animate-steam" style={{ animationDelay: `${-d}s`, animationDuration: "8s" }} />
          ))}
        </g>
        <path d={ridge(FAR, H)} className="fill-(--fs-1)" />
        <g clipPath="url(#forest-far)">
          <path d={SNOW} className="fill-(--fs-snow)" opacity={0.92} />
          <path d={SNOW_SHADE} className="fill-bg" opacity={0.12} />
        </g>
        <Mist y={250} h={110} />

        <path d={ridge(RANGE, H)} className="fill-(--fs-2)" />
        <path d={RANGE_PINES} className="fill-(--fs-2)" />

        {/* Laderas del valle */}
        <path d={ridge(SLOPES, H)} className="fill-(--fs-3)" />
        <path d={SLOPE_PINES} className="fill-(--fs-3)" />
        <Mist y={384} h={96} back />

        {/* Lomas cercanas, con el oso que sale de detrás de los pinos y el venado en su rellano */}
        <path d={ridge(NEAR, H)} className="fill-(--fs-4)" />
        <path d={NEAR_PINES} className="fill-(--fs-4)" />
        <g transform="translate(250 344)">
          <g className="motion-safe:animate-walk-across" style={{ "--walk": "260px", animationDuration: "21s" } as CSSProperties}>
            <SpectacledBear width={100} className="pointer-events-auto" />
          </g>
        </g>
        <AndeanDeer x={1036} y={357} width={84} className="pointer-events-auto" />
        <Mist y={448} h={100} />

        {/* Pinos grandes del frente, con la cotinga en la punta */}
        <path d={BIG} className="fill-(--fs-5)" />
        <Cotinga x={1225} y={324} width={22} className="pointer-events-auto" />

        {/* Matorral con frailejones: el tapir camina entre las matas, el colibrí visita una flor y la candelita salta */}
        <path d={GROUND} className="fill-(--fs-ground)" />
        <path d={SCRUB} className="fill-(--fs-ground)" />
        {BLOOMS.map(({ stalks, heads }, i) => (
          <g key={i}>
            <path d={stalks} fill="none" strokeWidth={1.6} strokeLinecap="round" className="stroke-(--fs-ground)" />
            {heads.map(([x, y]) => (
              <circle key={x} cx={x} cy={y} r={3.2} className="fill-highlight" />
            ))}
          </g>
        ))}
        <g transform="translate(760 474) scale(-1 1)">
          <g className="motion-safe:animate-walk-across" style={{ "--walk": "220px", animationDuration: "30s", animationDelay: "-9s" } as CSSProperties}>
            <MountainTapir width={116} className="pointer-events-auto" />
          </g>
        </g>
        <path d={FRONT_SCRUB} className="fill-(--fs-ground)" />
        <Hummingbird x={994} y={406} width={44} className="pointer-events-auto" />
        <Redstart x={470} y={492} width={34} className="pointer-events-auto" />
      </svg>

      {/* Aves en el cielo, sobre el nombre: el cóndor cruza de lado a lado; las dos águilas giran a la derecha. */}
      <div className="absolute inset-x-0 top-[3%] motion-safe:animate-soar-across" style={{ animationDelay: "-34s" }}>
        <Condor className="w-[clamp(84px,10vw,160px)]" />
      </div>
      <Circling className="top-[8%] left-[58%] w-[clamp(34px,3.8vw,58px)]" rx={50} ry={11} period={11}>
        <WhiteTailedEagle />
      </Circling>
      <Circling className="top-[13%] left-[80%] w-[clamp(42px,4.8vw,74px)]" rx={64} ry={15} period={9}>
        <MountainEagle />
      </Circling>
    </div>
  );
}
