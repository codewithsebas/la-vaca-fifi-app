import type { CSSProperties } from "react";
import { PhotoSlot } from "../photo-slot";
import { FAUNA_TONES, HolsteinCow } from "./fauna";
import { pine } from "./scenery";

// Paisaje de la portada: la cordillera nevada con el Nevado del Ruiz y su fumarola, colinas en capas, pinos y, sobre
// una loma, la cabaña de colores encendida con su baranda de palos pintados, las luces, la fogata y La Vaca Fifí
// pastando al lado. Es una sola ilustración (de x -200
// a 1640 y de y 0 a 600) que llena su contenedor apoyada en el borde inferior: lo que sobra se recorta por arriba
// (cielo) y por los lados. En pantallas angostas se centra entre el nevado y la cabaña (x = 860), así que lo importante
// va entre x 580 y 1140 y por debajo de y = 170. En pantallas anchas y bajas (o con zoom) la ilustración se ajusta al
// ancho y el recorte de arriba crece: para que las cumbres (desde y = 150, con la fumarola) no se corten, el
// contenedor debe medir de alto al menos 450 / 1840 ≈ 24,5 % de su ancho (lo asegura la portada, app/page.tsx). El
// cielo no se dibuja aquí: es el fondo de la portada. Todos los tonos salen de la paleta.
// Al cargar, cada capa sube a su lugar (las lejanas primero); con mouse, se desplazan un poco en profundidad
// (--hx/--hy de HeroParallax). Con movimiento reducido queda quieta.

const TONES = {
  "--sc-snow": "color-mix(in srgb, var(--color-card) 90%, var(--color-accent))",
  "--sc-snow-shade": "color-mix(in srgb, var(--color-card) 56%, var(--color-accent))",
  "--sc-back": "color-mix(in srgb, var(--color-accent) 24%, var(--color-surface))",
  "--sc-far": "color-mix(in srgb, var(--color-accent) 42%, var(--color-surface))",
  "--sc-hill-light": "color-mix(in srgb, var(--color-accent) 64%, var(--color-bg))",
  "--sc-hill": "color-mix(in srgb, var(--color-accent) 42%, var(--color-bg))",
  "--sc-hill-near": "color-mix(in srgb, var(--color-accent) 22%, var(--color-bg))",
  "--sc-pine-far": "color-mix(in srgb, var(--color-accent) 16%, var(--color-bg))",
  "--sc-pine": "color-mix(in srgb, var(--color-bg) 58%, var(--color-night))",
  "--sc-dark": "color-mix(in srgb, var(--color-bg) 30%, var(--color-night))",
} as CSSProperties;

// Cordillera lejana, más pálida, y la principal con el nevado (meseta entre x 690 y 850).
const BACK =
  "M-240 640V284L-170 250L-100 290L-40 300L40 268L120 290L210 236L300 280L380 262L470 300L560 262L650 290L760 250L860 286L960 240L1050 284L1150 252L1260 290L1340 246L1440 286L1480 280L1560 250L1640 288L1680 270V640Z";
const RANGE =
  "M-240 640V310L-190 270L-130 226L-80 276L-40 318L0 330L60 300L130 250L190 290L240 262L290 215L350 262L390 248L430 270L500 330L560 300L640 235L690 196Q720 182 750 186L800 184Q830 186 850 200L920 250L980 300L1040 280L1090 235L1140 268L1190 240L1250 200L1310 250L1350 238L1400 255L1440 280L1480 300L1530 262L1590 222L1640 268L1680 300V640Z";
// Caras en sombra (a la derecha de cada cumbre).
const RANGE_SHADE = ["M-130 226L-80 276L-50 320L-124 320Z", "M290 215L350 262L390 310L296 310Z", "M800 184Q830 186 850 200L920 250L980 300L1010 350L826 350Z", "M1250 200L1310 250L1356 310L1262 310Z", "M1590 222L1640 268L1670 320L1598 320Z"];
const SNOW = [
  "M-130 226L-98 258L-110 262L-122 252L-134 266L-148 254L-160 248Z",
  "M130 250L168 275L154 282L142 272L128 286L114 274L96 274Z",
  "M290 215L335 250L322 256L308 244L296 262L282 246L268 258L253 250Z",
  "M390 248L420 265L408 266L398 258L386 268L372 256Z",
  "M628 245L640 235L690 196Q720 182 750 186L800 184Q830 186 850 200L920 250L902 252L886 240L868 262L850 244L832 270L812 248L792 276L772 250L752 268L734 246L714 264L696 244L676 258L658 242L642 252Z",
  "M1090 235L1120 255L1108 258L1096 250L1084 262L1070 253Z",
  "M1250 200L1293 236L1280 240L1266 230L1252 248L1238 232L1222 244L1208 234L1196 236Z",
  "M1350 238L1372 246L1360 250L1350 244L1338 252L1326 246Z",
  "M1590 222L1622 251L1610 256L1598 246L1586 260L1572 248L1558 243Z",
];
const SNOW_SHADE = ["M290 215L335 250L322 256L308 244L300 232Z", "M800 184Q830 186 850 200L920 250L902 252L886 240L868 262L850 244L832 270L812 248L806 228Z", "M1250 200L1293 236L1280 240L1266 230L1258 218Z"];

