import { serviceIconPath } from "@/lib/service-icons";
import type { SiteService } from "@/lib/site";

// Un servicio (portada y vista previa del panel): el ícono en un círculo blanco de borde fino, el nombre y, si la tiene,
// su descripción. Con etiqueta («Se cotiza aparte») se marca como extra: el ícono en azul y la etiqueta debajo.
export function ServiceCard({ s }: { s: Pick<SiteService, "title" | "description" | "icon" | "note"> }) {
  const d = serviceIconPath(s.icon);
  const extra = !!s.note;
  return (
    <div className="flex h-full items-start gap-3.5 text-on-light">
      <span
        aria-hidden="true"
        className={`grid size-12 flex-none place-items-center rounded-full border bg-card ${extra ? "border-accent/30 text-accent" : "border-on-dark/12 text-cta"}`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d={d} />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col gap-1 pt-0.5">
        <h3 className="text-[.98rem] leading-snug font-extrabold text-balance">{s.title}</h3>
        {s.description && <p className="text-[.86rem] leading-snug text-on-light-muted">{s.description}</p>}
        {s.note && <span className="self-start rounded-full bg-accent/10 px-2.5 py-0.5 text-[.74rem] font-extrabold text-accent">{s.note}</span>}
      </span>
    </div>
  );
}
