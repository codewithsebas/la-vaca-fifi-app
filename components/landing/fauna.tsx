import type { CSSProperties, ReactNode, SVGProps } from "react";

// Fauna de Murillo y del Parque de los Nevados, ilustrada como siluetas del paisaje (el mismo trazo plano de las
// cordilleras) con las marcas que distinguen a cada especie: el collar blanco del cóndor, los «anteojos» del oso, la
// barba del colibrí chivito, la cresta roja de la cotinga… Cada animal es un SVG con su propio viewBox: se usa suelto
// en HTML (aves en el cielo) o anidado dentro de un paisaje con x, y y width (los que caminan sobre una loma).
// Los colores salen de las variables --fa-* (FAUNA_TONES, derivadas de la paleta); quien los usa las declara.
// Todo lo que se mueve va con motion-safe: con movimiento reducido cada animal queda quieto en su pose.

export const FAUNA_TONES = {
  "--fa-ink": "color-mix(in srgb, var(--color-bg) 26%, var(--color-night))",
  "--fa-ink-far": "color-mix(in srgb, var(--color-bg) 12%, var(--color-night))",
  "--fa-pale": "color-mix(in srgb, var(--color-card) 88%, var(--color-accent))",
  "--fa-gray": "color-mix(in srgb, var(--color-card) 34%, var(--color-bg))",
  "--fa-warm": "color-mix(in srgb, color-mix(in srgb, var(--color-highlight) 40%, #b0502a) 62%, var(--color-night))",
  "--fa-gold": "var(--color-highlight)",
  "--fa-red": "color-mix(in srgb, #d2452c 82%, var(--color-highlight))",
  // La vaca: blanca con manchas negras, hocico rosado y cuernos del dorado de la paleta.
  "--fa-cow": "color-mix(in srgb, var(--color-card) 94%, #ffffff)",
  "--fa-cow-shade": "color-mix(in srgb, var(--color-card) 70%, var(--color-bg))",
  "--fa-pink": "color-mix(in srgb, #f0a69a 86%, var(--color-card))",
  "--fa-horn": "color-mix(in srgb, var(--color-accent) 88%, var(--color-card))",
} as CSSProperties;

type FaunaProps = SVGProps<SVGSVGElement>;

// Pivote de una parte del cuerpo en su propia caja (patas, alas, cabeza…): `origin` en % de esa caja.
const pivot = (origin: string, extra?: CSSProperties): CSSProperties => ({ transformBox: "fill-box", transformOrigin: origin, ...extra });
// Desfase de una animación (para que las patas alternen o dos animales no vayan sincronizados).
const lag = (s: number, extra?: CSSProperties): CSSProperties => ({ animationDelay: `${-s}s`, ...extra });

// Con un ancho numérico (dentro de un paisaje) el alto sale de la proporción del viewBox.
function Figure({ viewBox, label, children, width, height, ...rest }: FaunaProps & { viewBox: string; label: string; children: ReactNode }) {
  const [, , w, h] = viewBox.split(" ").map(Number);
  return (
    <svg viewBox={viewBox} overflow="visible" width={width} height={height ?? (typeof width === "number" ? (width * h) / w : undefined)} {...rest}>
      <title>{label}</title>
      {children}
    </svg>
  );
}

// ——— Aves que planean (vistas de frente, alas abiertas). El ala derecha se dibuja una vez y se refleja. ———

// Cóndor de los Andes: alas largas y rectas con siete «dedos» abiertos, banda plateada en las secundarias y el collar
// blanco. Planea sin aletear: se inclina despacio y las alas se flexionan apenas.
const CONDOR_WING =
  "M126 33C148 27 176 25 198 26L226 14L206 28L233 21L209 32L237 28L210 36L238 35L209 40L236 42L207 44L232 49L203 48L224 55L196 51C186 54 176 56 166 56L160 59L154 56L148 59L142 56L136 58L126 52Z";
const CONDOR_BAND = "M134 48C152 47 176 46.6 194 46L197 50C184 53 170 54 160 54L154 56L148 54L142 55L136 54Z";

