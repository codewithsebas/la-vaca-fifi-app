import type { CSSProperties } from "react";
import { FIFI, FIFI_BEANS, FIFI_COLORS as C, FIFI_EYES, FIFI_VIEWBOX } from "./fifi-paths";

// Fifí, la vaca del letrero del restaurante, dibujada en trazo de caricatura (contorno oscuro y colores planos). Con
// `cup`, la taza de café humeante a su lado. Se mueve sola: parpadea, se relame, el arete se mece y los granos saltan;
// con movimiento reducido queda quieta. Decorativa salvo que llegue `title`.

const pivot = (origin: string, extra?: CSSProperties): CSSProperties => ({ transformBox: "fill-box", transformOrigin: origin, ...extra });

export function Fifi({ cup = false, title, className = "" }: { cup?: boolean; title?: string; className?: string }) {
  return (
    <svg
      viewBox={cup ? FIFI_VIEWBOX.cup : FIFI_VIEWBOX.head}
      className={`block h-auto w-full overflow-visible ${className}`}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <g stroke={C.ink} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round">
        <path d={FIFI.earRight} fill={C.earRight} />
        <path d={FIFI.earRightInner} fill={C.earRightInner} stroke="none" />
        <path d={FIFI.hornLeft} fill={C.horn} />
        <path d={FIFI.hornRight} fill={C.horn} />
        <path d={FIFI.earLeft} fill={C.earLeft} />
        <path d={FIFI.head} fill={C.white} />
        <path d={FIFI.patch} fill={C.patch} stroke="none" />

        {/* Ojos: parpadean juntos cada tanto. */}
        <g className="motion-safe:animate-fifi-blink" style={pivot("50% 50%")}>
          {FIFI_EYES.map(({ white, iris, pupil, shine }, i) => (
            <g key={i}>
              <ellipse cx={white[0]} cy={white[1]} rx={white[2]} ry={white[3]} fill={C.white} />
              <circle cx={iris[0]} cy={iris[1]} r={iris[2]} fill={C.iris} strokeWidth={3} />
              <circle cx={pupil[0]} cy={pupil[1]} r={pupil[2]} fill={C.ink} stroke="none" />
              <circle cx={shine[0]} cy={shine[1]} r={shine[2]} fill={C.white} stroke="none" />
            </g>
          ))}
        </g>
        <path d={FIFI.lashes} fill="none" strokeWidth={4} />

        <path d={FIFI.muzzle} fill={C.muzzle} />
        <ellipse cx={100} cy={244} rx={21} ry={12} transform="rotate(-8 100 244)" fill={C.nostril} stroke="none" />
        <path d={FIFI.mouth} fill="none" strokeWidth={4} />

        {/* La lengua: se relame desde la comisura. */}
        <g className="motion-safe:animate-fifi-lick" style={pivot("4% 96%")}>
          <path d={FIFI.tongue} fill={C.tongue} />
          <path d={FIFI.tongueGroove} fill="none" stroke={C.tongueGroove} strokeWidth={4} />
          <path d={FIFI.tongueShine} fill="none" stroke={C.tongueShine} strokeWidth={5} />
        </g>

        {/* El arete de Murillo, colgado de la oreja: se mece desde el agujero. */}
        <path d={FIFI.tagString} fill="none" strokeWidth={3} />
        <g className="motion-safe:animate-fifi-tag" style={pivot("50% 6%")}>
          <path d={FIFI.tag} fill={C.tag} />
          <circle cx={46} cy={174} r={4} fill={C.white} strokeWidth={3} />
          <text
            x={46}
            y={202}
            textAnchor="middle"
            fill={C.ink}
            stroke="none"
            fontSize={10.5}
            letterSpacing={0.3}
            style={{ fontFamily: "var(--font-display), 'Arial Black', sans-serif" }}
          >
            MURILLO
          </text>
        </g>

        {cup && (
          <>
            <path d={FIFI.cup} fill={C.white} />
            <path d={FIFI.cupHandle} fill="none" strokeWidth={6} />
            <ellipse cx={356} cy={214} rx={40} ry={9} fill={C.coffee} />
            <path d={FIFI.coffeeSplash} fill={C.coffee} />
            {FIFI_BEANS.map(([x, y, r], i) => (
              <g key={x} className="motion-safe:animate-fifi-bean" style={pivot("50% 50%", { animationDelay: `${-i * 0.9}s` })}>
                <g transform={`translate(${x} ${y}) rotate(${r})`}>
                  <ellipse rx={13} ry={9} fill={C.bean} />
                  <path d={FIFI.beanGroove} fill="none" strokeWidth={3} />
                </g>
              </g>
            ))}
          </>
        )}
      </g>
    </svg>
  );
}

// La taza de Fifí sola, con sus granos saltando: para la sección del restaurante.
export function CoffeeCup({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="300 118 134 192" aria-hidden="true" className={`block h-auto w-full overflow-visible ${className}`}>
      <g stroke={C.ink} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round">
        <path d={FIFI.cup} fill={C.white} />
        <path d={FIFI.cupHandle} fill="none" strokeWidth={6} />
        <ellipse cx={356} cy={214} rx={40} ry={9} fill={C.coffee} />
        <path d={FIFI.coffeeSplash} fill={C.coffee} />
        {FIFI_BEANS.map(([x, y, r], i) => (
          <g key={x} className="motion-safe:animate-fifi-bean" style={pivot("50% 50%", { animationDelay: `${-i * 0.9}s` })}>
            <g transform={`translate(${x} ${y}) rotate(${r})`}>
              <ellipse rx={13} ry={9} fill={C.bean} />
              <path d={FIFI.beanGroove} fill="none" strokeWidth={3} />
            </g>
          </g>
        ))}
      </g>
    </svg>
  );
}
