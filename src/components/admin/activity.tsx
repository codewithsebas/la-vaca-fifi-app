"use client";

// Registro de actividad (solo superadministradores): cada movimiento del equipo en el panel —quién, qué, cuándo y qué
// cambió— y los inicios de sesión. Los filtros van en la URL; la paginación la hace el servidor (api/admin/activity).
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertIcon, LoginIcon, LogoutIcon, PencilIcon, PlusIcon, RefreshIcon, ShieldIcon, TrashIcon, UserIcon } from "@/components/ui/icons";
import { Combobox } from "@/components/ui/combobox";
import { api } from "@/lib/client/api";
import { addDays, dateOf, fmtClock, fmtFullDate, isISO, plural, timeAgo } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/permissions";
import type { ActivityAction, ActivityEntry, ActivityPage } from "@/lib/types";
import { useAdmin, useParam } from "@/components/admin/context";
import { DateRangePicker } from "@/components/admin/date-picker";
import { Avatar, displayName } from "@/components/admin/account";
import { Paginator, PAGE_SIZES, type Paged } from "@/components/admin/paginator";
import { PREF, usePref, writePref } from "@/components/admin/prefs";
import { MODULES, paths } from "@/components/admin/routes";
import { Badge, Button, Callout, Card, EmptyState, ErrorState, PageHeader, Segmented, Skeleton, buttonClass, type Tone } from "@/components/admin/ui";
import { useSyncStatus } from "@/components/admin/sync";

type View = "changes" | "sessions";

/* ───────────── Qué es cada cosa ───────────── */

export const ENTITY_LABEL: Record<string, string> = {
  reservations: "Reserva",
  reservation_notes: "Nota de reserva",
  payments: "Pago",
  payment_proofs: "Comprobante de pago",
  blocks: "Bloqueo de cabaña",
  bathrooms: "Baño",
  bathroom_blocks: "Bloqueo de baño",
  cabin_types: "Cabaña",
  rate_seasons: "Temporada",
  client_profiles: "Cliente",
  client_entries: "Registro de cliente",
  site_settings: "Configuración del sitio",
  site_policies: "Política del sitio",
  site_photos: "Foto del sitio",
  site_services: "Servicio del sitio",
  channel_calendars: "Calendario de Booking",
  channel_stays: "Estadía de Booking",
  booking_inbox: "Reserva de Booking por correo (Ayenda)",
  email_outbox: "Correo",
  employees: "Cuenta del equipo",
  session: "Sesión",
};

const ACTION_FILTERS: { value: ActivityAction | "todas"; label: string }[] = [
  { value: "todas", label: "Todas las acciones" },
  { value: "insert", label: "Creó" },
  { value: "update", label: "Editó" },
  { value: "delete", label: "Eliminó" },
  { value: "sync", label: "Leyó Booking" },
];
const SESSION_FILTERS: { value: ActivityAction | "todas"; label: string }[] = [
  { value: "todas", label: "Todos" },
  { value: "login", label: "Ingresos" },
  { value: "login_failed", label: "Intentos fallidos" },
  { value: "logout", label: "Cierres de sesión" },
];

// Nombres de los campos que más se cambian (los demás se muestran como están en la base de datos).
const FIELD: Record<string, string> = {
  status: "Estado",
  check_in: "Llegada",
  check_out: "Salida",
  cabin_type_id: "Cabaña",
  unit: "Unidad",
  adults: "Adultos",
  children: "Niños",
  guest_full_name: "Huésped",
  guest_email: "Correo",
  guest_phone: "Teléfono",
  guest_doc_number: "Documento",
  paid_amount: "Pagado",
  quote: "Cotización",
  amount: "Valor",
  kind: "Tipo",
  nombre: "Nombre",
  name: "Nombre",
  title: "Título",
  activa: "Activa",
  active: "Activa",
  role: "Rol",
  email: "Correo",
  password: "Contraseña",
  precio_pareja: "Precio pareja",
  persona_adicional: "Persona adicional",
  from_date: "Desde",
  to_date: "Hasta",
  reason: "Motivo",
  notes: "Notas",
  text: "Texto",
  import_url: "Enlace de Booking",
  reservation_code: "Reserva",
  review_note: "Nota de revisión",
  deposit_pct: "Abono (%)",
};

