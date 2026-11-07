"use client";

// Calendarios de Booking.com, uno por cabaña (en Booking hay una habitación por cabaña física). En cada uno se pega el
// enlace de exportación de Booking (el panel lo lee cada 5 minutos y sus noches ocupan la cabaña) y se copia el enlace
// del panel para importarlo en Booking (así Booking cierra las noches ocupadas en el panel).
import { useCallback, useEffect, useState } from "react";
import { RefreshIcon } from "@/components/ui/icons";
import { useSyncStatus } from "@/components/admin/sync";
import { api, type Channels } from "@/lib/client/api";
import { fmtDate, plural, timeAgo, todayISO } from "@/lib/format";
import type { ChannelCalendar, ChannelStay } from "@/lib/types";
import { useAdmin } from "@/components/admin/context";
import { adminInput } from "@/components/admin/shared";
import { Badge, Button, Card, CardHeader, CopyButton, ErrorState, Field, IconButton, Skeleton } from "@/components/admin/ui";

const ERRORS: Record<string, string> = {
  INVALID_URL: "Pega el enlace de exportación de Booking: empieza por https://ical.booking.com/…",
  NOT_FOUND: "Ese calendario ya no existe. Recarga la página.",
};

// Evento con el estado de los calendarios después de leer Booking (lo escucha la tarjeta de calendarios).
const BOOKING_SYNCED = "vf:booking-synced";

// «Leer Booking ahora»: lee todos los calendarios de Booking y avisa cómo le fue. Lo usan la tarjeta de calendarios y el
// botón junto a Booking en el menú lateral.
export function useBookingSync() {
  const { onAuthError, toast, sync } = useAdmin();
  const offline = useSyncStatus(sync).network === "offline";
  const [syncing, setSyncing] = useState(false);
  const run = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await api.admin.channels.sync();
      if (r.status === 401 || r.status === 403) return onAuthError();
      const d = r.data as Channels;
      if (r.status !== 200 || !Array.isArray(d?.calendars)) return toast("No se pudo leer Booking. Inténtalo de nuevo.", "error");
      window.dispatchEvent(new CustomEvent(BOOKING_SYNCED, { detail: d }));
      const results = d.results ?? [];
      const bad = results.filter((x) => !x.ok).length;
      toast(
        results.length === 0
          ? "Booking ya se leyó hace un momento."
          : bad
            ? `${plural(bad, "calendario no se pudo leer", "calendarios no se pudieron leer")}.`
            : "Booking leído.",
        bad ? "error" : "ok",
      );
    } catch {
      toast("Sin conexión con el servidor. Inténtalo de nuevo.", "error");
    } finally {
      setSyncing(false);
    }
  };
  return { syncing, offline, run };
}

// Botón de recarga junto a Booking en el menú lateral (barra negra): la misma acción que «Leer Booking ahora».
export function BookingSyncButton({ className = "" }: { className?: string }) {
  const { syncing, offline, run } = useBookingSync();
  return (
    <IconButton
      label={offline ? "Leer Booking ahora · sin conexión" : "Leer Booking ahora"}
      size="sm"
      data-gesture="refresh"
      aria-busy={syncing || undefined}
      disabled={offline}
      onClick={run}
      className={`size-7! text-white/60 hover:bg-white/10! hover:text-white ${className}`}
    >
      <RefreshIcon size={14} className={syncing ? "animate-spin-fast" : ""} />
    </IconButton>
  );
}

