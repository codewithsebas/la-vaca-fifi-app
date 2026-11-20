// Piezas de cifras compartidas por el Dashboard, Finanzas, Condiciones de pago, Empleados y Booking: dinero en corto,
// variación contra el periodo anterior, barras de partes y columnas por mes. Con el estilo del panel de Fifí: tinta
// sobre los pasteles y píldoras redondas.
import type { ReactNode } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "@/components/ui/icons";
import { cop } from "@/lib/format";
import { useTip } from "@/components/ui/floating";
import { useTweened } from "@/components/admin/motion";

// Dinero en corto: $850 mil, $1,2 M, $12 M.
export const money = (n: number) =>
  Math.abs(n) >= 1e6
    ? `$${(n / 1e6).toFixed(Math.abs(n) >= 1e7 ? 0 : 1).replace(".", ",")} M`
    : Math.abs(n) >= 1e3
      ? `$${Math.round(n / 1e3)} mil`
      : `$${Math.round(n)}`;

// Variación contra el periodo anterior: flecha y cifra, verde si sube y rosa oscuro si baja. `unit`: «%» (variación) o
// «pp» (puntos porcentuales, para lo que ya es un porcentaje). `invert`: para lo que es mejor que baje (lo que falta por
// cobrar). Sin datos del periodo anterior, lo dice.
export function Delta({
  value,
  unit = "%",
  against = "el periodo anterior",
  invert = false,
}: {
  value: number | null;
  unit?: "%" | "pp";
  against?: string;
  invert?: boolean;
}) {
  if (value === null) return <span className="text-[11.5px] font-semibold text-ink/60">{`Sin datos de ${against}`}</span>;
  const up = value >= 0;
  const good = invert ? !up : up;
  return (
    <span
      className={`inline-flex flex-none items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap tabular-nums ${good ? "bg-success-soft text-success" : "bg-error-soft text-error"}`}
    >
      {up ? <ArrowUpIcon size={11} /> : <ArrowDownIcon size={11} />}
      {unit === "pp" ? `${Math.abs(Math.round(value))} pp` : `${Math.abs(Math.round(value))} %`}
      <span className="sr-only">{`${up ? "más" : "menos"} que ${against}`}</span>
    </span>
  );
}

// Una barra dividida en partes (2 px de aire entre ellas) con su leyenda: abonos y saldos, canales, roles…
export type Part = { key: string; label: string; value: number; color: string; text?: string };
export function PartsBar({ parts, format = money, label }: { parts: Part[]; format?: (n: number) => string; label: string }) {
  const tip = useTip();
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return null;
  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${format(p.value)}`).join(", ")}`} className="flex h-2.5 gap-[2px]">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span
              key={p.key}
              {...tip(() => (
                <span>
                  <strong>{p.label}</strong> · {format(p.value)} · {Math.round((p.value / total) * 100)} %
                </span>
              ))}
              className="h-full rounded-full"
              style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
            />
          ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5 text-[12px] font-semibold text-ink/70">
            <span aria-hidden="true" className="size-2 rounded-full" style={{ background: p.color }} />
            {p.label}
            <span className="font-bold text-ink tabular-nums">{p.text ?? format(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Columnas por mes (o por periodo): la última resaltada en tinta y las anteriores atenuadas; el detalle al pasar el mouse.
export function MonthBars({
  items,
  label,
  delay = 0,
  height = 112,
  format = cop,
}: {
  items: { key: string; label: string; full: string; value: number }[];
  label: string;
  delay?: number;
  height?: number;
  format?: (n: number) => string;
}) {
  const tip = useTip();
  const max = Math.max(1, ...items.map((x) => x.value));
  const heights = useTweened(
    items.map((x) => (x.value / max) * 100),
    { delay, duration: 900, stagger: 35 },
  );
  return (
    <figure aria-label={label} className="min-w-0">
      <ol className="flex items-end gap-1.5 border-b-2 border-ink/15" style={{ height }}>
        {items.map((x, i) => {
          const last = i === items.length - 1;
          return (
            <li
              key={x.key}
              aria-label={`${x.full}: ${format(x.value)}`}
              {...tip(
                () => (
                  <span>
                    <strong className="first-letter:uppercase">{x.full}</strong> · {format(x.value)}
                  </span>
                ),
                { anchor: (el) => el.firstElementChild as HTMLElement | null },
              )}
              className="flex h-full flex-1 items-end justify-center"
            >
              <span
                aria-hidden="true"
                className={`block w-full max-w-[18px] rounded-t-full transition-opacity ${last ? "bg-ink" : "bg-ink/30 hover:bg-ink/50"}`}
                style={{ height: `${Math.max(x.value ? 4 : 1.5, heights[i])}%` }}
              />
            </li>
          );
        })}
      </ol>
      <div aria-hidden="true" className="mt-1.5 flex gap-1.5">
        {items.map((x, i) => (
          <span key={x.key} className={`flex-1 text-center text-[10.5px] ${i === items.length - 1 ? "font-bold text-ink" : "font-semibold text-ink/55"}`}>
            {x.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

// Barras horizontales con su rótulo y su cifra (cabañas, tipos de huésped…), de la más alta a la más baja.
export function RankBars({
  items,
  format = money,
  delay = 0,
  color = "var(--color-ink)",
}: {
  items: { key: string; label: ReactNode; value: number; hint?: string }[];
  format?: (n: number) => string;
  delay?: number;
  color?: string;
}) {
  const top = Math.max(1, ...items.map((c) => c.value));
  const widths = useTweened(
    items.map((c) => (c.value / top) * 100),
    { delay, duration: 900, stagger: 60 },
  );
  return (
    <ul className="flex flex-col gap-3">
      {items.map((c, i) => (
        <li key={c.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-semibold text-ink">
              {c.label}
              {c.hint && <span className="ml-1.5 text-[11.5px] font-medium text-ink-muted">{c.hint}</span>}
            </span>
            <span className="flex-none font-bold text-ink tabular-nums">{format(c.value)}</span>
          </div>
          <span aria-hidden="true" className="block h-2 rounded-full bg-ink/8">
            <span className="block h-full rounded-full" style={{ width: `${widths[i]}%`, background: color }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
