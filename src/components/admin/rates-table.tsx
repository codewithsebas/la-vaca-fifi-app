"use client";

// Tarifas → tabla única: el precio base de todas las cabañas en un solo lugar, como el % de abono. Cada tipo cobra por
// personas (una fila por cantidad) o por pareja + persona adicional, entre semana y en fin de semana. Los días de fin de
// semana son uno solo para todas. Se guarda junto (PUT /api/admin/cabin-types); las temporadas siguen aparte.
import { useState, type ReactNode } from "react";
import { CheckIcon, CloseIcon, PencilIcon } from "@/components/ui/icons";
import { cleanDayRates, dayRateLabel, invalidPersonRates, personSteps, tierPrice, unitLabel } from "@/lib/booking";
import { api } from "@/lib/client/api";
import { WD_FULL, WD_MIN, cop, plural } from "@/lib/format";
import type { CabinType, PersonRates, Rates, SeasonDayRate } from "@/lib/types";
import { useAdmin } from "@/components/admin/context";
import { Badge, Button, Callout, Card, FieldError, IconButton, Modal, ModalPresence, MoneyInput, SaveBar, Stepper, Switch } from "@/components/admin/ui";

const WEEK = [1, 2, 3, 4, 5, 6, 0]; // la semana empieza el lunes
export const DEFAULT_WEEKEND = [5, 6, 0]; // viernes, sábado y domingo

type Prices = { couple: number; extra: number; tiers: PersonRates };
type Draft = { id: string; byPeople: boolean; from: number; weekday: Prices; weekend: Prices | null };

// Campo de precio de la tabla: angosto y sin «COP», para que dos columnas quepan en un teléfono.
const PRICE = "max-w-[190px] [&>input]:pr-2! [&>input]:pl-6! [&>span:first-of-type]:left-2.5! [&>span:last-of-type]:hidden";

const daysText = (days: number[]) => dayRateLabel({ weekdays: days, dates: [], precioPareja: 0, personaAdicional: 0 });

// Días de fin de semana guardados: los de la primera regla por día que tenga alguna cabaña (todas usan los mismos).
export function weekendOf(cabins: CabinType[]) {
  const rule = cabins.flatMap((c) => c.dayRates ?? []).find((r) => r.weekdays.length);
  return rule ? [...rule.weekdays] : DEFAULT_WEEKEND;
}

function draftOf(c: CabinType): Draft {
  const rule = (c.dayRates ?? []).find((r) => r.weekdays.length);
  const raw = {
    weekday: { couple: c.precioPareja, extra: c.personaAdicional, tiers: c.preciosPersonas ?? {} },
    weekend: rule ? { couple: rule.precioPareja, extra: rule.personaAdicional, tiers: rule.preciosPersonas ?? {} } : null,
  };
  // Por personas si entre semana o el fin de semana lo es: así la tabla muestra lo que de verdad se cobra, aunque solo uno
  // de los dos tenga tabla. Cada fila vale lo que cobraría hoy la cotización (lib/booking: tierPrice o pareja + adicional).
  const steps = [...personSteps(raw.weekday.tiers), ...personSteps(raw.weekend?.tiers)];
  const byPeople = steps.length > 0;
  const from = byPeople ? Math.min(...steps) : Math.min(2, c.maxPersonas);
  const filled = (p: Prices): Prices => {
    if (!byPeople) return { ...p, tiers: { ...p.tiers } };
    const tiers: PersonRates = {};
    for (let n = from; n <= c.maxPersonas; n++) tiers[n] = personSteps(p.tiers).length ? tierPrice(p.tiers, n) : p.couple + Math.max(0, n - 2) * p.extra;
    return { ...p, tiers };
  };
  return { id: c.id, byPeople, from, weekday: filled(raw.weekday), weekend: raw.weekend && filled(raw.weekend) };
}

