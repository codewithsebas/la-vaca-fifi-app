"use client";

// Inicio del panel: saludo con el resumen del día, indicadores principales, movimiento de hoy (lista + detalle), pagos
// por completar; a la derecha, el mes, la agenda de hoy y las próximas llegadas. Las cifras de dinero viven en Finanzas.
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  ArrowRightIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
  GiftIcon,
  HomeIcon,
  LoginIcon,
  LogoutIcon,
  PawIcon,
  PlusIcon,
  RefreshIcon,
  WalletIcon,
  WhatsAppIcon,
} from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/status-pill";
import { balanceDue, pendingOf } from "@/lib/admin-metrics";
import { ACTIVE_STATUSES } from "@/lib/booking";
import { MONTHS, addDays, cop, countdown, fmtDate, fmtFullDate, nightsBetween, parseISO, plural, waTo } from "@/lib/format";
import type { Reservation } from "@/lib/types";
import { useAdmin } from "@/components/admin/context";
import { useLabelTip, useTip } from "@/components/ui/floating";
import { NewReservationDialog } from "@/components/admin/new-reservation";
import { paths } from "@/components/admin/routes";
import { ARRIVING, DEPARTING, rowOf } from "@/components/admin/shared";
import {
  ACCENT,
  Badge,
  Button,
  CountBadge,
  Deco,
  EmptyState,
  IconButton,
  ModalPresence,
  PageHeader,
  Segmented,
  buttonClass,
  iconButtonClass,
  type Accent,
} from "@/components/admin/ui";

type Data = ReturnType<typeof useAdmin>["data"];

function occupancy(d: Data, date: string) {
  let busy = 0;
  let total = 0;
  for (const c of d.cabinTypes) {
    if (!c.activa && !d.reservations.some((r) => r.cabinTypeId === c.id)) continue;
    total += c.units;
    const set = new Set<number>();
    d.reservations.forEach((r) => r.cabinTypeId === c.id && ACTIVE_STATUSES.includes(r.status) && r.checkIn <= date && date < r.checkOut && set.add(r.unit));
    d.blocks.forEach((b) => b.cabinTypeId === c.id && b.from <= date && date <= b.to && set.add(b.unit));
    busy += set.size;
  }
  return { busy, total, pc: total ? Math.round((busy / total) * 100) : 0 };
}

const greeting = (now: number) => {
  const h = Number(new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "numeric", hourCycle: "h23" }).format(now));
  return h >= 5 && h < 12 ? "Buenos días" : h >= 12 && h < 19 ? "Buenas tardes" : "Buenas noches";
};

// "16:05" en la hora de Colombia.
const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

