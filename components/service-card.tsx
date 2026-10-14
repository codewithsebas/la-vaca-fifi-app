import { serviceIconPath } from "@/lib/service-icons";
import type { SiteService } from "@/lib/site";

// Un servicio (sitio y vista previa del panel): ícono en un aro, nombre y, si la tiene, su descripción. Al pasar el
// mouse el aro se llena y el ícono se vuelve a dibujar con el trazo. Con etiqueta («Valor adicional») se marca como
// extra. Va sobre fondos oscuros.
export function ServiceCard({ s }: { s: Pick<SiteService, "title" | "description" | "icon" | "note"> }) {
  const d = serviceIconPath(s.icon);
  const extra = !!s.note;
  return (
    <div className="group flex h-full items-start gap-3.5 rounded-2xl p-3 transition-colors duration-300 hover:bg-on-dark/6">
      <span
        aria-hidden="true"
        className={`grid size-12 flex-none place-items-center rounded-full border-2 text-highlight transition-[background-color,color] duration-300 group-hover:bg-highlight group-hover:text-on-light ${
          extra ? "border-dashed border-highlight/70" : "border-on-dark/20"
        }`}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d={d} pathLength={1} className="[stroke-dasharray:1] motion-safe:group-hover:animate-icon-draw" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col gap-1 pt-1">
        <h3 className="text-[.98rem] leading-snug font-bold text-balance">{s.title}</h3>
        {s.description && <p className="text-[.88rem] leading-snug text-on-dark-muted">{s.description}</p>}
        {s.note && <span className="self-start rounded-full bg-highlight/15 px-2.5 py-0.5 text-[.72rem] font-extrabold text-highlight ring-1 ring-highlight/45">{s.note}</span>}
      </span>
    </div>
  );
}
