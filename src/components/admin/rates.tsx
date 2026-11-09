"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarIcon, CheckIcon, CloseIcon, HomeIcon, PauseIcon, PencilIcon, PlayIcon, PlusIcon, TagIcon, TrashIcon, WalletIcon } from "@/components/ui/icons";
import {
  MAX_DAY_RATES,
  cleanPersonRates,
  computeQuote,
  dayRateLabel,
  invalidDayRates,
  invalidPersonRates,
  nightlyRate,
  personSteps,
  rateFrom,
  tierPrice,
} from "@/lib/booking";
import { api } from "@/lib/client/api";
import { WD_FULL, WD_MIN, addDays, cop, fmtDate, nightsBetween, plural } from "@/lib/format";
import type { PersonRates, RateSeason, SeasonDayRate, SeasonInput } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin, useParam, useSetParams } from "@/components/admin/context";
import { MODULES } from "@/components/admin/routes";
import { RatesTable } from "@/components/admin/rates-table";
import { Paginator, usePaged } from "@/components/admin/paginator";
import { DatePicker, DateRangePicker } from "@/components/admin/date-picker";
import { adminInput } from "@/components/admin/shared";
import { LIST_CARD, LIST_MOBILE_ROW, LIST_ROW, LIST_ROW_HOVER, LIST_ROW_LATEST, ListTableHead } from "@/components/admin/list-table";
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Field,
  FieldError,
  IconButton,
  Modal,
  ModalPresence,
  MoneyInput,
  PageHeader,
  Stepper,
  Switch,
  type Tone,
} from "@/components/admin/ui";

const pct = (v: number, base: number) => (base ? Math.round(((v - base) / base) * 100) : 0);
const diff = (v: number, base: number) => {
  const p = pct(v, base);
  return p === 0 ? "igual a la base" : `${p > 0 ? "+" : ""}${p} % sobre la base`;
};

function seasonState(s: RateSeason, today: string): { label: string; tone: Tone; order: number } {
  if (!s.activa) return { label: "Pausada", tone: "neutral", order: 3 };
  if (s.to < today) return { label: "Finalizada", tone: "neutral", order: 2 };
  if (s.from <= today) return { label: "Vigente ahora", tone: "success", order: 0 };
  return { label: `Empieza el ${fmtDate(s.from)}`, tone: "info", order: 1 };
}

type RatesTab = "tarifas" | "temporadas" | "simulador";
const RATES_TABS: { value: RatesTab; label: string; icon: ReactNode }[] = [
  { value: "tarifas", label: "Tarifas", icon: <TagIcon size={14} /> },
  { value: "temporadas", label: "Temporadas", icon: <CalendarIcon size={14} /> },
  { value: "simulador", label: "Simulador", icon: <WalletIcon size={14} /> },
];