// "a, b y c"
const listOf = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}` : (xs[0] ?? ""));

// Llegadas de la semana que se muestran en la lista; el resto se ve en el calendario.
const UPCOMING_MAX = 6;

export function Dashboard() {
  const { data, today, now, cabinLabel, reload } = useAdmin();
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const calTip = useLabelTip("Abrir el calendario");
  const R = data.reservations;
  const arr = R.filter((r) => r.checkIn === today && ARRIVING.includes(r.status));
  const dep = R.filter((r) => r.checkOut === today && DEPARTING.includes(r.status));
  const upcoming = R.filter((r) => r.checkIn > today && r.checkIn <= addDays(today, 7) && ARRIVING.includes(r.status)).sort((a, b) =>
    a.checkIn < b.checkIn ? -1 : 1,
  );
  // Pagos por completar: abonos de fechas retenidas (el plazo más cercano primero) y saldos de huéspedes en estadía.
  const deadlineOf = (r: Reservation) => (r.status === "pending_deposit" ? r.depositDueAt : "");
  const pend = R.filter((r) => r.status === "pending_deposit" || balanceDue(r)).sort((a, b) => (deadlineOf(a) < deadlineOf(b) ? -1 : 1));

  const todo = [
    arr.length ? plural(arr.length, "llegada por recibir", "llegadas por recibir") : "",
    dep.length ? plural(dep.length, "salida por entregar", "salidas por entregar") : "",
    pend.length ? plural(pend.length, "pago por completar", "pagos por completar") : "",
  ].filter(Boolean);

  const refresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-x-8 gap-y-8 xl:grid-cols-[minmax(0,1fr)_336px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-7">
          <PageHeader
            title={greeting(now)}
            description={`${fmtFullDate(today)}. ${todo.length ? `Hoy tienes ${listOf(todo)}.` : "Hoy no hay llegadas, salidas ni pagos pendientes."}`}
            actions={
              <div className="flex gap-2 xl:hidden">
                <Link href={paths.calendario()} className={buttonClass()}>
                  <CalendarIcon size={16} />
                  Calendario
                </Link>
                <Button variant="primary" icon={<PlusIcon size={14} />} onClick={() => setCreating(true)}>
                  Nueva reserva
                </Button>
              </div>
            }
          />
          <Highlights arr={arr} dep={dep} pend={pend} />
          <TodayBoard arr={arr} dep={dep} />
          <PendingList pend={pend} />
        </div>

        <aside aria-label="Mes, agenda de hoy y próximas llegadas" className="flex min-w-0 flex-col gap-6">
          <MiniCalendar />
          <div className="flex items-center gap-2">
            <Button variant="primary" size="lg" className="flex-1" icon={<PlusIcon size={15} />} onClick={() => setCreating(true)}>
              Nueva reserva
            </Button>
            <IconButton label="Actualizar los datos" variant="secondary" size="lg" onClick={refresh} disabled={refreshing}>
              <RefreshIcon size={18} className={refreshing ? "animate-spin-fast" : ""} />
            </IconButton>
            <Link href={paths.calendario()} aria-label="Abrir el calendario" {...calTip} className={iconButtonClass("secondary", "lg")}>
              <CalendarIcon size={18} />
            </Link>
          </div>
          <Agenda arr={arr} dep={dep} pend={pend} />
          <ListSection
            id="d-up"
            title="Próximas llegadas"
            count={upcoming.length}
            empty="No hay llegadas en los próximos 7 días."
            icon={<CalendarIcon size={18} />}
            footer={
              upcoming.length > UPCOMING_MAX && (
                <Link href={paths.calendario()} className="self-start text-[13px] font-semibold text-ink underline-offset-2 hover:underline">
                  {`Y ${upcoming.length - UPCOMING_MAX} más: ver el calendario`}
                </Link>
              )
            }
          >
            {upcoming.slice(0, UPCOMING_MAX).map((r) => {
              const x = rowOf(r, cabinLabel);
              return (
                <Row
                  key={r.code}
                  href={paths.reserva(r.code)}
                  icon={<CalendarIcon size={17} />}
                  accent="blue"
                  title={r.guest.fullName}
                  meta={`${x.cabin} · ${x.nights}`}
                  right={<Chip>{r.checkIn === addDays(today, 1) ? "Mañana" : fmtDate(r.checkIn)}</Chip>}
                />
              );
            })}
          </ListSection>
        </aside>
      </div>

      <ModalPresence>{creating && <NewReservationDialog draft={{}} onClose={() => setCreating(false)} />}</ModalPresence>
    </>
  );
}

/* ───────────── Piezas ───────────── */

// Etiqueta blanca de hora o fecha al final de una fila.
function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`flex-none rounded-full bg-paper px-2.5 py-1 text-[12px] font-bold text-ink tabular-nums ${className}`}>{children}</span>;
}

// Cifra pequeña con su rótulo; la destacada lleva la línea debajo.
function Stat({ value, label, strong = false }: { value: ReactNode; label: string; strong?: boolean }) {
  return (
    <div className={`min-w-0 pb-1.5 ${strong ? "border-b-2 border-ink" : "border-b-2 border-transparent"}`}>
      <p className="text-[16px] leading-tight font-bold text-ink tabular-nums">{value}</p>
      <p className="mt-1 line-clamp-2 text-[10.5px] leading-tight font-semibold tracking-[.05em] text-ink/65 uppercase">{label}</p>
    </div>
  );
}

// Tarjeta pastel de los indicadores principales.
function Highlight({
  id,
  accent,
  title,
  action,
  className = "",
  children,
}: {
  id: string;
  accent: Accent;
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={`relative isolate flex min-h-[200px] min-w-0 flex-col gap-4 overflow-hidden rounded-[24px] p-5 ${ACCENT[accent].bg} ${className}`}
    >
      <Deco accent={accent} className="-top-7 -right-7 size-[140px] rotate-[16deg]" />
      <div className="flex items-start justify-between gap-3">
        <h2 id={id} className="text-[17px] leading-tight font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Highlights({ arr, dep, pend }: { arr: Reservation[]; dep: Reservation[]; pend: Reservation[] }) {
  const { data, today } = useAdmin();
  const tip = useTip();
  const tonight = occupancy(data, today);
  const inHouse = data.reservations.filter((r) => r.status === "checked_in").length;

  // Llegadas por día en las próximas dos semanas (barras); los días sin llegadas, punteados.
  const next = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(today, i);
    return { day, n: data.reservations.filter((r) => r.checkIn === day && ARRIVING.concat(["checked_in"]).includes(r.status)).length };
  });
  const maxN = Math.max(1, ...next.map((d) => d.n));

  // Ocupación de dos semanas atrás a dos semanas adelante (línea), con hoy marcado.
  const span = Array.from({ length: 29 }, (_, i) => ({ day: addDays(today, i - 14), ...occupancy(data, addDays(today, i - 14)) }));
  const week = span.slice(14, 21);
  const avg7 = Math.round(week.reduce((s, d) => s + d.pc, 0) / week.length);
  const max30 = Math.max(...span.slice(14).map((d) => d.pc));

  const deposits = pend.filter((r) => r.status === "pending_deposit");
  const balances = pend.filter((r) => r.status !== "pending_deposit");
  const proofs = data.proofs.filter((p) => p.status === "pending").length;
  const toCollect = data.reservations.reduce((s, r) => s + pendingOf(r).total, 0);

  // Próximos 7 días: llegadas, salidas, noches libres y baños fuera de servicio hoy.
  const nextWeek = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1));
  const weekArr = data.reservations.filter((r) => nextWeek.includes(r.checkIn) && ARRIVING.includes(r.status)).length;
  const weekDep = data.reservations.filter((r) => nextWeek.includes(r.checkOut) && DEPARTING.includes(r.status)).length;
  const freeNights = nextWeek.reduce((n, d) => {
    const o = occupancy(data, d);
    return n + Math.max(0, o.total - o.busy);
  }, 0);
  const bathAlerts = (data.bathrooms ?? []).filter(
    (b) => b.status !== "available" || (data.bathroomBlocks ?? []).some((k) => k.bathroomId === b.id && k.from <= today && today <= k.to),
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Highlight id="d-hl-today" accent="yellow" title="Hoy:">
          <div className="grid grid-cols-3 gap-3 pr-10">
            <Stat value={arr.length} label="Llegan" strong />
            <Stat value={dep.length} label="Salen" />
            <Stat value={inHouse} label="En estadía" />
          </div>
          <div className="mt-auto">
            <ol aria-label="Llegadas de los próximos 14 días" className="flex h-[88px] items-end gap-[5px]">
              {next.map((d, i) => (
                <li
                  key={d.day}
                  aria-label={`${fmtDate(d.day)}: ${plural(d.n, "llegada", "llegadas")}`}
                  {...tip(() => (
                    <span>
                      <strong>{i === 0 ? "Hoy" : fmtDate(d.day)}</strong> · {plural(d.n, "llegada", "llegadas")}
                    </span>
                  ))}
                  className="flex h-full flex-1 items-end justify-center"
                >
                  <span
                    aria-hidden="true"
                    className={`block w-full max-w-[11px] rounded-full ${d.n ? "bg-ink" : "border-[1.5px] border-dashed border-ink/45"}`}
                    style={{ height: d.n ? `${36 + (54 * d.n) / maxN}%` : "36%" }}
                  />
                </li>
              ))}
            </ol>
            <div aria-hidden="true" className="mt-2 flex justify-between text-[11px] font-semibold text-ink/70">
              <span>Hoy</span>
              <span>{fmtDate(next[next.length - 1].day)}</span>
            </div>
          </div>
        </Highlight>

        <Highlight id="d-hl-occ" accent="pink" title="Ocupación:">
          <div className="grid grid-cols-3 gap-3 pr-10 sm:max-w-[360px]">
            <Stat value={`${tonight.pc} %`} label={`Esta noche (${tonight.busy} de ${tonight.total})`} strong />
            <Stat value={`${avg7} %`} label="Promedio 7 días" />
            <Stat value={`${max30} %`} label="Máximo 15 días" />
          </div>
          <OccupancyLine span={span} />
        </Highlight>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Highlight
          id="d-hl-pay"
          accent="green"
          title="Por cobrar:"
          action={
            <Link
              href={paths.pagos({ vista: "por-cobrar" })}
              className="rounded-full bg-paper/70 px-3 py-1 text-[12.5px] font-semibold text-ink transition-colors hover:bg-paper"
            >
              Ver pagos
            </Link>
          }
          className="min-h-[164px]"
        >
          <p className="text-[clamp(1.6rem,2.6vw,2.1rem)] leading-none font-bold tracking-[-0.03em] text-ink tabular-nums">{cop(toCollect)}</p>
          <div className="mt-auto grid grid-cols-3 gap-3 sm:max-w-[420px]">
            <Stat value={deposits.length} label="Abonos" />
            <Stat value={balances.length} label="Saldos" />
            <Stat value={proofs} label="Comprobantes" />
          </div>
        </Highlight>

        <Highlight
          id="d-hl-week"
          accent="blue"
          title="Próximos 7 días:"
          action={
            <Link
              href={paths.calendario()}
              className="rounded-full bg-paper/70 px-3 py-1 text-[12.5px] font-semibold text-ink transition-colors hover:bg-paper"
            >
              Calendario
            </Link>
          }
          className="min-h-[164px]"
        >
          <p className="text-[clamp(1.6rem,2.6vw,2.1rem)] leading-none font-bold tracking-[-0.03em] text-ink tabular-nums">
            {plural(weekArr, "llegada", "llegadas")}
          </p>
          <div className="mt-auto grid grid-cols-3 gap-3 pr-8">
            <Stat value={weekDep} label="Salidas" />
            <Stat value={freeNights} label="Noches libres" />
            <Stat value={bathAlerts} label="Baños con aviso" />
          </div>
        </Highlight>
      </div>
    </div>
  );
}

// Curva suave (Catmull-Rom → Bézier) por los puntos.
function smooth(pts: [number, number][]) {
  let d = `M${pts[0][0]},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const [p1, p2] = [pts[i], pts[i + 1]];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1].toFixed(1)}`;
  }
  return d;
}

// Ocupación diaria (la línea se aclara hacia adelante) con la marca de hoy, como en un monitor.
function OccupancyLine({ span }: { span: { day: string; pc: number; busy: number; total: number }[] }) {
  const tip = useTip();
  const mid = Math.floor(span.length / 2);
  const W = 280;
  const step = W / (span.length - 1);
  const y = (pc: number) => 88 - pc * 0.76;
  const pts = span.map((d, i) => [i * step, y(d.pc)] as [number, number]);
  const ticks = [0, 7, mid, mid + 7, span.length - 1];
  return (
    <figure className="mt-auto" aria-label={`Ocupación diaria: hoy ${span[mid].pc} %`}>
      <div className="relative h-[104px]">
        <svg viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 size-full overflow-visible">
          <path d={smooth(pts.slice(0, mid + 1))} fill="none" stroke="var(--color-ink)" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
          <path d={smooth(pts.slice(mid))} fill="none" stroke="var(--color-ink)" strokeOpacity={0.4} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </svg>
        {/* Marca de hoy: punto y línea punteada hasta el eje. */}
        <span
          aria-hidden="true"
          className="absolute bottom-0 w-0 border-l-[1.5px] border-dashed border-ink/55"
          style={{ left: "50%", top: `${y(span[mid].pc)}%` }}
        />
        <span
          aria-hidden="true"
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-[3px] ring-pink"
          style={{ left: "50%", top: `${y(span[mid].pc)}%` }}
        />
        {/* Zonas invisibles por día para el detalle al pasar el mouse. */}
        <ol aria-hidden="true" className="absolute inset-0 flex">
          {span.map((d) => (
            <li
              key={d.day}
              className="h-full flex-1"
              {...tip(() => (
                <span>
                  <strong>{fmtDate(d.day)}</strong> · {d.pc} % · {d.busy} de {d.total} cabañas
                </span>
              ))}
            />
          ))}
        </ol>
      </div>
      <div aria-hidden="true" className="mt-2 grid grid-cols-5 text-[11px] font-semibold text-ink/70">
        {ticks.map((t, i) => (
          <span key={t} className={`${i === 0 ? "text-left" : i === ticks.length - 1 ? "text-right" : "text-center"} ${t === mid ? "font-bold text-ink" : ""}`}>
            {t === mid ? "Hoy" : fmtDate(span[t].day)}
          </span>
        ))}
      </div>
    </figure>
  );
}

/* ───────────── Listas ───────────── */

function ListSection({
  id,
  title,
  count,
  empty,
  icon,
  actions,
  footer,
  children,
}: {
  id: string;
  title: string;
  count: number;
  empty: string;
  icon: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id={id} className="flex items-center gap-2 text-[18px] leading-tight font-semibold tracking-[-0.015em] text-ink">
          {title} <CountBadge n={count} />
        </h2>
        {actions}
      </div>
      {count ? <ul className="flex flex-col gap-2">{children}</ul> : <EmptyState compact icon={icon} title={empty} />}
      {footer}
    </section>
  );
}

// Fila de las listas del inicio: icono en círculo de color, nombre, detalle y una etiqueta al final.
function Row({
  href,
  onClick,
  selected = false,
  icon,
  accent,
  title,
  meta,
  right,
}: {
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  icon: ReactNode;
  accent: Accent;
  title: string;
  meta: string;
  right?: ReactNode;
}) {
  const cls = `group flex w-full min-w-0 items-center gap-3 rounded-[18px] py-2.5 pr-3 pl-2.5 text-left transition-colors duration-150 ${selected ? "bg-pink" : "bg-panel hover:bg-line/80"}`;
  const body = (
    <>
      <span aria-hidden="true" className={`grid size-10 flex-none place-items-center rounded-full text-ink ${selected ? "bg-paper/70" : ACCENT[accent].bg}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] leading-snug font-semibold text-ink">{title}</span>
        <span className={`block truncate text-[12.5px] leading-snug ${selected ? "text-ink/75" : "text-ink-muted"}`}>{meta}</span>
      </span>
      {right}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className={cls}>
          {body}
          <ChevronRightIcon size={15} className="flex-none text-ink-subtle transition-transform duration-150 motion-safe:group-hover:translate-x-0.5" />
        </Link>
      ) : (
        <button type="button" onClick={onClick} aria-pressed={selected} className={cls}>
          {body}
        </button>
      )}
    </li>
  );
}