export function Condor(props: FaunaProps) {
  const wing = (
    <g className="motion-safe:animate-wing-flex" style={pivot("0% 60%")}>
      <path d={CONDOR_WING} className="fill-(--fa-ink)" />
      <path d={CONDOR_BAND} className="fill-(--fa-pale)" opacity={0.78} />
    </g>
  );
  return (
    <Figure viewBox="0 0 240 72" label="Cóndor de los Andes (Vultur gryphus)" {...props}>
      <g className="motion-safe:animate-bank" style={pivot("50% 50%")}>
        {wing}
        <g transform="translate(240 0) scale(-1 1)">{wing}</g>
        <path d="M114 56L111 66L120 70L129 66L126 56Z" className="fill-(--fa-ink)" />
        <path d="M113 37C113 30 127 30 127 37L126 54C125 60 115 60 114 54Z" className="fill-(--fa-ink)" />
        <ellipse cx={120} cy={31.5} rx={7.6} ry={3.6} className="fill-(--fa-pale)" />
        <circle cx={120} cy={25.5} r={4.4} className="fill-(--fa-ink)" />
        <path d="M118.6 28.6L120 32L121.4 28.6Z" className="fill-(--fa-warm)" />
      </g>
    </Figure>
  );
}

// Águila real de montaña (Spizaetus isidori): alas anchas de puntas redondeadas, cola larga con banda clara, cresta
// en punta y el pecho castaño.
const ISIDORI_WING =
  "M90 34C108 28 128 26 145 28L159 23L150 31L164 30L152 35L166 37L151 39L162 43L148 43L156 48L141 46C126 52 108 52 92 46Z";
const ISIDORI_COVERTS = "M92 36C108 31 122 30 134 31L133 38C120 39 106 40 92 42Z";

export function MountainEagle(props: FaunaProps) {
  const wing = (
    <g className="motion-safe:animate-wing-flex" style={pivot("0% 60%", { animationDuration: "3.4s" })}>
      <path d={ISIDORI_WING} className="fill-(--fa-ink)" />
      <path d={ISIDORI_COVERTS} className="fill-(--fa-warm)" />
      <ellipse cx={145} cy={37} rx={4.5} ry={5.5} className="fill-(--fa-pale)" opacity={0.42} />
    </g>
  );
  return (
    <Figure viewBox="0 0 170 76" label="Águila real de montaña (Spizaetus isidori)" {...props}>
      <g className="motion-safe:animate-bank" style={pivot("50% 50%", { animationDuration: "5.5s" })}>
        {wing}
        <g transform="translate(170 0) scale(-1 1)">{wing}</g>
        <path d="M80.5 47L77 71H93L89.5 47Z" className="fill-(--fa-ink)" />
        <rect x={78.4} y={57} width={13.2} height={3.4} className="fill-(--fa-pale)" opacity={0.5} />
        <path d="M80 30C80 24 90 24 90 30L89 48C88 52 82 52 81 48Z" className="fill-(--fa-ink)" />
        <ellipse cx={85} cy={41} rx={3.6} ry={6} className="fill-(--fa-warm)" />
        <path d="M83 21L85.4 10.5L87.4 21Z" className="fill-(--fa-ink)" />
        <circle cx={85} cy={23.5} r={4.3} className="fill-(--fa-ink)" />
      </g>
    </Figure>
  );
}

// Águila de cola blanca (Geranoaetus melanoleucus): alas muy anchas con el borde de atrás abombado y la cola corta en
// cuña; por debajo, el pecho negro y el vientre, las coberteras y la cola blancos.
const BUZZARD_WING = "M90 30C110 24 132 22 148 24L162 22L151 28L165 29L152 33L163 36L150 37L158 42L144 41C130 50 112 54 92 46Z";
const BUZZARD_COVERTS = "M92 32C110 27 127 26 141 27L139 34C124 37 108 38 92 40Z";