// Verbo de cada movimiento, con los casos que el equipo reconoce: cancelar, desactivar, desconectar, completar…
function verbOf(e: ActivityEntry): { text: string; tone: Tone; icon: typeof PlusIcon } {
  const to = (k: string) => e.changes?.[k]?.[1];
  if (e.action === "login") return { text: "Inició sesión", tone: "success", icon: LoginIcon };
  if (e.action === "logout") return { text: "Cerró sesión", tone: "neutral", icon: LogoutIcon };
  if (e.action === "login_failed") return { text: "Intento de ingreso fallido", tone: "danger", icon: AlertIcon };
  if (e.action === "sync") return { text: "Leyó ahora", tone: "info", icon: RefreshIcon };
  if (e.action === "insert") return { text: "Creó", tone: "success", icon: PlusIcon };
  if (e.action === "delete") return { text: "Eliminó", tone: "danger", icon: TrashIcon };
  if (e.entity === "reservations" && to("status") === "cancelled") return { text: "Canceló", tone: "danger", icon: TrashIcon };
  if (e.entity === "channel_calendars" && e.changes && "import_url" in e.changes && to("import_url") === null)
    return { text: "Desconectó", tone: "warning", icon: TrashIcon };
  if (e.entity === "channel_stays" && to("reservation_code")) return { text: "Completó", tone: "success", icon: PencilIcon };
  if (to("activa") === false || to("active") === false) return { text: "Desactivó", tone: "warning", icon: PencilIcon };
  if (to("activa") === true || to("active") === true) return { text: "Activó", tone: "success", icon: PencilIcon };
  return { text: "Editó", tone: "info", icon: PencilIcon };
}

// A dónde lleva cada movimiento en el panel.
function linkOf(e: ActivityEntry): { href: string; label: string } | null {
  const r = e.refs ?? {};
  if (r.reservation) return { href: paths.reserva(r.reservation), label: `Reserva ${r.reservation}` };
  if (r.client) return { href: paths.cliente(r.client), label: "Ver cliente" };
  switch (e.entity) {
    case "cabin_types":
      return e.action !== "delete" && e.entityId ? { href: paths.cabana(e.entityId), label: "Ver cabaña" } : { href: paths.cabanas, label: "Cabañas" };
    case "rate_seasons":
      return { href: paths.tarifas(), label: "Tarifas" };
    case "blocks":
    case "bathrooms":
    case "bathroom_blocks":
      return { href: paths.bloqueos(), label: "Bloqueos y baños" };
    case "site_settings":
    case "site_policies":
    case "site_photos":
    case "site_services":
      return { href: paths.contenido(), label: "Contenido del sitio" };
    case "channel_calendars":
    case "channel_stays":
    case "booking_inbox":
      return { href: paths.booking, label: "Booking" };
    case "employees":
      return { href: paths.empleados, label: "Empleados" };
  }
  return null;
}

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "string") return v.length > 160 ? v.slice(0, 160) + "…" : v;
  const s = JSON.stringify(v);
  return s.length > 160 ? s.slice(0, 160) + "…" : s;
};

// Navegador y sistema, en pocas palabras ("Chrome · Windows").
function deviceOf(ua: string | null) {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Navegador";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} · ${os}` : browser;
}

/* ───────────── Página ───────────── */