type Move = { r: Reservation; kind: "llegada" | "salida" | "estadia"; time: string };
type MoveFilter = "todo" | "llegada" | "salida" | "estadia";
const MOVE_META: Record<Move["kind"], { label: string; accent: Accent; icon: ReactNode }> = {
  llegada: { label: "Llegada", accent: "pink", icon: <LoginIcon size={17} /> },
  salida: { label: "Salida", accent: "blue", icon: <LogoutIcon size={17} /> },
  estadia: { label: "En estadía", accent: "green", icon: <HomeIcon size={17} /> },
};

// Quién llega, quién sale y quién está alojado hoy, con el detalle de la reserva elegida al lado.
function TodayBoard({ arr, dep }: { arr: Reservation[]; dep: Reservation[] }) {
  const { data, today, cabinLabel } = useAdmin();
  const s = data.site.settings;
  const [filter, setFilter] = useState<MoveFilter>("todo");
  const [picked, setPicked] = useState<string | null>(null);
  const staying = data.reservations.filter((r) => r.status === "checked_in" && r.checkIn < today && r.checkOut > today);
  const moves: Move[] = [
    ...arr.map((r) => ({ r, kind: "llegada" as const, time: r.estimatedArrival || s.checkInStart })),
    ...dep.map((r) => ({ r, kind: "salida" as const, time: s.checkOutTime })),
    ...staying.map((r) => ({ r, kind: "estadia" as const, time: "" })),
  ].sort((a, b) => ((a.time || "99") < (b.time || "99") ? -1 : 1));
  const list = moves.filter((m) => filter === "todo" || m.kind === filter);
  const sel = list.find((m) => `${m.kind}:${m.r.code}` === picked) ?? list[0];
  const count = (k: Move["kind"]) => moves.filter((m) => m.kind === k).length;

  return (
    <section aria-labelledby="d-moves" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id="d-moves" className="flex items-center gap-2 text-[18px] leading-tight font-semibold tracking-[-0.015em] text-ink">
          Movimiento de hoy <CountBadge n={moves.length} />
        </h2>
        <Segmented
          label="Mostrar"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "todo", label: "Todo" },
            { value: "llegada", label: "Llegadas", count: count("llegada") },
            { value: "salida", label: "Salidas", count: count("salida") },
            { value: "estadia", label: "En estadía", count: count("estadia") },
          ]}
        />
      </div>
      {list.length ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)]">
          <ul className="flex min-w-0 flex-col gap-2">
            {list.map((m) => {
              const meta = MOVE_META[m.kind];
              return (
                <Row
                  key={`${m.kind}:${m.r.code}`}
                  onClick={() => setPicked(`${m.kind}:${m.r.code}`)}
                  selected={sel === m}
                  icon={meta.icon}
                  accent={meta.accent}
                  title={m.r.guest.fullName}
                  meta={`${meta.label} · ${cabinLabel(m.r.cabinTypeId, m.r.unit)}`}
                  right={<Chip>{m.time || `Sale ${fmtDate(m.r.checkOut)}`}</Chip>}
                />
              );
            })}
          </ul>
          {sel && <MoveDetail m={sel} />}
        </div>
      ) : (
        <EmptyState
          compact
          icon={<LoginIcon size={18} />}
          title={filter === "todo" ? "Hoy no hay llegadas, salidas ni huéspedes en estadía." : "Nada en este filtro hoy."}
        />
      )}
    </section>
  );
}