export function WhiteTailedEagle(props: FaunaProps) {
  const wing = (
    <g className="motion-safe:animate-wing-flex" style={pivot("0% 60%", { animationDuration: "4.2s" })}>
      <path d={BUZZARD_WING} className="fill-(--fa-ink)" />
      <path d={BUZZARD_COVERTS} className="fill-(--fa-pale)" opacity={0.9} />
    </g>
  );
  return (
    <Figure viewBox="0 0 170 62" label="Águila de cola blanca (Geranoaetus melanoleucus)" {...props}>
      <g className="motion-safe:animate-bank" style={pivot("50% 50%", { animationDuration: "6.5s" })}>
        {wing}
        <g transform="translate(170 0) scale(-1 1)">{wing}</g>
        <path d="M81 45L76 56L85 59.5L94 56L89 45Z" className="fill-(--fa-pale)" />
        <path d="M76.6 54.6L85 57.6L93.4 54.6L94 56L85 59.5L76 56Z" className="fill-(--fa-ink)" />
        <path d="M80 28C80 22 90 22 90 28L89 44C88 49 82 49 81 44Z" className="fill-(--fa-ink)" />
        <ellipse cx={85} cy={42} rx={3.6} ry={4.6} className="fill-(--fa-pale)" />
        <circle cx={85} cy={22} r={4.1} className="fill-(--fa-ink)" />
      </g>
    </Figure>
  );
}

// ——— Aves pequeñas ———

// Colibrí chivito de páramo (Oxypogon stuebelii), el ave emblema de Murillo: pico corto, la cresta larga en punta y la
// barba blanca que le da el nombre. Se sostiene en el aire batiendo las alas y va de una flor a otra.
export function Hummingbird(props: FaunaProps) {
  return (
    <Figure viewBox="0 0 64 56" label="Colibrí chivito de páramo, ave emblema de Murillo" {...props}>
      <g className="motion-safe:animate-hover-dart">
        <g className="motion-safe:animate-hover-bob">
          {/* Ala de atrás, borrosa, y la de adelante, que bate. */}
          <path d="M33 24Q30 12 21 5Q24 16 31 27Z" className="fill-(--fa-ink)" opacity={0.35} />
          <path d="M27 38L19 50L22 51L25.4 45L24.4 52L27.6 51L30.4 39Z" className="fill-(--fa-ink)" />
          <path d="M36 19.6C32 22 26 28 24.4 33.6C23.4 37.6 26.4 40 29.4 37.8C34.4 34 40 28 42.4 22.4Z" className="fill-(--fa-ink)" />
          <path d="M37.4 14Q31 8.4 24.6 4.4Q30.6 10 38.6 15.8Z" className="fill-(--fa-ink)" />
          <circle cx={40} cy={18} r={5.2} className="fill-(--fa-ink)" />
          <path d="M44.4 16.4L51.6 14.6L51.9 15.6L44.8 18.4Z" className="fill-(--fa-ink)" />
          <path d="M40.6 21.6Q43.2 27.6 41.2 33.4Q38.8 28 38.4 22.4Z" className="fill-(--fa-pale)" />
          <circle cx={41.6} cy={16.8} r={0.9} className="fill-(--fa-pale)" />
          <g className="motion-safe:animate-hummer-wing" style={pivot("92% 96%")}>
            <path d="M33.4 24.2Q27 9 15.6 3.6Q21 17 31.2 27.4Z" className="fill-(--fa-ink)" />
          </g>
        </g>
      </g>
    </Figure>
  );
}

// Cotinga crestirroja (Ampelion rubrocristatus): gris, posada muy erguida en la punta de un árbol, con la banda blanca
// bajo la cola. De vez en cuando levanta la cresta roja, se voltea y mueve la cola.
export function Cotinga(props: FaunaProps) {
  return (
    <Figure viewBox="0 0 30 44" label="Cotinga crestirroja (Ampelion rubrocristatus)" {...props}>
      <g className="motion-safe:animate-perch-turn" style={pivot("50% 100%")}>
        <g className="motion-safe:animate-tail-flick" style={pivot("80% 0%")}>
          <path d="M12 27L8 38L12.6 38.6L16 28Z" className="fill-(--fa-ink)" />
          <path d="M8.7 35.6L13.4 36.2L13 37.6L8.2 37Z" className="fill-(--fa-pale)" />
        </g>
        <path d="M11 14C8 18 8 25 12 29C14 30.6 18 30.6 19.6 28C21 23 21 17 19 13Z" className="fill-(--fa-gray)" />
        <path d="M12.6 15.6C11 20 11.6 25 13.6 29L16.6 27.4C15.6 22 15.8 18 15 15Z" className="fill-(--fa-ink)" opacity={0.8} />
        <g className="motion-safe:animate-crest" style={pivot("40% 100%")}>
          <path d="M12.6 8Q12.2 2.2 17.8 3.2Q15.6 4.8 16.2 7.4Z" className="fill-(--fa-red)" />
        </g>
        <circle cx={16.4} cy={10.4} r={4.4} className="fill-(--fa-ink)" />
        <path d="M20.4 9.4L24 10.6L20.4 11.8Z" className="fill-(--fa-pale)" />
        <circle cx={18} cy={9.8} r={0.9} className="fill-(--fa-red)" />
        <path d="M14.4 29.6V31.6M17.2 29.4V31.6" className="stroke-(--fa-ink)" strokeWidth={1} />
      </g>
    </Figure>
  );
}