const HILL =
  "M-240 640V398C-180 388-100 400-40 416L0 420C120 380 220 350 330 372C430 392 500 440 600 430C720 418 800 340 920 330C1040 320 1120 400 1240 410C1320 416 1390 390 1440 372L1480 366C1540 356 1600 366 1680 384V640Z";
// Pliegues de las colinas: las laderas que quedan en sombra.
const HILL_FOLDS = ["M330 372C400 384 470 420 540 436C460 440 380 452 300 480C310 440 320 400 330 372Z", "M920 330C990 326 1060 350 1130 390C1060 392 990 404 930 424C926 392 922 360 920 330Z"];
// La loma de la cabaña: su cima queda en (960, 394).
const HILL_NEAR =
  "M-240 640V492C-170 472-90 468-40 472L0 470C100 450 200 462 300 480C420 502 520 520 640 500C760 480 840 400 960 394C1080 388 1180 470 1280 490C1350 504 1400 500 1440 492L1480 488C1540 480 1600 486 1680 500V640Z";
const FRONT = "M-240 640V566C-160 548-80 540-40 544L0 540C140 500 300 520 460 548C600 572 760 580 900 560C1060 538 1240 520 1440 548L1480 552C1540 558 1600 552 1680 540V640Z";

// Pinos: [x, base, alto].
type Tree = [x: number, base: number, h: number];
const PINES_FAR: Tree[] = [
  [-150, 398, 40], [-122, 400, 30], [70, 404, 34], [92, 398, 46], [118, 392, 30], [210, 368, 38], [236, 364, 28], [430, 396, 36], [452, 402, 48], [476, 410, 32],
  [1120, 382, 40], [1146, 392, 54], [1172, 400, 34], [1300, 410, 36], [1326, 408, 48], [1352, 402, 30], [1556, 362, 44], [1586, 364, 32],
];
const PINES_NEAR: Tree[] = [
  [-176, 480, 86], [-138, 472, 60], [40, 460, 72], [78, 458, 100], [112, 460, 62], [300, 484, 58], [332, 490, 86], [362, 494, 54], [640, 504, 64], [672, 498, 92], [704, 488, 56], [782, 452, 44],
  [1166, 449, 60], [1200, 465, 94], [1236, 480, 66], [1400, 500, 86], [1432, 498, 60], [1540, 486, 92], [1580, 488, 64], [1620, 492, 78],
];
const PINES_FRONT: Tree[] = [[-160, 566, 220], [-92, 556, 150], [26, 552, 96], [1410, 552, 110], [1500, 560, 190], [1584, 564, 250]];
const trees = (list: Tree[]) => list.map(([x, base, h]) => pine(x, base, h)).join("");

// Cabaña de colores (centro de la base en 960, 428; toda la terraza se dibuja ahí, y se amplía y sube a la cima de la
// loma): paredes claras, techo de lámina, puerta, ventanas encendidas, pilares y baranda de palos pintados, como las de
// la finca.
const ROOF = "M900 405L960 379L1020 405Z";
const WINDOWS = [944, 978];
const PICKETS = Array.from({ length: 11 }, (_, i) => 966 + i * 3.6);
const PICKET_TONES = ["fill-accent", "fill-highlight", "fill-card", "fill-cta"];
const BULBS: [x: number, y: number][] = [[1013, 403], [1027, 405], [1040, 404], [1053, 399]];
const FIREFLIES: [x: number, y: number][] = [[-120, 530], [120, 522], [238, 548], [384, 562], [566, 556], [706, 572], [1178, 540], [1292, 560], [1362, 524], [1560, 536]];

// Cuánto se desplaza una capa al mover el mouse (las cercanas, más).
const depth = (x: number, y: number): CSSProperties => ({ translate: `calc(var(--hx, 0) * ${x}px) calc(var(--hy, 0) * ${y}px)`, transition: "translate 1s ease-out" });
const rise = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