// Detalle de la reserva elegida en «Movimiento de hoy».
function MoveDetail({ m }: { m: Move }) {
  const { cabinLabel } = useAdmin();
  const r = m.r;
  const due = pendingOf(r).total;
  const people = r.adults + r.children;
  const rows: { k: string; v: ReactNode }[] = [
    { k: "Estadía", v: `${fmtDate(r.checkIn)} → ${fmtDate(r.checkOut)} · ${plural(nightsBetween(r.checkIn, r.checkOut), "noche", "noches")}` },
    { k: "Huéspedes", v: `${plural(people, "persona", "personas")}${r.children ? ` (${plural(r.children, "niño", "niños")})` : ""}` },
    { k: "Llegada", v: r.estimatedArrival ? `Hacia las ${r.estimatedArrival}` : "Sin hora estimada" },
    { k: "Pagos", v: `${cop(r.paid)} de ${cop(r.quote.total)}${due ? ` · faltan ${cop(due)}` : " · al día"}` },
  ];
  if (r.specialRequests) rows.push({ k: "Solicitudes", v: r.specialRequests });
  return (
    <article aria-labelledby="d-move-title" className="flex min-w-0 flex-col gap-4 rounded-[22px] bg-pink p-5 motion-safe:animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="d-move-title" className="truncate text-[16px] font-bold text-ink">
            <Link href={paths.reserva(r.code)} className="underline decoration-ink/40 underline-offset-[3px] hover:decoration-ink">
              {r.guest.fullName}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-[12.5px] font-medium text-ink/75">{cabinLabel(r.cabinTypeId, r.unit)}</p>
        </div>
        <span className="flex-none rounded-full bg-paper px-2.5 py-1 text-[11.5px] font-bold tracking-[.04em] text-ink tabular-nums">{r.code}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <StatusPill status={r.status} size="sm" className="ring-1 ring-ink/10" />
        {r.pet?.hasPet && (
          <span className="inline-flex items-center gap-1 rounded-full bg-pink-deep/60 px-2.5 py-0.5 text-[12px] font-semibold text-ink">
            <PawIcon size={13} /> Mascota
          </span>
        )}
        {r.decoration?.requested && (
          <span className="inline-flex items-center gap-1 rounded-full bg-pink-deep/60 px-2.5 py-0.5 text-[12px] font-semibold text-ink">
            <GiftIcon size={13} /> Decoración
          </span>
        )}
        {due > 0 && <span className="rounded-full bg-pink-deep/60 px-2.5 py-0.5 text-[12px] font-semibold text-ink">{`Saldo ${cop(due)}`}</span>}
      </div>
      <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[13px]">
        {rows.map((x) => (
          <div key={x.k} className="contents">
            <dt className="text-ink/65">{x.k}</dt>
            <dd className="font-medium break-words text-ink">{x.v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto flex flex-wrap gap-2">
        <Link href={paths.reserva(r.code)} className={buttonClass("primary", "sm")}>
          Ver la reserva
          <ArrowRightIcon size={14} />
        </Link>
        {r.guest.phone && (
          <a href={waTo(r.guest.phone)} target="_blank" rel="noopener" className={buttonClass("ghost", "sm", "bg-paper/60 hover:not-disabled:bg-paper")}>
            <WhatsAppIcon size={15} />
            WhatsApp
          </a>
        )}
      </div>
    </article>
  );
}

function PendingList({ pend }: { pend: Reservation[] }) {
  const { data, now, cabinLabel } = useAdmin();
  const proofFor = (code: string) => data.proofs.find((p) => p.reservationCode === code && p.status === "pending");
  return (
    <ListSection
      id="d-pend"
      title="Pagos por completar"
      count={pend.length}
      empty="No hay abonos ni saldos pendientes."
      icon={<WalletIcon size={18} />}
      actions={
        <Link
          href={paths.pagos({ vista: "por-cobrar" })}
          className="text-[13px] font-semibold text-ink-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Ver todos
        </Link>
      }
    >
      {pend.slice(0, 6).map((r) => {
        const x = rowOf(r, cabinLabel);
        const bd = balanceDue(r);
        const deadline = r.status === "pending_deposit" ? r.depositDueAt : "";
        const minutes = deadline ? (Date.parse(deadline) - now) / 6e4 : 0;
        const proof = proofFor(r.code);
        return (
          <Row
            key={r.code}
            href={paths.reserva(r.code)}
            icon={proof ? <FileTextIcon size={17} /> : <WalletIcon size={17} />}
            accent={bd ? "green" : "yellow"}
            title={r.guest.fullName}
            meta={bd ? `Saldo ${cop(bd.amount)} · en estadía` : `Abono ${x.deposit} · llega ${fmtDate(r.checkIn)}`}
            right={
              proof ? (
                <Badge tone="info" icon={<FileTextIcon size={12} />}>
                  Comprobante
                </Badge>
              ) : bd ? (
                <Chip>{cop(bd.amount)}</Chip>
              ) : (
                <span
                  className={`inline-flex flex-none items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold tabular-nums ${minutes < 10 ? "bg-error-soft text-error" : "bg-paper text-ink"}`}
                >
                  <ClockIcon size={13} />
                  <span className="sr-only">La retención vence en </span>
                  {countdown(deadline)}
                </span>
              )
            }
          />
        );
      })}
    </ListSection>
  );
}

/* ───────────── Mes ───────────── */

const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

// Semana ISO (lunes a domingo) de una fecha AAAA-MM-DD.
function isoWeek(iso: string) {
  const d = parseISO(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 864e5 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

// Mes con las llegadas marcadas: un día abre el calendario en ese día.
function MiniCalendar() {
  const { data, today } = useAdmin();
  const [month, setMonth] = useState(today.slice(0, 7) + "-01");
  const todayTip = useLabelTip("Volver al mes actual");
  const first = parseISO(month);
  const lead = (first.getUTCDay() + 6) % 7;
  const start = addDays(month, -lead);
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  const shift = (n: number) => {
    const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + n, 1));
    setMonth(d.toISOString().slice(0, 10));
  };
  const arrivals = new Map<string, number>();
  data.reservations.forEach(
    (r) => ARRIVING.concat(["checked_in", "completed"]).includes(r.status) && arrivals.set(r.checkIn, (arrivals.get(r.checkIn) ?? 0) + 1),
  );
  const label = `${MONTHS[first.getUTCMonth()]} ${first.getUTCFullYear()}`;

  return (
    <section aria-label={`Calendario de ${label}`} className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <IconButton label="Mes anterior" size="sm" onClick={() => shift(-1)}>
          <ChevronLeftIcon size={18} />
        </IconButton>
        <button
          type="button"
          onClick={() => setMonth(today.slice(0, 7) + "-01")}
          {...todayTip}
          className="rounded-full bg-pink px-3.5 py-1 text-[13px] font-semibold text-ink first-letter:uppercase"
        >
          {label}
        </button>
        <IconButton label="Mes siguiente" size="sm" onClick={() => shift(1)}>
          <ChevronRightIcon size={18} />
        </IconButton>
      </div>
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_34px] gap-y-1 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} aria-hidden="true" className="mx-auto mb-1 rounded-full bg-panel px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted">
            {w}
          </span>
        ))}
        <span aria-hidden="true" />
        {Array.from({ length: weeks }, (_, w) => {
          const weekStart = addDays(start, w * 7);
          const current = weekStart <= today && today <= addDays(weekStart, 6);
          return [
            ...Array.from({ length: 7 }, (_, i) => {
              const day = addDays(weekStart, i);
              const inMonth = day.slice(0, 7) === month.slice(0, 7);
              const n = arrivals.get(day) ?? 0;
              const isToday = day === today;
              return (
                <Link
                  key={day}
                  href={paths.calendario({ vista: "dia", fecha: day })}
                  aria-label={`${fmtDate(day)}${n ? `: ${plural(n, "llegada", "llegadas")}` : ""}`}
                  className={`relative mx-auto grid size-9 place-items-center rounded-full text-[13px] tabular-nums transition-colors ${
                    isToday
                      ? "bg-pink font-bold text-ink"
                      : inMonth
                        ? day < today
                          ? "text-ink-subtle hover:bg-panel"
                          : "text-ink hover:bg-panel"
                        : "text-ink-subtle/50 hover:bg-panel"
                  }`}
                >
                  {parseISO(day).getUTCDate()}
                  {n > 0 && <span aria-hidden="true" className="absolute bottom-1 size-1 rounded-full bg-ink" />}
                </Link>
              );
            }),
            <span
              key={`w${w}`}
              aria-hidden="true"
              className={`mx-auto grid h-6 place-items-center place-self-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums ${current ? "bg-panel text-ink" : "text-ink-subtle"}`}
            >
              {`S${isoWeek(weekStart)}`}
            </span>,
          ];
        })}
      </div>
    </section>
  );
}

