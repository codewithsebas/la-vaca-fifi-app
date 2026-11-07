"use client";

// Tarifas → tabla única: el precio base de todas las cabañas en un solo lugar, como el % de abono. Cada tipo cobra por
// personas (una fila por cantidad) o por pareja + persona adicional, entre semana y en fin de semana. Los días de fin de
// semana son uno solo para todas. Se guarda junto (PUT /api/admin/cabin-types); las temporadas siguen aparte.
import { useState } from "react";
import { HomeIcon } from "@/components/ui/icons";
import { cleanDayRates, dayRateLabel, invalidPersonRates, personSteps, tierPrice, unitLabel } from "@/lib/booking";
import { api } from "@/lib/client/api";
import { WD_FULL, WD_MIN, cop, plural } from "@/lib/format";
import type { CabinType, PersonRates, Rates, SeasonDayRate } from "@/lib/types";
import { useAdmin } from "@/components/admin/context";
import { Badge, Callout, Card, CardHeader, FieldError, MoneyInput, SaveBar, Segmented, Stepper, Switch } from "@/components/admin/ui";

const WEEK = [1, 2, 3, 4, 5, 6, 0]; // la semana empieza el lunes
export const DEFAULT_WEEKEND = [5, 6, 0]; // viernes, sábado y domingo

type Prices = { couple: number; extra: number; tiers: PersonRates };
type Draft = { id: string; byPeople: boolean; from: number; weekday: Prices; weekend: Prices | null };

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