export function RatesView() {
  const { data, today } = useAdmin();
  const params = useSearchParams();
  const setParams = useSetParams();
  const [tabP, setTab] = useParam<RatesTab>("vista", "tarifas");
  // Un enlace directo a una temporada abre esa pestaña debajo de su editor.
  const tab: RatesTab = params.get("temporada") ? "temporadas" : RATES_TABS.some((t) => t.value === tabP) ? tabP : "tarifas";
  const [filter, setFilter] = useParam<"vigentes" | "finalizadas" | "todas">("mostrar", "vigentes");
  const seasons = [...data.seasons].sort((a, b) => seasonState(a, today).order - seasonState(b, today).order || (a.from < b.from ? -1 : 1));
  const [cabinId, setCabinId] = useParam("cabana", "");
  const shown = seasons.filter(
    (s) => (filter === "todas" || (filter === "finalizadas" ? s.to < today : s.to >= today)) && (!cabinId || s.cabinTypeId === cabinId),
  );

  // El editor de temporadas se abre desde la URL: ?temporada=nueva o ?temporada=<id>.
  const seasonId = params.get("temporada");
  const first = data.cabinTypes[0];
  const found = seasonId && seasonId !== "nueva" ? data.seasons.find((x) => x.id === seasonId) : undefined;
  const editing: SeasonInput | null =
    seasonId === "nueva"
      ? {
          cabinTypeId: first?.id ?? "",
          nombre: "",
          from: "",
          to: "",
          precioPareja: first?.precioPareja ?? 0,
          personaAdicional: first?.personaAdicional ?? 0,
          preciosPersonas: first?.preciosPersonas ?? {},
          activa: true,
          dayRates: [],
        }
      : found
        ? { ...found }
        : null;
  const edit = (id: string) => setParams({ temporada: id });
  const paged = usePaged(shown, "temporadas", `${filter}|${cabinId}`);

  // Barra de secciones compacta; en el teléfono ocupa todo el ancho, en partes iguales. En Tarifas va junto a los días de fin de semana.
  const tabs = (
    <div role="tablist" aria-label="Secciones de tarifas" className="grid w-full grid-cols-3 gap-1 rounded-full bg-panel p-1 sm:w-fit">
      {RATES_TABS.map((t) => {
        const on = t.value === tab;
        const count = t.value === "temporadas" ? data.seasons.filter((s) => s.activa && s.to >= today).length : 0;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => setTab(t.value)}
            className={`inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-[13px] font-semibold whitespace-nowrap transition-colors duration-150 sm:px-4 ${on ? "bg-ink text-paper" : "text-ink-muted hover:text-ink"}`}
          >
            {t.icon}
            {t.label}
            {count > 0 && <span className="rounded-full bg-yellow px-1.5 text-[11px] font-bold text-ink tabular-nums">{count}</span>}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <PageHeader
        title={MODULES.tarifas.label}
        description="El precio de cada noche. Las temporadas lo reemplazan en sus fechas."
        actions={
          tab === "temporadas" ? (
            <Button variant="primary" icon={<PlusIcon size={14} />} onClick={() => edit("nueva")}>
              Nueva temporada
            </Button>
          ) : undefined
        }
      />

      {tab !== "tarifas" && tabs}

      {/* Oculta, no desmontada: cambiar de pestaña no borra los cambios sin guardar. */}
      <div className={tab === "tarifas" ? "" : "hidden"}>
        <RatesTable toolbar={tabs} />
      </div>

      {tab === "simulador" && <Simulator />}

      {tab === "temporadas" && (
        <section aria-label="Temporadas" className="flex flex-col gap-3">
          <p className="text-[13.5px] text-ink-muted">Dos temporadas activas de la misma cabaña no pueden cruzarse.</p>
          {data.seasons.length > 0 && (
            <div role="search" aria-label="Filtrar temporadas" className="grid grid-cols-1 items-center gap-2 sm:grid-cols-2 xl:w-[560px]">
              <div className="min-w-0">
                <label htmlFor="rt-mostrar" className="sr-only">
                  Mostrar
                </label>
                <Combobox
                  id="rt-mostrar"
                  value={filter}
                  onChange={(v) => setFilter(v as typeof filter)}
                  searchable={false}
                  options={[
                    {
                      value: "vigentes",
                      label: "Vigentes y próximas",
                      description: plural(data.seasons.filter((s) => s.to >= today).length, "temporada", "temporadas"),
                    },
                    { value: "finalizadas", label: "Finalizadas" },
                    { value: "todas", label: "Todas" },
                  ]}
                />
              </div>
              <div className="min-w-0">
                <Combobox
                  value={cabinId}
                  onChange={setCabinId}
                  options={[{ value: "", label: "Todas las cabañas" }, ...data.cabinTypes.map((c) => ({ value: c.id, label: c.nombre }))]}
                  icon={<HomeIcon size={14} className="text-ink-muted" />}
                />
              </div>
            </div>
          )}
          {shown.length ? (
            <>
              <Card className={LIST_CARD}>
                <table className="w-full text-[14px]">
                  <ListTableHead columns={["Temporada", "Cabaña", "Fechas", "Precio", "Estado", "Acciones"]} right={["Precio", "Acciones"]} />
                  <tbody className="divide-y divide-line">
                    {paged.rows.map((s) => (
                      <SeasonTableRow key={s.id} s={s} onEdit={() => edit(s.id)} />
                    ))}
                  </tbody>
                </table>
                <Paginator p={paged} noun="temporadas" className="border-t border-line px-4 py-3" />
              </Card>
              <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:hidden">
                {paged.rows.map((s) => (
                  <SeasonCard key={s.id} s={s} onEdit={() => edit(s.id)} />
                ))}
              </ul>
              <Paginator p={paged} noun="temporadas" className="rounded-[20px] bg-paper px-4 py-3 ring-1 ring-line xl:hidden" />
            </>
          ) : (
            <Card className="p-4">
              <EmptyState
                compact
                icon={<CalendarIcon size={18} />}
                title={data.seasons.length ? "No hay temporadas con esos filtros" : "Aún no hay temporadas"}
                text={
                  data.seasons.length
                    ? undefined
                    : "Crea una temporada para cobrar distinto en fechas de alta demanda. Se aplica automáticamente al cotizar en el sitio."
                }
              />
            </Card>
          )}
        </section>
      )}

      <ModalPresence>{editing && <SeasonEditor key={seasonId} initial={editing} onClose={() => setParams({ temporada: null })} />}</ModalPresence>
    </>
  );
}

/* ───────────── Precio por cantidad de personas ───────────── */

// Precio por noche según cuántas personas se alojan, cuando no sube parejo. Muestra una fila por cada cantidad posible en la
// cabaña, desde la que se elija hasta su capacidad. Lo usan la tarifa base, las temporadas y los precios por día.
function PersonRatesEditor({
  value,
  max,
  couple,
  extra,
  error,
  onChange,
}: {
  value: PersonRates;
  max: number;
  couple: number;
  extra: number;
  error?: string;
  onChange: (r: PersonRates) => void;
}) {
  const steps = personSteps(value);
  const on = steps.length > 0;
  const from = steps[0] ?? Math.min(2, max);
  const guess = (n: number) => couple + Math.max(0, n - 2) * extra;
  // Conserva lo escrito; las filas nuevas arrancan con lo que costaría hoy.
  const rebuild = (start: number) => {
    const next: PersonRates = {};
    for (let n = start; n <= max; n++) next[n] = value[n] ?? guess(n);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <Switch
        checked={on}
        onChange={(v) => (v ? rebuild(from) : onChange({}))}
        label="Cobrar según la cantidad de personas"
        description={`Un precio por noche para cada cantidad, hasta ${plural(max, "persona", "personas")}.`}
      />
      {on && (
        <div className="flex flex-col gap-3 rounded-[18px] bg-canvas/60 p-3.5">
          <Field label="Desde" hint="Con menos personas se cobra esta primera fila.">
            {(p) => <Stepper id={p.id} describedBy={p["aria-describedby"]} value={from} onChange={rebuild} min={1} max={max} unit="personas" />}
          </Field>
          <div className="flex flex-col gap-3">
            {Array.from({ length: max - from + 1 }, (_, i) => from + i).map((n) => (
              <Field key={n} label={`Noche para ${plural(n, "persona", "personas")}`}>
                {(p) => (
                  <MoneyInput
                    id={p.id}
                    describedBy={p["aria-describedby"]}
                    invalid={!(value[n] > 0)}
                    value={value[n] ?? 0}
                    onChange={(price) => {
                      const next: PersonRates = {};
                      for (let k = from; k <= max; k++) next[k] = k === n ? price : (value[k] ?? guess(k));
                      onChange(next);
                    }}
                  />
                )}
              </Field>
            ))}
          </div>
          {error && <FieldError>{error}</FieldError>}
        </div>
      )}
    </div>
  );
}

/* ───────────── Temporadas ───────────── */

// Editar, pausar o activar y eliminar: los clics no abren el editor dos veces (la fila entera también lo abre).
function SeasonActions({ s, onEdit }: { s: RateSeason; onEdit: () => void }) {
  const { ask } = useAdmin();
  const toggle = () =>
    ask({
      title: s.activa ? "Pausar temporada" : "Activar temporada",
      text: s.activa
        ? `«${s.nombre}» deja de aplicarse: esas fechas vuelven al precio base.`
        : `«${s.nombre}» vuelve a aplicarse a las cotizaciones de esas fechas.`,
      okLabel: s.activa ? "Pausar" : "Activar",
      done: s.activa ? "Temporada pausada" : "Temporada activada",
      run: () => api.admin.updateSeason({ ...s, activa: !s.activa }),
    });
  const remove = () =>
    ask({
      title: "Eliminar temporada",
      text: `«${s.nombre}» se elimina. Las reservas ya hechas conservan su valor.`,
      okLabel: "Eliminar",
      danger: true,
      done: "Temporada eliminada",
      run: () => api.admin.deleteSeason(s.id),
    });
  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <IconButton label={`Editar ${s.nombre}`} size="sm" variant="secondary" data-gesture="cancel" onClick={onEdit}>
        <PencilIcon size={15} />
      </IconButton>
      <IconButton label={s.activa ? `Pausar ${s.nombre}` : `Activar ${s.nombre}`} size="sm" variant="secondary" data-gesture="pay" onClick={toggle}>
        {s.activa ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
      </IconButton>
      <IconButton label={`Eliminar ${s.nombre}`} size="sm" variant="danger-ghost" data-gesture="cancel" onClick={remove}>
        <TrashIcon size={15} />
      </IconButton>
    </div>
  );
}

// Lo que comparten la fila de la tabla y la tarjeta del teléfono.
function useSeasonView(s: RateSeason) {
  const { today, cabin } = useAdmin();
  const c = cabin(s.cabinTypeId);
  const from = rateFrom(s);
  return {
    st: seasonState(s, today),
    cabinName: c?.nombre ?? s.cabinTypeId,
    nights: plural(nightsBetween(s.from, s.to) + 1, "noche", "noches"),
    dates: `${fmtDate(s.from)} → ${fmtDate(s.to)}`,
    price: cop(from.price),
    priceHint: `para ${from.guests}${c ? ` · ${diff(from.price, rateFrom(c).price)}` : ""}`,
    days: (s.dayRates ?? []).map((r) => (
      <Badge key={dayRateLabel(r)} tone="info">
        {dayRateLabel(r)} · {cop(rateFrom(r).price)}
      </Badge>
    )),
  };
}

function SeasonTableRow({ s, onEdit }: { s: RateSeason; onEdit: () => void }) {
  const v = useSeasonView(s);
  return (
    <tr
      onClick={onEdit}
      className={`${LIST_ROW} ${v.st.order === 0 ? LIST_ROW_LATEST : LIST_ROW_HOVER} ${v.st.order >= 2 ? "[&>td:not(:last-child)]:opacity-60" : ""}`}
    >
      <td className="px-4 py-3">
        <span className="block font-bold text-ink">{s.nombre}</span>
        {v.days.length > 0 && <span className="mt-1 flex flex-wrap gap-1.5">{v.days}</span>}
      </td>
      <td className="px-4 py-3 text-ink">{v.cabinName}</td>
      <td className="px-4 py-3">
        <span className="block whitespace-nowrap text-ink">{v.dates}</span>
        <span className="block text-[12.5px] text-ink-muted">{v.nights}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="block font-semibold text-ink tabular-nums">{v.price}</span>
        <span className="block text-[12px] whitespace-nowrap text-ink-muted">{v.priceHint}</span>
      </td>
      <td className="px-4 py-3">
        <Badge tone={v.st.tone}>{v.st.label}</Badge>
      </td>
      <td className="px-4 py-3">
        <SeasonActions s={s} onEdit={onEdit} />
      </td>
    </tr>
  );
}

function SeasonCard({ s, onEdit }: { s: RateSeason; onEdit: () => void }) {
  const v = useSeasonView(s);
  return (
    <li className={`${LIST_MOBILE_ROW} ${v.st.order === 0 ? "bg-yellow-soft/70" : "bg-paper"} ${v.st.order >= 2 ? "opacity-75" : ""}`}>
      <span className="flex w-full flex-wrap items-center justify-between gap-2">
        <strong className="font-bold text-ink">{s.nombre}</strong>
        <Badge tone={v.st.tone}>{v.st.label}</Badge>
      </span>
      <span className="text-[13px] text-ink-muted">{`${v.cabinName} · ${v.dates} · ${v.nights}`}</span>
      {v.days.length > 0 && <span className="flex flex-wrap gap-1.5">{v.days}</span>}
      <span className="flex w-full flex-wrap items-center justify-between gap-2">
        <span>
          <strong className="block font-semibold text-ink tabular-nums">{v.price}</strong>
          <span className="block text-[12px] text-ink-muted">{v.priceHint}</span>
        </span>
        <SeasonActions s={s} onEdit={onEdit} />
      </span>
    </li>
  );
}

function SeasonEditor({ initial, onClose }: { initial: SeasonInput; onClose: () => void }) {
  const { data, setData, toast, today, onAuthError } = useAdmin();
  const [s, setS] = useState<SeasonInput>(initial);
  const [rules, setRules] = useState<DraftRule[]>((initial.dayRates ?? []).map((r) => ({ ...r, kind: r.dates.length ? "dates" : "weekdays" })));
  const [cabins, setCabins] = useState<string[]>(
    initial.id
      ? [initial.cabinTypeId]
      : data.cabinTypes
          .filter((c) => c.activa)
          .map((c) => c.id)
          .slice(0, 1),
  );
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (p: Partial<SeasonInput>) => {
    setS((x) => ({ ...x, ...p }));
    setError("");
  };
  const ref = data.cabinTypes.find((c) => c.id === (initial.id ? s.cabinTypeId : cabins[0]));
  const chosen = data.cabinTypes.filter((c) => cabins.includes(c.id));
  // La capacidad manda en las filas de precio: con varias cabañas, la mayor; cada una guarda solo las que le caben.
  const capacity = Math.max(...chosen.map((c) => c.maxPersonas), 1);
  const capacityNote = chosen.length > 1 && new Set(chosen.map((c) => c.maxPersonas)).size > 1;
  const hasTiers = personSteps(s.preciosPersonas).length > 0;
  // Mientras no se toquen los precios, una temporada nueva arranca con los de la cabaña elegida.
  const pricesTouched = useRef(!!initial.id);
  const setPrice = (p: Partial<SeasonInput>) => {
    pricesTouched.current = true;
    set(p);
  };
  const pickCabins = (next: string[]) => {
    setCabins(next);
    const c = data.cabinTypes.find((x) => x.id === next[0]);
    if (c && !pricesTouched.current) set({ precioPareja: c.precioPareja, personaAdicional: c.personaAdicional, preciosPersonas: c.preciosPersonas ?? {} });
  };

  // Cruces con otras temporadas activas de las mismas cabañas.
  const clash =
    s.activa && s.from && s.to
      ? data.seasons.filter((x) => x.id !== s.id && x.activa && cabins.includes(x.cabinTypeId) && x.from <= s.to && s.from <= x.to)
      : [];
  const errs = {
    nombre: !s.nombre.trim() ? "Escribe un nombre, por ejemplo «Temporada alta de diciembre»." : "",
    cabins: !cabins.length ? "Elige al menos una cabaña." : "",
    dates: !s.from || !s.to ? "Elige la primera y la última noche." : "",
    price: !hasTiers && s.precioPareja <= 0 ? "La tarifa debe ser mayor que cero." : "",
    tiers: invalidPersonRates(s.preciosPersonas) ?? "",
    dayRates: s.from && s.to ? (invalidDayRates(rules.map(ruleOf), s.from, s.to) ?? "") : "",
  };
  const invalid = Object.values(errs).some(Boolean) || clash.length > 0;

  async function save() {
    setTried(true);
    if (invalid || busy) return;
    setBusy(true);
    try {
      let last: RateSeason[] | null = null;
      for (const id of cabins) {
        const max = data.cabinTypes.find((c) => c.id === id)?.maxPersonas;
        const body = {
          ...s,
          nombre: s.nombre.trim(),
          cabinTypeId: id,
          preciosPersonas: cleanPersonRates(s.preciosPersonas, max),
          dayRates: rules.map(ruleOf).map((r) => ({ ...r, preciosPersonas: cleanPersonRates(r.preciosPersonas, max) })),
        };
        const r = s.id ? await api.admin.updateSeason(body) : await api.admin.createSeason(body);
        if (r.status === 401 || r.status === 403) return onAuthError();
        if (r.status !== 200 || !Array.isArray(r.data)) {
          const f = (r.data as { fields?: Record<string, string> } | null)?.fields;
          setError(f ? Object.values(f)[0] : "No se pudo guardar la temporada.");
          if (last) setData((d) => ({ ...d, seasons: last! }));
          return;
        }
        last = r.data;
      }
      if (last) setData((d) => ({ ...d, seasons: last! }));
      toast(s.id ? "Temporada actualizada" : cabins.length > 1 ? `Temporada creada para ${plural(cabins.length, "cabaña", "cabañas")}` : "Temporada creada");
      onClose();
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const nights = s.from && s.to ? nightsBetween(s.from, s.to) + 1 : 0;

  return (
    <Modal onClose={onClose} labelledBy="se-title" initialFocus="#se-name" className="m-auto w-[calc(100%-32px)] max-w-[560px] rounded-[26px] p-0">
      <div className="flex max-h-[calc(100dvh-140px)] flex-col gap-4 overflow-y-auto p-5 sm:p-6">
        <div>
          <h2 id="se-title" className="text-[18px] font-bold tracking-[-0.02em] text-ink">
            {s.id ? "Editar temporada" : "Nueva temporada"}
          </h2>
          <p className="text-[13.5px] text-ink-muted">En estas noches se cobra este precio en lugar de la tarifa base.</p>
        </div>
        <Field label="Nombre" error={tried ? errs.nombre : undefined}>
          {(p) => (
            <input
              {...p}
              id="se-name"
              type="text"
              maxLength={80}
              value={s.nombre}
              onChange={(e) => set({ nombre: e.target.value })}
              placeholder="Temporada alta de fin de año"
              className={adminInput}
            />
          )}
        </Field>
        {s.id ? (
          <Field label="Cabaña">
            {(p) => (
              <Combobox
                id={p.id}
                value={s.cabinTypeId}
                onChange={(v) => {
                  set({ cabinTypeId: v });
                  pickCabins([v]);
                }}
                options={data.cabinTypes.map((c) => ({ value: c.id, label: c.nombre }))}
              />
            )}
          </Field>
        ) : (
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1.5 text-[13px] font-semibold text-ink">Aplica a</legend>
            <div className="flex flex-wrap gap-2">
              {data.cabinTypes.map((c) => {
                const on = cabins.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${on ? "border-ink bg-paper text-ink" : "border-dashed border-line-strong text-ink-muted hover:text-ink"}`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => pickCabins(on ? cabins.filter((x) => x !== c.id) : [...cabins, c.id])}
                      className="size-4 accent-[var(--color-ink)]"
                    />
                    {c.nombre}
                  </label>
                );
              })}
            </div>
            {tried && errs.cabins && <FieldError>{errs.cabins}</FieldError>}
          </fieldset>
        )}
        <Field
          label="Noches que cubre (la última incluida)"
          error={tried ? errs.dates : undefined}
          hint={nights ? `${plural(nights, "noche", "noches")}: se cobra la temporada a quien duerma en cualquiera de ellas.` : undefined}
        >
          {(p) => (
            <DateRangePicker
              id={p.id}
              describedBy={p["aria-describedby"]}
              invalid={!!p["aria-invalid"]}
              mode="days"
              from={s.from || null}
              to={s.to || null}
              min={s.id ? undefined : today}
              onChange={(from, to) => set({ from: from ?? "", to: to ?? "" })}
            />
          )}
        </Field>
        {!hasTiers && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Noche para 2"
              error={tried ? errs.price : undefined}
              hint={ref ? `Base ${cop(ref.precioPareja)} · ${diff(s.precioPareja, ref.precioPareja)}` : undefined}
            >
              {(p) => (
                <MoneyInput
                  id={p.id}
                  describedBy={p["aria-describedby"]}
                  invalid={!!p["aria-invalid"]}
                  value={s.precioPareja}
                  onChange={(n) => setPrice({ precioPareja: n })}
                />
              )}
            </Field>
            <Field label="Persona adicional" hint={ref ? `Base ${cop(ref.personaAdicional)}` : undefined}>
              {(p) => (
                <MoneyInput id={p.id} describedBy={p["aria-describedby"]} value={s.personaAdicional} onChange={(n) => setPrice({ personaAdicional: n })} />
              )}
            </Field>
          </div>
        )}
        <PersonRatesEditor
          value={s.preciosPersonas ?? {}}
          max={capacity}
          couple={s.precioPareja}
          extra={s.personaAdicional}
          error={errs.tiers || undefined}
          onChange={(preciosPersonas) => setPrice({ preciosPersonas })}
        />
        {capacityNote && (
          <p className="-mt-1 text-[12.5px] text-ink-muted">
            Cada cabaña guarda solo las filas de su capacidad: {chosen.map((c) => `${c.nombre} hasta ${c.maxPersonas}`).join(", ")}.
          </p>
        )}
        <DayRatesEditor
          season={s}
          capacity={capacity}
          rules={rules}
          onChange={(r) => {
            setRules(r);
            setError("");
          }}
          error={tried ? errs.dayRates : undefined}
        />
        <Switch
          checked={s.activa}
          onChange={(v) => set({ activa: v })}
          label="Activa"
          description="Si la pausas, se guarda pero no se aplica a las cotizaciones."
        />
        {clash.length > 0 && (
          <Callout tone="error" role="alert">
            Se cruza con {clash.map((x) => `«${x.nombre}» (${fmtDate(x.from)} → ${fmtDate(x.to)})`).join(", ")} de la misma cabaña. Ajusta las fechas o pausa
            una de las dos.
          </Callout>
        )}
        {s.from && s.to && !clash.length && ref && !hasTiers && !personSteps(ref.preciosPersonas).length && s.precioPareja > 0 && (
          <Callout>
            Ejemplo: 2 noches para 2 personas en {ref.nombre} durante esta temporada = <strong>{cop(s.precioPareja * 2)}</strong> (con la tarifa base serían{" "}
            {cop(ref.precioPareja * 2)}).
          </Callout>
        )}
        {error && <FieldError>{error}</FieldError>}
      </div>
      <div className="flex flex-col-reverse gap-2 rounded-b-[26px] border-t border-line bg-canvas/70 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={busy} disabled={tried && invalid} icon={<CheckIcon size={14} />} onClick={save}>
          {s.id ? "Guardar cambios" : "Crear temporada"}
        </Button>
      </div>
    </Modal>
  );
}

/* ───────────── Precios por día ───────────── */

// En el editor cada regla recuerda si es de días de la semana o de fechas (vacía, no se sabría).
type DraftRule = SeasonDayRate & { kind: "weekdays" | "dates" };
const ruleOf = ({ kind, ...r }: DraftRule): SeasonDayRate => (kind === "dates" ? { ...r, weekdays: [] } : { ...r, dates: [] });
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // la semana empieza el lunes

// Dentro de la temporada, unas noches de la semana o unas fechas puntuales se cobran distinto. Una fecha puntual gana
// sobre un día de la semana; las demás noches se cobran con el precio de la temporada.
function DayRatesEditor({
  season,
  capacity,
  rules,
  onChange,
  error,
}: {
  season: Pick<SeasonInput, "precioPareja" | "personaAdicional" | "preciosPersonas" | "from" | "to">;
  capacity: number;
  rules: DraftRule[];
  onChange: (r: DraftRule[]) => void;
  error?: string;
}) {
  const update = (i: number, p: Partial<DraftRule>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const add = (kind: DraftRule["kind"]) =>
    onChange([
      ...rules,
      {
        kind,
        weekdays: [],
        dates: [],
        precioPareja: season.precioPareja,
        personaAdicional: season.personaAdicional,
        preciosPersonas: season.preciosPersonas ?? {},
      },
    ]);
  const takenDays = (i: number) => new Set(rules.flatMap((r, j) => (j !== i && r.kind === "weekdays" ? r.weekdays : [])));
  const takenDates = (i: number) => new Set(rules.flatMap((r, j) => (j !== i && r.kind === "dates" ? r.dates : [])));
  const full = rules.length >= MAX_DAY_RATES;

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <div>
        <legend className="text-[13px] font-semibold text-ink">Precios por día (opcional)</legend>
        <p className="text-[12.5px] text-ink-muted">
          Cobra distinto ciertas noches de la temporada: por ejemplo, viernes y sábado, o el 24 y el 31 de diciembre. Una fecha puntual gana sobre un día de la
          semana.
        </p>
      </div>
      {rules.map((r, i) => {
        const days = takenDays(i);
        const dates = takenDates(i);
        return (
          <div key={i} className="flex flex-col gap-3 rounded-[18px] bg-canvas/60 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-ink">{r.kind === "weekdays" ? "Noches de la semana" : "Fechas puntuales"}</p>
              <IconButton label="Quitar este precio por día" size="sm" variant="danger-ghost" onClick={() => onChange(rules.filter((_, j) => j !== i))}>
                <TrashIcon size={14} />
              </IconButton>
            </div>
            {r.kind === "weekdays" ? (
              <div role="group" aria-label="Noches de la semana" className="flex flex-wrap gap-1.5">
                {WEEK.map((d) => {
                  const on = r.weekdays.includes(d);
                  const used = days.has(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      aria-label={WD_FULL[d]}
                      title={used ? `${WD_FULL[d]} ya tiene otro precio` : WD_FULL[d]}
                      disabled={used}
                      onClick={() => update(i, { weekdays: on ? r.weekdays.filter((x) => x !== d) : [...r.weekdays, d] })}
                      className={`grid size-9 place-items-center rounded-full text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${on ? "bg-ink text-paper" : "border border-line-strong text-ink-muted hover:not-disabled:text-ink"}`}
                    >
                      {WD_MIN[d]}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {r.dates.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {[...r.dates].sort().map((d) => (
                      <li key={d} className="flex items-center gap-1 rounded-full bg-paper py-1 pr-1 pl-3 text-[13px] font-semibold text-ink">
                        {fmtDate(d, true)}
                        <IconButton label={`Quitar ${fmtDate(d, true)}`} size="sm" onClick={() => update(i, { dates: r.dates.filter((x) => x !== d) })}>
                          <CloseIcon size={13} />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                )}
                {season.from && season.to ? (
                  <DatePicker
                    value={null}
                    min={season.from}
                    max={season.to}
                    disabled={(iso) => dates.has(iso) || r.dates.includes(iso)}
                    placeholder="Agregar una fecha"
                    onChange={(iso) => iso && update(i, { dates: [...r.dates, iso] })}
                  />
                ) : (
                  <p className="text-[12.5px] text-ink-muted">Elige primero las noches de la temporada.</p>
                )}
              </div>
            )}
            {!personSteps(r.preciosPersonas).length && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Noche para 2" hint={`Temporada ${cop(season.precioPareja)}`}>
                  {(p) => <MoneyInput id={p.id} describedBy={p["aria-describedby"]} value={r.precioPareja} onChange={(n) => update(i, { precioPareja: n })} />}
                </Field>
                {capacity > 2 && (
                  <Field label="Persona adicional" hint={`Temporada ${cop(season.personaAdicional)}`}>
                    {(p) => (
                      <MoneyInput
                        id={p.id}
                        describedBy={p["aria-describedby"]}
                        value={r.personaAdicional}
                        onChange={(n) => update(i, { personaAdicional: n })}
                      />
                    )}
                  </Field>
                )}
              </div>
            )}
            <PersonRatesEditor
              value={r.preciosPersonas ?? {}}
              max={capacity}
              couple={r.precioPareja}
              extra={r.personaAdicional}
              onChange={(preciosPersonas) => update(i, { preciosPersonas })}
            />
          </div>
        );
      })}
      {error && <FieldError>{error}</FieldError>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<PlusIcon size={13} />} disabled={full} onClick={() => add("weekdays")}>
          Días de la semana
        </Button>
        <Button size="sm" icon={<PlusIcon size={13} />} disabled={full} onClick={() => add("dates")}>
          Fechas puntuales
        </Button>
      </div>
    </fieldset>
  );
}

/* ───────────── Simulador ───────────── */

// Responde «¿cuánto pagaría un huésped?» con las tarifas y temporadas actuales, noche a noche.
function Simulator() {
  const { data, today } = useAdmin();
  const active = data.cabinTypes.filter((c) => c.activa);
  const [cabinId, setCabinId] = useState(active[0]?.id ?? "");
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({ from: addDays(today, 7), to: addDays(today, 9) });
  const [wanted, setGuests] = useState(2);
  const c = data.cabinTypes.find((x) => x.id === cabinId);
  // Al pasar a una cabaña más pequeña no se cotiza por encima de su capacidad.
  const guests = Math.min(wanted, c?.maxPersonas ?? wanted);
  const pct = data.site.settings.depositPct;
  const minPeople = personSteps(c?.preciosPersonas)[0];

  // Cada renglón es lo que vale una noche para estos huéspedes y de dónde sale; la suma de los renglones es el total.
  const result = useMemo(() => {
    if (!c || !range.from || !range.to || range.to <= range.from) return null;
    const q = computeQuote(c, range.from, range.to, guests, data.seasons, pct);
    const weekend = (c.dayRates ?? []).find((r) => r.weekdays.length);
    const weekdaysLabel = weekend ? dayRateLabel({ ...weekend, weekdays: WEEK.filter((d) => !weekend.weekdays.includes(d)), dates: [] }) : "";
    const extra = Math.max(0, guests - 2);
    const groups = new Map<string, { label: string; nights: number; price: number; detail: string }>();
    for (let d = range.from; d < range.to; d = addDays(d, 1)) {
      const r = nightlyRate(c, data.seasons, d);
      const key = `${r.season?.id ?? "base"}|${r.dayRate ? dayRateLabel(r.dayRate) : ""}`;
      const label = r.season
        ? r.dayRate
          ? `${r.season.nombre} · ${dayRateLabel(r.dayRate)}`
          : r.season.nombre
        : r.dayRate
          ? `Tarifa base · ${dayRateLabel(r.dayRate)}`
          : weekdaysLabel
            ? `Tarifa base · ${weekdaysLabel}`
            : "Tarifa base";
      const step = r.tiers ? ([...personSteps(r.tiers)].reverse().find((n) => n <= guests) ?? personSteps(r.tiers)[0]) : 0;
      const price = r.tiers ? tierPrice(r.tiers, guests) : r.couple + extra * r.extra;
      const detail = r.tiers
        ? step === guests
          ? `para ${plural(guests, "persona", "personas")}`
          : `tarifa de ${plural(step, "persona", "personas")}`
        : extra && r.extra
          ? `pareja ${cop(r.couple)} + ${plural(extra, "adicional", "adicionales")} × ${cop(r.extra)}`
          : "para 2 personas";
      const g = groups.get(key) ?? { label, nights: 0, price, detail };
      g.nights++;
      groups.set(key, g);
    }
    return { q, groups: [...groups.values()] };
  }, [c, range, guests, data.seasons, pct]);

  if (!active.length) return null;
  return (
    <Card aria-label="Simulador de precio" className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.4fr_auto]">
        <Field label="Cabaña">
          {(p) => <Combobox id={p.id} value={cabinId} onChange={setCabinId} options={active.map((x) => ({ value: x.id, label: x.nombre }))} />}
        </Field>
        <Field label="Fechas">
          {(p) => <DateRangePicker id={p.id} mode="nights" from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} clearable={false} />}
        </Field>
        <Field label="Huéspedes">{(p) => <Stepper id={p.id} value={guests} onChange={setGuests} min={1} max={c?.maxPersonas ?? 12} />}</Field>
        {minPeople && guests < minPeople && (
          <p className="-mt-1 text-[12.5px] text-ink-muted md:col-span-3">{`${c?.nombre} cobra desde ${plural(minPeople, "persona", "personas")}: con ${guests} se cobra la tarifa de ${minPeople}.`}</p>
        )}
      </div>
      {result ? (
        <div className="grid grid-cols-1 gap-4 rounded-[18px] bg-paper p-4 ring-1 ring-line md:grid-cols-[1fr_auto]">
          <ul className="flex flex-col gap-1.5 text-[13.5px]">
            {result.groups.map((g) => (
              <li key={g.label} data-sim-line className="flex flex-wrap justify-between gap-x-4">
                <span className="text-ink">
                  {plural(g.nights, "noche", "noches")} × {cop(g.price)}{" "}
                  <span className="text-ink-muted">
                    · {g.label} · {g.detail}
                  </span>
                </span>
                <span className="font-semibold text-ink tabular-nums">{cop(g.nights * g.price)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col items-start gap-0.5 border-t border-line pt-3 md:items-end md:border-t-0 md:border-l md:pt-0 md:pl-5">
            <span className="text-[12.5px] text-ink-muted">Total</span>
            <strong className="text-[24px] font-bold tracking-[-0.025em] text-ink tabular-nums">{cop(result.q.total)}</strong>
            <span className="text-[12.5px] text-ink-muted">
              Abono {data.site.settings.depositPct} %: {cop(result.q.deposit)}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-ink-muted">Elige una cabaña y las fechas de llegada y salida.</p>
      )}
    </Card>
  );
}
