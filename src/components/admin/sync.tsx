"use client";

// Estado de la sincronización para el usuario: el indicador del encabezado, la marca de cada registro y la página con lo pendiente
// y lo que hay que revisar. Todo sale del motor (lib/offline/engine.ts); nada aquí bloquea la navegación.
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { AlertIcon, CheckIcon, ClockIcon, RefreshIcon, WarningIcon } from "@/components/ui/icons";
import { useAdmin } from "@/components/admin/context";
import { paths } from "@/components/admin/routes";
import { Badge, Button, Callout, Card, CardHeader, EmptyState, PageHeader } from "@/components/admin/ui";
import type { SyncEngine, SyncStatus } from "@/lib/offline/engine";
import { OPS, type Op } from "@/lib/offline/ops";

const NONE: SyncStatus = { network: "online", syncing: false, pending: 0, conflicts: 0, waiting: 0, authLost: false, lastSyncAt: null, sent: 0, total: 0 };
const noop = () => () => {};

export function useSyncStatus(engine: SyncEngine | null) {
  return useSyncExternalStore(
    engine ? (fn) => engine.subscribe(fn) : noop,
    () => engine?.status ?? NONE,
    () => NONE,
  );
}

export function chipOf(s: SyncStatus): { label: string; detail: string; tone: string; icon: typeof CheckIcon; spin?: boolean } {
  if (s.authLost)
    return {
      label: "Ingresa de nuevo",
      detail: "La sesión venció. Tus cambios siguen guardados en este dispositivo.",
      tone: "bg-warning-soft text-warning",
      icon: WarningIcon,
    };
  if (s.conflicts)
    return {
      label: `Revisar ${s.conflicts}`,
      detail: "Hay cambios que el servidor no aceptó: decide qué hacer con ellos.",
      tone: "bg-error-soft text-error",
      icon: AlertIcon,
    };
  if (s.network === "offline")
    return {
      label: s.pending ? `Sin conexión · ${s.pending} ${s.pending === 1 ? "pendiente" : "pendientes"}` : "Sin conexión",
      detail: "Puedes seguir trabajando: los cambios quedan guardados en este dispositivo y se envían al volver la conexión.",
      tone: "bg-warning-soft text-warning",
      icon: ClockIcon,
    };
  if (s.syncing && s.total)
    return {
      label: `Sincronizando ${Math.min(s.sent + 1, s.total)} de ${s.total}`,
      detail: "Enviando los cambios guardados en este dispositivo.",
      tone: "bg-info-soft text-info",
      icon: RefreshIcon,
      spin: true,
    };
  if (s.pending)
    return {
      label: `${s.pending} ${s.pending === 1 ? "pendiente" : "pendientes"}`,
      detail: "Cambios guardados en este dispositivo, esperando enviarse.",
      tone: "bg-info-soft text-info",
      icon: ClockIcon,
    };
  // Actualizando sin nada por enviar: solo cambia el icono, para que el encabezado no salte con cada actualización.
  if (s.syncing) return { label: "En línea", detail: "Actualizando los datos…", tone: "bg-success-soft text-success", icon: RefreshIcon, spin: true };
  return { label: "En línea", detail: "Todo está sincronizado.", tone: "bg-success-soft text-success", icon: CheckIcon };
}

// Indicador del encabezado: discreto, con texto e ícono (no solo color), y lleva al detalle.
export function SyncChip({ compact = false }: { compact?: boolean }) {
  const { sync } = useAdmin();
  const status = useSyncStatus(sync);
  if (!sync) return null;
  const c = chipOf(status);
  return (
    <Link
      href={paths.sincronizacion}
      data-sync-state={
        status.authLost
          ? "auth"
          : status.conflicts
            ? "conflict"
            : status.network === "offline"
              ? "offline"
              : status.syncing
                ? "syncing"
                : status.pending
                  ? "pending"
                  : "online"
      }
      title={c.detail}
      aria-label={`${c.label}. ${c.detail}`}
      className={`flex h-9 flex-none items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold whitespace-nowrap ${c.tone}`}
    >
      <c.icon size={14} className={c.spin ? "motion-safe:animate-spin" : ""} />
      <span className={compact ? "max-sm:sr-only" : ""}>{c.label}</span>
      {compact && status.pending + status.conflicts > 0 && (
        <span aria-hidden="true" className="tabular-nums sm:hidden">
          {status.pending + status.conflicts}
        </span>
      )}
    </Link>
  );
}

// Marca de un registro: guardado solo en este dispositivo o por revisar. Sin marca: sincronizado.
export function SyncMark({ entity }: { entity: string }) {
  const { sync } = useAdmin();
  useSyncStatus(sync);
  const mark = sync?.markOf(entity);
  if (!mark) return null;
  return mark === "conflict" ? (
    <Badge tone="danger" icon={<AlertIcon size={12} />}>
      Por revisar
    </Badge>
  ) : (
    <Badge tone="warning" icon={<ClockIcon size={12} />}>
      Guardado en este dispositivo
    </Badge>
  );
}

const show = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v);
const at = (iso: string) => new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });

function ConflictCard({ op }: { op: Op }) {
  const { sync, toast, ask } = useAdmin();
  if (!sync) return null;
  const c = op.conflict;
  const def = OPS[op.type];
  const mineLabel = c?.code === "PAID_CHANGED" ? "Registrarlo de todos modos" : c?.code === "QUOTE_CHANGED" ? "Aceptar el valor nuevo" : "Usar lo mío";
  const canMine = ["VERSION_CONFLICT", "PAID_CHANGED", "QUOTE_CHANGED"].includes(c?.code ?? "");
  const canRecreate = !!c?.gone && !!def?.recreate;
  const failed = (c?.detail as { failed?: { ref: string; error?: string }[] } | undefined)?.failed;
  const discard = () =>
    ask({
      title: "Descartar este cambio",
      text: `${op.label}. Se borra de este dispositivo y no se puede recuperar.`,
      okLabel: "Descartar",
      danger: true,
      done: "Cambio descartado",
      run: async () => {
        await sync.resolve(op.opId, "discard");
        return { status: 200, data: null };
      },
    });
  return (
    <li className="flex flex-col gap-3 rounded-[18px] bg-error-soft/60 p-4" data-conflict={op.opId}>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-ink">{op.label}</p>
        <p className="text-[12.5px] text-ink-muted">Hecho el {at(op.occurredAt)}</p>
        <p className="mt-1.5 text-[13.5px] text-ink">{sync.conflictText(op)}</p>
      </div>
      {!!c?.fields?.length && (
        <dl className="grid grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-1 rounded-[14px] bg-paper/70 px-3 py-2 text-[13px]">
          <span className="text-ink-muted">Campo</span>
          <span className="font-semibold text-ink-muted">Lo tuyo</span>
          <span className="font-semibold text-ink-muted">En el servidor</span>
          {c.fields.map((f) => (
            <div key={f.field} className="contents">
              <dt className="text-ink-muted">{f.field}</dt>
              <dd className="text-ink">{show(f.mine)}</dd>
              <dd className="text-ink">{show(f.theirs)}</dd>
            </div>
          ))}
        </dl>
      )}
      {failed && (
        <ul className="rounded-[14px] bg-paper/70 px-3 py-2 text-[13px] text-ink">
          {failed.map((f) => (
            <li key={f.ref}>
              <strong className="font-semibold">{f.ref}</strong>: {f.error}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {canMine && (
          <Button size="sm" variant="primary" onClick={() => void sync.resolve(op.opId, "mine").then(() => toast("Se volverá a enviar"))}>
            {mineLabel}
          </Button>
        )}
        {canRecreate && (
          <Button size="sm" variant="primary" onClick={() => void sync.resolve(op.opId, "recreate").then(() => toast("Se creará de nuevo"))}>
            Crear de nuevo
          </Button>
        )}
        {c?.code !== "IMPORT_PARTIAL" && (
          <Button size="sm" onClick={() => void sync.resolve(op.opId, "retry")}>
            Reintentar
          </Button>
        )}
        <Button size="sm" variant="danger-ghost" onClick={discard}>
          {c?.fields?.length ? "Usar lo del servidor" : c?.code === "IMPORT_PARTIAL" ? "Entendido" : "Descartar"}
        </Button>
        {op.entities[0].startsWith("reservations:") && (
          <Link href={paths.reserva(op.entities[0].slice("reservations:".length))} className="ml-auto self-center text-[13px] font-semibold text-ink underline">
            Ver reserva
          </Link>
        )}
      </div>
    </li>
  );
}

export function SyncCenter() {
  const { sync } = useAdmin();
  const status = useSyncStatus(sync);
  if (!sync)
    return (
      <>
        <PageHeader title="Sincronización" description="El trabajo sin conexión no está activo en este entorno." />
        <EmptyState icon={<CheckIcon size={20} />} title="Sin nada que sincronizar" text="Los cambios se guardan directamente en el servidor." />
      </>
    );
  const ops = sync.list();
  const conflicts = ops.filter((o) => o.state === "conflict");
  const pending = ops.filter((o) => o.state === "pending");
  const c = chipOf(status);
  return (
    <>
      <PageHeader
        title="Sincronización"
        description="Lo que está guardado en este dispositivo y aún no ha llegado al servidor."
        actions={
          <Button icon={<RefreshIcon size={14} />} disabled={status.network === "offline" || status.syncing} onClick={() => void sync.probe()}>
            Sincronizar ahora
          </Button>
        }
      />
      <Callout tone={status.conflicts ? "warning" : "info"}>
        <strong>{c.label}.</strong> {c.detail}
        {status.lastSyncAt ? ` Última sincronización: ${at(new Date(status.lastSyncAt).toISOString())}.` : ""}
      </Callout>
      {conflicts.length > 0 && (
        <Card aria-labelledby="sy-conflicts" className="flex flex-col gap-3 p-4 sm:p-5">
          <CardHeader
            id="sy-conflicts"
            icon={<AlertIcon size={18} />}
            title={`Por revisar (${conflicts.length})`}
            subtitle="El servidor no los aceptó. No se han perdido: decide qué hacer con cada uno."
          />
          <ul className="flex flex-col gap-2.5">
            {conflicts.map((op) => (
              <ConflictCard key={op.opId} op={op} />
            ))}
          </ul>
        </Card>
      )}
      {pending.length > 0 && (
        <Card aria-labelledby="sy-pending" className="flex flex-col gap-3 p-4 sm:p-5">
          <CardHeader
            id="sy-pending"
            icon={<ClockIcon size={18} />}
            title={`Pendientes (${pending.length})`}
            subtitle="Se envían solos, en este orden, cuando hay conexión. Puedes seguir trabajando."
          />
          <ul className="flex flex-col divide-y divide-line">
            {pending.map((op) => (
              <li key={op.opId} data-pending={op.opId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13.5px]">
                <span className="min-w-0 text-ink">{op.label}</span>
                <span className="text-[12.5px] text-ink-muted">
                  {at(op.occurredAt)}
                  {op.attempts ? ` · ${op.attempts} ${op.attempts === 1 ? "reintento" : "reintentos"}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {!ops.length && <EmptyState icon={<CheckIcon size={20} />} title="Todo sincronizado" text="No hay cambios pendientes en este dispositivo." />}
    </>
  );
}
