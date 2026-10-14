import { serviceIconPath } from "@/lib/service-icons";
import type { SiteService } from "@/lib/site";

// Un servicio (sitio y vista previa del panel): una calcomanía con el ícono en un círculo amarillo de borde de tinta,
// el nombre y, si la tiene, su descripción. Con etiqueta («Se cotiza aparte») se marca como extra: círculo azul y la
// etiqueta debajo.
export function ServiceCard({ s }: { s: Pick<SiteService, "title" | "description" | "icon" | "note"> }) {
  const d = serviceIconPath(s.icon);
  const extra = !!s.note;
  return (
    <div className="sticker-sm group flex h-full items-center gap-3.5 rounded-[20px] bg-card p-3.5 text-on-light transition-transform duration-200 hover:-translate-y-0.5 hover:-rotate-1">
      <span aria-hidden="true" className={`grid size-12 flex-none place-items-center rounded-full border-[2.5px] border-on-dark ${extra ? "bg-accent text-card" : "bg-highlight text-on-light"}`}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={d} />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <h3 className="text-[1rem] leading-snug font-extrabold text-balance">{s.title}</h3>
        {s.description && <p className="text-[.88rem] leading-snug text-on-light-muted">{s.description}</p>}
        {s.note && <span className="self-start rounded-full border-2 border-on-dark bg-bg px-2.5 py-0.5 text-[.74rem] font-extrabold">{s.note}</span>}
      </span>
    </div>
  );
}