export function RatesTable() {
  const { data, ask } = useAdmin();
  const cabins = data.cabinTypes;
  const savedWeekend = weekendOf(cabins);
  const savedKey = JSON.stringify(cabins.map(savedOf));

  const [weekend, setWeekend] = useState(savedWeekend);
  const [drafts, setDrafts] = useState(() => cabins.map(draftOf));
  // Al guardar (aquí, en otra pestaña o en otro equipo), lo guardado pasa a ser la base.
  const [base, setBase] = useState(savedKey);
  if (base !== savedKey) {
    setBase(savedKey);
    setDrafts(cabins.map(draftOf));
    setWeekend(weekendOf(cabins));
  }

  const setDraft = (id: string, fn: (d: Draft) => Draft) => setDrafts((ds) => ds.map((d) => (d.id === id ? fn(d) : d)));
  const rows = cabins.flatMap((c) => {
    const d = drafts.find((x) => x.id === c.id);
    return d ? [{ c, d, rate: rateOf(d, c, weekend), error: errorOf(d, c) }] : [];
  });
  const changed = rows.filter((r) => JSON.stringify(r.rate) !== JSON.stringify(savedOf(r.c)));
  const invalid = rows.some((r) => r.error);
  const weekdays = WEEK.filter((d) => !weekend.includes(d));
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
    <Card aria-labelledby="rt-base" className="flex flex-col gap-5 p-4 sm:p-5">
      <CardHeader
        id="rt-base"
        icon={<HomeIcon size={18} />}
        title="Tarifa base"
        subtitle="El precio de todas las cabañas en un solo lugar, para todo el año. Las temporadas lo reemplazan en sus fechas."
      />

      <fieldset className="flex min-w-0 flex-col gap-2 rounded-[18px] bg-canvas/60 p-3.5">
        <legend className="sr-only">Días de fin de semana</legend>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-[13.5px] font-semibold text-ink">Fin de semana para todas las cabañas</p>
          <div role="group" aria-label="Días de fin de semana" className="flex flex-wrap gap-1.5">
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
                  className={`grid size-9 place-items-center rounded-full text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${on ? "bg-ink text-paper" : "border border-line-strong text-ink-muted hover:not-disabled:text-ink"}`}
                >
                  {WD_MIN[d]}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-[12.5px] text-ink-muted">{`Noches de ${daysText(weekend)} con su propio precio en las cabañas que lo tengan; el resto, ${daysText(weekdays)}.`}</p>
      </fieldset>

      {odd.length > 0 && (
        <Callout tone="warning">
          {`${odd.map((c) => c.nombre).join(", ")} ${odd.length === 1 ? "tiene" : "tienen"} precios por día que esta tabla no muestra. Al guardar se reemplazan por el fin de semana de arriba.`}
        </Callout>
      )}

      <div className="flex flex-col gap-3">
        {rows.map(({ c, d, error }) => {
          const people = Array.from({ length: Math.max(0, c.maxPersonas - d.from + 1) }, (_, i) => d.from + i);
          const unitsText = c.units ? Array.from({ length: c.units }, (_, i) => unitLabel(c, i + 1)).join(", ") : "sin unidades";
          const lines: { key: string; label: string; get: (p: Prices) => number; put: (p: Prices, v: number) => Prices }[] = d.byPeople
            ? people.map((n) => ({
                key: `p${n}`,
                label: plural(n, "persona", "personas"),
                get: (p) => p.tiers[n] ?? 0,
                put: (p, v) => ({ ...p, tiers: { ...p.tiers, [n]: v } }),
              }))
            : [
                { key: "couple", label: "Noche para 2", get: (p) => p.couple, put: (p, v) => ({ ...p, couple: v }) },
                ...(c.maxPersonas > 2
                  ? [{ key: "extra", label: "Persona adicional", get: (p: Prices) => p.extra, put: (p: Prices, v: number) => ({ ...p, extra: v }) }]
                  : []),
              ];
          return (
            <section key={c.id} aria-labelledby={`rt-${c.id}`} className="@container flex flex-col gap-3 rounded-[18px] border border-line p-3.5 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <h3 id={`rt-${c.id}`} className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink">
                    {c.nombre}
                    {!c.activa && <Badge>Inactiva</Badge>}
                  </h3>
                  <p className="text-[13px] text-ink-muted">{`${c.units === 1 ? "Cabaña" : "Cabañas"} ${unitsText} · hasta ${plural(c.maxPersonas, "persona", "personas")}`}</p>
                </div>
                {c.maxPersonas > 2 && (
                  <Segmented
                    size="sm"
                    label={`Cómo cobra ${c.nombre}`}
                    value={d.byPeople ? "personas" : "pareja"}
                    onChange={(v) =>
                      setDraft(c.id, (x) => {
                        if (v === "pareja") return { ...x, byPeople: false };
                        // Las filas nuevas arrancan con lo que costaría hoy.
                        const seed = (p: Prices): Prices => {
                          const tiers: PersonRates = { ...p.tiers };
                          for (let n = x.from; n <= c.maxPersonas; n++) tiers[n] ??= p.couple + Math.max(0, n - 2) * p.extra;
                          return { ...p, tiers };
                        };
                        return { ...x, byPeople: true, weekday: seed(x.weekday), weekend: x.weekend && seed(x.weekend) };
                      })
                    }
                    options={[
                      { value: "personas", label: "Por personas" },
                      { value: "pareja", label: "Pareja + adicional" },
                    ]}
                  />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {d.byPeople && (
                  <label className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                    Desde
                    <Stepper
                      id={`rt-${c.id}-from`}
                      value={d.from}
                      onChange={(n) => setDraft(c.id, (x) => ({ ...x, from: n }))}
                      min={1}
                      max={c.maxPersonas}
                      unit="personas"
                    />
                  </label>
                )}
                <Switch
                  checked={!!d.weekend}
                  onChange={(on) => setDraft(c.id, (x) => ({ ...x, weekend: on ? { ...x.weekday, tiers: { ...x.weekday.tiers } } : null }))}
                  label="Precio distinto en fin de semana"
                />
              </div>

              <table className="w-full table-fixed border-separate border-spacing-y-1.5 text-[13.5px]">
                <thead>
                  <tr className="text-left text-[12px] font-semibold text-ink-muted">
                    <th scope="col" className="w-[34%] font-semibold">
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
                          onChange={(v) => setDraft(c.id, (x) => ({ ...x, weekday: l.put(x.weekday, v) }))}
                        />
                      </td>
                      {d.weekend && (
                        <td>
                          <MoneyInput
                            id={`rt-${c.id}-${l.key}-b`}
                            aria-label={`${c.nombre}, ${l.label}, ${daysText(weekend)}`}
                            invalid={!(l.get(d.weekend) > 0) && l.key !== "extra"}
                            value={l.get(d.weekend)}
                            onChange={(v) => setDraft(c.id, (x) => ({ ...x, weekend: x.weekend && l.put(x.weekend, v) }))}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.byPeople && d.from > 2 && (
                <p className="text-[12.5px] text-ink-muted">{`Con menos de ${plural(d.from, "persona", "personas")} se cobra la fila de ${d.from}.`}</p>
              )}
              {error && <FieldError>{error}</FieldError>}
            </section>
          );
        })}
      </div>

      {(changed.length > 0 || invalid) && (
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
    </Card>
  );
}
