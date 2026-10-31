"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CalendarIcon, CheckIcon, HomeIcon, PauseIcon, PencilIcon, PlayIcon, PlusIcon, TagIcon, TrashIcon } from "@/components/icons";
import { computeQuote, nightlyRate } from "@/lib/booking";
import { api } from "@/lib/api";
import { config } from "@/lib/config";
import { addDays, cop, fmtDate, nightsBetween, plural } from "@/lib/format";
import type { CabinType, RateSeason, SeasonInput } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin, useParam, useSetParams } from "./context";
import { MODULES } from "./routes";
import { DateRangePicker } from "./date-picker";
import { adminInput } from "./shared";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  Field,
  FieldError,
  IconButton,
  Modal,
  MoneyInput,
  PageHeader,
  Segmented,
  Stepper,
  Switch,
  type Tone,
} from "./ui";

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

export function RatesView() {
  const { data, today } = useAdmin();
  const params = useSearchParams();
  const setParams = useSetParams();
  const [filter, setFilter] = useParam<"vigentes" | "finalizadas" | "todas">("mostrar", "vigentes");
  const seasons = [...data.seasons].sort((a, b) => seasonState(a, today).order - seasonState(b, today).order || (a.from < b.from ? -1 : 1));
  const shown = seasons.filter((s) => filter === "todas" || (filter === "finalizadas" ? s.to < today : s.to >= today));

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
          activa: true,
        }
      : found
        ? { ...found }
        : null;
  const edit = (id: string) => setParams({ temporada: id });

  return (
    <>
      <PageHeader
        title={MODULES.tarifas.label}
        description="El precio base aplica todo el año. Las temporadas reemplazan el precio base en sus fechas (por ejemplo, fin de año o puentes festivos)."
      />

      <section aria-labelledby="rt-base" className="flex flex-col gap-3">
        <h2 id="rt-base" className="text-[15px] font-bold text-ink">
          Tarifa base por cabaña
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.cabinTypes.map((c) => (
            <BaseRateCard key={`${c.id}-${c.precioPareja}-${c.personaAdicional}`} c={c} />
          ))}
        </div>
      </section>

      <Card aria-labelledby="rt-seasons" className="flex flex-col gap-4 p-4 sm:p-5">
        <CardHeader
          id="rt-seasons"
          icon={<CalendarIcon size={18} />}
          title="Temporadas"
          subtitle="Precio especial por fechas. Dos temporadas activas de la misma cabaña no pueden cruzarse."
          actions={
            <Button variant="primary" icon={<PlusIcon size={14} />} onClick={() => edit("nueva")}>
              Nueva temporada
            </Button>
          }
        />
        {data.seasons.length > 0 && (
          <Segmented
            label="Mostrar"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "vigentes", label: "Vigentes y próximas", count: data.seasons.filter((s) => s.to >= today).length },
              { value: "finalizadas", label: "Finalizadas" },
              { value: "todas", label: "Todas" },
            ]}
          />
        )}
        {shown.length ? (
          <ul className="flex flex-col gap-2">
            {shown.map((s) => (
              <SeasonRow key={s.id} s={s} onEdit={() => edit(s.id)} />
            ))}
          </ul>
        ) : (
          <EmptyState
            compact
            icon={<CalendarIcon size={18} />}
            title={data.seasons.length ? "No hay temporadas en este filtro" : "Aún no hay temporadas"}
            text={
              data.seasons.length
                ? undefined
                : "Crea una temporada para cobrar distinto en fechas de alta demanda. Se aplica automáticamente al cotizar en el sitio."
            }
          />
        )}
      </Card>

      <Simulator />

      {editing && <SeasonEditor key={seasonId} initial={editing} onClose={() => setParams({ temporada: null })} />}
    </>
  );
}

/* ───────────── Tarifa base ───────────── */

