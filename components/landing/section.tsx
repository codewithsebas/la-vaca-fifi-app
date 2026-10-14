import type { ReactNode } from "react";
import { NightSky, Stars } from "./night-sky";
import { Ridge, type RidgeKind } from "./ridge";

// Sistema de secciones de la página de inicio: mismo espaciado y ancho, y un encabezado común. Cada sección tiene
// profundidad: una luz suave que cae desde arriba (de un lado o del otro, alternando) y, al pie, su tramo de paisaje en
// capas (components/landing/ridge.tsx) que la separa de la siguiente. Casi todas van sobre el fondo de la página; una
// se aparta con el «Fondo profundo» del panel (tone="deep"), y el paisaje de la sección anterior ya sube en ese color.
// Lo que necesita destacarse dentro de una sección lo hace con paneles redondeados.

export type SectionTone = "base" | "deep";

const TONE_BG: Record<SectionTone, string> = { base: "var(--color-bg)", deep: "var(--color-deep)" };

type SectionProps = {
  id?: string;
  labelledBy?: string;
  className?: string; // composición propia del contenido (flex, grid…)
  tone?: SectionTone; // color de fondo, de la paleta del panel
  ridge?: RidgeKind; // paisaje al pie de la sección
  next?: SectionTone; // fondo de la sección siguiente (el color de la capa cercana del paisaje)
  light?: "left" | "right"; // de qué lado cae la luz (y el resplandor del paisaje)
  starry?: boolean; // cielo con estrellas que titilan en la parte de arriba
  night?: boolean; // cielo nocturno en toda la sección (Vía Láctea, estrellas, constelaciones)
  screens?: boolean; // el contenido va en pantallas completas (min-h-svh) con su propio aire: sin margen arriba
  children: ReactNode;
};

export function Section({ id, labelledBy, className = "", tone = "base", ridge, next = "base", light = "left", starry = false, night = false, screens = false, children }: SectionProps) {
  return (
    // Cada sección pinta su fondo: el paisaje de la anterior asoma unos píxeles por debajo y queda tapado (sin línea de
    // corte entre las dos, aunque el borde caiga a mitad de un píxel).
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`relative isolate scroll-mt-6 text-on-dark ${screens ? "" : "pt-[clamp(52px,7vw,108px)]"} ${ridge ? "pb-[clamp(116px,15vw,250px)]" : "pb-[clamp(52px,7vw,108px)]"}`}
      style={{ background: TONE_BG[tone] }}
    >
      {night && <NightSky className="-z-1" />}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-1 h-[min(80%,760px)] [mask-image:linear-gradient(to_bottom,transparent,black_30%)]"
        style={{ background: `radial-gradient(50% 70% at ${light === "left" ? "18%" : "82%"} 22%, color-mix(in srgb, var(--color-accent) 11%, transparent), transparent 72%)` }}
      />
      {starry && <Stars count={48} height={60} className="-z-1 [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_45%,transparent_70%)]" />}
      {ridge && <Ridge kind={ridge} base={TONE_BG[tone]} next={TONE_BG[next]} glow={light === "left" ? "right" : "left"} />}
      <div className={`gutter-1360 relative ${className}`}>{children}</div>
    </section>
  );
}

// Dos estrellas unidas por un trazo punteado, como un tramo de constelación: acompaña a la etiqueta del encabezado.
function Asterism({ flip = false }: { flip?: boolean }) {
  return (
    <svg aria-hidden="true" width="46" height="12" viewBox="0 0 46 12" className={`flex-none fill-highlight stroke-highlight ${flip ? "-scale-x-100" : ""}`}>
      <path d="M8 6H38" fill="none" strokeWidth={1.4} strokeDasharray="1 5" strokeLinecap="round" />
      <path d="M40 0C40.4 3.8 42.2 5.6 46 6C42.2 6.4 40.4 8.2 40 12C39.6 8.2 37.8 6.4 34 6C37.8 5.6 39.6 3.8 40 0Z" stroke="none" />
      <circle cx={4} cy={6} r={2.2} stroke="none" />
    </svg>
  );
}

type HeaderProps = {
  id: string; // id del título (aria-labelledby de la sección)
  eyebrow: string;
  title: ReactNode;
  accent?: ReactNode; // segunda parte del título, en el color de acento
  subtitle?: ReactNode;
  align?: "center" | "left";
  className?: string; // p. ej. para quitar el margen inferior cuando el encabezado va dentro de una columna
  fit?: boolean; // en una pantalla completa: el título y los espacios se ajustan también al alto de la pantalla
  children?: ReactNode; // acciones bajo el subtítulo
};

// Encabezado común: etiqueta en versalitas entre estrellas, título grande con su parte de acento y un subtítulo.
// Aparece al llegar con el scroll.
export function SectionHeader({ id, eyebrow, title, accent, subtitle, align = "center", className = "mb-[clamp(28px,4.4vw,56px)]", fit = false, children }: HeaderProps) {
  const centered = align === "center";
  return (
    <header className={`reveal-on-scroll flex flex-col ${fit ? "gap-[clamp(6px,1.4svh,16px)]" : "gap-4"} ${centered ? "mx-auto max-w-[820px] items-center text-center" : "items-start"} ${className}`}>
      <p className="flex items-center gap-3 text-[.76rem] font-extrabold tracking-[.24em] text-accent uppercase">
        <Asterism flip />
        {eyebrow}
        {centered && <Asterism />}
      </p>
      <h2 id={id} className={`display leading-[.94] text-balance ${fit ? "text-[clamp(2.5rem,min(5.4cqi,8svh),4.9rem)]" : "text-[clamp(2.5rem,5.4cqi,4.9rem)]"}`}>
        {title}
        {accent && (
          <>
            {" "}
            <span className="text-accent">{accent}</span>
          </>
        )}
      </h2>
      {/* En pantalla completa el subtítulo usa todo el ancho del encabezado: una línea menos. */}
      {subtitle && <p className={`text-[1.02rem] leading-relaxed text-pretty text-on-dark-muted ${fit ? "" : "max-w-[58ch]"}`}>{subtitle}</p>}
      {children}
    </header>
  );
}
