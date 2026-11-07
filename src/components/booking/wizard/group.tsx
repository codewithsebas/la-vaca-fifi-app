"use client";

// Reservar varias cabañas para las mismas fechas: el grupo se reparte entre cabañas (cada una con sus personas y su
// tarifa). Se paga un solo abono y llega un solo correo con un solo código (lib/groups).
import { MAX_GROUP_CABINS } from "@/lib/booking";
import { cop, plural } from "@/lib/format";
import type { Availability, CabinType, Quote } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { Counter } from "@/components/booking/wizard/fields";

export type GroupRow = { type: string; adults: number; children: number };

type TypeInfo = Pick<CabinType, "id" | "nombre" | "maxPersonas">;

// Tarifa de una cabaña del grupo según cuántos se alojan en ella (la da la consulta de disponibilidad).
export function rowQuote(avail: Availability | null, r: GroupRow): Quote | null {
  const op = avail?.options.find((o) => o.cabinTypeId === r.type);
  return op?.quoteBy?.[String(r.adults + r.children)] ?? null;
}

export function sumQuotes(qs: Quote[]): Quote | null {
  if (!qs.length) return null;
  const add = (f: (q: Quote) => number) => qs.reduce((s, q) => s + f(q), 0);
  return {
    ...qs[0],
    base: add((q) => q.base),
    extraAmount: add((q) => q.extraAmount),
    total: add((q) => q.total),
    deposit: add((q) => q.deposit),
    balance: add((q) => q.balance),
  };
}

// Qué falta para poder seguir: cabañas libres, capacidad y que estén todas las personas. null = listo.
export function groupProblem(avail: Availability | null, types: TypeInfo[], rows: GroupRow[], adults: number, children: number): string | null {
  if (rows.length < 2) return "Agrega al menos dos cabañas.";
  for (const [i, r] of rows.entries()) {
    const t = types.find((x) => x.id === r.type);
    const op = avail?.options.find((o) => o.cabinTypeId === r.type);
    if (!t || !op) return `Elige la cabaña ${i + 1}.`;
    if (r.adults + r.children > t.maxPersonas) return `${t.nombre}: máximo ${t.maxPersonas} personas.`;
    if (r.adults < 1) return `Cada cabaña necesita al menos un adulto.`;
    const wanted = rows.filter((x) => x.type === r.type).length;
    const free = op.unitsFree ?? op.unitsLeft;
    if (wanted > free)
      return free
        ? `Solo ${free === 1 ? "queda 1 cabaña" : `quedan ${free} cabañas`} ${t.nombre} libres en esas fechas.`
        : `${t.nombre} no tiene cupo en esas fechas.`;
  }
  const a = rows.reduce((s, r) => s + r.adults, 0);
  const c = rows.reduce((s, r) => s + r.children, 0);
  if (a !== adults || c !== children)
    return `Reparte a las ${plural(adults + children, "persona", "personas")} de tu búsqueda: van ${plural(a, "adulto", "adultos")} de ${adults}${children || c ? ` y ${plural(c, "niño", "niños")} de ${children}` : ""}.`;
  return null;
}

// Un primer reparto: las cabañas libres más grandes primero, llenas hasta completar el grupo.
export function suggestRows(avail: Availability | null, types: TypeInfo[], adults: number, children: number): GroupRow[] {
  const opts = (avail?.options ?? [])
    .map((o) => ({ o, t: types.find((x) => x.id === o.cabinTypeId) }))
    .filter((x): x is { o: (typeof x)["o"]; t: TypeInfo } => !!x.t && (x.o.unitsFree ?? x.o.unitsLeft) > 0)
    .sort((a, b) => b.t.maxPersonas - a.t.maxPersonas);
  const rows: GroupRow[] = [];
  let a = adults;
  let c = children;
  const used: Record<string, number> = {};
  while ((a > 0 || c > 0) && rows.length < MAX_GROUP_CABINS) {
    const pick = opts.find((x) => (used[x.t.id] ?? 0) < (x.o.unitsFree ?? x.o.unitsLeft));
    if (!pick) break;
    used[pick.t.id] = (used[pick.t.id] ?? 0) + 1;
    const ra = Math.max(1, Math.min(a, pick.t.maxPersonas));
    const rc = Math.min(c, pick.t.maxPersonas - ra);
    rows.push({ type: pick.t.id, adults: ra, children: rc });
    a -= ra;
    c -= rc;
  }
  while (rows.length < 2 && opts[0]) rows.push({ type: opts[0].t.id, adults: 1, children: 0 });
  return rows;
}