export function BookingCalendars({ offline }: { offline: boolean }) {
  const { onAuthError } = useAdmin();
  const [state, setState] = useState<Channels | null>(null);
  const [failed, setFailed] = useState(false);

  const apply = useCallback(
    (r: { status: number; data: unknown }) => {
      if (r.status === 401 || r.status === 403) {
        onAuthError();
        return null;
      }
      const d = r.data as Channels & { error?: string };
      if (r.status !== 200 || !Array.isArray(d?.calendars)) return d?.error ?? "ERROR";
      setState(d);
      setFailed(false);
      return null;
    },
    [onAuthError],
  );

  const load = useCallback(
    () =>
      api.admin.channels
        .list()
        .then((r) => apply(r) && setFailed(true))
        .catch(() => setFailed(true)),
    [apply],
  );
  useEffect(() => {
    load();
  }, [load]);

  const { syncing, run: syncAll } = useBookingSync();
  // Leído desde aquí o desde el botón del menú lateral: la lista se actualiza igual.
  useEffect(() => {
    const on = (e: Event) => setState((e as CustomEvent<Channels>).detail);
    window.addEventListener(BOOKING_SYNCED, on);
    return () => window.removeEventListener(BOOKING_SYNCED, on);
  }, []);

  const linked = state?.calendars.filter((c) => c.importUrl).length ?? 0;

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="bk-cal">
      <CardHeader
        id="bk-cal"
        title="Calendarios de Booking.com"
        subtitle={
          state
            ? `${linked} de ${state.calendars.length} cabañas conectadas. El panel lee Booking cada 5 minutos.`
            : "Una conexión por cabaña, en los dos sentidos."
        }
        icon={<RefreshIcon size={16} />}
        accent="blue"
        actions={
          state &&
          linked > 0 && (
            <Button size="sm" icon={<RefreshIcon size={15} />} loading={syncing} disabled={offline} onClick={syncAll}>
              Leer Booking ahora
            </Button>
          )
        }
      />
      <ol className="ml-5 list-decimal text-[13px] leading-relaxed text-ink-muted">
        <li>
          <strong className="text-ink">Booking → panel:</strong> en Booking, <em>Sincronizar calendarios → Exportar</em>, copia el enlace de cada cabaña y
          pégalo aquí. Sus noches ocupan esa cabaña en el panel.
        </li>
        <li>
          <strong className="text-ink">Panel → Booking:</strong> copia el enlace del panel de cada cabaña y pégalo en Booking, en <em>Importar calendario</em>.
          Booking cierra las noches ocupadas aquí.
        </li>
      </ol>

      {failed ? (
        <ErrorState
          title="No pudimos cargar los calendarios"
          text="Revisa tu conexión e inténtalo de nuevo."
          onRetry={() => {
            setFailed(false);
            load();
          }}
        />
      ) : !state ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {state.calendars.map((c) => (
            <CalendarRow key={c.id} cal={c} stays={state.stays.filter((s) => s.calendarId === c.id)} offline={offline} onSaved={apply} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function CalendarRow({
  cal,
  stays,
  offline,
  onSaved,
}: {
  cal: ChannelCalendar;
  stays: ChannelStay[];
  offline: boolean;
  onSaved: (r: { status: number; data: unknown }) => string | null;
}) {
  const { data, toast, now } = useAdmin();
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(cal.importUrl ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const type = data.cabinTypes.find((t) => t.id === cal.cabinTypeId);
  const today = todayISO();
  const upcoming = stays.filter((s) => !s.removedAt && !s.echo && s.checkOut > today).sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  const save = async (value: string | null) => {
    setBusy(true);
    setError("");
    try {
      const r = await api.admin.channels.setUrl(cal.id, value);
      const err = onSaved(r);
      if (err) return setError(ERRORS[err] ?? "No se pudo guardar el enlace. Inténtalo de nuevo.");
      setEditing(false);
      const result = (r.data as Channels).results?.[0];
      if (value && result && !result.ok) toast(`${cal.label}: ${result.error ?? "no se pudo leer el enlace"}`, "error");
      else toast(value ? `${cal.label} conectada con Booking.` : `${cal.label} desconectada de Booking.`, "ok");
    } catch {
      setError("Sin conexión con el servidor. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const status = !cal.importUrl ? (
    <Badge>Sin enlace de Booking</Badge>
  ) : cal.lastStatus === "error" ? (
    <Badge tone="danger">No se pudo leer</Badge>
  ) : cal.lastStatus === "ok" ? (
    <Badge tone="success">Conectada</Badge>
  ) : (
    <Badge tone="info">Por leer</Badge>
  );

  return (
    <li className="flex flex-col gap-2.5 py-3.5" data-calendar={cal.label}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[14.5px] font-bold text-ink">{cal.label}</p>
          <p className="text-[12.5px] text-ink-muted">{type?.nombre ?? cal.cabinTypeId}</p>
        </div>
        <div className="flex items-center gap-2">
          {status}
          {!editing && (
            <Button
              size="sm"
              disabled={offline}
              onClick={() => {
                setUrl(cal.importUrl ?? "");
                setError("");
                setEditing(true);
              }}
            >
              {cal.importUrl ? "Cambiar enlace" : "Pegar enlace"}
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!url.trim()) return setError("Pega el enlace de exportación de Booking.");
            save(url.trim());
          }}
        >
          <Field label="Enlace de exportación de Booking" hint="Booking → Sincronizar calendarios → Exportar calendario de esta cabaña." error={error}>
            {(p) => (
              <input
                {...p}
                className={adminInput}
                inputMode="url"
                autoComplete="off"
                placeholder="https://ical.booking.com/v1/export?t=…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" size="sm" loading={busy} disabled={offline}>
              Guardar y leer
            </Button>
            <Button type="button" size="sm" disabled={busy} onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            {cal.importUrl && (
              <Button type="button" size="sm" variant="ghost" disabled={busy || offline} onClick={() => save(null)}>
                Quitar enlace
              </Button>
            )}
          </div>
        </form>
      )}

      <dl className="grid gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold text-ink">Booking → panel</dt>
        <dd className="text-ink-muted">
          {!cal.importUrl
            ? "Sin conectar: las reservas de Booking no bloquean esta cabaña."
            : cal.lastStatus === "error"
              ? cal.lastError
              : cal.lastSyncedAt
                ? `Leído ${timeAgo(cal.lastSyncedAt, now)} · ${upcoming.length ? plural(upcoming.length, "estadía próxima", "estadías próximas") : "sin estadías próximas"}`
                : "Aún no se ha leído."}
        </dd>
        <dt className="font-semibold text-ink">Panel → Booking</dt>
        <dd className="flex min-w-0 items-center gap-1.5 text-ink-muted">
          <span className="min-w-0 truncate">
            {cal.lastFetchedAt ? `Booking leyó el panel ${timeAgo(cal.lastFetchedAt, now)}` : "Booking aún no ha leído el panel"}
          </span>
          <CopyButton value={cal.exportUrl} label={`Copiar el enlace del panel de la ${cal.label}`} />
        </dd>
      </dl>

      {upcoming.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`Noches ocupadas en Booking, ${cal.label}`}>
          {upcoming.slice(0, 6).map((s) => (
            <li key={s.id} className="rounded-full bg-canvas px-2.5 py-0.5 text-[12px] font-semibold text-ink-muted">
              {`${fmtDate(s.checkIn)} → ${fmtDate(s.checkOut)}`}
            </li>
          ))}
          {upcoming.length > 6 && <li className="px-1 text-[12px] text-ink-muted">{`y ${upcoming.length - 6} más`}</li>}
        </ul>
      )}
    </li>
  );
}