function BaseRateCard({ c }: { c: CabinType }) {
  const { ask } = useAdmin();
  const [v, setV] = useState({ precioPareja: c.precioPareja, personaAdicional: c.personaAdicional });
  const dirty = v.precioPareja !== c.precioPareja || v.personaAdicional !== c.personaAdicional;
  const invalid = v.precioPareja <= 0;

  const save = () =>
    ask({
      title: "Guardar tarifa base",
      text: `${c.nombre}. Aplica a las cotizaciones desde ahora; las reservas existentes conservan su valor.`,
      details: [
        ...(v.precioPareja !== c.precioPareja ? [{ k: "Noche para 2", v: `${cop(c.precioPareja)} → ${cop(v.precioPareja)}` }] : []),
        ...(v.personaAdicional !== c.personaAdicional ? [{ k: "Persona adicional", v: `${cop(c.personaAdicional)} → ${cop(v.personaAdicional)}` }] : []),
      ],
      okLabel: "Guardar tarifa",
      done: `Tarifa de ${c.nombre} guardada`,
      run: () => api.admin.saveRates({ [c.id]: { ...v, maxPersonas: c.maxPersonas } }),
    });

  return (
    <Card aria-labelledby={`rb-${c.id}`} className={`flex flex-col gap-4 p-4 sm:p-5 ${dirty ? "ring-2 ring-highlight/50" : ""}`}>
      <CardHeader
        id={`rb-${c.id}`}
        icon={<HomeIcon size={18} />}
        title={c.nombre}
        subtitle={`Máximo ${plural(c.maxPersonas, "persona", "personas")} · ${plural(c.units, "unidad", "unidades")}`}
        actions={!c.activa ? <Badge>Inactivo</Badge> : undefined}
      />
      <Field label="Noche para 2" error={invalid ? "La tarifa debe ser mayor que cero." : undefined}>
        {(p) => (
          <MoneyInput
            id={p.id}
            describedBy={p["aria-describedby"]}
            invalid={invalid}
            value={v.precioPareja}
            onChange={(n) => setV({ ...v, precioPareja: n })}
          />
        )}
      </Field>
      <Field label="Persona adicional por noche" hint="Desde la 3.ª persona.">
        {(p) => <MoneyInput id={p.id} describedBy={p["aria-describedby"]} value={v.personaAdicional} onChange={(n) => setV({ ...v, personaAdicional: n })} />}
      </Field>
      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <p aria-live="polite" className="text-[12.5px] text-ink-muted">
          {dirty ? "Cambios sin guardar" : "Guardada"}
        </p>
        <div className="flex gap-2">
          {dirty && (
            <Button size="sm" variant="ghost" onClick={() => setV({ precioPareja: c.precioPareja, personaAdicional: c.personaAdicional })}>
              Descartar
            </Button>
          )}
          <Button size="sm" variant="primary" disabled={!dirty || invalid} onClick={save}>
            Guardar
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ───────────── Temporadas ───────────── */

function SeasonRow({ s, onEdit }: { s: RateSeason; onEdit: () => void }) {
  const { today, cabin, ask } = useAdmin();
  const st = seasonState(s, today);
  const c = cabin(s.cabinTypeId);
  const nights = nightsBetween(s.from, s.to) + 1;
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
    <li
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border px-4 py-3 ${st.order === 0 ? "border-success/30 bg-success-soft/40" : "border-line"} ${st.order >= 2 ? "opacity-75" : ""}`}
    >
      <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-xl bg-canvas text-ink-muted">
        <TagIcon size={17} />
      </span>
      <div className="min-w-[200px] flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">
          {s.nombre}
          <Badge tone={st.tone}>{st.label}</Badge>
        </p>
        <p className="text-[13px] text-ink-muted">
          {c?.nombre ?? s.cabinTypeId} · noches del {fmtDate(s.from, true)} al {fmtDate(s.to, true)} ({plural(nights, "noche", "noches")})
        </p>
      </div>
      <div className="text-right">
        <p className="text-[15px] font-bold text-ink tabular-nums">{cop(s.precioPareja)}</p>
        <p className="text-[12px] text-ink-muted">{c ? diff(s.precioPareja, c.precioPareja) : ""}</p>
      </div>
      <div className="flex gap-1">
        <Button size="sm" icon={<PencilIcon size={13} />} onClick={onEdit}>
          Editar
        </Button>
        <IconButton label={s.activa ? `Pausar ${s.nombre}` : `Activar ${s.nombre}`} size="sm" onClick={toggle}>
          {s.activa ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
        </IconButton>
        <IconButton label={`Eliminar ${s.nombre}`} size="sm" variant="danger-ghost" onClick={remove}>
          <TrashIcon size={15} />
        </IconButton>
      </div>
    </li>
  );
}

function SeasonEditor({ initial, onClose }: { initial: SeasonInput; onClose: () => void }) {
  const { data, setData, toast, today, onAuthError } = useAdmin();
  const [s, setS] = useState<SeasonInput>(initial);
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

  // Cruces con otras temporadas activas de las mismas cabañas.
  const clash =
    s.activa && s.from && s.to
      ? data.seasons.filter((x) => x.id !== s.id && x.activa && cabins.includes(x.cabinTypeId) && x.from <= s.to && s.from <= x.to)
      : [];
  const errs = {
    nombre: !s.nombre.trim() ? "Escribe un nombre, por ejemplo «Temporada alta de diciembre»." : "",
    cabins: !cabins.length ? "Elige al menos una cabaña." : "",
    dates: !s.from || !s.to ? "Elige la primera y la última noche." : "",
    price: s.precioPareja <= 0 ? "La tarifa debe ser mayor que cero." : "",
  };
  const invalid = Object.values(errs).some(Boolean) || clash.length > 0;

  async function save() {
    setTried(true);
    if (invalid || busy) return;
    setBusy(true);
    try {
      let last: RateSeason[] | null = null;
      for (const id of cabins) {
        const body = { ...s, nombre: s.nombre.trim(), cabinTypeId: id };
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
    <Modal
      onClose={onClose}
      labelledBy="se-title"
      initialFocus="#se-name"
      className="m-auto w-[calc(100%-32px)] max-w-[560px] rounded-2xl p-0 motion-safe:open:animate-pop-in"
    >
      <div className="flex max-h-[calc(100dvh-140px)] flex-col gap-4 overflow-y-auto p-5 sm:p-6">
        <div>
          <h2 id="se-title" className="text-[17px] font-bold text-ink">
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
                  setCabins([v]);
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
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[13.5px] font-semibold transition-colors ${on ? "border-ink bg-ink/5 text-ink" : "border-line-strong text-ink-muted hover:text-ink"}`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setCabins(on ? cabins.filter((x) => x !== c.id) : [...cabins, c.id])}
                      className="size-4 accent-[var(--color-cta)]"
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
                onChange={(n) => set({ precioPareja: n })}
              />
            )}
          </Field>
          <Field label="Persona adicional" hint={ref ? `Base ${cop(ref.personaAdicional)}` : undefined}>
            {(p) => <MoneyInput id={p.id} describedBy={p["aria-describedby"]} value={s.personaAdicional} onChange={(n) => set({ personaAdicional: n })} />}
          </Field>
        </div>
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
        {s.from && s.to && !clash.length && ref && s.precioPareja > 0 && (
          <Callout>
            Ejemplo: 2 noches para 2 personas en {ref.nombre} durante esta temporada = <strong>{cop(s.precioPareja * 2)}</strong> (con la tarifa base serían{" "}
            {cop(ref.precioPareja * 2)}).
          </Callout>
        )}
        {error && <FieldError>{error}</FieldError>}
      </div>
      <div className="flex flex-col-reverse gap-2 rounded-b-2xl border-t border-line bg-canvas/60 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={busy} disabled={tried && invalid} icon={<CheckIcon size={14} />} onClick={save}>
          {s.id ? "Guardar cambios" : "Crear temporada"}
        </Button>
      </div>
    </Modal>
  );
}