export function GroupBuilder({
  avail,
  types,
  rows,
  adults,
  kids,
  nights,
  onChange,
  onSingle,
}: {
  avail: Availability;
  types: TypeInfo[];
  rows: GroupRow[];
  adults: number;
  kids: number; // niños de la búsqueda
  nights: number;
  onChange: (rows: GroupRow[]) => void;
  onSingle?: () => void; // volver a una sola cabaña (solo si el grupo cabe en una)
}) {
  const options = avail.options
    .filter((o) => (o.unitsFree ?? o.unitsLeft) > 0)
    .map((o) => {
      const t = types.find((x) => x.id === o.cabinTypeId);
      return {
        value: o.cabinTypeId,
        label: t?.nombre ?? o.cabinTypeId,
        description: `Hasta ${t?.maxPersonas ?? "?"} personas · ${plural(o.unitsFree ?? o.unitsLeft, "libre", "libres")}`,
      };
    });
  const set = (i: number, p: Partial<GroupRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const quotes = rows.map((r) => rowQuote(avail, r));
  const total = sumQuotes(quotes.filter((q): q is Quote => !!q));
  const problem = groupProblem(avail, types, rows, adults, kids);

  return (
    <section aria-labelledby="group-title" className="flex flex-col gap-4 rounded-lg bg-card p-4 text-on-light sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="group-title" className="display text-[1.8rem] leading-none">
            Varias cabañas
          </h3>
          <p className="mt-1 text-[.9rem]">
            {`Reparte a las ${plural(adults + kids, "persona", "personas")} entre las cabañas. Mismas fechas, un solo código y un solo abono.`}
          </p>
        </div>
        {onSingle && (
          <button type="button" onClick={onSingle} className="btn btn-outline-dark min-h-11 px-4 text-[.9rem] font-bold">
            Solo una cabaña
          </button>
        )}
      </div>
      <ol className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const t = types.find((x) => x.id === r.type);
          const max = t?.maxPersonas ?? 6;
          const q = quotes[i];
          return (
            <li key={i} className="flex flex-col gap-2 rounded-md border-2 border-card-muted p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{`Cabaña ${i + 1}`}</strong>
                <span className="flex items-center gap-3">
                  {q && <span className="font-extrabold">{cop(q.total)}</span>}
                  {rows.length > 2 && (
                    <button
                      type="button"
                      onClick={() => onChange(rows.filter((_, j) => j !== i))}
                      aria-label={`Quitar la cabaña ${i + 1}`}
                      className="btn-icon size-10 text-[1.3rem] leading-none hover:bg-on-light/8"
                    >
                      ×
                    </button>
                  )}
                </span>
              </div>
              <Combobox
                id={`group-type-${i}`}
                value={r.type}
                onChange={(v) => {
                  const nt = types.find((x) => x.id === v);
                  const cap = nt?.maxPersonas ?? max;
                  const ra = Math.min(r.adults, cap);
                  set(i, { type: v, adults: ra, children: Math.min(r.children, cap - ra) });
                }}
                options={options}
                tone="site"
              />
              <Counter
                label="Adultos"
                sub="13 años o más"
                count={r.adults}
                decDisabled={r.adults <= 1}
                incDisabled={r.adults + r.children >= max}
                onDec={() => set(i, { adults: r.adults - 1 })}
                onInc={() => set(i, { adults: r.adults + 1 })}
              />
              <Counter
                label="Niños"
                sub="Hasta 12 años"
                count={r.children}
                decDisabled={r.children <= 0}
                incDisabled={r.adults + r.children >= max}
                onDec={() => set(i, { children: r.children - 1 })}
                onInc={() => set(i, { children: r.children + 1 })}
              />
            </li>
          );
        })}
      </ol>
      {rows.length < MAX_GROUP_CABINS && options.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([...rows, { type: options[0].value, adults: 1, children: 0 }])}
          className="btn btn-outline-dark min-h-12 self-start px-5 font-bold"
        >
          + Agregar otra cabaña
        </button>
      )}
      <div aria-live="polite" className="flex flex-col gap-1 rounded-sm bg-card-muted px-3.5 py-2.5">
        {total && !problem && (
          <p className="font-bold">{`${plural(rows.length, "cabaña", "cabañas")} · ${plural(nights, "noche", "noches")} · total ${cop(total.total)} · abono ${cop(total.deposit)}`}</p>
        )}
        {problem && <p className="font-bold text-error">{problem}</p>}
      </div>
    </section>
  );
}
