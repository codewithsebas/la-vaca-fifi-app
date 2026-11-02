import { statusOf } from "@/lib/format";

export function StatusPill({ status, size = "md", className = "" }: { status: string; size?: "sm" | "md"; className?: string }) {
  const st = statusOf(status);
  const sz = size === "sm" ? "px-2.5 py-0.5 text-[12px] leading-[1.6] font-bold" : "px-3.5 py-1.5 text-[.85rem] font-extrabold";
  return (
    <span
      className={`inline-flex items-center self-start rounded-full whitespace-nowrap text-[color:var(--status-text,var(--color-on-light))] ${sz} ${className}`}
      style={{ background: st.bg }}
    >
      {st.label}
    </span>
  );
}

type Row = { k: string; v: string; wide?: boolean };

// `card`: caja crema del sitio público. `plain`: lista sobria para el panel (etiqueta tenue, valor marcado).
export function KeyValues({ rows, variant = "card" }: { rows: Row[]; variant?: "card" | "plain" }) {
  if (variant === "plain")
    return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
        {rows.map((x) => (
          <div key={x.k} className={x.wide ? "col-span-2" : ""}>
            <dt className="text-[12.5px] font-medium text-ink-muted">{x.k}</dt>
            <dd className="mt-0.5 text-[14px] font-semibold break-words text-ink">{x.v}</dd>
          </div>
        ))}
      </dl>
    );
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-3 rounded-md bg-card-muted p-4">
      {rows.map((x) => (
        <div key={x.k}>
          <dt className="text-[.72rem] font-extrabold tracking-[.06em] uppercase">{x.k}</dt>
          <dd className="mt-0.5 font-bold">{x.v}</dd>
        </div>
      ))}
    </dl>
  );
}
