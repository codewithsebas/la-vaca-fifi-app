"use client";

// Baños: su estado (disponible, no disponible, en mantenimiento), la cabaña a la que pertenecen (opcional) y sus
// bloqueos por fechas. Un baño fuera de servicio no cierra la cabaña: es un aviso en el calendario, la cabaña y la
// reserva, para avisar al huésped o reubicarlo.
import Link from "next/link";
import { useMemo, useState } from "react";
import { BanIcon, BathIcon, CalendarIcon, CheckIcon, ClockIcon, HomeIcon, PencilIcon, PlusIcon, TrashIcon, WrenchIcon } from "@/components/ui/icons";
import { BATHROOM_BLOCK_REASONS } from "@/lib/booking";
import { api, type Bathrooms } from "@/lib/client/api";
import { addDays, fmtDate, nightsBetween, plural, timeAgo } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { AdminData, ApiResult, Bathroom, BathroomBlock, BathroomBlockInput, BathroomInput, BathroomStatus } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin } from "@/components/admin/context";
import { DateRangePicker, type DayMark } from "@/components/admin/date-picker";
import { Paginator, usePaged } from "@/components/admin/paginator";
import { paths } from "@/components/admin/routes";
import { adminInput } from "@/components/admin/shared";
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
  ModalPresence,
  Segmented,
  type Tone,
} from "@/components/admin/ui";

export const BATHROOM_STATUS: Record<BathroomStatus, { label: string; tone: Tone; dot: string }> = {
  available: { label: "Disponible", tone: "success", dot: "bg-success" },
  maintenance: { label: "En mantenimiento", tone: "warning", dot: "bg-warning" },
  unavailable: { label: "No disponible", tone: "danger", dot: "bg-error" },
};
const STATUSES = Object.keys(BATHROOM_STATUS) as BathroomStatus[];

const ERRORS: Record<string, string> = {
  BLOCK_OVERLAP: "Ese baño ya tiene un bloqueo que se cruza con estas fechas.",
  INVALID_NOTES: "Describe el motivo.",
  FORBIDDEN: "Tu rol no permite este cambio.",
};

/* ───────────── Avisos ───────────── */

export type BathroomIssue = { bathroom: Bathroom; kind: "status" | "block"; text: string };

// Baños de una cabaña con algo que avisar entre dos días (incluidos): un estado distinto de «disponible» o un bloqueo
// que se cruza. Un baño sin unidad sirve a todas las unidades de esa cabaña.
export function bathroomIssues(
  d: Pick<AdminData, "bathrooms" | "bathroomBlocks">,
  cabinTypeId: string,
  unit: number,
  from: string,
  to: string,
): BathroomIssue[] {
  const out: BathroomIssue[] = [];
  for (const b of d.bathrooms ?? []) {
    if (b.cabinTypeId !== cabinTypeId || (b.unit !== null && b.unit !== unit)) continue;
    if (b.status !== "available")
      out.push({ bathroom: b, kind: "status", text: `${b.name}: ${BATHROOM_STATUS[b.status].label.toLowerCase()}${b.notes ? ` · ${b.notes}` : ""}` });
    for (const k of d.bathroomBlocks ?? [])
      if (k.bathroomId === b.id && k.from <= to && from <= k.to)
        out.push({
          bathroom: b,
          kind: "block",
          text: `${b.name}: bloqueado del ${fmtDate(k.from)} al ${fmtDate(k.to)} · ${k.notes ? `${k.reason}, ${k.notes}` : k.reason}`,
        });
  }
  return out;
}

// Aviso para una reserva o una cabaña: qué baño tiene un problema en esas fechas. No impide nada.
export function BathroomWarning({
  cabinTypeId,
  unit,
  from,
  to,
  className = "",
}: {
  cabinTypeId: string;
  unit: number;
  from: string;
  to: string;
  className?: string;
}) {
  const { data } = useAdmin();
  const issues = bathroomIssues(data, cabinTypeId, unit, from, to);
  if (!issues.length) return null;
  return (
    <Callout tone="warning" className={className}>
      <p className="font-semibold">{issues.length === 1 ? "Aviso del baño" : `${issues.length} avisos de baños`}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {issues.map((i, n) => (
          <li key={n}>{i.text}</li>
        ))}
      </ul>
      <p className="mt-1.5 text-[12.5px] opacity-85">La cabaña sigue disponible. Avisa al huésped o cambia el estado en Bloqueos y baños.</p>
    </Callout>
  );
}