// Candelita adornada (Myioborus ornatus): pequeña, amarilla por debajo y en la frente, gris por encima, con la cola
// negra de bordes blancos que abre y cierra sin parar mientras salta de rama en rama.
export function Redstart(props: FaunaProps) {
  return (
    <Figure viewBox="0 0 40 28" label="Candelita adornada (Myioborus ornatus)" {...props}>
      <g className="motion-safe:animate-hop-along">
        <g className="motion-safe:animate-hop">
          <g className="motion-safe:animate-tail-fan" style={pivot("100% 50%")}>
            <path d="M12 12.8L3.4 10.6L3.8 16.6L12 15.8Z" className="fill-(--fa-ink)" />
            <path d="M3.4 10.6L7.4 11.6M3.8 16.6L7.6 15.8" className="stroke-(--fa-pale)" strokeWidth={1.1} strokeLinecap="round" />
          </g>
          <path d="M10 14.4C10 9 18 7 24 9C28 10 30 13 29 16C27 20 18 21 13 19Z" className="fill-(--fa-gold)" />
          <path d="M10 14.4C11 9.4 18 7 24 9C26.6 9.8 28.4 11.4 28.8 13C24 13 16 13.2 10 15.4Z" className="fill-(--fa-gray)" />
          <path d="M14 12.4C17 11.4 22 12 24.4 13.2C21.4 16 17 16.8 14 16Z" className="fill-(--fa-ink)" opacity={0.85} />
          <circle cx={28.4} cy={10.4} r={4} className="fill-(--fa-gold)" />
          <path d="M25 9.2C26 6.6 29 6 31 7.4C29.4 7.6 27.6 8.4 26.6 10.4Z" className="fill-(--fa-gray)" />
          <circle cx={29.8} cy={9.8} r={0.85} className="fill-(--fa-ink)" />
          <path d="M31.8 9.8L34.6 10.6L31.8 11.6Z" className="fill-(--fa-ink)" />
          <path d="M19 19.4L18 24M22.4 19.4L23.4 24" className="stroke-(--fa-ink)" strokeWidth={1} strokeLinecap="round" />
        </g>
      </g>
    </Figure>
  );
}

// ——— Mamíferos (de perfil, mirando a la derecha; las patas pivotan en la cadera y en el hombro) ———

type LegsProps = { near: [string, string]; far: [string, string]; step: number };

// Cuatro patas que caminan: la delantera cercana va con la trasera lejana, y la delantera lejana con la trasera
// cercana. `step` es lo que dura medio paso.
function Legs({ legs, step, layer }: { legs: LegsProps; step: number; layer: "near" | "far" }) {
  const [front, hind] = legs[layer];
  const fill = layer === "far" ? "fill-(--fa-ink-far)" : "fill-(--fa-ink)";
  const phase = layer === "near" ? 0 : step;
  return (
    <>
      <g className="motion-safe:animate-leg-swing" style={pivot("50% 6%", lag(phase, { animationDuration: `${step}s` }))}>
        <path d={front} className={fill} />
      </g>
      <g className="motion-safe:animate-leg-swing" style={pivot("50% 6%", lag(phase + step, { animationDuration: `${step}s` }))}>
        <path d={hind} className={fill} />
      </g>
    </>
  );
}