/* ───────────── Simulador ───────────── */

// Responde «¿cuánto pagaría un huésped?» con las tarifas y temporadas actuales, noche a noche.
function Simulator() {
  const { data, today } = useAdmin();
  const active = data.cabinTypes.filter((c) => c.activa);
  const [cabinId, setCabinId] = useState(active[0]?.id ?? "");
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({ from: addDays(today, 7), to: addDays(today, 9) });
  const [guests, setGuests] = useState(2);
  const c = data.cabinTypes.find((x) => x.id === cabinId);

  const result = useMemo(() => {
    if (!c || !range.from || !range.to || range.to <= range.from) return null;
    const q = computeQuote(c, range.from, range.to, guests, data.seasons);
    const groups = new Map<string, { label: string; nights: number; couple: number; extra: number }>();
    for (let d = range.from; d < range.to; d = addDays(d, 1)) {
      const r = nightlyRate(c, data.seasons, d);
      const key = r.season?.id ?? "base";
      const g = groups.get(key) ?? { label: r.season ? r.season.nombre : "Tarifa base", nights: 0, couple: r.couple, extra: r.extra };
      g.nights++;
      groups.set(key, g);
    }
    return { q, groups: [...groups.values()] };
  }, [c, range, guests, data.seasons]);

  if (!active.length) return null;
  return (
    <Card aria-labelledby="rt-sim" className="flex flex-col gap-4 p-4 sm:p-5">
      <CardHeader
        id="rt-sim"
        icon={<TagIcon size={18} />}
        title="Simulador de precio"
        subtitle="Comprueba cuánto se cobraría con las tarifas y temporadas actuales."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
        <Field label="Cabaña">
          {(p) => <Combobox id={p.id} value={cabinId} onChange={setCabinId} options={active.map((x) => ({ value: x.id, label: x.nombre }))} />}
        </Field>
        <Field label="Fechas">
          {(p) => <DateRangePicker id={p.id} mode="nights" from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} clearable={false} />}
        </Field>
        <Field label="Huéspedes">{(p) => <Stepper id={p.id} value={guests} onChange={setGuests} min={1} max={c?.maxPersonas ?? 12} />}</Field>
      </div>
      {result ? (
        <div className="grid grid-cols-1 gap-4 rounded-xl bg-canvas p-4 sm:grid-cols-[1fr_auto]">
          <ul className="flex flex-col gap-1.5 text-[13.5px]">
            {result.groups.map((g) => (
              <li key={g.label} className="flex flex-wrap justify-between gap-x-4">
                <span className="text-ink">
                  {plural(g.nights, "noche", "noches")} × {cop(g.couple)} <span className="text-ink-muted">· {g.label}</span>
                </span>
                <span className="font-semibold text-ink tabular-nums">{cop(g.nights * g.couple)}</span>
              </li>
            ))}
            {result.q.extraGuests > 0 && (
              <li className="flex flex-wrap justify-between gap-x-4">
                <span className="text-ink">{plural(result.q.extraGuests, "persona adicional", "personas adicionales")}</span>
                <span className="font-semibold text-ink tabular-nums">{cop(result.q.extraAmount)}</span>
              </li>
            )}
          </ul>
          <div className="flex flex-col items-start gap-0.5 sm:items-end sm:border-l sm:border-line sm:pl-5">
            <span className="text-[12.5px] text-ink-muted">Total</span>
            <strong className="text-[22px] font-extrabold text-ink tabular-nums">{cop(result.q.total)}</strong>
            <span className="text-[12.5px] text-ink-muted">
              Abono {config.depositPct} %: {cop(result.q.deposit)}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-ink-muted">Elige una cabaña y las fechas de llegada y salida.</p>
      )}
    </Card>
  );
}