/* ───────────── Agenda de hoy ───────────── */

type AgendaItem = {
  key: string;
  time: string;
  r: Reservation;
  title: string;
  meta: string;
  accent: Accent;
  icon: ReactNode;
  kind: "llegada" | "salida" | "plazo";
};
type AgendaFilter = "todo" | AgendaItem["kind"];

// Lo que pasa hoy, en orden de hora, con la hora actual marcada; lo que ya pasó se atenúa.
function Agenda({ arr, dep, pend }: { arr: Reservation[]; dep: Reservation[]; pend: Reservation[] }) {
  const { data, today, now, cabinLabel } = useAdmin();
  const s = data.site.settings;
  const [filter, setFilter] = useState<AgendaFilter>("todo");
  const nowTime = hhmm(new Date(now).toISOString());
  const items: AgendaItem[] = [
    ...arr.map((r) => ({
      key: `a${r.code}`,
      time: r.estimatedArrival || s.checkInStart,
      r,
      title: r.guest.fullName,
      meta: `Llegada · ${cabinLabel(r.cabinTypeId, r.unit)}`,
      accent: "pink" as const,
      icon: <LoginIcon size={16} />,
      kind: "llegada" as const,
    })),
    ...dep.map((r) => ({
      key: `s${r.code}`,
      time: s.checkOutTime,
      r,
      title: r.guest.fullName,
      meta: `Salida · ${cabinLabel(r.cabinTypeId, r.unit)}`,
      accent: "blue" as const,
      icon: <LogoutIcon size={16} />,
      kind: "salida" as const,
    })),
    ...pend
      .filter(
        (r) => r.status === "pending_deposit" && r.depositDueAt.slice(0, 10) <= today && Date.parse(r.depositDueAt) < Date.parse(`${today}T23:59:59-05:00`),
      )
      .map((r) => ({
        key: `p${r.code}`,
        time: hhmm(r.depositDueAt),
        r,
        title: r.guest.fullName,
        meta: `Vence la retención · abono ${cop(r.quote.deposit)}`,
        accent: "yellow" as const,
        icon: <ClockIcon size={16} />,
        kind: "plazo" as const,
      })),
  ]
    .filter((x) => filter === "todo" || x.kind === filter)
    .sort((a, b) => (a.time < b.time ? -1 : 1));
  const nowAt = items.findIndex((x) => x.time > nowTime);
  const marker = (
    <li key="now" aria-label={`Hora actual: ${nowTime}`} className="flex items-center gap-2 py-1">
      <span className="w-[46px] flex-none">
        <span className="rounded-full bg-pink px-1.5 py-0.5 text-[11px] font-bold text-ink tabular-nums">{nowTime}</span>
      </span>
      <span aria-hidden="true" className="h-0 flex-1 border-t-[1.5px] border-dashed border-ink/50" />
    </li>
  );

  return (
    <section aria-labelledby="d-agenda" className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="d-agenda" className="text-[18px] leading-tight font-semibold tracking-[-0.015em] text-ink">
            {fmtDate(today)}
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-muted">Agenda de hoy</p>
        </div>
        <label className="relative">
          <span className="sr-only">Mostrar en la agenda</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as AgendaFilter)}
            className="h-8 appearance-none rounded-full bg-ink pr-8 pl-3.5 text-[12.5px] font-semibold text-paper outline-none"
          >
            <option value="todo">Todo</option>
            <option value="llegada">Llegadas</option>
            <option value="salida">Salidas</option>
            <option value="plazo">Plazos</option>
          </select>
          <ChevronDownIcon size={14} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-paper" />
        </label>
      </div>
      {items.length ? (
        <ol className="flex flex-col gap-2">
          {items.map((x, i) => {
            const past = x.time <= nowTime;
            return [
              i === nowAt ? marker : null,
              <li key={x.key} className={`flex items-start gap-2 transition-opacity ${past ? "opacity-55 hover:opacity-100" : ""}`}>
                <span className="w-[46px] flex-none pt-3 text-[12px] font-semibold text-ink-muted tabular-nums">{x.time}</span>
                <Link
                  href={paths.reserva(x.r.code)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-[18px] bg-panel p-3 transition-colors hover:bg-line/80"
                >
                  <span aria-hidden="true" className={`grid size-9 flex-none place-items-center rounded-full text-ink ${ACCENT[x.accent].bg}`}>
                    {x.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">{x.title}</span>
                    <span className="block truncate text-[12px] text-ink-muted">{x.meta}</span>
                  </span>
                </Link>
              </li>,
            ];
          })}
          {nowAt === -1 && marker}
        </ol>
      ) : (
        <EmptyState compact icon={<ClockIcon size={18} />} title="Sin movimientos programados hoy." />
      )}
      <Link href={paths.calendario()} className={buttonClass("primary", "lg", "w-full")}>
        Ver el calendario
      </Link>
    </section>
  );
}