// Oso de anteojos u oso andino (Tremarctos ornatus): negro, robusto y sin joroba, con el hocico claro y las marcas
// crema alrededor de los ojos que bajan por la garganta hasta el pecho. Camina despacio, cabeceando.
const BEAR_LEGS: LegsProps = {
  near: ["M78 44H88L89 66C89 70 87 72 84 72H80C78 72 77 70 77 68Z", "M22 42C26 40 34 40 36 44L35 66C35 70 33 72 30 72H26C24 72 23 70 23 68Z"],
  far: ["M70 44H80L81 66C81 70 79 72 76 72H72C70 72 69 70 69 68Z", "M30 42C34 40 42 40 44 44L43 66C43 70 41 72 38 72H34C32 72 31 70 31 68Z"],
  step: 0.55,
};

export function SpectacledBear(props: FaunaProps) {
  const step = BEAR_LEGS.step;
  return (
    <Figure viewBox="0 0 124 76" label="Oso de anteojos (Tremarctos ornatus)" {...props}>
      <Legs legs={BEAR_LEGS} step={step} layer="far" />
        <g className="motion-safe:animate-body-bob" style={{ animationDuration: `${step}s` }}>
          <circle cx={13} cy={35} r={3} className="fill-(--fa-ink)" />
          <path d="M14 44C10 34 16 22 30 20C46 17 66 17 80 20C88 22 92 28 92 36L90 50C80 54 40 54 22 52C17 51 15 48 14 44Z" className="fill-(--fa-ink)" />
          <path d="M90 40Q94 46 92 52Q88.6 48 86 42Z" className="fill-(--fa-pale)" opacity={0.85} />
          <g className="motion-safe:animate-head-nod" style={pivot("10% 70%", { animationDuration: `${step * 2}s` })}>
            <circle cx={92} cy={18.6} r={4.4} className="fill-(--fa-ink)" />
            <circle cx={101} cy={17} r={4} className="fill-(--fa-ink)" />
            <path d="M84 26C88 18 100 16 108 22C112 25 116 28 119 31C121 33 120 36 117 37L110 39C104 42 94 42 88 38Z" className="fill-(--fa-ink)" />
            <path d="M108 29C112 30 116 31 118 33C118 35 116 36 113 36.5L108 37C106 34 106 31 108 29Z" className="fill-(--fa-pale)" opacity={0.92} />
            <path d="M99.6 24.6Q104 20 109.4 24Q105 23.2 102 27.2Z" className="fill-(--fa-pale)" opacity={0.9} />
            <path d="M103 31Q101 36.4 96 42Q99.4 43 104 39Q106 35 106.2 31Z" className="fill-(--fa-pale)" opacity={0.9} />
            <circle cx={104.2} cy={27.6} r={1.25} className="fill-(--fa-pale)" />
            <circle cx={119.2} cy={32.4} r={1.9} className="fill-(--fa-ink)" />
          </g>
        </g>
      <Legs legs={BEAR_LEGS} step={step} layer="near" />
    </Figure>
  );
}

// Tapir andino o de montaña (Tapirus pinchaque): lanudo y oscuro, de lomo redondeado, con la trompa corta que no deja
// de moverse, el borde blanco de los labios y las orejas de punta blanca.
const TAPIR_LEGS: LegsProps = {
  near: ["M84 44H92L92 64C92 66 91 68 89 68H86C84 68 83 66 83 64Z", "M18 42C22 40 30 40 32 44L31 64C31 66 30 68 28 68H24C22 68 21 66 21 64Z"],
  far: ["M77 44H85L85 64C85 66 84 68 82 68H79C77 68 76 66 76 64Z", "M26 42C30 40 38 40 40 44L39 64C39 66 38 68 36 68H32C30 68 29 66 29 64Z"],
  step: 0.6,
};