export function ActivityView() {
  const { sync, today, now, onAuthError } = useAdmin();
  const offline = useSyncStatus(sync).network === "offline";
  const [view, setView] = useParam<View>("vista", "changes");
  const [actor, setActor] = useParam("usuario", "");
  const [action, setAction] = useParam("accion", "todas");
  const [entity, setEntity] = useParam("entidad", "todas");
  const [fromP, setFrom] = useParam("desde", "");
  const [toP, setTo] = useParam("hasta", "");
  const from = isISO(fromP) ? fromP : "";
  const to = isISO(toP) ? toP : "";
  const sizeKey = `${PREF.pageSize}:actividad`;
  const stored = Number(usePref(sizeKey, "50"));
  const size = PAGE_SIZES.includes(stored) ? stored : 50;
  const [page, setPage] = useState(1);
  const filters = `${view}|${actor}|${action}|${entity}|${from}|${to}|${size}`;
  const [seen, setSeen] = useState(filters);
  if (seen !== filters) {
    setSeen(filters);
    setPage(1);
  }
  const [res, setRes] = useState<{ key: string; data: ActivityPage | null; failed: boolean; missing?: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const key = `${filters}|${page}|${retry}`;

  useEffect(() => {
    let alive = true;
    api.admin
      .activity({
        view,
        actor: actor || undefined,
        action: action === "todas" ? undefined : action,
        entity: view === "changes" && entity !== "todas" ? entity : undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        size,
      })
      .then((r) => {
        if (!alive) return;
        if (r.status === 401 || r.status === 403) return onAuthError();
        if ((r.data as { error?: string } | null)?.error === "ACTIVITY_NOT_MIGRATED") return setRes({ key, data: null, failed: true, missing: true });
        if (r.status !== 200 || !r.data || !Array.isArray((r.data as ActivityPage).items)) throw 0;
        setRes({ key, data: r.data as ActivityPage, failed: false });
      })
      .catch(() => alive && setRes({ key, data: null, failed: true }));
    return () => {
      alive = false;
    };
  }, [key, view, actor, action, entity, from, to, page, size, onAuthError]);

  const loading = res?.key !== key;
  const data = res?.data ?? null;
  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const pager: Paged<ActivityEntry> = {
    rows: items,
    page,
    pages: Math.max(1, Math.ceil(total / size)),
    size,
    total,
    setPage: (n) => setPage(Math.max(1, Math.min(n, Math.max(1, Math.ceil(total / size))))),
    setSize: (n) => writePref(sizeKey, String(Math.min(200, Math.max(10, n)))),
  };

  // La página agrupada por día (hora de Colombia), del más reciente al más antiguo.
  const days = useMemo(() => {
    const out: { day: string; items: ActivityEntry[] }[] = [];
    for (const e of items) {
      const day = dateOf(e.occurredAt);
      const last = out[out.length - 1];
      if (last?.day === day) last.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [items]);
  const dayLabel = (d: string) => (d === today ? "Hoy" : d === addDays(today, -1) ? "Ayer" : fmtFullDate(d));
  const actors = data?.actors ?? [];
  const filtered = !!(actor || action !== "todas" || (view === "changes" && entity !== "todas") || from || to);

  return (
    <>
      <PageHeader
        title={MODULES.actividad.label}
        description="Cada movimiento del equipo en el panel, con quién lo hizo, cuándo y qué cambió, y los inicios de sesión."
      >
        <div className="mt-3">
          <Segmented
            label="Vista"
            value={view}
            onChange={(v) => {
              setView(v);
              setAction("todas");
            }}
            options={[
              { value: "changes", label: "Movimientos", icon: <PencilIcon size={13} /> },
              { value: "sessions", label: "Inicios de sesión", icon: <LoginIcon size={13} /> },
            ]}
          />
        </div>
      </PageHeader>

      {offline && <Callout tone="warning">Sin conexión no se puede consultar el registro de actividad.</Callout>}

      <div role="search" aria-label="Filtrar la actividad" className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-[230px]">
          <Combobox
            value={actor}
            onChange={setActor}
            placeholder="Todo el equipo"
            icon={<UserIcon size={15} className="text-ink-muted" />}
            options={[
              { value: "", label: "Todo el equipo" },
              ...actors.map((a) => ({
                value: a.id,
                label: a.name || a.email,
                description: a.role ? `${ROLE_LABEL[a.role]} · ${a.email}` : a.email,
                keywords: a.email,
              })),
            ]}
          />
        </div>
        <div className="w-full sm:w-[200px]">
          <Combobox value={action} onChange={setAction} searchable={false} options={view === "sessions" ? SESSION_FILTERS : ACTION_FILTERS} />
        </div>
        {view === "changes" && (
          <div className="w-full sm:w-[240px]">
            <Combobox
              value={entity}
              onChange={setEntity}
              options={[
                { value: "todas", label: "Todo lo afectado" },
                ...Object.entries(ENTITY_LABEL)
                  .filter(([k]) => k !== "session")
                  .map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>
        )}
        <div className="w-full sm:w-[280px]">
          <DateRangePicker
            mode="days"
            from={from || null}
            to={to || null}
            max={today}
            placeholder="Cualquier fecha"
            onChange={(f, t) => {
              setFrom(f ?? "");
              setTo(t ?? "");
            }}
          />
        </div>
        {filtered && (
          <Button
            variant="ghost"
            onClick={() => {
              setActor("");
              setAction("todas");
              setEntity("todas");
              setFrom("");
              setTo("");
            }}
          >
            Quitar filtros
          </Button>
        )}
      </div>

      {res?.failed && !loading ? (
        <Card className="p-5">
          {res.missing ? (
            <ErrorState
              title="El registro de actividad aún no está en esta base de datos"
              text="Falta aplicar la migración 20261119010000_registro_de_actividad. Cuando se aplique, aparecerá aquí lo que haga el equipo desde ese momento."
              onRetry={() => setRetry((n) => n + 1)}
            />
          ) : (
            <ErrorState title="No pudimos cargar la actividad" text="Revisa tu conexión e inténtalo de nuevo." onRetry={() => setRetry((n) => n + 1)} />
          )}
        </Card>
      ) : loading && !data ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : days.length ? (
        <div className={`flex flex-col gap-4 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          {days.map(({ day, items }) => (
            <Card key={day} aria-labelledby={`ac-${day}`} className="overflow-hidden">
              <h2 id={`ac-${day}`} className="border-b border-line bg-canvas/70 px-4 py-2 text-[12.5px] font-bold text-ink-muted">
                {dayLabel(day)}{" "}
                <span className="font-medium">
                  · {view === "sessions" ? plural(items.length, "registro", "registros") : plural(items.length, "movimiento", "movimientos")}
                </span>
              </h2>
              <ul className="divide-y divide-line">
                {items.map((e) => (
                  <EntryRow key={e.id} e={e} now={now} />
                ))}
              </ul>
            </Card>
          ))}
          <Paginator p={pager} noun={view === "sessions" ? "registros" : "movimientos"} className="rounded-[18px] bg-paper px-4 py-3 ring-1 ring-line" />
        </div>
      ) : (
        <Card className="p-5">
          <EmptyState
            icon={<ShieldIcon size={18} />}
            title={
              filtered
                ? "Nada coincide con los filtros"
                : view === "sessions"
                  ? "Aún no hay inicios de sesión registrados"
                  : "Aún no hay movimientos registrados"
            }
            text={filtered ? "Prueba con otro usuario, otra acción u otras fechas." : "Lo que haga el equipo en el panel aparecerá aquí."}
          />
        </Card>
      )}
    </>
  );
}

/* ───────────── Cada movimiento ───────────── */

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function fieldsLabel(n: number, action: ActivityAction) {
  const one = n === 1;
  if (action === "update") return `${n} ${one ? "campo cambiado" : "campos cambiados"}`;
  if (action === "insert") return `${n} ${one ? "campo guardado" : "campos guardados"}`;
  return `${n} ${one ? "campo que tenía" : "campos que tenía"}`;
}

function EntryRow({ e, now }: { e: ActivityEntry; now: number }) {
  const verb = verbOf(e);
  const link = linkOf(e);
  const who = e.actor.id ? { id: e.actor.id, name: e.actor.name ?? "", email: e.actor.email ?? "" } : null;
  const changes = Object.entries(e.changes ?? {});
  // Algo hecho sin conexión que llegó después: se muestran las dos horas.
  const late = Date.parse(e.receivedAt) - Date.parse(e.occurredAt) > 60_000;
  const isSession = e.entity === "session";
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      {who ? (
        <Avatar user={who} size={36} className="mt-0.5" />
      ) : (
        <span aria-hidden="true" className="mt-0.5 grid size-9 flex-none place-items-center rounded-full bg-error-soft text-error">
          <AlertIcon size={16} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[14px] text-ink">
          <span className="font-semibold">{who ? displayName(who) : isSession ? (e.label ?? "Correo desconocido") : "Sistema"}</span>{" "}
          {e.actor.role && <span className="text-[12px] text-ink-muted">({ROLE_LABEL[e.actor.role]})</span>}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13.5px] text-ink">
          <Badge tone={verb.tone} icon={<verb.icon size={11} />}>
            {verb.text}
          </Badge>
          {!isSession && (
            <>
              <span className="font-medium">{lowerFirst(ENTITY_LABEL[e.entity] ?? e.entity)}</span>
              {e.label && <span className="min-w-0 truncate text-ink-muted">· {e.label}</span>}
            </>
          )}
        </p>
        <p className="mt-1 text-[12px] text-ink-subtle">
          <time dateTime={e.occurredAt}>{fmtClock(e.occurredAt)}</time> · {timeAgo(e.occurredAt, now)}
          {late && <> · sin conexión, llegó {timeAgo(e.receivedAt, now)}</>}
          {isSession && (deviceOf(e.userAgent) || e.ip) && <> · {[deviceOf(e.userAgent), e.ip].filter(Boolean).join(" · ")}</>}
        </p>
        {changes.length > 0 && (
          <details className="group mt-2">
            <summary className="cursor-pointer text-[12.5px] font-medium text-ink-muted select-none hover:text-ink">
              {fieldsLabel(changes.length, e.action)}
            </summary>
            <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-[14px] bg-canvas/70 p-3 text-[12.5px] sm:grid-cols-[minmax(120px,max-content)_1fr]">
              {changes.map(([k, [before, after]]) => (
                <div key={k} className="contents">
                  <dt className="font-medium text-ink-muted">{FIELD[k] ?? k}</dt>
                  <dd className="min-w-0 break-words text-ink">
                    {e.action === "update" ? (
                      <>
                        <span className="text-ink-muted line-through decoration-ink-subtle">{show(before)}</span> → <span>{show(after)}</span>
                      </>
                    ) : (
                      show(e.action === "delete" ? before : after)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </div>
      {link && (
        <Link href={link.href} className={`${buttonClass("secondary", "sm")} flex-none`}>
          {link.label}
        </Link>
      )}
    </li>
  );
}
