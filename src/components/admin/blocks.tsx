"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BanIcon,
  BathIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  HomeIcon,
  MoonIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  WarningIcon,
  WrenchIcon,
} from "@/components/ui/icons";
import { BLOCK_REASONS, clashingReservations } from "@/lib/booking";
import { unitMarks } from "@/lib/admin-metrics";
import { api } from "@/lib/client/api";
import { addDays, fmtDate, isISO, nightsBetween, plural } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Block, BlockInput } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin, useParam, useSetParams } from "@/components/admin/context";
import { MODULES } from "@/components/admin/routes";
import { DateRangePicker } from "@/components/admin/date-picker";
import { BathroomsPanel } from "@/components/admin/bathrooms";
import { Paginator, usePaged } from "@/components/admin/paginator";
import { adminInput } from "@/components/admin/shared";
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
  PageHeader,
  Segmented,
  StatCard,
  Tabs,
  type Tone,
} from "@/components/admin/ui";

type Filter = "vigentes" | "finalizados" | "todos";
type View = "cabanas" | "banos";
type Draft = { id?: string; type: string; unit: string; from: string | null; to: string | null; reason: string; notes: string };

const BG =
  "repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-status-block) 32%, white) 0 5px, color-mix(in srgb, var(--color-status-block) 14%, white) 5px 10px)";

function stateOf(b: Block, today: string): { label: string; tone: Tone; order: number } {
  if (b.to < today) return { label: "Finalizado", tone: "neutral", order: 2 };
  if (b.from <= today) return { label: "En curso", tone: "warning", order: 0 };
  const d = nightsBetween(today, b.from);
  return { label: d === 1 ? "Empieza mañana" : `Empieza en ${d} días`, tone: "info", order: 1 };
}