// Baños de una cabaña (cualquier unidad) con un problema hoy: estado o bloqueo en curso.
export function cabinBathroomAlerts(d: Pick<AdminData, "bathrooms" | "bathroomBlocks">, cabinTypeId: string, today: string) {
  return (d.bathrooms ?? []).filter(
    (b) =>
      b.cabinTypeId === cabinTypeId &&
      (b.status !== "available" || (d.bathroomBlocks ?? []).some((k) => k.bathroomId === b.id && k.from <= today && today <= k.to)),
  );
}

export function BathroomStatusBadge({ status }: { status: BathroomStatus }) {
  const s = BATHROOM_STATUS[status];
  return (
    <Badge tone={s.tone} icon={status === "available" ? <CheckIcon size={11} /> : <WrenchIcon size={11} />}>
      {s.label}
    </Badge>
  );
}

/* ───────────── Guardar ───────────── */

// Aplica la respuesta de la API (baños y bloqueos) a los datos del panel; devuelve el mensaje de error, si hubo.
function useBathroomSave() {
  const { setData, onAuthError } = useAdmin();
  return async (call: () => Promise<ApiResult<unknown>>): Promise<string | null> => {
    try {
      const r = await call();
      if (r.status === 401) {
        onAuthError();
        return "Tu sesión terminó.";
      }
      const body = r.data as (Bathrooms & { error?: string; fields?: Record<string, string> }) | null;
      if (r.status !== 200 || !body || !Array.isArray(body.bathrooms)) {
        return (body?.fields && Object.values(body.fields)[0]) || (body?.error && ERRORS[body.error]) || "No se pudo guardar. Inténtalo de nuevo.";
      }
      setData((d) => ({ ...d, bathrooms: body.bathrooms, bathroomBlocks: body.blocks }));
      return null;
    } catch {
      return "Error de conexión. Inténtalo de nuevo.";
    }
  };
}

// Cambio rápido de estado (todo el equipo puede hacerlo).
function StatusPicker({ b, size = "sm" }: { b: Bathroom; size?: "sm" | "md" }) {
  const { toast } = useAdmin();
  const save = useBathroomSave();
  const [busy, setBusy] = useState(false);
  return (
    <Segmented
      label={`Estado de ${b.name}`}
      size={size}
      value={b.status}
      onChange={async (status) => {
        if (busy || status === b.status) return;
        setBusy(true);
        const err = await save(() => api.admin.bathrooms.update({ id: b.id, status }));
        setBusy(false);
        toast(err ?? `${b.name}: ${BATHROOM_STATUS[status].label.toLowerCase()}`, err ? "error" : "ok");
      }}
      options={STATUSES.map((s) => ({ value: s, label: BATHROOM_STATUS[s].label }))}
    />
  );
}

/* ───────────── Pestaña «Baños» de Bloqueos ───────────── */

type BathDraft = { id?: string; name: string; status: BathroomStatus; cabinTypeId: string; unit: string; notes: string };
type BlockDraft = { id?: string; bathroomId: string; from: string | null; to: string | null; reason: string; notes: string };
type BlockFilter = "vigentes" | "finalizados" | "todos";

