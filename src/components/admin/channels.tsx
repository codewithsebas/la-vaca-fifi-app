"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertIcon, CalendarIcon, CheckIcon, ClockIcon, ExternalLinkIcon, PencilIcon, RefreshIcon } from "@/components/ui/icons";
import { Combobox } from "@/components/ui/combobox";
import { api, type Channels } from "@/lib/client/api";
import { isMockApi } from "@/lib/config";
import { addDays, fmtDate, nightsBetween, plural, timeAgo } from "@/lib/format";
import type { Beds24Room, Beds24Status, ChannelCalendar, ChannelSyncResult } from "@/lib/types";
import { useAdmin } from "@/components/admin/context";
import { MODULES, paths } from "@/components/admin/routes";
import { adminInput } from "@/components/admin/shared";
import { Badge, Button, Callout, Card, CardHeader, EmptyState, Field, Modal, PageHeader, StatCard, type Tone } from "@/components/admin/ui";

// Booking.com: cada unidad de la app se enlaza con un tipo de alojamiento de Booking, de una de dos formas:
//   · Por Beds24 (channel manager), en tiempo real: cada venta de la web se reserva primero en Beds24, que la rechaza si
//     Booking ya vendió esas noches y si no las cierra allá al instante; las reservas de Booking llegan en segundos.
//   · Por calendarios iCal: la app lee el enlace de exportación de Booking cada 5 minutos y Booking importa el de la app a
//     su ritmo (cada pocas horas), así que queda un margen de sobreventa.
// Solo viajan fechas: ni nombres, ni precios.

type Unit = { key: string; cabinTypeId: string; unit: number; name: string; cal: ChannelCalendar | null };
type Draft = { cabinTypeId: string; unit: number; units: number[]; name: string; label: string; importUrl: string; beds24RoomId: number | null };
// Cabaña del mismo tipo para elegir el grupo: takenBy, el tipo de Booking que ya lo cubre (otro calendario).
type PoolOption = { unit: number; name: string; takenBy: string | null };

// Cabañas que cubre un tipo de Booking (los datos simulados viejos no traen units).
const poolOf = (c: ChannelCalendar) => (c.units?.length ? c.units : [c.unit]);

const ERRORS: Record<string, string> = {
  CHANNELS_NOT_READY: "Falta aplicar en la base de datos la actualización para Booking.com.",
  INVALID_UNIT: "Esa cabaña ya no existe. Recarga la página.",
  BEDS24_NOT_CONNECTED: "Primero conecta Beds24.",
  NOT_AVAILABLE_IN_MOCK: "No disponible en modo simulado.",
};

// Booking descarga el enlace de la web cada pocas horas. Si nunca lo hizo, falta pegarlo en el extranet (Importar
// calendario); si lleva más de 12 horas sin hacerlo, Booking dejó de ver lo que se vende en la web.
const STALE_FETCH_MS = 12 * 3600_000;

function stateOf(c: ChannelCalendar | null, now: number, beds24: Beds24Status | null): { label: string; tone: Tone } {
  if (c?.beds24RoomId) return beds24?.lastError ? { label: "Error con Beds24", tone: "danger" } : { label: "Tiempo real", tone: "success" };
  if (!c?.importUrl) return { label: "Sin enlazar", tone: "neutral" };
  if (c.lastStatus === "error") return { label: "Error al leer", tone: "danger" };
  if (!c.lastSyncedAt) return { label: "Pendiente", tone: "warning" };
  if (!c.lastFetchedAt) return { label: "Falta importar en Booking", tone: "warning" };
  if (now - Date.parse(c.lastFetchedAt) > STALE_FETCH_MS) return { label: "Booking no lee la web", tone: "danger" };
  return { label: "Sincronizada", tone: "success" };
}