export function BlocksView() {
  const { data, today, ask, cabinLabel } = useAdmin();
  const params = useSearchParams();
  const setParams = useSetParams();
  const [filter, setFilter] = useParam<Filter>("mostrar", "vigentes");
  const [view, setView] = useParam<View>("ver", "cabanas");
  const canDelete = can(data.me.role, "delete");

  // El editor se abre desde la URL: ?editar=<bloqueo> o ?nuevo=1[&cabana=&unidad=&fecha=] (atajo desde el calendario).
  const editId = params.get("editar");
  const isNew = params.has("nuevo");
  const draftFromUrl = (): Draft | null => {
    if (isNew) {
      const type = params.get("cabana");
      const cabin = data.cabinTypes.find((c) => c.id === type && c.units > 0) ?? data.cabinTypes.find((c) => c.units > 0);
      const unit = Number(params.get("unidad"));
      const date = params.get("fecha");
      const valid = isISO(date) && date >= today;
      return {
        type: cabin?.id ?? "",
        unit: cabin && unit >= 1 && unit <= cabin.units ? String(unit) : "1",
        from: valid ? date : null,
        to: valid ? date : null,
        reason: "Mantenimiento",
        notes: "",
      };
    }
    const b = editId ? data.blocks.find((x) => x.id === editId) : null;
    return b ? { id: b.id, type: b.cabinTypeId, unit: String(b.unit), from: b.from, to: b.to, reason: b.reason, notes: b.notes } : null;
  };
  const editing = draftFromUrl();
  const openNew = () => setParams({ nuevo: "1", editar: null });
  const close = () => setParams({ nuevo: null, editar: null, cabana: null, unidad: null, fecha: null });

  const sorted = useMemo(
    () => [...data.blocks].sort((a, b) => stateOf(a, today).order - stateOf(b, today).order || (a.from < b.from ? -1 : 1)),
    [data.blocks, today],
  );
  const list = sorted.filter((b) => filter === "todos" || (filter === "finalizados" ? b.to < today : b.to >= today));
  const paged = usePaged(list, "bloqueos", filter);
  const baths = data.bathrooms ?? [];
  const bathBlocksToday = (data.bathroomBlocks ?? []).filter((k) => k.from <= today && today <= k.to);
  const inCourse = data.blocks.filter((b) => b.from <= today && b.to >= today).length;
  const next30 = addDays(today, 30);
  const upcoming = data.blocks.filter((b) => b.from > today && b.from <= next30).length;
  let nights = 0;
  for (const b of data.blocks) {
    const a = b.from > today ? b.from : today;
    const z = b.to < next30 ? b.to : next30;
    if (z >= a) nights += nightsBetween(a, z) + 1;
  }

  const remove = (b: Block) =>
    ask({
      title: "Eliminar bloqueo",
      text: `Las fechas de ${cabinLabel(b.cabinTypeId, b.unit)} quedarán disponibles para reservar en el sitio.`,
      details: [
        { k: "Fechas", v: `${fmtDate(b.from, true)} → ${fmtDate(b.to, true)}` },
        { k: "Motivo", v: b.notes ? `${b.reason} · ${b.notes}` : b.reason },
      ],
      okLabel: "Eliminar bloqueo",
      danger: true,
      done: "Bloqueo eliminado",
      run: async () => {
        const r = await api.admin.deleteBlock(b.id);
        if (r.status < 400) close();
        return r;
      },
    });

  return (
    <>
      <PageHeader
        title={MODULES.bloqueos.label}
        description={
          view === "banos"
            ? "Estado de cada baño y fechas en que no se puede usar. Es un aviso: la cabaña se sigue pudiendo reservar."
            : "Fechas cerradas por mantenimiento, uso propio u otros motivos. No se pueden reservar en el sitio."
        }
        actions={
          view === "cabanas" ? (
            <Button variant="primary" icon={<PlusIcon size={14} />} onClick={openNew}>
              Nuevo bloqueo
            </Button>
          ) : undefined
        }
      />
      <Tabs
        label="Qué bloquear"
        value={view === "banos" ? "banos" : "cabanas"}
        onChange={setView}
        tabs={[
          { value: "cabanas", label: "Cabañas", icon: <HomeIcon size={15} />, count: inCourse },
          {
            value: "banos",
            label: "Baños",
            icon: <BathIcon size={15} />,
            count: baths.filter((b) => b.status !== "available").length + bathBlocksToday.length,
          },
        ]}
      />
      {view === "banos" ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              accent="green"
              label="Baños disponibles"
              value={`${baths.filter((b) => b.status === "available").length}/${baths.length}`}
              hint="en servicio ahora"
              icon={<BathIcon size={15} />}
            />
            <StatCard
              accent="yellow"
              label="En mantenimiento o fuera"
              value={baths.filter((b) => b.status !== "available").length}
              hint="con aviso en sus cabañas"
              icon={<WrenchIcon size={15} />}
            />
            <StatCard accent="pink" label="Bloqueados hoy" value={bathBlocksToday.length} hint="por fechas" icon={<BanIcon size={15} />} />
          </div>
          <BathroomsPanel />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              accent="yellow"
              label="En curso hoy"
              value={inCourse}
              hint={inCourse ? "cabañas cerradas ahora" : "Todo abierto"}
              icon={<BanIcon size={15} />}
              tone={inCourse ? "warning" : undefined}
            />
            <StatCard accent="blue" label="Próximos 30 días" value={upcoming} hint="bloqueos programados" icon={<CalendarIcon size={15} />} />
            <StatCard accent="pink" label="Noches bloqueadas" value={nights} hint="en los próximos 30 días" icon={<MoonIcon size={15} />} />
          </div>

          <Card className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Segmented
                label="Mostrar"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "vigentes", label: "Vigentes y próximos", count: data.blocks.filter((b) => b.to >= today).length },
                  { value: "finalizados", label: "Finalizados" },
                  { value: "todos", label: "Todos" },
                ]}
              />
            </div>
            {list.length ? (
              <>
                <ul className="flex flex-col gap-2">
                  {paged.rows.map((b) => {
                    const st = stateOf(b, today);
                    const days = nightsBetween(b.from, b.to) + 1;
                    return (
                      <li
                        key={b.id}
                        className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[18px] px-4 py-3 transition-colors ${st.order === 0 ? "bg-yellow-soft" : "bg-canvas/60"} ${st.order === 2 ? "opacity-75" : ""}`}
                      >
                        <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-full text-ink-muted" style={{ background: BG }}>
                          <BanIcon size={17} />
                        </span>
                        <div className="min-w-[200px] flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">
                            {cabinLabel(b.cabinTypeId, b.unit)}
                            <Badge tone={st.tone} icon={st.order === 0 ? <ClockIcon size={11} /> : undefined}>
                              {st.label}
                            </Badge>
                          </p>
                          <p className="text-[13px] text-ink-muted">
                            {fmtDate(b.from, true)} → {fmtDate(b.to, true)} · {plural(days, "día", "días")}
                          </p>
                          <p className="mt-1 text-[13px] text-ink">
                            <strong className="font-semibold">{b.reason}</strong>
                            {b.notes ? <span className="text-ink-muted"> · {b.notes}</span> : null}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" icon={<PencilIcon size={13} />} onClick={() => setParams({ editar: b.id, nuevo: null })}>
                            Editar
                          </Button>
                          {canDelete && (
                            <IconButton
                              label={`Eliminar bloqueo de ${cabinLabel(b.cabinTypeId, b.unit)}`}
                              size="sm"
                              variant="danger-ghost"
                              onClick={() => remove(b)}
                            >
                              <TrashIcon size={15} />
                            </IconButton>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <Paginator p={paged} noun="bloqueos" />
              </>
            ) : (
              <EmptyState
                icon={<CalendarIcon size={18} />}
                title={filter === "finalizados" ? "No hay bloqueos finalizados" : "No hay fechas bloqueadas"}
                text={
                  filter === "finalizados"
                    ? undefined
                    : "Bloquea fechas por mantenimiento o uso propio. También puedes hacerlo desde el calendario, con un clic en un día libre."
                }
                action={
                  filter !== "finalizados" ? (
                    <Button icon={<PlusIcon size={14} />} onClick={openNew}>
                      Nuevo bloqueo
                    </Button>
                  ) : undefined
                }
              />
            )}
          </Card>
        </>
      )}

      <ModalPresence>
        {editing && (
          <BlockEditor
            key={editing.id ?? `nuevo-${params.toString()}`}
            initial={editing}
            onClose={close}
            onDelete={editing.id && canDelete ? () => remove(data.blocks.find((b) => b.id === editing.id)!) : undefined}
          />
        )}
      </ModalPresence>
    </>
  );
}

/* ───────────── Crear / editar ───────────── */

function BlockEditor({ initial, onClose, onDelete }: { initial: Draft; onClose: () => void; onDelete?: () => void }) {
  const { data, setData, toast, today, cabinLabel, onAuthError } = useAdmin();
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tried, setTried] = useState(false);
  const cabin = data.cabinTypes.find((c) => c.id === d.type);
  const units = cabin?.units ?? 0;
  const unitList = d.unit === "all" ? Array.from({ length: units }, (_, i) => i + 1) : [Number(d.unit)];
  const set = (p: Partial<Draft>) => {
    setD((x) => ({ ...x, ...p }));
    setError("");
  };

  // Choques en vivo: reservas activas y otros bloqueos en las unidades y fechas elegidas.
  const clashes = d.from && d.to ? unitList.flatMap((u) => clashingReservations(data.reservations, d.type, u, d.from!, d.to!)) : [];
  const overlaps =
    d.from && d.to
      ? data.blocks.filter((b) => b.id !== d.id && b.cabinTypeId === d.type && unitList.includes(b.unit) && b.from <= d.to! && d.from! <= b.to)
      : [];
  const marks = useMemo(
    () => unitMarks(data.reservations, data.blocks, d.type, d.unit === "all" ? "all" : Number(d.unit), today, addDays(today, 400), d.id),
    [data, d.type, d.unit, today, d.id],
  );

  const errs = {
    dates: !d.from || !d.to ? "Elige el primer y el último día del bloqueo." : "",
    notes: d.reason === "Otro" && !d.notes.trim() ? "Describe el motivo." : d.notes.length > 500 ? "Máximo 500 caracteres." : "",
  };
  const blocked = !!(errs.dates || errs.notes || clashes.length || overlaps.length);

  async function save() {
    setTried(true);
    if (blocked || busy) return;
    setBusy(true);
    const body: BlockInput = {
      cabinTypeId: d.type,
      unit: d.unit === "all" ? "all" : Number(d.unit),
      from: d.from!,
      to: d.to!,
      reason: d.reason,
      notes: d.notes.trim(),
    };
    try {
      const r = d.id ? await api.admin.updateBlock({ ...body, id: d.id }) : await api.admin.addBlock(body);
      if (r.status === 401 || r.status === 403) return onAuthError();
      if (r.status !== 200 || !Array.isArray(r.data)) {
        const err = r.data as unknown as { error?: string; conflicts?: string[] } | null;
        setError(
          err?.error === "RESERVATION_CONFLICT"
            ? `Hay reservas activas en esas fechas (${err.conflicts?.join(", ")}). Reprográmalas o elige otras fechas.`
            : err?.error === "BLOCK_OVERLAP"
              ? "Ya existe un bloqueo que se cruza con estas fechas."
              : "No se pudo guardar el bloqueo. Inténtalo de nuevo.",
        );
        return;
      }
      const blocks = r.data;
      setData((x) => ({ ...x, blocks }));
      toast(d.id ? "Bloqueo actualizado" : unitList.length > 1 ? `Fechas bloqueadas en ${plural(unitList.length, "unidad", "unidades")}` : "Fechas bloqueadas");
      onClose();
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const days = d.from && d.to ? nightsBetween(d.from, d.to) + 1 : 0;
  const cabins = data.cabinTypes.filter((c) => c.units > 0);

  return (
    <Modal onClose={onClose} labelledBy="bk-title" initialFocus="#bk-dates" className="m-auto w-[calc(100%-32px)] max-w-[540px] rounded-[26px] p-0">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-full text-ink" style={{ background: BG }}>
            <BanIcon size={18} />
          </span>
          <div className="pt-1">
            <h2 id="bk-title" className="text-[18px] font-bold tracking-[-0.02em] text-ink">
              {d.id ? "Editar bloqueo" : "Nuevo bloqueo"}
            </h2>
            <p className="text-[13.5px] text-ink-muted">Las fechas bloqueadas no se pueden reservar en el sitio.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cabaña" className="col-span-2 sm:col-span-1">
            {(p) => (
              <Combobox
                id={p.id}
                value={d.type}
                onChange={(v) => set({ type: v, unit: "1" })}
                options={cabins.map((c) => ({ value: c.id, label: c.nombre, description: plural(c.units, "unidad", "unidades") }))}
              />
            )}
          </Field>
          <Field label="Unidad" className="col-span-2 sm:col-span-1">
            {(p) => (
              <Combobox
                id={p.id}
                value={d.unit}
                onChange={(v) => set({ unit: v })}
                options={[
                  ...Array.from({ length: units }, (_, i) => ({ value: String(i + 1), label: `Unidad ${i + 1}` })),
                  ...(!d.id && units > 1 ? [{ value: "all", label: "Todas las unidades", description: "Cierra este tipo de cabaña completo" }] : []),
                ]}
              />
            )}
          </Field>
          <Field
            label="Fechas (el último día queda incluido)"
            className="col-span-2"
            error={tried ? errs.dates : undefined}
            hint="Los días marcados ya tienen una reserva (punto) o un bloqueo (rayado)."
          >
            {(p) => (
              <DateRangePicker
                id="bk-dates"
                describedBy={p["aria-describedby"]}
                invalid={!!p["aria-invalid"]}
                mode="days"
                from={d.from}
                to={d.to}
                min={d.id ? undefined : today}
                marks={marks}
                legend
                onChange={(from, to) => set({ from, to })}
              />
            )}
          </Field>
        </div>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1.5 text-[13px] font-semibold text-ink">Motivo</legend>
          <Segmented label="Motivo" value={d.reason} onChange={(v) => set({ reason: v })} options={BLOCK_REASONS.map((r) => ({ value: r, label: r }))} />
        </fieldset>
        <Field
          label={d.reason === "Otro" ? "Descripción" : "Descripción (opcional)"}
          error={tried ? errs.notes : undefined}
          hint="Solo la ve el equipo. Ej. pintura del baño, visita familiar."
        >
          {(p) => (
            <textarea {...p} rows={2} maxLength={500} value={d.notes} onChange={(e) => set({ notes: e.target.value })} className={`${adminInput} resize-y`} />
          )}
        </Field>

        {d.from &&
          d.to &&
          (clashes.length || overlaps.length ? (
            <Callout tone="error" role="alert">
              {clashes.length > 0 && (
                <p>
                  <strong>Choca con {plural(clashes.length, "reserva activa", "reservas activas")}:</strong>{" "}
                  {clashes.map((c) => `${c.code} (${fmtDate(c.checkIn)} → ${fmtDate(c.checkOut)})`).join(", ")}. Reprográmala o elige otras fechas.
                </p>
              )}
              {overlaps.length > 0 && (
                <p>
                  Se cruza con otro bloqueo ({overlaps.map((b) => `${cabinLabel(b.cabinTypeId, b.unit)}: ${fmtDate(b.from)} → ${fmtDate(b.to)}`).join(", ")}).
                </p>
              )}
            </Callout>
          ) : (
            <Callout tone="success">
              <span className="font-semibold">Sin conflictos.</span> Se bloquearán {plural(days, "día", "días")} en{" "}
              {d.unit === "all" ? `todas las unidades de ${cabin?.nombre}` : cabinLabel(d.type, Number(d.unit))}, del {fmtDate(d.from, true)} al{" "}
              {fmtDate(d.to, true)}.
            </Callout>
          ))}
        {error && <FieldError>{error}</FieldError>}
      </div>
      <div className="flex flex-col-reverse gap-2 rounded-b-[26px] border-t border-line bg-canvas/70 px-5 py-3.5 sm:flex-row sm:items-center sm:px-6">
        {onDelete && (
          <Button variant="danger-ghost" icon={<TrashIcon size={14} />} onClick={onDelete} className="sm:mr-auto">
            Eliminar
          </Button>
        )}
        <Button onClick={onClose} className="sm:ml-auto">
          Cancelar
        </Button>
        <Button
          variant="primary"
          loading={busy}
          disabled={tried && blocked}
          icon={blocked && tried ? <WarningIcon size={14} /> : <CheckIcon size={14} />}
          onClick={save}
        >
          {d.id ? "Guardar cambios" : "Bloquear fechas"}
        </Button>
      </div>
    </Modal>
  );
}