export function BathroomsPanel() {
  const { data, today, ask, cabinLabel } = useAdmin();
  const role = data.me.role;
  const save = useBathroomSave();
  const [bathEdit, setBathEdit] = useState<BathDraft | null>(null);
  const [blockEdit, setBlockEdit] = useState<BlockDraft | null>(null);
  const [filter, setFilter] = useState<BlockFilter>("vigentes");
  const bathrooms = useMemo(() => data.bathrooms ?? [], [data.bathrooms]);
  const blocks = data.bathroomBlocks ?? [];
  const byId = useMemo(() => new Map(bathrooms.map((b) => [b.id, b])), [bathrooms]);

  const where = (b: Bathroom) => (b.cabinTypeId ? cabinLabel(b.cabinTypeId, b.unit ?? undefined) : "Compartido");
  const blockedNow = (b: Bathroom) => blocks.find((k) => k.bathroomId === b.id && k.from <= today && today <= k.to);

  const list = blocks
    .filter((k) => filter === "todos" || (filter === "finalizados" ? k.to < today : k.to >= today))
    .sort((a, b) => (filter === "finalizados" ? (a.from < b.from ? 1 : -1) : a.from < b.from ? -1 : 1));
  const paged = usePaged(list, "bloqueos-banos", filter);

  const removeBath = (b: Bathroom) =>
    ask({
      title: "Eliminar baño",
      text: `${b.name} se elimina con sus bloqueos.`,
      okLabel: "Eliminar baño",
      danger: true,
      done: "Baño eliminado",
      run: async () => {
        const err = await save(() => api.admin.bathrooms.remove(b.id));
        if (!err) setBathEdit(null);
        return { status: err ? 400 : 200, data: err ? { fields: { baño: err } } : null } as ApiResult<unknown>;
      },
    });
  const removeBlock = (k: BathroomBlock) =>
    ask({
      title: "Eliminar bloqueo del baño",
      text: `${byId.get(k.bathroomId)?.name ?? "El baño"} vuelve a quedar disponible en esas fechas.`,
      details: [
        { k: "Fechas", v: `${fmtDate(k.from, true)} → ${fmtDate(k.to, true)}` },
        { k: "Motivo", v: k.notes ? `${k.reason} · ${k.notes}` : k.reason },
      ],
      okLabel: "Eliminar bloqueo",
      danger: true,
      done: "Bloqueo eliminado",
      run: async () => {
        const err = await save(() => api.admin.bathroomBlocks.remove(k.id));
        if (!err) setBlockEdit(null);
        return { status: err ? 400 : 200, data: err ? { fields: { bloqueo: err } } : null } as ApiResult<unknown>;
      },
    });

  const newBlock = (bathroomId = bathrooms[0]?.id ?? "") => setBlockEdit({ bathroomId, from: null, to: null, reason: BATHROOM_BLOCK_REASONS[0], notes: "" });

  return (
    <>
      <Card aria-labelledby="bt-list" className="flex flex-col gap-4 p-4 sm:p-5">
        <CardHeader
          id="bt-list"
          icon={<BathIcon size={18} />}
          accent="blue"
          title="Baños"
          subtitle="Un baño fuera de servicio no cierra la cabaña: aparece como aviso en el calendario, la cabaña y la reserva."
          actions={
            can(role, "bathrooms") ? (
              <Button
                size="sm"
                variant="primary"
                icon={<PlusIcon size={13} />}
                onClick={() => setBathEdit({ name: "", status: "available", cabinTypeId: "", unit: "", notes: "" })}
              >
                Nuevo baño
              </Button>
            ) : undefined
          }
        />
        {bathrooms.length ? (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {bathrooms.map((b) => {
              const now = blockedNow(b);
              const issue = b.status !== "available" || !!now;
              return (
                <li key={b.id} className={`flex flex-col gap-3 rounded-[18px] p-4 ${issue ? "bg-yellow-soft" : "bg-paper/60"}`}>
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className={`grid size-10 flex-none place-items-center rounded-full ${issue ? "bg-yellow text-ink" : "bg-blue text-ink"}`}
                    >
                      <BathIcon size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-bold text-ink">{b.name}</p>
                      <p className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                        <HomeIcon size={12} />
                        {where(b)}
                      </p>
                    </div>
                    <IconButton
                      label={`Editar ${b.name}`}
                      size="sm"
                      onClick={() =>
                        setBathEdit({
                          id: b.id,
                          name: b.name,
                          status: b.status,
                          cabinTypeId: b.cabinTypeId ?? "",
                          unit: b.unit ? String(b.unit) : "",
                          notes: b.notes,
                        })
                      }
                    >
                      <PencilIcon size={14} />
                    </IconButton>
                  </div>
                  <StatusPicker b={b} />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-muted">
                    {now ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-warning">
                        <BanIcon size={12} />
                        Bloqueado hasta el {fmtDate(now.to)}
                      </span>
                    ) : null}
                    {b.notes && <span className="truncate">{b.notes}</span>}
                    <span className="ml-auto inline-flex items-center gap-1">
                      <ClockIcon size={12} />
                      {timeAgo(b.statusUpdatedAt)}
                    </span>
                  </div>
                  <Button size="sm" variant="ghost" icon={<BanIcon size={13} />} onClick={() => newBlock(b.id)} className="self-start">
                    Bloquear fechas
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            compact
            icon={<BathIcon size={18} />}
            title="Aún no hay baños"
            text={can(role, "bathrooms") ? "Crea los baños y, si quieres, asígnalos a una cabaña para ver sus avisos." : "Un administrador puede crearlos."}
          />
        )}
      </Card>

      <Card aria-labelledby="bt-blocks" className="flex flex-col gap-4 p-4 sm:p-5">
        <CardHeader
          id="bt-blocks"
          icon={<BanIcon size={18} />}
          accent="yellow"
          title="Bloqueos de baños"
          subtitle="Fechas en las que un baño no se puede usar (reparación, limpieza profunda…)."
          actions={
            bathrooms.length ? (
              <Button size="sm" icon={<PlusIcon size={13} />} onClick={() => newBlock()}>
                Bloquear un baño
              </Button>
            ) : undefined
          }
        />
        <Segmented
          label="Mostrar"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "vigentes", label: "Vigentes y próximos", count: blocks.filter((k) => k.to >= today).length },
            { value: "finalizados", label: "Finalizados" },
            { value: "todos", label: "Todos" },
          ]}
        />
        {list.length ? (
          <>
            <ul className="flex flex-col gap-2">
              {paged.rows.map((k) => {
                const b = byId.get(k.bathroomId);
                const live = k.from <= today && today <= k.to;
                const days = nightsBetween(k.from, k.to) + 1;
                return (
                  <li
                    key={k.id}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[18px] px-4 py-3 ${live ? "bg-yellow-soft" : "bg-paper/60"} ${k.to < today ? "opacity-75" : ""}`}
                  >
                    <div className="min-w-[200px] flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">
                        {b?.name ?? "Baño eliminado"}
                        <span className="text-[12.5px] font-medium text-ink-muted">{b ? where(b) : ""}</span>
                        {live && (
                          <Badge tone="warning" icon={<ClockIcon size={11} />}>
                            En curso
                          </Badge>
                        )}
                      </p>
                      <p className="text-[13px] text-ink-muted">
                        {fmtDate(k.from, true)} → {fmtDate(k.to, true)} · {plural(days, "día", "días")} ·{" "}
                        <span className="font-semibold text-ink">{k.reason}</span>
                        {k.notes ? ` · ${k.notes}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        icon={<PencilIcon size={13} />}
                        onClick={() => setBlockEdit({ id: k.id, bathroomId: k.bathroomId, from: k.from, to: k.to, reason: k.reason, notes: k.notes })}
                      >
                        Editar
                      </Button>
                      {can(role, "delete") && (
                        <IconButton label={`Eliminar bloqueo de ${b?.name ?? "baño"}`} size="sm" variant="danger-ghost" onClick={() => removeBlock(k)}>
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
          <EmptyState compact icon={<CalendarIcon size={18} />} title={filter === "finalizados" ? "No hay bloqueos finalizados" : "No hay baños bloqueados"} />
        )}
      </Card>

      <ModalPresence>
        {bathEdit && (
          <BathroomEditor
            key={bathEdit.id ?? "nuevo"}
            initial={bathEdit}
            onClose={() => setBathEdit(null)}
            onDelete={bathEdit.id && can(role, "delete") ? () => removeBath(byId.get(bathEdit.id!)!) : undefined}
          />
        )}
      </ModalPresence>
      <ModalPresence>
        {blockEdit && (
          <BathroomBlockEditor
            key={blockEdit.id ?? `nuevo-${blockEdit.bathroomId}`}
            initial={blockEdit}
            onClose={() => setBlockEdit(null)}
            onDelete={blockEdit.id && can(role, "delete") ? () => removeBlock(blocks.find((k) => k.id === blockEdit.id)!) : undefined}
          />
        )}
      </ModalPresence>
    </>
  );
}

/* ───────────── Crear / editar un baño ───────────── */

function BathroomEditor({ initial, onClose, onDelete }: { initial: BathDraft; onClose: () => void; onDelete?: () => void }) {
  const { data, toast } = useAdmin();
  const save = useBathroomSave();
  const manage = can(data.me.role, "bathrooms"); // nombre y cabaña; el estado y las notas, todo el equipo
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");
  const set = (p: Partial<BathDraft>) => {
    setD((x) => ({ ...x, ...p }));
    setError("");
  };
  const cabin = data.cabinTypes.find((c) => c.id === d.cabinTypeId);
  const nameErr = !d.name.trim() || d.name.length > 60 ? "Escribe un nombre de hasta 60 caracteres." : "";

  async function submit() {
    setTried(true);
    if (busy || (manage && nameErr)) return;
    setBusy(true);
    const body: BathroomInput = {
      ...(initial.id && { id: initial.id }),
      status: d.status,
      notes: d.notes.trim(),
      ...(manage && {
        name: d.name.trim(),
        cabinTypeId: (d.cabinTypeId || null) as BathroomInput["cabinTypeId"],
        unit: d.cabinTypeId && d.unit ? Number(d.unit) : null,
      }),
    };
    const err = await save(() => (initial.id ? api.admin.bathrooms.update(body) : api.admin.bathrooms.create(body)));
    setBusy(false);
    if (err) return setError(err);
    toast(initial.id ? "Baño actualizado" : "Baño creado");
    onClose();
  }

  return (
    <Modal onClose={onClose} labelledBy="bt-title" initialFocus="input" className="m-auto w-[calc(100%-32px)] max-w-[540px] rounded-[26px] p-0">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-full bg-blue text-ink">
              <BathIcon size={18} />
            </span>
            <div className="pt-1">
              <h2 id="bt-title" className="text-[18px] font-bold tracking-[-0.02em] text-ink">
                {initial.id ? `Editar ${initial.name}` : "Nuevo baño"}
              </h2>
              <p className="text-[13.5px] text-ink-muted">Asignarlo a una cabaña es opcional: sirve para avisar cuando no está disponible.</p>
            </div>
          </div>

          {manage && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre" error={tried ? nameErr || undefined : undefined} className="col-span-2">
                {(p) => (
                  <input
                    {...p}
                    value={d.name}
                    maxLength={60}
                    placeholder="Ej. Baño Cabaña 1"
                    onChange={(e) => set({ name: e.target.value })}
                    className={adminInput}
                  />
                )}
              </Field>
              <Field label="Cabaña (opcional)" className="col-span-2 sm:col-span-1">
                {(p) => (
                  <Combobox
                    id={p.id}
                    value={d.cabinTypeId}
                    onChange={(v) => set({ cabinTypeId: v, unit: "" })}
                    options={[
                      { value: "", label: "Sin cabaña", description: "Baño compartido" },
                      ...data.cabinTypes.map((c) => ({ value: c.id, label: c.nombre })),
                    ]}
                  />
                )}
              </Field>
              <Field label="Unidad" className="col-span-2 sm:col-span-1" hint={cabin && cabin.units > 1 ? "Sin unidad: sirve a todas." : undefined}>
                {(p) => (
                  <Combobox
                    id={p.id}
                    value={d.unit}
                    onChange={(v) => set({ unit: v })}
                    options={
                      cabin
                        ? [
                            ...(cabin.units > 1 ? [{ value: "", label: "Todas las unidades" }] : []),
                            ...Array.from({ length: cabin.units }, (_, i) => ({ value: String(i + 1), label: `Unidad ${i + 1}` })),
                          ]
                        : [{ value: "", label: "—", disabled: true }]
                    }
                  />
                )}
              </Field>
            </div>
          )}

          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1.5 text-[13px] font-semibold text-ink">Estado</legend>
            <Segmented
              label="Estado"
              value={d.status}
              onChange={(v) => set({ status: v })}
              options={STATUSES.map((s) => ({ value: s, label: BATHROOM_STATUS[s].label }))}
            />
          </fieldset>
          <Field label="Notas (opcional)" hint="Solo las ve el equipo. Ej. cambio de la ducha, sin agua caliente.">
            {(p) => (
              <textarea {...p} rows={2} maxLength={300} value={d.notes} onChange={(e) => set({ notes: e.target.value })} className={`${adminInput} resize-y`} />
            )}
          </Field>
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
          <Button type="submit" variant="primary" loading={busy} icon={<CheckIcon size={14} />}>
            {initial.id ? "Guardar cambios" : "Crear baño"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ───────────── Bloquear un baño ───────────── */

function BathroomBlockEditor({ initial, onClose, onDelete }: { initial: BlockDraft; onClose: () => void; onDelete?: () => void }) {
  const { data, today, toast, cabinLabel } = useAdmin();
  const save = useBathroomSave();
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");
  const set = (p: Partial<BlockDraft>) => {
    setD((x) => ({ ...x, ...p }));
    setError("");
  };
  const bathrooms = data.bathrooms ?? [];
  const others = (data.bathroomBlocks ?? []).filter((k) => k.bathroomId === d.bathroomId && k.id !== d.id);
  const marks = useMemo(() => {
    const out: Record<string, DayMark> = {};
    for (const k of others) for (let x = k.from; x <= k.to; x = addDays(x, 1)) out[x] = "blocked";
    return out;
  }, [others]);
  const overlap = d.from && d.to ? others.find((k) => k.from <= d.to! && d.from! <= k.to) : undefined;
  const errs = {
    bathroom: d.bathroomId ? "" : "Elige el baño.",
    dates: !d.from || !d.to ? "Elige el primer y el último día." : "",
    notes: d.reason === "Otro" && !d.notes.trim() ? "Describe el motivo." : "",
  };
  const blocked = !!(errs.bathroom || errs.dates || errs.notes || overlap);

  async function submit() {
    setTried(true);
    if (busy || blocked) return;
    setBusy(true);
    const body: BathroomBlockInput = { ...(d.id && { id: d.id }), bathroomId: d.bathroomId, from: d.from!, to: d.to!, reason: d.reason, notes: d.notes.trim() };
    const err = await save(() => (d.id ? api.admin.bathroomBlocks.update(body) : api.admin.bathroomBlocks.create(body)));
    setBusy(false);
    if (err) return setError(err);
    toast(d.id ? "Bloqueo actualizado" : "Baño bloqueado");
    onClose();
  }

  return (
    <Modal onClose={onClose} labelledBy="bb-title" initialFocus="#bb-dates" className="m-auto w-[calc(100%-32px)] max-w-[540px] rounded-[26px] p-0">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-full bg-yellow text-ink">
            <BanIcon size={18} />
          </span>
          <div className="pt-1">
            <h2 id="bb-title" className="text-[18px] font-bold tracking-[-0.02em] text-ink">
              {d.id ? "Editar bloqueo del baño" : "Bloquear un baño"}
            </h2>
            <p className="text-[13.5px] text-ink-muted">La cabaña se puede seguir reservando; el bloqueo queda como aviso.</p>
          </div>
        </div>
        <Field label="Baño" error={tried ? errs.bathroom || undefined : undefined}>
          {(p) => (
            <Combobox
              id={p.id}
              value={d.bathroomId}
              onChange={(v) => set({ bathroomId: v })}
              options={bathrooms.map((b) => ({
                value: b.id,
                label: b.name,
                description: b.cabinTypeId ? cabinLabel(b.cabinTypeId, b.unit ?? undefined) : "Compartido",
              }))}
            />
          )}
        </Field>
        <Field
          label="Fechas (el último día queda incluido)"
          error={tried ? errs.dates || undefined : undefined}
          hint={others.length ? "Los días rayados ya tienen otro bloqueo de este baño." : undefined}
        >
          {(p) => (
            <DateRangePicker
              id="bb-dates"
              describedBy={p["aria-describedby"]}
              invalid={!!p["aria-invalid"]}
              mode="days"
              from={d.from}
              to={d.to}
              min={d.id ? undefined : today}
              marks={marks}
              onChange={(from, to) => set({ from, to })}
            />
          )}
        </Field>
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1.5 text-[13px] font-semibold text-ink">Motivo</legend>
          <Segmented
            label="Motivo"
            value={d.reason}
            onChange={(v) => set({ reason: v })}
            options={BATHROOM_BLOCK_REASONS.map((r) => ({ value: r, label: r }))}
          />
        </fieldset>
        <Field label={d.reason === "Otro" ? "Descripción" : "Descripción (opcional)"} error={tried ? errs.notes || undefined : undefined}>
          {(p) => (
            <textarea {...p} rows={2} maxLength={300} value={d.notes} onChange={(e) => set({ notes: e.target.value })} className={`${adminInput} resize-y`} />
          )}
        </Field>
        {overlap && (
          <Callout tone="error" role="alert">
            Se cruza con otro bloqueo de este baño ({fmtDate(overlap.from)} → {fmtDate(overlap.to)}).
          </Callout>
        )}
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
        <Button variant="primary" loading={busy} disabled={tried && blocked} icon={<CheckIcon size={14} />} onClick={submit}>
          {d.id ? "Guardar cambios" : "Bloquear baño"}
        </Button>
      </div>
    </Modal>
  );
}

/* ───────────── En la ficha de una cabaña ───────────── */

// Baños asignados a la cabaña, con su estado para cambiarlo en el momento.
export function CabinBathrooms({ cabinTypeId }: { cabinTypeId: string }) {
  const { data, today, cabinLabel } = useAdmin();
  const mine = (data.bathrooms ?? []).filter((b) => b.cabinTypeId === cabinTypeId);
  const cabin = data.cabinTypes.find((c) => c.id === cabinTypeId);
  return (
    <Card aria-labelledby="cb-baths" className="flex flex-col gap-4 p-4 sm:p-5">
      <CardHeader
        id="cb-baths"
        icon={<BathIcon size={18} />}
        accent="blue"
        title="Baños"
        subtitle="Si un baño no está disponible, la cabaña se sigue ofreciendo y el equipo ve el aviso."
        actions={
          <Link href={paths.bloqueos({ ver: "banos" })} className="text-[13px] font-semibold text-ink underline-offset-2 hover:underline">
            Gestionar baños
          </Link>
        }
      />
      {mine.length ? (
        <ul className="flex flex-col gap-2.5">
          {mine.map((b) => (
            <li key={b.id} className="flex flex-col gap-2.5 rounded-[18px] bg-paper/60 p-3.5">
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[14px] font-semibold text-ink">
                  {b.name}
                  {cabin && cabin.units > 1 && (
                    <span className="ml-1.5 text-[12.5px] font-medium text-ink-muted">{b.unit ? cabinLabel(cabinTypeId, b.unit) : "Todas las unidades"}</span>
                  )}
                </span>
                <BathroomStatusBadge status={b.status} />
              </p>
              <StatusPicker b={b} />
              {(data.bathroomBlocks ?? [])
                .filter((k) => k.bathroomId === b.id && k.to >= today)
                .map((k) => (
                  <p key={k.id} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-warning">
                    <BanIcon size={12} />
                    Bloqueado del {fmtDate(k.from)} al {fmtDate(k.to)} · {k.reason}
                  </p>
                ))}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={<BathIcon size={18} />} title="Sin baños asignados" text="Asigna un baño a esta cabaña desde Bloqueos y baños." />
      )}
    </Card>
  );
}
