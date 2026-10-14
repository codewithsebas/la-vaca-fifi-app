"use client";

// Controles de elección del sitio (tarjeta crema de la marca): interruptor, tarjeta con interruptor y casilla de verificación.
// El interruptor es el mismo del formulario de la portada; la casilla dibuja la marca al activarse.
import type { ReactNode } from "react";

// Pista del interruptor (solo visual: el control accesible es el botón o la casilla que lo contiene).
export function SwitchTrack({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={`relative h-[30px] w-[52px] flex-none rounded-full transition-colors duration-200 ${on ? "bg-cta" : "bg-[color-mix(in_srgb,var(--color-on-light)_35%,var(--color-card-muted))]"}`}>
      <span className={`absolute top-1 left-1 size-[22px] rounded-full bg-card shadow-[0_1px_2px_rgb(0_0_0/0.18)] transition-transform duration-200 ${on ? "translate-x-[22px]" : ""}`} />
    </span>
  );
}

type ToggleCardProps = {
  id?: string;
  icon: ReactNode;
  title: string;
  description: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode; // detalles que aparecen al activarla
};

// Opción de sí/no con su interruptor; al activarla despliega sus detalles dentro de la misma tarjeta.
export function ToggleCard({ id, icon, title, description, checked, onChange, children }: ToggleCardProps) {
  return (
    <div className={`rounded-md border-2 transition-[border-color,background-color] duration-200 ${checked ? "border-on-light/25 bg-card" : "border-transparent bg-card-muted"}`}>
      <button id={id} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-[76px] w-full items-center gap-4 rounded-md px-4 py-3 text-left sm:px-5">
        <span aria-hidden="true" className={`grid size-11 flex-none place-items-center rounded-full transition-colors duration-200 ${checked ? "bg-cta text-cta-text" : "bg-card text-on-light"}`}>
          {icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[1rem] leading-tight font-extrabold">{title}</span>
          <span className="text-[.86rem] leading-snug">{description}</span>
        </span>
        <SwitchTrack on={checked} />
      </button>
      {checked && children && <div className="flex flex-col gap-3 border-t-2 border-dotted border-card-muted px-4 pt-4 pb-4.5 motion-safe:animate-fade-in sm:px-5">{children}</div>}
    </div>
  );
}

type CheckOptionProps = {
  id?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  invalid?: boolean;
  describedBy?: string;
  note?: ReactNode; // aclaración bajo el texto (p. ej. «Obligatorio» u «Opcional»)
  card?: boolean; // como tarjeta seleccionable (autorizaciones) o en línea (dentro de otra tarjeta)
  className?: string;
  children: ReactNode;
};

// Casilla propia: la nativa queda oculta pero accesible (teclado, lector de pantalla, formularios); la marca se dibuja al activarla.
export function CheckOption({ id, checked, onChange, invalid, describedBy, note, card = false, className = "", children }: CheckOptionProps) {
  const frame = card
    ? `rounded-md border-2 px-4 py-3.5 transition-[border-color,background-color] duration-200 ${invalid ? "border-error bg-card" : checked ? "border-on-light/25 bg-card" : "border-card-muted hover:border-on-light/25"}`
    : "py-1.5";
  return (
    <label className={`group flex min-h-11 cursor-pointer items-start gap-3 ${frame} ${className}`}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={invalid || undefined} aria-describedby={describedBy} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={`mt-px grid size-6 flex-none place-items-center rounded-[8px] border-2 transition-[background-color,border-color,transform] duration-200 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-highlight motion-safe:group-active:scale-90 ${
          checked ? "border-cta bg-cta" : invalid ? "border-error bg-card" : "border-on-light/40 bg-[color-mix(in_srgb,var(--color-card)_55%,#fff)] group-hover:border-on-light/70"
        }`}
      >
        <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-cta-text">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            pathLength={1}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`[stroke-dasharray:1] transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none ${checked ? "[stroke-dashoffset:0]" : "[stroke-dashoffset:1]"}`}
          />
        </svg>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 pt-px">
        <span className="leading-snug font-semibold">{children}</span>
        {note && <span className="text-[.82rem] font-medium opacity-80">{note}</span>}
      </span>
    </label>
  );
}