// Lo que se guarda de una cabaña: la tabla por personas (solo de «desde» a la capacidad) y una regla para el fin de semana.
function rateOf(d: Draft, c: CabinType, weekend: number[]) {
  const rows = (p: Prices): PersonRates => {
    if (!d.byPeople) return {};
    const out: PersonRates = {};
    for (let n = d.from; n <= c.maxPersonas; n++) out[n] = p.tiers[n] ?? 0;
    return out;
  };
  const dayRates: SeasonDayRate[] = d.weekend
    ? [{ weekdays: weekend, dates: [], precioPareja: d.weekend.couple, personaAdicional: d.weekend.extra, preciosPersonas: rows(d.weekend) }]
    : [];
  return {
    precioPareja: d.weekday.couple,
    personaAdicional: d.weekday.extra,
    maxPersonas: c.maxPersonas,
    preciosPersonas: rows(d.weekday),
    dayRates: cleanDayRates(dayRates),
  };
}

// Para comparar con lo guardado: misma forma que rateOf, a partir de la cabaña.
const savedOf = (c: CabinType) => ({
  precioPareja: c.precioPareja,
  personaAdicional: c.personaAdicional,
  maxPersonas: c.maxPersonas,
  preciosPersonas: c.preciosPersonas ?? {},
  dayRates: cleanDayRates(c.dayRates ?? []),
});

function errorOf(d: Draft, c: CabinType) {
  const check = (p: Prices, when: string) => {
    if (d.byPeople) {
      const rows: PersonRates = {};
      for (let n = d.from; n <= c.maxPersonas; n++) rows[n] = p.tiers[n] ?? 0;
      const bad = invalidPersonRates(rows);
      return bad ? `${bad.replace(/\.$/, "")} (${when}).` : null;
    }
    return p.couple > 0 ? null : `Escribe el precio para 2 personas (${when}).`;
  };
  return check(d.weekday, "entre semana") ?? (d.weekend ? check(d.weekend, "fin de semana") : null);
}