// Fotos de la portada sobre el primer plano: la principal y las cuatro pequeñas, como copias impresas apenas torcidas.
const PHOTOS: { id: string; tilt: string }[] = [
  { id: "hero-main", tilt: "-rotate-2" },
  { id: "hero-thumb-1", tilt: "rotate-2" },
  { id: "hero-thumb-2", tilt: "-rotate-1" },
  { id: "hero-thumb-3", tilt: "rotate-3" },
  { id: "hero-thumb-4", tilt: "-rotate-2" },
];

export function HeroScene({ photos, className = "" }: { photos: Record<string, string>; className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ ...TONES, ...FAUNA_TONES }}>
      {/* En pantallas angostas la ilustración toma el alto del contenedor y se centra en x = 860 (57,6 % de su ancho),
          entre el nevado y la cabaña; desde md llena el contenedor centrada, recortando el cielo que sobre. */}
      <svg
        viewBox="-200 0 1840 600"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
        className="absolute bottom-0 left-1/2 h-full w-auto max-w-none min-w-full -translate-x-[57.6%] md:left-0 md:w-full md:translate-x-0"
      >
        <defs>
          <linearGradient id="sc-hill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--sc-hill-light)" }} />
            <stop offset="0.5" style={{ stopColor: "var(--sc-hill)" }} />
          </linearGradient>
          <linearGradient id="sc-mist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--color-card)", stopOpacity: 0 }} />
            <stop offset="0.55" style={{ stopColor: "var(--color-card)", stopOpacity: 0.2 }} />
            <stop offset="1" style={{ stopColor: "var(--color-card)", stopOpacity: 0 }} />
          </linearGradient>
          <radialGradient id="sc-glow">
            <stop offset="0" style={{ stopColor: "var(--color-highlight)", stopOpacity: 0.6 }} />
            <stop offset="1" style={{ stopColor: "var(--color-highlight)", stopOpacity: 0 }} />
          </radialGradient>
        </defs>

        {/* Cordilleras y nevado */}
        <g style={depth(5, 3)}>
          <g className="motion-safe:animate-land-rise" style={{ ...rise(80), animationDuration: "2s" }}>
            <path d={BACK} className="fill-(--sc-back)" opacity={0.75} />
            {/* Fumarola del Nevado del Ruiz */}
            <g className="fill-(--sc-snow)">
              {[0, 2.3, 4.6].map((d) => (
                <ellipse key={d} cx={748} cy={176} rx={11} ry={8} opacity={0} className="svg-pivot motion-safe:animate-steam" style={{ animationDelay: `${-d}s` }} />
              ))}
              <path d="M738 186q-6-12 6-16q2-12 16-9q12-4 15 8q11 6 3 15z" opacity={0.85} />
            </g>
            <path d={RANGE} className="fill-(--sc-far)" />
            {RANGE_SHADE.map((d) => (
              <path key={d} d={d} className="fill-bg" opacity={0.14} />
            ))}
            {SNOW.map((d) => (
              <path key={d} d={d} className="fill-(--sc-snow)" />
            ))}
            {SNOW_SHADE.map((d) => (
              <path key={d} d={d} className="fill-(--sc-snow-shade)" />
            ))}
          </g>
        </g>

        {/* Niebla entre la cordillera y las colinas */}
        <rect x={-420} y={296} width={2280} height={170} fill="url(#sc-mist)" className="motion-safe:animate-fog-drift" />

        {/* Colinas del fondo */}
        <g style={depth(10, 5)}>
          <g className="motion-safe:animate-land-rise" style={rise(220)}>
            <path d={HILL} fill="url(#sc-hill)" />
            {HILL_FOLDS.map((d) => (
              <path key={d} d={d} className="fill-(--sc-hill-near)" opacity={0.4} />
            ))}
            <path d={trees(PINES_FAR)} className="fill-(--sc-pine-far)" />
          </g>
        </g>

        {/* Loma de la cabaña */}
        <g style={depth(17, 8)}>
          <g className="motion-safe:animate-land-rise" style={rise(360)}>
            <circle cx={960} cy={374} r={128} fill="url(#sc-glow)" className="motion-safe:animate-glow" />
            <path d={HILL_NEAR} className="fill-(--sc-hill-near)" />
            <path d={trees(PINES_NEAR)} className="fill-(--sc-pine)" />

            {/* Terraza: la cabaña de colores con su baranda y las luces */}
            <g transform="translate(960 398) scale(1.22) translate(-960 -428)">
            <g className="fill-(--sc-dark) stroke-(--sc-dark)" strokeWidth={0}>
              <rect x={904} y={428} width={152} height={5} rx={2} />
              {[912, 960, 1006, 1044].map((x) => (
                <rect key={x} x={x} y={432} width={3} height={10} />
              ))}
              <path d="M1066 386V438" fill="none" strokeWidth={2} strokeLinecap="round" />
            </g>
            <rect x={912} y={403} width={96} height={25} className="fill-[color-mix(in_srgb,var(--color-card)_86%,var(--color-highlight))]" />
            <rect x={922} y={410} width={11} height={18} rx={1} className="fill-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-bg))]" />
            {WINDOWS.map((x) => (
              <g key={x}>
                <rect x={x} y={409} width={16} height={10} className="fill-[color-mix(in_srgb,var(--color-highlight)_45%,var(--color-card))]" />
                <path d={`M${x + 8} 409V419M${x} 414H${x + 16}`} fill="none" strokeWidth={1} className="stroke-(--sc-dark)" />
              </g>
            ))}
            <path d={ROOF} className="fill-highlight" />
            <path d="M900 405L960 379L1020 405" fill="none" strokeWidth={1.6} strokeLinejoin="round" className="stroke-[color-mix(in_srgb,var(--color-bg)_70%,var(--color-highlight))]" />
            <rect x={912} y={405} width={3} height={23} className="fill-accent" />
            <rect x={1005} y={405} width={3} height={23} className="fill-accent" />
            <rect x={964} y={417.4} width={44} height={1.6} className="fill-card" />
            {PICKETS.map((x, i) => (
              <rect key={x} x={x} y={419} width={1.8} height={9} className={PICKET_TONES[i % PICKET_TONES.length]} />
            ))}
            <path d="M1000 396Q1034 412 1066 390" fill="none" strokeWidth={1} className="stroke-(--sc-dark)" />
            {BULBS.map(([x, y], i) => (
              <circle key={x} cx={x} cy={y} r={2.2} className="fill-highlight motion-safe:animate-star" style={{ animationDelay: `${-i * 0.9}s` }} />
            ))}
            </g>

            {/* La Vaca Fifí, pastando en la ladera junto a la cabaña */}
            <HolsteinCow x={798} y={398} width={44} />

            {/* Fogata, en la ladera */}
            <g transform="translate(0 -15)">
            <circle cx={1096} cy={426} r={34} fill="url(#sc-glow)" className="motion-safe:animate-glow" style={{ animationDuration: "1.7s" }} />
            <ellipse cx={1096} cy={438} rx={11} ry={3.4} className="fill-(--sc-dark)" />
            <g className="motion-safe:animate-flicker" style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}>
              <path d="M1096 437C1087 428 1094 421 1093 412C1102 419 1106 428 1100 437Z" className="fill-highlight" />
              <path d="M1096 437C1092 431 1096 428 1096 423C1101 428 1102 433 1098 437Z" className="fill-card" />
            </g>
            </g>
          </g>
        </g>

        {/* Primer plano: se funde con el fondo de la página */}
        <g style={depth(26, 12)}>
          <g className="motion-safe:animate-land-rise" style={rise(480)}>
            <path d={trees(PINES_FRONT)} className="fill-(--sc-dark)" />
            <path d={FRONT} className="fill-bg" />
            {FIREFLIES.map(([x, y], i) => (
              <circle key={x} cx={x} cy={y} r={1.9} className="fill-highlight motion-safe:animate-star" style={{ animationDelay: `${-((i * 1.1) % 4.5)}s` }} />
            ))}
          </g>
        </g>
      </svg>

      <ul aria-label="Fotos de La Vaca Fifí" className="no-scrollbar absolute inset-x-0 bottom-0 z-1 flex snap-x items-end gap-3 overflow-x-auto px-4 pt-4 pb-[clamp(10px,2.2svh,22px)] sm:justify-center">
        {PHOTOS.map(({ id, tilt }, i) => (
          <li
            key={id}
            style={{ animationDelay: `${900 + i * 110}ms` }}
            className={`relative h-[clamp(74px,10.5svh,108px)] flex-none snap-center overflow-hidden rounded-xl bg-surface shadow-card ring-[3px] ring-card transition-transform duration-500 hover:z-1 hover:-translate-y-1.5 hover:rotate-0 motion-safe:animate-rise [&_img]:transition-transform [&_img]:duration-700 hover:[&_img]:scale-110 ${i === 0 ? "aspect-4/3" : "aspect-[1/1.1]"} ${tilt}`}
          >
            <PhotoSlot id={id} src={photos[id]} sizes={i === 0 ? "170px" : "130px"} eager zoom />
          </li>
        ))}
      </ul>
    </div>
  );
}