export function MountainTapir(props: FaunaProps) {
  const step = TAPIR_LEGS.step;
  return (
    <Figure viewBox="0 0 132 72" label="Tapir andino (Tapirus pinchaque)" {...props}>
      <Legs legs={TAPIR_LEGS} step={step} layer="far" />
      <g className="motion-safe:animate-body-bob" style={{ animationDuration: `${step}s` }}>
        <circle cx={10.6} cy={30} r={2.6} className="fill-(--fa-ink)" />
        <path d="M10 36C8 22 22 14 40 14C60 14 78 18 90 24C96 27 98 32 98 38L96 48C80 52 40 52 22 50C14 48 10 43 10 36Z" className="fill-(--fa-ink)" />
        <g className="motion-safe:animate-ear-flick" style={pivot("50% 100%")}>
          <ellipse cx={96} cy={19} rx={3.4} ry={5.4} transform="rotate(-18 96 19)" className="fill-(--fa-ink) stroke-(--fa-pale)" strokeWidth={1.1} />
        </g>
        <path d="M90 24C98 22 108 24 114 30C117 33 118 36 117 39L112 42C104 44 96 42 92 38Z" className="fill-(--fa-ink)" />
        <g className="motion-safe:animate-trunk" style={pivot("0% 30%")}>
          <path d="M112.6 30C118 30 122 33 124 37C125 40 123 42 121 41C120 38 117 36 113 37Z" className="fill-(--fa-ink)" />
        </g>
        <path d="M107.6 40.2C111 42 114 42 117 40L117.2 41.6C114 43.6 110.4 43.6 107.2 41.8Z" className="fill-(--fa-pale)" />
        <circle cx={106} cy={30} r={1.1} className="fill-(--fa-pale)" opacity={0.8} />
      </g>
      <Legs legs={TAPIR_LEGS} step={step} layer="near" />
    </Figure>
  );
}

// Venado rojo andino (Mazama rufina): pequeño y rojizo, de lomo arqueado, patas oscuras, orejas grandes y cuernos
// cortos en punta. Mira a la izquierda: pasta, levanta la cabeza alerta, mueve las orejas y la cola.
export function AndeanDeer(props: FaunaProps) {
  return (
    <Figure viewBox="0 0 96 74" label="Venado rojo andino (Mazama rufina)" {...props}>
      <path d="M37 46H41L41.4 68L42.4 72H38.2L37.4 68Z" className="fill-(--fa-ink-far)" />
      <path d="M63 44C66 46 66 52 64.8 57L65.6 68L66.6 72H62.6L61.8 67C61.2 60 59.8 54 59.8 48Z" className="fill-(--fa-ink-far)" />
      <g className="motion-safe:animate-tail-flick" style={pivot("0% 50%", { animationDuration: "3.2s" })}>
        <path d="M80 31L86.4 29.4L84.4 36Z" className="fill-(--fa-pale)" />
      </g>
      <path d="M26 36C30 28 50 24 66 26C76 27 82 32 82 40C82 46 78 50 70 50H36C30 50 25 44 26 36Z" className="fill-(--fa-warm)" />
      <path d="M30.4 46H34.6L34.6 68L35.6 72H31.2L30.6 68Z" className="fill-(--fa-ink)" />
      <path d="M70 44C74 46 74 52 72.4 57L73 68L74 72H70L69.2 67C68.4 60 66.6 54 66.6 48Z" className="fill-(--fa-ink)" />
      <g className="motion-safe:animate-graze" style={pivot("88% 94%")}>
        <path d="M26 42C23 34 19 27 16 21L27 15.5C30 22 35 28 41 32Z" className="fill-(--fa-warm)" />
        <path d="M20.4 10.4L19.4 3L21.6 3.4L22.4 10.4Z" className="fill-(--fa-ink)" />
        <g className="motion-safe:animate-ear-flick" style={pivot("20% 100%", { animationDuration: "4.6s" })}>
          <path d="M22.4 13C23.4 6 27.4 3 30.4 5C29.4 9 26.4 12 24.4 14Z" className="fill-(--fa-warm)" />
        </g>
        <path d="M18.8 12.4C18 6.4 20 2.4 23 3.2C23.2 7 22.4 10 21.4 13Z" className="fill-(--fa-warm)" />
        <path d="M12 12.6C16 9 24 9.6 28 14.4C28 19.4 24 21.4 20 21.4L9 23.4C5.6 23.4 4.6 21 6 18.8Z" className="fill-(--fa-warm)" />
        <path d="M9 23.4C5.6 23.4 4.6 21 6 18.8L10.4 16.2C11.4 18.6 11.8 20.8 11.4 22.8Z" className="fill-(--fa-ink)" />
        <circle cx={15.8} cy={15.6} r={1.1} className="fill-(--fa-ink)" />
      </g>
    </Figure>
  );
}