// Resumen de una lectura para el aviso: «2 fechas nuevas · 1 cancelada».
function summary(results: ChannelSyncResult[]) {
  const failed = results.filter((r) => !r.ok);
  if (failed.length) return { ok: false, text: failed[0].error ?? "No se pudo leer el calendario." };
  const added = results.reduce((s, r) => s + r.added, 0);
  const removed = results.reduce((s, r) => s + r.removed, 0);
  const moved = results.flatMap((r) => r.moved);
  const conflicts = results.flatMap((r) => r.conflicts);
  const parts = [
    added && plural(added, "fecha nueva", "fechas nuevas"),
    removed && plural(removed, "cancelada", "canceladas"),
    moved.length && `${plural(moved.length, "reserva reacomodada", "reservas reacomodadas")}`,
  ];
  if (conflicts.length) return { ok: false, text: `Posible sobreventa: ${conflicts.join(", ")}. Revisa Notificaciones.` };
  const changes = parts.filter(Boolean).join(" · ");
  return { ok: true, text: results.length ? `Booking.com leído${changes ? `: ${changes}` : ", sin cambios"}` : "Ya estaba al día" };
}

export function ChannelsView() {
  const { data, setData, toast, onAuthError, today, now, cabinLabel } = useAdmin();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [syncing, setSyncing] = useState(false);
  const beds24 = data.beds24;

  // El tipo de Booking que cubre una cabaña (primero los enlazados: un calendario sin enlazar de esa cabaña no cuenta).
  const calOf = (typeId: string, unit: number) => {
    const all = data.channelCalendars.filter((x) => x.cabinTypeId === typeId && poolOf(x).includes(unit));
    return all.find((x) => x.importUrl || x.beds24RoomId) ?? all[0] ?? null;
  };
  const units: Unit[] = data.cabinTypes
    .filter((c) => c.units > 0)
    .flatMap((c) =>
      Array.from({ length: c.units }, (_, i) => ({
        key: `${c.id}:${i + 1}`,
        cabinTypeId: c.id,
        unit: i + 1,
        name: cabinLabel(c.id, i + 1),
        cal: calOf(c.id, i + 1),
      })),
    );
  const live = units.filter((u) => u.cal?.beds24RoomId);
  const ical = units.filter((u) => u.cal?.importUrl && !u.cal.beds24RoomId);
  const linked = [...live, ...ical];
  const failing = ical.filter((u) => u.cal!.lastStatus === "error");
  const reads = [...ical.map((u) => u.cal!.lastSyncedAt), ...(live.length ? [beds24?.lastPullAt, beds24?.lastWebhookAt] : [])];
  const lastRead =
    reads
      .filter((x): x is string => !!x)
      .sort()
      .at(-1) ?? null;
  const next30 = addDays(today, 30);
  const upcoming = data.channelStays.filter((s) => !s.removedAt && s.checkOut > today).sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1));
  const cancelled = data.channelStays.filter((s) => s.removedAt && s.checkOut > today).sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1));
  let nights30 = 0;
  for (const s of upcoming) {
    const a = s.checkIn > today ? s.checkIn : today;
    const z = s.checkOut < next30 ? s.checkOut : next30;
    if (z > a) nights30 += nightsBetween(a, z);
  }

  const apply = (c: Channels) => setData((d) => ({ ...d, channelCalendars: c.calendars, channelStays: c.stays, beds24: c.beds24 }));
  const errorOf = (r: { status: number; data: unknown }) =>
    ERRORS[(r.data as { error?: string } | null)?.error ?? ""] ?? "No se pudo completar. Inténtalo de nuevo.";

  async function syncNow() {
    setSyncing(true);
    try {
      const r = await api.admin.channels.sync();
      if (r.status === 401 || r.status === 403) return onAuthError();
      if (r.status !== 200 || !r.data || !("calendars" in r.data)) return toast(errorOf(r), "error");
      apply(r.data);
      const s = summary(r.data.results ?? []);
      toast(s.text, s.ok ? "ok" : "error");
    } catch {
      toast("Error de conexión. Inténtalo de nuevo.", "error");
    } finally {
      setSyncing(false);
    }
  }

  const copy = (url: string, done = "Enlace copiado. Pégalo en Booking.com → Importar calendario.") =>
    navigator.clipboard?.writeText(url).then(
      () => toast(done),
      () => toast("No se pudo copiar. Selecciona el enlace y cópialo a mano.", "error"),
    );

  return (
    <>
      <PageHeader
        title={MODULES.booking.label}
        description={
          live.length
            ? "Conectado en tiempo real por Beds24: cada venta de la web se reserva primero allá y se cierra en Booking.com al instante, y las reservas de Booking.com llegan en segundos. Solo se comparten fechas."
            : "Lo que se vende en Booking.com bloquea esas fechas en la web, y lo que se vende en la web las cierra en Booking.com. Solo se comparten fechas: ni huéspedes ni precios."
        }
        actions={
          linked.length > 0 && (
            <Button variant="primary" icon={<RefreshIcon size={14} />} loading={syncing} onClick={syncNow}>
              Sincronizar ahora
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Cabañas enlazadas"
          value={`${linked.length} de ${units.length}`}
          hint={live.length ? `${live.length} en tiempo real por Beds24` : linked.length ? "con su calendario de Booking.com" : "Ninguna todavía"}
          icon={<RefreshIcon size={15} />}
        />
        <StatCard label="Noches de Booking.com" value={nights30} hint="ocupadas en los próximos 30 días" icon={<CalendarIcon size={15} />} />
        <StatCard
          label="Última lectura"
          value={lastRead ? timeAgo(lastRead, now) : "—"}
          hint={
            failing.length
              ? `${plural(failing.length, "calendario con error", "calendarios con error")}`
              : live.length
                ? "Beds24 avisa de cada reserva"
                : "se lee cada 5 minutos"
          }
          icon={<ClockIcon size={15} />}
          tone={failing.length || (live.length && beds24?.lastError) ? "danger" : undefined}
        />
      </div>

      {isMockApi && (
        <Callout>Modo simulado: los enlaces son de ejemplo, Beds24 no se puede conectar y «Sincronizar ahora» no lee Booking.com de verdad.</Callout>
      )}
      {failing.length > 0 && (
        <Callout tone="error" role="alert">
          No se pudo leer {failing.map((u) => u.cal!.label || u.name).join(", ")}: {failing[0].cal!.lastError} Mientras tanto, las fechas de Booking.com quedan
          como en la última lectura.
        </Callout>
      )}

      <Beds24Card
        status={beds24}
        mapped={live.length}
        onConnected={(c, msg, ok) => (apply(c), toast(msg, ok ? "ok" : "error"))}
        onAuthError={onAuthError}
        errorOf={errorOf}
        copy={copy}
      />

      <Card className="flex flex-col">
        <CardHeader
          id="ch-units"
          className="p-4 sm:px-5"
          icon={<RefreshIcon size={18} />}
          title="Cabañas y tipos de alojamiento"
          subtitle="Enlaza cada cabaña con su tipo de alojamiento en Booking.com. Los que no se venden allá quedan sin enlazar."
        />
        <ul aria-labelledby="ch-units" className="flex flex-col divide-y divide-line border-t border-line">
          {units.map((u) => {
            const st = stateOf(u.cal, now, beds24);
            const c = u.cal;
            return (
              <li key={u.key} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5">
                <div className="min-w-[220px] flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">
                    {u.name}
                    <Badge tone={st.tone} icon={st.tone === "success" ? <CheckIcon size={11} /> : st.tone === "danger" ? <AlertIcon size={11} /> : undefined}>
                      {st.label}
                    </Badge>
                  </p>
                  <p className="text-[13px] text-ink-muted">
                    {c?.label ? `En Booking.com: ${c.label}` : c?.importUrl || c?.beds24RoomId ? "En Booking.com" : "Solo se vende en la web"}
                    {c &&
                      poolOf(c).length > 1 &&
                      ` · junto con ${poolOf(c)
                        .filter((x) => x !== u.unit)
                        .map((x) => cabinLabel(u.cabinTypeId, x))
                        .join(" y ")}`}
                    {c?.beds24RoomId && " · por Beds24"}
                    {c?.importUrl &&
                      !c.beds24RoomId &&
                      c.lastSyncedAt &&
                      ` · leída ${timeAgo(c.lastSyncedAt, now)} · ${plural(c.lastEventCount, "fecha", "fechas")}`}
                    {c?.importUrl &&
                      !c.beds24RoomId &&
                      (c.lastFetchedAt ? ` · Booking vio la web ${timeAgo(c.lastFetchedAt, now)}` : " · Booking aún no ha leído el enlace de la web")}
                  </p>
                  {c?.lastStatus === "error" && !c.beds24RoomId && <p className="mt-1 text-[12.5px] font-semibold text-error">{c.lastError}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {c?.importUrl && !c.beds24RoomId && (
                    <Button size="sm" variant="ghost" onClick={() => copy(c.exportUrl)}>
                      Copiar enlace para Booking
                    </Button>
                  )}
                  <Button
                    size="sm"
                    icon={<PencilIcon size={13} />}
                    onClick={() =>
                      setEditing({
                        cabinTypeId: u.cabinTypeId,
                        unit: c?.unit ?? u.unit,
                        units: c ? poolOf(c) : [u.unit],
                        name: cabinLabel(u.cabinTypeId, c?.unit ?? u.unit),
                        label: c?.label ?? "",
                        importUrl: c?.importUrl ?? "",
                        beds24RoomId: c?.beds24RoomId ?? null,
                      })
                    }
                  >
                    {c?.importUrl || c?.beds24RoomId ? "Editar" : "Enlazar"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card className="flex flex-col">
          <CardHeader
            id="ch-stays"
            className="p-4 sm:px-5"
            icon={<CalendarIcon size={18} />}
            title="Próximas fechas de Booking.com"
            subtitle="Reservas o cierres hechos en Booking.com. No se pueden reservar en la web."
          />
          {upcoming.length ? (
            <ul aria-labelledby="ch-stays" className="flex flex-col divide-y divide-line border-t border-line">
              {upcoming.slice(0, 40).map((s) => (
                <li key={s.id}>
                  <Link
                    href={paths.calendario({ fecha: s.checkIn })}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13.5px] transition-colors hover:bg-canvas sm:px-5"
                  >
                    <span className="font-semibold text-ink">{cabinLabel(s.cabinTypeId, s.unit)}</span>
                    <span className="text-ink-muted tabular-nums">
                      {fmtDate(s.checkIn)} → {fmtDate(s.checkOut)} · {plural(nightsBetween(s.checkIn, s.checkOut), "noche", "noches")}
                      {s.checkIn <= today && (
                        <Badge tone="info" className="ml-2">
                          En curso
                        </Badge>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            // Sin fechas, el aviso ocupa el alto de la tarjeta (que iguala el de las instrucciones de al lado).
            <div className="flex flex-1 flex-col border-t border-line p-4 sm:px-5 [&>div]:flex-1">
              <EmptyState
                compact
                icon={<CalendarIcon size={20} />}
                title={linked.length ? "Sin fechas ocupadas en Booking.com" : "Todavía no hay cabañas enlazadas"}
                text={linked.length ? "Cuando alguien reserve allá, las fechas aparecerán aquí." : "Enlaza una cabaña para empezar."}
              />
            </div>
          )}
          {cancelled.length > 0 && (
            <p className="border-t border-line px-4 py-2.5 text-[12.5px] text-ink-muted sm:px-5">
              Canceladas en Booking.com y ya disponibles en la web:{" "}
              {cancelled.map((s) => `${cabinLabel(s.cabinTypeId, s.unit)} ${fmtDate(s.checkIn)}`).join(" · ")}
            </p>
          )}
        </Card>

        {beds24 ? (
          <Card className="flex flex-col gap-3 p-4 sm:p-5">
            <h2 className="text-[15px] font-bold text-ink">Cómo enlazar una cabaña por Beds24</h2>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-[13.5px] leading-snug text-ink">
              <li>
                En Beds24, conecta Booking.com en <strong>Settings → Channel Manager → Booking.com</strong> y trae las reservas que ya existen con{" "}
                <strong>Import existing bookings</strong>.
              </li>
              <li>
                Aquí, en cada cabaña que se vende en Booking.com, pulsa <strong>Editar</strong> y elige su habitación de Beds24. La app sube allá sus reservas y
                bloqueos.
              </li>
              <li>
                Pega la <strong>dirección del aviso</strong> (arriba) en Beds24 → <strong>Settings → Properties → Access → Booking webhook</strong>.
              </li>
              <li>Revisa que Beds24 muestre las reservas de la web («Web VF-…») y activa la conexión completa con Booking.com.</li>
            </ol>
            <Callout tone="success">
              Cada venta de la web se reserva primero en Beds24: si Booking.com ya vendió esas noches, la web no la confirma y ofrece otra cabaña.
            </Callout>
          </Card>
        ) : (
          <Card className="flex flex-col gap-3 p-4 sm:p-5">
            <h2 className="text-[15px] font-bold text-ink">Cómo enlazar una cabaña por calendario</h2>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-[13.5px] leading-snug text-ink">
              <li>
                En el extranet de Booking.com entra a <strong>Tarifas y disponibilidad → Sincronizar calendarios</strong> y pulsa{" "}
                <strong>Conectar un calendario</strong> en el tipo de alojamiento.
              </li>
              <li>
                Paso 1, <strong>Importar calendario</strong>: pega el <strong>enlace para Booking</strong> de la cabaña que corresponde (aquí, en{" "}
                <strong>Enlazar</strong>) y ponle de nombre «Web La Vaca Fifí».
              </li>
              <li>
                Paso 2, <strong>Exportar calendario</strong>: copia el enlace de Booking.com y pégalo aquí, en esa misma cabaña.
              </li>
            </ol>
            <Callout tone="warning">
              Booking.com descarga el calendario de la web a su ritmo (cada pocas horas; cada cabaña muestra cuándo lo vio por última vez). Si en ese rato
              alguien reserva allá una cabaña ya vendida aquí, la app reacomoda la reserva en otra libre del mismo tipo o te avisa de la posible sobreventa.
              Para evitarlo, conecta Beds24.
            </Callout>
            <p className="text-[12.5px] text-ink-muted">
              Booking.com solo permite sincronizar calendarios si cada tipo de alojamiento tiene una unidad y no hay un channel manager conectado.{" "}
              <a
                href="https://admin.booking.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-ink underline-offset-2 hover:underline"
              >
                Abrir el extranet <ExternalLinkIcon size={12} />
              </a>
            </p>
          </Card>
        )}
      </div>

      {editing && (
        <LinkEditor
          draft={editing}
          cal={data.channelCalendars.find((x) => x.cabinTypeId === editing.cabinTypeId && x.unit === editing.unit) ?? null}
          poolOptions={units
            .filter((u) => u.cabinTypeId === editing.cabinTypeId)
            .map((u) => ({
              unit: u.unit,
              name: u.name,
              takenBy:
                u.cal && u.cal.unit !== editing.unit && (u.cal.importUrl || u.cal.beds24RoomId) ? u.cal.label || cabinLabel(u.cabinTypeId, u.cal.unit) : null,
            }))}
          beds24={!!beds24}
          onClose={() => setEditing(null)}
          onSaved={(c, msg, ok) => {
            apply(c);
            setEditing(null);
            toast(msg, ok ? "ok" : "error");
          }}
          onAuthError={onAuthError}
          errorOf={errorOf}
          copy={copy}
        />
      )}
    </>
  );
}

// Conexión con Beds24: el código de invitación la activa; después muestra su estado y la dirección del aviso (webhook).
function Beds24Card({
  status,
  mapped,
  onConnected,
  onAuthError,
  errorOf,
  copy,
}: {
  status: Beds24Status | null;
  mapped: number;
  onConnected: (c: Channels, msg: string, ok: boolean) => void;
  onAuthError: () => void;
  errorOf: (r: { status: number; data: unknown }) => string;
  copy: (url: string, done?: string) => void;
}) {
  const { now } = useAdmin();
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const r = await api.admin.channels.connectBeds24(code.trim());
      if (r.status === 401 || r.status === 403) return onAuthError();
      if (r.status === 200 && r.data && "calendars" in r.data) {
        setCode("");
        setOpen(false);
        const s = summary(r.data.results ?? []);
        return onConnected(r.data, s.ok ? "Beds24 conectado" : `Beds24 conectado, pero el repaso falló: ${s.text}`, s.ok);
      }
      setError((r.data as { fields?: Record<string, string> } | null)?.fields?.code ?? errorOf(r));
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <div className="flex flex-col gap-3">
      <Field
        label="Código de invitación de Beds24"
        error={error}
        hint="Beds24 → Settings → Marketplace → API → invite code, con permisos bookings (all), inventory (read) y properties (read). Vence a las 24 horas."
      >
        {(p) => (
          <input
            {...p}
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${adminInput} font-mono text-[13px]`}
            disabled={isMockApi}
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={busy} disabled={!code.trim() || isMockApi} onClick={connect}>
          Conectar Beds24
        </Button>
        {status && (
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );

  if (!status)
    return (
      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <CardHeader
          icon={<RefreshIcon size={18} />}
          title="Conexión en tiempo real con Beds24"
          subtitle="Con Beds24 conectado a Booking.com, cada venta de la web cierra esas noches allá al instante y no hay margen de sobreventa."
        />
        {form}
      </Card>
    );

  const ok = !status.lastError;
  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <CardHeader
        icon={<RefreshIcon size={18} />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            Beds24
            <Badge tone={ok ? "success" : "danger"} icon={ok ? <CheckIcon size={11} /> : <AlertIcon size={11} />}>
              {ok ? "Conectado" : "Con error"}
            </Badge>
          </span>
        }
        subtitle={[
          mapped ? plural(mapped, "cabaña enlazada", "cabañas enlazadas") : "Ninguna cabaña enlazada todavía: elige su habitación de Beds24 en Editar",
          status.lastWebhookAt ? `último aviso de Beds24 ${timeAgo(status.lastWebhookAt, now)}` : "Beds24 aún no ha enviado avisos",
          status.lastPullAt && `revisado ${timeAgo(status.lastPullAt, now)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          !open && (
            <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
              Cambiar código
            </Button>
          )
        }
      />
      {!ok && (
        <Callout tone="error" role="alert">
          {status.lastError} Mientras tanto, la web no vende las cabañas de Booking.com que Beds24 no confirme.
        </Callout>
      )}
      {open && form}
      <div className="flex flex-col gap-2 rounded-xl bg-canvas p-3.5">
        <p className="text-[13px] font-semibold text-ink">
          Dirección del aviso (Beds24 → Settings → Properties → Access → Booking webhook, versión 2 sin datos personales)
        </p>
        <code className="block rounded-lg bg-panel px-3 py-2 font-mono text-[12px] break-all text-ink-muted shadow-panel">{status.webhookUrl}</code>
        <div>
          <Button size="sm" onClick={() => copy(status.webhookUrl, "Dirección copiada. Pégala en Beds24 → Properties → Access → Booking webhook.")}>
            Copiar dirección
          </Button>
        </div>
      </div>
    </Card>
  );
}

function LinkEditor({
  draft,
  cal,
  poolOptions,
  beds24,
  onClose,
  onSaved,
  onAuthError,
  errorOf,
  copy,
}: {
  draft: Draft;
  cal: ChannelCalendar | null;
  poolOptions: PoolOption[];
  beds24: boolean;
  onClose: () => void;
  onSaved: (c: Channels, msg: string, ok: boolean) => void;
  onAuthError: () => void;
  errorOf: (r: { status: number; data: unknown }) => string;
  copy: (url: string) => void;
}) {
  const { ask, setData } = useAdmin();
  const [d, setD] = useState(draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<Beds24Room[] | null>(null);
  const viaBeds24 = d.beds24RoomId !== null;
  const unlinking = viaBeds24 ? false : (!!cal?.importUrl && !d.importUrl.trim()) || (!!cal?.beds24RoomId && !d.importUrl.trim());
  const linking = viaBeds24 && d.beds24RoomId !== (cal?.beds24RoomId ?? null);

  // Habitaciones de la cuenta de Beds24, para elegir la de esta cabaña.
  useEffect(() => {
    if (!beds24) return;
    let alive = true;
    api.admin.channels.beds24Rooms().then(
      (r) => {
        if (!alive) return;
        if (r.status === 200 && r.data && "rooms" in r.data) setRooms(r.data.rooms);
        else {
          setRooms([]);
          setErrors((e) => ({ ...e, beds24RoomId: (r.data as { message?: string } | null)?.message ?? "No se pudieron cargar las habitaciones de Beds24." }));
        }
      },
      () => alive && (setRooms([]), setErrors((e) => ({ ...e, beds24RoomId: "Error de conexión con Beds24." }))),
    );
    return () => {
      alive = false;
    };
  }, [beds24]);

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      const r = await api.admin.channels.save({
        cabinTypeId: d.cabinTypeId,
        unit: d.unit,
        units: viaBeds24 ? [d.unit] : d.units,
        label: d.label,
        importUrl: viaBeds24 ? "" : d.importUrl,
        beds24RoomId: d.beds24RoomId,
      });
      if (r.status === 401 || r.status === 403) return onAuthError();
      if (r.status === 200 && r.data && "calendars" in r.data) {
        const res = r.data.results ?? [];
        if (linking) {
          const s = summary(res);
          return onSaved(r.data, s.ok ? `${d.name} enlazada con Beds24` : `Se enlazó, pero el repaso con Beds24 falló: ${s.text}`, s.ok);
        }
        if (!viaBeds24 && !d.importUrl.trim()) return onSaved(r.data, `${d.name} quedó sin enlazar`, true);
        if (!res.length) return onSaved(r.data, "Cambios guardados", true);
        const s = summary(res);
        return onSaved(
          r.data,
          s.ok ? `${d.name} enlazada · ${plural(res[0].events, "fecha leída", "fechas leídas")}` : `Se guardó el enlace, pero no se pudo leer: ${s.text}`,
          s.ok,
        );
      }
      const fields = (r.data as { fields?: Record<string, string> } | null)?.fields;
      setErrors(fields ?? { form: errorOf(r) });
    } catch {
      setErrors({ form: "Error de conexión. Inténtalo de nuevo." });
    } finally {
      setBusy(false);
    }
  }

  const rotate = (c: ChannelCalendar) =>
    ask({
      title: "Cambiar el enlace para Booking",
      text: "El enlace actual dejará de funcionar. Tendrás que pegar el nuevo en el extranet (Importar calendario) o Booking.com dejará de ver las reservas de la web.",
      okLabel: "Cambiar enlace",
      danger: true,
      done: "Enlace cambiado. Pégalo de nuevo en Booking.com.",
      run: async () => {
        const r = await api.admin.channels.rotate(c.id);
        if (r.status === 200 && r.data && "calendars" in r.data) {
          const next = r.data;
          setData((x) => ({ ...x, channelCalendars: next.calendars, channelStays: next.stays, beds24: next.beds24 }));
        }
        return r;
      },
    });

  const roomOptions = [
    { value: "", label: "Sin Beds24", description: "Por calendario iCal (o solo en la web)" },
    ...(rooms ?? []).map((r) => ({ value: String(r.id), label: r.name, description: [r.propertyName, `n.º ${r.id}`].filter(Boolean).join(" · ") })),
    // La habitación enlazada se muestra aunque la lista aún no cargue.
    ...(d.beds24RoomId && !rooms?.some((r) => r.id === d.beds24RoomId) ? [{ value: String(d.beds24RoomId), label: `Habitación n.º ${d.beds24RoomId}` }] : []),
  ];

  return (
    <Modal
      onClose={onClose}
      labelledBy="ch-ed-title"
      initialFocus="[data-autofocus]"
      className="m-auto w-[calc(100%-32px)] max-w-[620px] rounded-2xl p-0 motion-safe:open:animate-pop-in"
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <h2 id="ch-ed-title" className="text-[17px] font-bold text-ink">
            {d.name} en Booking.com
          </h2>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            {beds24
              ? "Elige su habitación de Beds24 (en tiempo real) o pega el enlace de exportación del calendario."
              : "Pega el enlace de exportación del tipo de alojamiento que corresponde a esta cabaña."}
          </p>
        </div>
        <Field
          label="Nombre en Booking.com (opcional)"
          error={errors.label}
          hint="Como aparece en el extranet, para reconocerla. Ej. «Habitación Doble con baño privado»."
        >
          {(p) => (
            <input
              {...p}
              data-autofocus
              type="text"
              maxLength={80}
              value={d.label}
              onChange={(e) => setD({ ...d, label: e.target.value })}
              className={adminInput}
            />
          )}
        </Field>
        {beds24 && (
          <Field label="Habitación en Beds24" error={errors.beds24RoomId} hint="La de Beds24 que corresponde a este tipo de alojamiento de Booking.com.">
            {(p) => (
              <Combobox
                id={p.id}
                value={d.beds24RoomId ? String(d.beds24RoomId) : ""}
                onChange={(v) => setD({ ...d, beds24RoomId: v ? Number(v) : null })}
                options={roomOptions}
                loading={rooms === null}
                invalid={!!errors.beds24RoomId}
                describedBy={p["aria-describedby"]}
              />
            )}
          </Field>
        )}
        {!viaBeds24 && poolOptions.length > 1 && (
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1.5 text-[13px] font-semibold text-ink">Cabañas de la web que cubre</legend>
            <div className="flex flex-wrap gap-2">
              {poolOptions.map((o) => {
                const on = d.units.includes(o.unit);
                const fixed = o.unit === d.unit;
                return (
                  <label
                    key={o.unit}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[13.5px] font-semibold transition-colors ${o.takenBy ? "cursor-not-allowed border-line text-ink-subtle" : on ? "cursor-pointer border-ink bg-ink/5 text-ink" : "cursor-pointer border-line-strong text-ink-muted hover:text-ink"}`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={fixed || !!o.takenBy}
                      onChange={() => setD({ ...d, units: on ? d.units.filter((x) => x !== o.unit) : [...d.units, o.unit].sort((a, b) => a - b) })}
                      className="size-4 accent-[var(--color-cta)]"
                    />
                    {o.name}
                    {o.takenBy && <span className="font-normal">· {o.takenBy}</span>}
                  </label>
                );
              })}
            </div>
            <p className="text-[12.5px] text-ink-muted">
              Booking.com vende uno por noche: se cierra allá solo cuando todos los marcados están ocupados, y cada reserva suya ocupa uno libre.
            </p>
            {errors.units && <p className="text-[13px] font-semibold text-error">{errors.units}</p>}
          </fieldset>
        )}
        {linking && (
          <Callout tone="info">
            Al guardar, la app sube a Beds24 las reservas y bloqueos de la web de esta cabaña y empieza a recibir las de Booking.com. Deja de usar el calendario
            iCal.
          </Callout>
        )}
        {!viaBeds24 && (
          <>
            <Field
              label="Enlace de exportación de Booking.com"
              error={errors.importUrl}
              hint="Extranet → Tarifas y disponibilidad → Sincronizar calendarios → Exportar calendario. Déjalo vacío para desenlazar."
            >
              {(p) => (
                <textarea
                  {...p}
                  rows={3}
                  maxLength={1000}
                  spellCheck={false}
                  value={d.importUrl}
                  onChange={(e) => setD({ ...d, importUrl: e.target.value })}
                  placeholder="https://admin.booking.com/hotel/hoteladmin/ical.html?t=…"
                  className={`${adminInput} resize-none font-mono text-[13px] break-all`}
                />
              )}
            </Field>
            {unlinking && <Callout tone="warning">Al desenlazarla, sus fechas de Booking.com dejan de bloquear la web.</Callout>}
            {cal && (
              <div className="flex flex-col gap-2 rounded-xl bg-canvas p-3.5">
                <p className="text-[13px] font-semibold text-ink">Enlace para Booking.com (Importar calendario)</p>
                <code className="block rounded-lg bg-panel px-3 py-2 font-mono text-[12px] break-all text-ink-muted shadow-panel">{cal.exportUrl}</code>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => copy(cal.exportUrl)}>
                    Copiar enlace
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => rotate(cal)}>
                    Cambiar enlace
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        {errors.form && (
          <Callout tone="error" role="alert">
            {errors.form}
          </Callout>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {unlinking
              ? "Desenlazar"
              : linking
                ? "Enlazar con Beds24"
                : !viaBeds24 && d.importUrl.trim() && d.importUrl.trim() !== (cal?.importUrl ?? "")
                  ? "Guardar y leer"
                  : "Guardar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