// `toolbar`: lo que va a la izquierda de los días de fin de semana (las pestañas de la página).
export function RatesTable({ toolbar }: { toolbar?: ReactNode }) {
  const { data, ask } = useAdmin();
  const cabins = data.cabinTypes;
  const savedWeekend = weekendOf(cabins);
  const savedKey = JSON.stringify(cabins.map(savedOf));

  const [weekend, setWeekend] = useState(savedWeekend);
  const [drafts, setDrafts] = useState(() => cabins.map(draftOf));
  // Al guardar (aquí, en otra pestaña o en otro equipo), lo guardado pasa a ser la base.
  const [base, setBase] = useState(savedKey);
  const [editing, setEditing] = useState<string | null>(null);
  if (base !== savedKey) {
    setBase(savedKey);
    setDrafts(cabins.map(draftOf));
    setWeekend(weekendOf(cabins));
    setEditing(null);
  }

  const setDraft = (id: string, fn: (d: Draft) => Draft) => setDrafts((ds) => ds.map((d) => (d.id === id ? fn(d) : d)));
  const rows = cabins.flatMap((c) => {
    const d = drafts.find((x) => x.id === c.id);
    return d ? [{ c, d, rate: rateOf(d, c, weekend), error: errorOf(d, c) }] : [];
  });
  const changed = rows.filter((r) => JSON.stringify(r.rate) !== JSON.stringify(savedOf(r.c)));
  const invalid = rows.some((r) => r.error);
  const weekdays = WEEK.filter((d) => !weekend.includes(d));
  const current = rows.find((r) => r.c.id === editing);
  // Columnas de la lista: de la menor cantidad que alguna cabaña cobra hasta la mayor capacidad.
  const columns = range(Math.min(...rows.map(({ d }) => (d.byPeople ? d.from : 2))), Math.max(2, ...rows.map(({ c }) => c.maxPersonas)));
  // Precios por día que la tabla no muestra (más de una regla, u otros días): al guardar se reemplazan por el fin de semana.
  const odd = cabins.filter(
    (c) => (c.dayRates ?? []).length > 1 || (c.dayRates ?? []).some((r) => JSON.stringify([...r.weekdays].sort()) !== JSON.stringify([...savedWeekend].sort())),
  );

  const save = () =>
    ask({
      title: "Guardar tarifas",
      text: "Aplican a las cotizaciones desde ahora, en el panel y en el sitio. Las reservas existentes conservan su valor.",
      details: changed.map(({ c, rate }) => {
        const prices = (p: { precioPareja: number; preciosPersonas?: PersonRates }) =>
          personSteps(p.preciosPersonas).length
            ? personSteps(p.preciosPersonas)
                .map((n) => `${n}: ${cop(p.preciosPersonas![n])}`)
                .join(" · ")
            : `2 personas ${cop(p.precioPareja)}`;
        const w = rate.dayRates[0];
        return {
          k: c.nombre,
          v: w ? `${daysText(weekdays)}: ${prices(rate)} — ${daysText(weekend)}: ${prices(w)}` : `Todos los días: ${prices(rate)}`,
        };
      }),
      okLabel: "Guardar tarifas",
      done: "Tarifas guardadas",
      run: () => api.admin.saveRates(Object.fromEntries(changed.map(({ c, rate }) => [c.id, rate])) as Rates),
    });

  return (
    <section aria-label="Lista de precios" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {toolbar}
        <fieldset className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-[20px] bg-panel px-3 py-1 max-sm:w-full">
          <legend className="sr-only">Días de fin de semana</legend>
          <p aria-hidden="true" className="text-[13px] font-semibold text-ink">
            Fin de semana
          </p>
          <div role="group" aria-label="Días de fin de semana" className="flex flex-wrap gap-1">
            {WEEK.map((d) => {
              const on = weekend.includes(d);
              const lock = (on && weekend.length === 1) || (!on && weekend.length === 6);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  aria-label={WD_FULL[d]}
                  title={WD_FULL[d]}
                  disabled={lock}
                  onClick={() => setWeekend(on ? weekend.filter((x) => x !== d) : WEEK.filter((x) => x === d || weekend.includes(x)))}
                  className={`grid size-8 place-items-center rounded-full text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${on ? "bg-sidebar text-white" : "text-ink-muted hover:not-disabled:bg-paper hover:not-disabled:text-ink"}`}
                >
                  {WD_MIN[d]}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      {odd.length > 0 && (
        <Callout tone="warning">
          {`${odd.map((c) => c.nombre).join(", ")} ${odd.length === 1 ? "tiene" : "tienen"} precios por día que esta lista no muestra. Al guardar se reemplazan por el fin de semana de arriba.`}
        </Callout>
      )}

      {/* Escritorio: una sola tabla para comparar cabañas. */}
      <Card className="hidden overflow-x-auto bg-paper! ring-1 ring-line lg:block">
        <table className="w-full text-[14px]">
          <thead className="border-b border-line bg-canvas/70 text-left text-[12px] font-semibold text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Cabaña
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                Días
              </th>
              {columns.map((n) => (
                <th key={n} scope="col" className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                  {plural(n, "persona", "personas")}
                </th>
              ))}
              <th scope="col" className="px-4 py-2.5">
                <span className="sr-only">Editar</span>
              </th>
            </tr>
          </thead>
          {rows.map(({ c, d }) => {
            const bands = bandsOf(d, weekdays, weekend);
            return (
              <tbody key={c.id} className="border-b border-line last:border-b-0">
                {bands.map((b, i) => (
                  <tr key={b.label}>
                    {i === 0 && (
                      <th scope="rowgroup" rowSpan={bands.length} className="px-4 py-3 text-left align-middle font-normal">
                        <span className="flex flex-wrap items-center gap-2 font-bold text-ink">
                          {c.nombre}
                          {!c.activa && <Badge>Inactiva</Badge>}
                        </span>
                        <span className="block text-[12.5px] text-ink-muted">{unitsOf(c)}</span>
                      </th>
                    )}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <DayTag weekend={b.weekend}>{b.label}</DayTag>
                    </td>
                    {columns.map((n) => {
                      const cell = cellOf(c, d, b.prices, n);
                      return (
                        <td key={n} className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                          {cell.price === null ? (
                            <span className="text-ink-subtle">—</span>
                          ) : (
                            <span
                              className={cell.below ? "text-ink-subtle" : "font-semibold text-ink"}
                              title={cell.below ? `Cobra desde ${plural(d.from, "persona", "personas")}` : undefined}
                            >
                              {cop(cell.price)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    {i === 0 && (
                      <td rowSpan={bands.length} className="px-4 py-3 text-right align-middle">
                        <Button size="sm" icon={<PencilIcon size={13} />} onClick={() => setEditing(c.id)}>
                          Editar
                          <span className="sr-only">{` precios de ${c.nombre}`}</span>
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </Card>

      {/* Teléfono y tablet: una tarjeta por cabaña, con una línea por cantidad de personas. */}
      <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:hidden">
        {rows.map(({ c, d }) => {
          const bands = bandsOf(d, weekdays, weekend);
          const people = columns.filter(
            (n) => n <= c.maxPersonas && cellOf(c, d, bands[0].prices, n).price !== null && !cellOf(c, d, bands[0].prices, n).below,
          );
          return (
            <li key={c.id} className="flex flex-col gap-3 rounded-[20px] bg-paper p-4 ring-1 ring-line">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
                    {c.nombre}
                    {!c.activa && <Badge>Inactiva</Badge>}
                  </p>
                  <p className="text-[12.5px] text-ink-muted">{unitsOf(c)}</p>
                </div>
                <Button size="sm" icon={<PencilIcon size={13} />} onClick={() => setEditing(c.id)}>
                  Editar
                  <span className="sr-only">{` precios de ${c.nombre}`}</span>
                </Button>
              </div>
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="text-left text-[12px] text-ink-muted">
                    <th scope="col" className="pb-1 font-semibold">
                      Personas
                    </th>
                    {bands.map((b) => (
                      <th key={b.label} scope="col" className="pb-1 text-right font-semibold">
                        {b.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {people.map((n) => (
                    <tr key={n} className="border-t border-line">
                      <th scope="row" className="py-1.5 text-left font-medium text-ink">
                        {n}
                      </th>
                      {bands.map((b) => (
                        <td key={b.label} className="py-1.5 text-right font-semibold text-ink tabular-nums">
                          {cop(cellOf(c, d, b.prices, n).price ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.byPeople && d.from > 1 && (
                <p className="text-[12.5px] text-ink-muted">{`Con menos de ${plural(d.from, "persona", "personas")} se cobra el precio de ${d.from}.`}</p>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-[12.5px] text-ink-muted">
        Los días de fin de semana son los mismos para todas las cabañas.
        {rows.some(({ d }) => d.byPeople && d.from > columns[0]) && (
          <span className="hidden lg:inline"> En gris: con menos personas se paga el mínimo de esa cabaña.</span>
        )}
      </p>

      <ModalPresence>
        {current && (
          <PriceEditor
            key={current.c.id}
            c={current.c}
            d={current.d}
            error={current.error}
            weekdays={weekdays}
            weekend={weekend}
            set={(fn) => setDraft(current.c.id, fn)}
            dirty={changed.some((x) => x.c.id === current.c.id)}
            onCancel={() => {
              setDraft(current.c.id, () => draftOf(current.c));
              setEditing(null);
            }}
            onSave={save}
          />
        )}
      </ModalPresence>

      {!editing && changed.length > 0 && (
        <SaveBar
          dirty={changed.length > 0}
          onDiscard={() => {
            setDrafts(cabins.map(draftOf));
            setWeekend(savedWeekend);
          }}
          onSave={() => !invalid && save()}
          saveLabel={invalid ? "Revisa los precios" : `Guardar tarifas (${changed.length})`}
        />
      )}
    </section>
  );
}

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

const unitsOf = (c: CabinType) =>
  `${c.units === 1 ? "Cabaña" : "Cabañas"} ${c.units ? Array.from({ length: c.units }, (_, i) => unitLabel(c, i + 1)).join(", ") : "sin unidades"}`;

// Una fila por cada grupo de días con precio propio.
function bandsOf(d: Draft, weekdays: number[], weekend: number[]): { label: string; weekend: boolean; prices: Prices }[] {
  return d.weekend
    ? [
        { label: daysText(weekdays), weekend: false, prices: d.weekday },
        { label: daysText(weekend), weekend: true, prices: d.weekend },
      ]
    : [{ label: "Todos los días", weekend: false, prices: d.weekday }];
}

// Lo que paga esa cantidad de personas. `below`: cobra desde más personas, así que paga el mínimo.
function cellOf(c: CabinType, d: Draft, p: Prices, n: number): { price: number | null; below: boolean } {
  if (n > c.maxPersonas) return { price: null, below: false };
  if (d.byPeople) return n < d.from ? { price: p.tiers[d.from] ?? 0, below: true } : { price: p.tiers[n] ?? 0, below: false };
  return { price: p.couple + Math.max(0, n - 2) * p.extra, below: false };
}

function DayTag({ weekend, children }: { weekend: boolean; children: ReactNode }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-semibold ${weekend ? "bg-sidebar text-white" : "bg-ink/7 text-ink"}`}>
      {children}
    </span>
  );
}

function Step({ n, title, help, children }: { n: number; title: string; help?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="grid size-6 flex-none place-items-center rounded-full bg-ink text-[12px] font-bold text-paper">
          {n}
        </span>
        <div className="min-w-0">
          <h3 className="text-[14.5px] font-bold text-ink">{title}</h3>
          {help && <p className="text-[12.5px] text-ink-muted">{help}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

// Editar una cabaña paso a paso: cómo cobra, si cambia el fin de semana y los precios, con el resultado en una frase.
function PriceEditor({
  c,
  d,
  error,
  weekdays,
  weekend,
  set,
  dirty,
  onCancel,
  onSave,
}: {
  c: CabinType;
  d: Draft;
  error: string | null;
  weekdays: number[];
  weekend: number[];
  set: (fn: (d: Draft) => Draft) => void;
  dirty: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const hasModes = c.maxPersonas > 2;
  let step = 0;
  const lines: { key: string; label: string; get: (p: Prices) => number; put: (p: Prices, v: number) => Prices }[] = d.byPeople
    ? range(d.from, c.maxPersonas).map((n) => ({
        key: `p${n}`,
        label: plural(n, "persona", "personas"),
        get: (p) => p.tiers[n] ?? 0,
        put: (p, v) => ({ ...p, tiers: { ...p.tiers, [n]: v } }),
      }))
    : [
        { key: "couple", label: "Noche para 2", get: (p) => p.couple, put: (p, v) => ({ ...p, couple: v }) },
        ...(c.maxPersonas > 2
          ? [{ key: "extra", label: "Cada persona más", get: (p: Prices) => p.extra, put: (p: Prices, v: number) => ({ ...p, extra: v }) }]
          : []),
      ];
  const sample = Math.min(c.maxPersonas, Math.max(d.byPeople ? d.from : 2, 2));
  const pay = (p: Prices) => cop(cellOf(c, d, p, sample).price ?? 0);
  const pickMode = (byPeople: boolean) =>
    set((x) => {
      if (!byPeople) return { ...x, byPeople: false };
      // Las filas nuevas arrancan con lo que costaría hoy.
      const seed = (p: Prices): Prices => {
        const tiers: PersonRates = { ...p.tiers };
        for (let n = x.from; n <= c.maxPersonas; n++) tiers[n] ??= p.couple + Math.max(0, n - 2) * p.extra;
        return { ...p, tiers };
      };
      return { ...x, byPeople: true, weekday: seed(x.weekday), weekend: x.weekend && seed(x.weekend) };
    });
  const modes = [
    { byPeople: true, title: "Por personas", text: "Un precio fijo para cada cantidad de personas." },
    { byPeople: false, title: "Pareja + adicional", text: "Un precio para 2 y un valor por cada persona más." },
  ];

  return (
    // Es un formulario de precios: un clic afuera por error no debe borrar lo escrito.
    <Modal onClose={onCancel} labelledBy="pe-title" dismissOnBackdrop={false} className="m-auto w-[calc(100%-32px)] max-w-[600px] rounded-[26px] p-0">
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="pe-title" className="text-[18px] font-bold tracking-[-0.02em] text-ink">
              {`Precios de ${c.nombre}`}
            </h2>
            <p className="text-[13.5px] text-ink-muted">{`${unitsOf(c)} · hasta ${plural(c.maxPersonas, "persona", "personas")}`}</p>
          </div>
          <IconButton label="Cerrar" onClick={onCancel} className="flex-none">
            <CloseIcon size={18} />
          </IconButton>
        </div>

        {hasModes && (
          <Step n={++step} title="¿Cómo se cobra?">
            <div role="radiogroup" aria-label={`Cómo cobra ${c.nombre}`} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {modes.map((m) => {
                const on = d.byPeople === m.byPeople;
                return (
                  <button
                    key={m.title}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pickMode(m.byPeople)}
                    className={`rounded-[16px] p-3 text-left ring-1 transition-colors ${on ? "bg-canvas ring-2 ring-ink" : "ring-line hover:bg-canvas/60"}`}
                  >
                    <span className="block text-[13.5px] font-bold text-ink">{m.title}</span>
                    <span className="block text-[12.5px] text-ink-muted">{m.text}</span>
                  </button>
                );
              })}
            </div>
          </Step>
        )}

        <Step n={++step} title="¿Cambia el fin de semana?">
          <Switch
            checked={!!d.weekend}
            onChange={(on) => set((x) => ({ ...x, weekend: on ? { ...x.weekday, tiers: { ...x.weekday.tiers } } : null }))}
            label={d.weekend ? `Sí, ${daysText(weekend)} tiene su propio precio` : "No, cuesta lo mismo todos los días"}
          />
        </Step>

        <Step n={++step} title="Precio por noche">
          {d.byPeople && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`rt-${c.id}-from`} className="text-[13px] font-semibold text-ink">
                Cobrar desde
              </label>
              <Stepper id={`rt-${c.id}-from`} value={d.from} onChange={(n) => set((x) => ({ ...x, from: n }))} min={1} max={c.maxPersonas} unit="personas" />
            </div>
          )}
          <table className="w-full table-fixed border-separate border-spacing-y-1.5 text-[13.5px]">
            <thead>
              <tr className="text-left text-[12px] font-semibold text-ink-muted">
                <th scope="col" className="w-[30%] font-semibold">
                  {d.byPeople ? "Personas" : "Concepto"}
                </th>
                <th scope="col" className="font-semibold">
                  {d.weekend ? daysText(weekdays) : "Todos los días"}
                </th>
                {d.weekend && (
                  <th scope="col" className="font-semibold">
                    {daysText(weekend)}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key}>
                  <th scope="row" className="pr-2 text-left font-semibold text-ink">
                    {l.label}
                  </th>
                  <td className="pr-2">
                    <MoneyInput
                      id={`rt-${c.id}-${l.key}-a`}
                      aria-label={`${c.nombre}, ${l.label}, ${d.weekend ? daysText(weekdays) : "todos los días"}`}
                      invalid={!(l.get(d.weekday) > 0) && l.key !== "extra"}
                      value={l.get(d.weekday)}
                      onChange={(v) => set((x) => ({ ...x, weekday: l.put(x.weekday, v) }))}
                      className={PRICE}
                    />
                  </td>
                  {d.weekend && (
                    <td>
                      <MoneyInput
                        id={`rt-${c.id}-${l.key}-b`}
                        aria-label={`${c.nombre}, ${l.label}, ${daysText(weekend)}`}
                        invalid={!(l.get(d.weekend) > 0) && l.key !== "extra"}
                        value={l.get(d.weekend)}
                        onChange={(v) => set((x) => ({ ...x, weekend: x.weekend && l.put(x.weekend, v) }))}
                        className={PRICE}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {d.byPeople && d.from > 1 && (
            <p className="text-[12.5px] text-ink-muted">{`Con menos de ${plural(d.from, "persona", "personas")} se cobra el precio de ${d.from}.`}</p>
          )}
          {error && <FieldError>{error}</FieldError>}
        </Step>

        <p className="rounded-[16px] bg-canvas px-4 py-3 text-[13.5px] text-ink">
          <strong className="font-semibold">Así queda: </strong>
          {d.weekend
            ? `${plural(sample, "persona paga", "personas pagan")} ${pay(d.weekday)} la noche de ${daysText(weekdays)} y ${pay(d.weekend)} de ${daysText(weekend)}.`
            : `${plural(sample, "persona paga", "personas pagan")} ${pay(d.weekday)} la noche, todos los días.`}
        </p>
      </div>
      <div className="flex flex-col-reverse gap-2 rounded-b-[26px] border-t border-line bg-canvas/70 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">
        <Button onClick={onCancel}>Cancelar</Button>
        <Button variant="primary" icon={<CheckIcon size={14} />} disabled={!dirty || !!error} onClick={onSave}>
          Guardar precios
        </Button>
      </div>
    </Modal>
  );
}