// La Vaca Fifí: vaca Holstein, blanca con manchas negras, hocico rosado, cuernos cortos y una flor junto a la oreja (la
// del logo). Mira a la izquierda: pasta, levanta la cabeza, mueve las orejas y la cola.
export function HolsteinCow(props: FaunaProps) {
  return (
    <Figure viewBox="0 0 104 72" label="La Vaca Fifí, vaca Holstein de la finca" {...props}>
      <path d="M36 46H41L41 66L42 70H36.5L36 66ZM78 46H83L83 66L84 70H78.5L78 66Z" className="fill-(--fa-cow-shade)" />
      <g className="motion-safe:animate-tail-flick" style={pivot("0% 4%", { animationDuration: "3.6s" })}>
        <path d="M91 28C95 32 96 42 95 50" fill="none" strokeWidth={1.6} strokeLinecap="round" className="stroke-(--fa-cow)" />
        <path d="M93 49C96 49 97 53 95 56C93 54 92 52 93 49Z" className="fill-(--fa-ink)" />
      </g>
      <path d="M30 30C32 23 44 20 60 20C76 20 87 22 92 27C96 31 96 40 93 45C90 50 84 51 76 51H38C31 51 27 44 30 30Z" className="fill-(--fa-cow)" />
      <path d="M44 21C52 19 61 22 62 28C63 35 55 38 48 36C42 34 40 27 44 21ZM74 23C82 22 90 26 90 33C88 39 80 39 76 35C72 31 71 26 74 23ZM56 42C62 40 70 42 70 47L69 51H56C53 48 53 44 56 42Z" className="fill-(--fa-ink)" />
      <path d="M62 50C63 54 70 54 71 50Z" className="fill-(--fa-pink)" />
      <path d="M33 46H38L38.4 66H33ZM84 44H89.5L89 66H84.4Z" className="fill-(--fa-cow)" />
      <path d="M32.6 66H38.6L39 70H32.4ZM84 66H89.2L89.6 70H83.6Z" className="fill-(--fa-ink)" />
      <g className="motion-safe:animate-graze" style={pivot("88% 94%", { animationDuration: "15s" })}>
        <path d="M34 38C28 36 24 32 21 27L12 24C7 23 5 20 7 16C9 12 15 11 21 13L25 14C30 16 34 22 36 28Z" className="fill-(--fa-cow)" />
        <path d="M15 13C19 11 24 13 25 16C23 19 18 19 15 17Z" className="fill-(--fa-ink)" />
        <path d="M19 12.6L17.4 7.6L20.4 8.6L21.4 12.6Z" className="fill-(--fa-horn)" />
        <g className="motion-safe:animate-ear-flick" style={pivot("10% 50%", { animationDuration: "5.8s" })}>
          <path d="M23 14.5C27 12.2 31 12.6 32.4 14.6C29.6 17 26 17.4 23 16.6Z" className="fill-(--fa-cow)" />
        </g>
        <ellipse cx={8.5} cy={19.5} rx={4.2} ry={3.8} className="fill-(--fa-pink)" />
        <circle cx={6.8} cy={19} r={0.7} className="fill-(--fa-ink)" />
        <circle cx={16.4} cy={16.2} r={1} className="fill-(--fa-ink)" />
        <g className="fill-(--fa-red)">
          <circle cx={24.6} cy={9.4} r={1.6} />
          <circle cx={26.2} cy={10.6} r={1.6} />
          <circle cx={25.6} cy={12.5} r={1.6} />
          <circle cx={23.6} cy={12.5} r={1.6} />
          <circle cx={23} cy={10.6} r={1.6} />
        </g>
        <circle cx={24.6} cy={11.2} r={1} className="fill-(--fa-horn)" />
      </g>
    </Figure>
  );
}

// Las especies, para los textos que las nombran (pie de página).
export const FAUNA = [
  "La Vaca Fifí",
  "Oso de anteojos",
  "Venado rojo andino",
  "Tapir andino",
  "Colibrí chivito de páramo",
  "Águila real de montaña",
  "Águila de cola blanca",
  "Cotinga crestirroja",
  "Candelita adornada",
  "Cóndor de los Andes",
];
