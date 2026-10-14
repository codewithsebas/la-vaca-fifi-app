"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { BanIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, HomeIcon, LoginIcon, LogoutIcon, MoonIcon, PlusIcon, RefreshIcon, WalletIcon } from "@/components/icons";
import { StatusPill } from "@/components/status-pill";
import { ACTIVE_STATUSES, channelBlocks, computeQuote, isChannelBlock, nightlyRate } from "@/lib/booking";
import { MONTHS, MS, WD, WD_FULL, WD_MIN, addDays, cop, countdown, fmtDate, fmtFullDate, isISO, monthStart, nightsBetween, parseISO, plural, statusOf } from "@/lib/format";
import { pendingOf } from "@/lib/admin-metrics";
import { fmtTime } from "@/lib/site";
import type { Block, CabinType, Reservation } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin, useParam } from "./context";
import { DatePicker } from "./date-picker";
import { Popover, useTip } from "@/components/ui/floating";
import { NewReservationDialog, type NewReservationDraft } from "./new-reservation";
import { PREF, usePref } from "./prefs";
import { paths } from "./routes";
import { Button, EmptyState, IconButton, Segmented, Skeleton, buttonClass } from "./ui";

export type CalView = "dia" | "3dias" | "semana" | "mes";

export const CALENDAR_VIEWS: { value: CalView; label: string }[] = [
  { value: "dia", label: "Día" },
  { value: "3dias", label: "3 días" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
];

// Vista inicial según el ancho disponible del calendario (no el de la ventana): pocos días en el celular, semana en tableta, mes en escritorio.
const autoView = (w: number): CalView => (w < 560 ? "3dias" : w < 900 ? "semana" : "mes");
// Por debajo de este ancho el mes se muestra como cuadrícula mensual: 60 medias jornadas no caben legibles.
const MONTH_TIMELINE_MIN = 900;

const lastOfMonth = (m: string) => {
  const d = parseISO(m);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};
const mondayOf = (d: string) => addDays(d, -((parseISO(d).getUTCDay() + 6) % 7));
const BLOCK_BG = "repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-status-block) 32%, white) 0 5px, color-mix(in srgb, var(--color-status-block) 14%, white) 5px 10px)";
// Noches ocupadas en Booking.com: azul de Booking. No se editan aquí (se gestionan en el extranet).
const BOOKING_STYLE: CSSProperties = { background: "color-mix(in srgb, var(--color-status-booking) 20%, white)", boxShadow: "inset 3px 0 0 var(--color-status-booking)" };
const blockStyle = (b: Block): CSSProperties => (isChannelBlock(b) ? BOOKING_STYLE : { background: BLOCK_BG });
const blockHref = (b: Block) => (isChannelBlock(b) ? paths.booking : paths.bloqueos({ editar: b.id }));

// Bloqueos del panel y noches de Booking.com juntos: el calendario los dibuja igual (Booking con su color y sin editar).
function useCalBlocks() {
  const { data } = useAdmin();
  return useMemo(() => [...data.blocks, ...channelBlocks(data.channelStays)], [data.blocks, data.channelStays]);
}

// Estilo de cada estado: relleno suave del color del estado + franja de acento a la izquierda. Pendiente de abono =
// rayado y contorno (aún no asegurada: si no se paga a tiempo, se libera).
function barStyle(r: Pick<Reservation, "status">): CSSProperties {
  const c = statusOf(r.status).bg;
  if (r.status === "pending_deposit")
    return {
      background: `repeating-linear-gradient(135deg, color-mix(in srgb, ${c} 32%, white) 0 6px, color-mix(in srgb, ${c} 18%, white) 6px 12px)`,
      boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${c} 100%, black 20%)`,
    };
  return { background: `color-mix(in srgb, ${c} ${r.status === "completed" ? 30 : 42}%, white)`, boxShadow: `inset 3px 0 0 color-mix(in srgb, ${c} 100%, black 28%)` };
}

// "35 min", "5 h", "2 d": lo que le queda a una retención (cabe en una barra angosta).
function shortLeft(iso: string, now: number) {
  const m = Math.floor((Date.parse(iso) - now) / 6e4);
  if (m <= 0) return "vencida";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

// Tarifa corta para la fila de disponibilidad: 290000 → "290k", 1250000 → "1,25M".
const kfmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 2 })}M` : `${Math.round(n / 1000)}k`);

// Nombre del día según el ancho de su columna: «Lunes», «Lun» o «L» (container queries: decide el espacio real, no la pantalla).
function DayName({ wd, className = "" }: { wd: number; className?: string }) {
  return (
    <span className={className}>
      <span aria-hidden="true" className="@min-[38px]:hidden">
        {WD_MIN[wd]}
      </span>
      <span aria-hidden="true" className="hidden @min-[38px]:inline @min-[92px]:hidden">
        {WD[wd]}
      </span>
      <span className="sr-only @min-[92px]:not-sr-only">{WD_FULL[wd]}</span>
    </span>
  );
}

// Ancho real del contenedor (ResizeObserver): con él se eligen vista, columnas y etiquetas.
// Arranca con una estimación según la ventana (menú lateral desde 1024 px, márgenes del panel, máximo 1400 px):
// el observador avisa en el siguiente pintado, y una pestaña en segundo plano puede tardar en pintar.
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(() => {
    if (typeof window === "undefined") return 0;
    const desk = innerWidth >= 1024;
    return Math.min(1400, desk ? innerWidth - 248 : innerWidth) - (desk ? 64 : 32);
  });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

type Unit = { key: string; cabin: CabinType; unit: number; label: string; short: string };

function units(cabins: CabinType[], filter: string): Unit[] {
  return cabins
    .filter((c) => c.units > 0 && (!filter || c.id === filter))
    .flatMap((c) =>
      Array.from({ length: c.units }, (_, i) => ({
        key: `${c.id}:${i + 1}`,
        cabin: c,
        unit: i + 1,
        label: `${c.nombre.replace(/^Domo\s+/i, "")} ${i + 1}`,
        short: `${c.nombre.replace(/^Domo\s+/i, "").split(" ")[0]} ${i + 1}`,
      })),
    );
}

const occupies = (r: Reservation, u: Unit) => r.cabinTypeId === u.cabin.id && r.unit === u.unit && !["cancelled", "expired"].includes(r.status);
const blocks = (b: Block, u: Unit) => b.cabinTypeId === u.cabin.id && b.unit === u.unit;

/* ───────────── Contenido de los tooltips ───────────── */

function ReservationTip({ r, cabin }: { r: Reservation; cabin: string }) {
  const p = pendingOf(r);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-[13px]">{r.guest.fullName}</strong>
        <span className="text-white/70">{r.code}</span>
      </div>
      <span className="text-white/85">{cabin}</span>
      <span>
        {fmtDate(r.checkIn)} → {fmtDate(r.checkOut)} · {plural(nightsBetween(r.checkIn, r.checkOut), "noche", "noches")} · {plural(r.adults + r.children, "huésped", "huéspedes")}
      </span>
      <span className="flex flex-wrap gap-x-3">
        <span>Total {cop(r.quote.total)}</span>
        {p.total > 0 && <span className="text-highlight">Pendiente {cop(p.total)}</span>}
      </span>
      {r.status === "pending_deposit" && <span className="text-highlight">{`Sin pagar · la retención vence en ${countdown(r.depositDueAt)}`}</span>}
      {r.source === "panel" && <span className="text-white/70">Creada por el equipo</span>}
      <span className="mt-0.5 flex items-center justify-between gap-2 border-t border-white/15 pt-1.5">
        <span className="rounded-full px-2 py-px text-[11px] font-bold text-on-light" style={{ background: statusOf(r.status).bg }}>
          {statusOf(r.status).label}
        </span>
        <span className="text-white/60">Clic para ver el detalle</span>
      </span>
    </div>
  );
}

function BlockTip({ b, cabin }: { b: Block; cabin: string }) {
  const booking = isChannelBlock(b);
  return (
    <div className="flex flex-col gap-1">
      <strong className="text-[13px]">{booking ? "Booking.com · reserva o cierre" : `Bloqueado · ${b.reason}`}</strong>
      <span className="text-white/85">{cabin}</span>
      <span>
        {booking
          ? `${fmtDate(b.from)} → ${fmtDate(addDays(b.to, 1))} · ${plural(nightsBetween(b.from, b.to) + 1, "noche", "noches")}`
          : `${fmtDate(b.from)} → ${fmtDate(b.to)} · ${plural(nightsBetween(b.from, b.to) + 1, "día", "días")}`}
      </span>
      {b.notes && <span className="text-white/85">{b.notes}</span>}
      <span className="mt-0.5 border-t border-white/15 pt-1.5 text-white/60">{booking ? "Se gestiona en el extranet de Booking.com" : "Clic para editar el bloqueo"}</span>
    </div>
  );
}

/* ───────────── Vista ───────────── */

export function CalendarView() {
  const { data, today } = useAdmin();
  const calBlocks = useCalBlocks();
  const [wrap, width] = useWidth();
  const pref = usePref(PREF.calendarView, "auto");
  const [viewParam, setViewParam] = useParam<CalView | "">("vista", "");
  const [dateParam, setDateParam] = useParam("fecha", "");
  const [filter, setFilter] = useParam("domo", "");
  const [draft, setDraft] = useState<NewReservationDraft | null>(null);
  const rows = useMemo(() => units(data.cabinTypes, filter), [data.cabinTypes, filter]);

  const valid = (v: string): v is CalView => CALENDAR_VIEWS.some((x) => x.value === v);
  const view: CalView = valid(viewParam) ? viewParam : valid(pref) ? pref : autoView(width);
  const anchor = isISO(dateParam) ? dateParam : today;
  const setAnchor = (d: string) => setDateParam(d === today ? "" : d);
  const narrow = width < 560;
  const monthGrid = view === "mes" && width < MONTH_TIMELINE_MIN;

  const from = view === "mes" ? monthStart(anchor) : view === "semana" ? mondayOf(anchor) : anchor;
  const to = view === "mes" ? lastOfMonth(from) : view === "semana" ? addDays(from, 6) : view === "3dias" ? addDays(anchor, 2) : anchor;
  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }, [from, to]);

  const stepDays = { dia: 1, "3dias": 3, semana: 7, mes: 0 }[view];
  const step = (dir: number) => setAnchor(view === "mes" ? monthStart(addDays(monthStart(anchor), dir > 0 ? 32 : -1)) : addDays(anchor, dir * stepDays));
  const unitName = { dia: "Día", "3dias": "Días", semana: "Semana", mes: "Mes" }[view];
  const range = (a: string, b: string) => {
    const x = parseISO(a);
    const y = parseISO(b);
    return `${x.getUTCDate()} ${MS[x.getUTCMonth()]} – ${y.getUTCDate()} ${MS[y.getUTCMonth()]} ${y.getUTCFullYear()}`;
  };
  const title = view === "mes" ? `${MONTHS[parseISO(from).getUTCMonth()]} ${parseISO(from).getUTCFullYear()}` : view === "dia" ? (narrow ? fmtDate(anchor, true) : fmtFullDate(anchor)) : range(from, to);

  // Resumen del periodo visible.
  const inView = data.reservations.filter((r) => rows.some((u) => occupies(r, u)) && r.checkIn <= to && r.checkOut > from);
  const arrivals = inView.filter((r) => r.checkIn >= from && r.checkIn <= to).length;
  const departures = inView.filter((r) => r.checkOut >= from && r.checkOut <= to).length;
  const unpaid = inView.filter((r) => r.status === "pending_deposit").length;
  let busyNights = 0;
  let blockedNights = 0;
  for (const d of days)
    for (const u of rows) {
      const b = calBlocks.find((x) => blocks(x, u) && x.from <= d && d <= x.to);
      if (data.reservations.some((r) => occupies(r, u) && ACTIVE_STATUSES.concat(["completed"]).includes(r.status) && r.checkIn <= d && d < r.checkOut) || (b && isChannelBlock(b))) busyNights++;
      else if (b) blockedNights++;
    }
  const capacity = rows.length * days.length - blockedNights;
  const occupancy = capacity ? Math.round((busyNights / capacity) * 100) : 0;

  const cabinOptions = [{ value: "", label: "Todos los domos" }, ...data.cabinTypes.filter((c) => c.units > 0).map((c) => ({ value: c.id, label: c.nombre, description: plural(c.units, "unidad", "unidades") }))];
  const showDay = (d: string) => {
    setAnchor(d);
    setViewParam("dia");
  };

  return (
    <div ref={wrap} className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 id="ad-title" tabIndex={-1} className="sr-only">
            Calendario
          </h1>
          <div className="flex items-center rounded-xl border border-line bg-panel p-0.5 shadow-panel">
            <IconButton label={`${unitName} anterior`} size="sm" onClick={() => step(-1)}>
              <ChevronLeftIcon size={17} />
            </IconButton>
            <Button size="sm" variant="ghost" onClick={() => setAnchor(today)} disabled={today >= from && today <= to} className="px-2.5">
              Hoy
            </Button>
            <IconButton label={`${unitName} siguiente`} size="sm" onClick={() => step(1)}>
              <ChevronRightIcon size={17} />
            </IconButton>
          </div>
          <p aria-live="polite" className="text-[clamp(1.15rem,1.9vw,1.5rem)] leading-tight font-extrabold tracking-[-0.01em] text-ink first-letter:uppercase">
            {title}
          </p>
        </div>
        {/* En móvil: fecha y domo lado a lado, la vista debajo y «Nueva reserva» a todo el ancho; así la cuadrícula empieza más arriba. */}
        <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <div className="min-w-0 sm:w-[168px]">
            <DatePicker value={anchor} onChange={(d) => d && setAnchor(d)} clearable={false} placeholder="Ir a fecha" className="h-8 min-h-8 text-[13px]" />
          </div>
          <div className="min-w-0 sm:w-[190px]">
            <Combobox value={filter} onChange={setFilter} options={cabinOptions} icon={<HomeIcon size={15} className="text-ink-muted" />} className="h-8 min-h-8 text-[13px]" />
          </div>
          <Segmented className="col-span-2 w-full justify-self-stretch sm:w-auto [&>*]:flex-1 [&>*]:justify-center sm:[&>*]:flex-none" label="Vista del calendario" value={view} onChange={(v) => setViewParam(v)} options={CALENDAR_VIEWS} />
          <Button variant="primary" size="sm" icon={<PlusIcon size={14} />} onClick={() => setDraft({ cabinTypeId: filter || undefined })} className="col-span-2 w-full sm:w-auto">
            Nueva reserva
          </Button>
        </div>
      </header>

      {!rows.length ? (
        <div className="rounded-2xl border border-line bg-panel p-4 shadow-panel">
          <EmptyState
            icon={<HomeIcon size={18} />}
            title="No hay domos para mostrar"
            text="Crea un domo (o asígnale unidades) para ver su ocupación aquí."
            action={
              <Link href={paths.domos} className={buttonClass()}>
                Ir a Domos
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6">
            <ul aria-label="Resumen del periodo" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 text-[12.5px] whitespace-nowrap sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              <Chip label="Ocupación" value={`${occupancy} %`} meter={occupancy} />
              <Chip label={view === "dia" ? "Llegan" : "Llegadas"} value={arrivals} icon={<LoginIcon size={13} />} />
              <Chip label={view === "dia" ? "Salen" : "Salidas"} value={departures} icon={<LogoutIcon size={13} />} />
              <Chip label="Por cobrar" value={unpaid} icon={<WalletIcon size={13} />} tone={unpaid ? "warning" : undefined} />
              <Chip label="Noches libres" value={Math.max(0, capacity - busyNights)} icon={<MoonIcon size={13} />} />
              {blockedNights > 0 && <Chip label="Bloqueadas" value={blockedNights} icon={<BanIcon size={13} />} />}
            </ul>
            <Legend />
          </div>
          <div key={`${view}-${from}-${filter}-${monthGrid}`} className="flex min-h-0 flex-1 flex-col motion-safe:animate-fade-in">
            {!width ? (
              <Skeleton className="min-h-[360px] flex-1" />
            ) : view === "dia" ? (
              <DayAgenda day={anchor} rows={rows} onNew={setDraft} />
            ) : monthGrid ? (
              <MonthGrid month={from} rows={rows} today={today} onPick={showDay} />
            ) : (
              <Timeline days={days} rows={rows} view={view} today={today} width={width} onDay={showDay} onNew={setDraft} />
            )}
          </div>
        </>
      )}
      {draft && <NewReservationDialog draft={draft} onClose={() => setDraft(null)} />}
    </div>
  );
}

function Chip({ label, value, icon, meter, tone }: { label: string; value: ReactNode; icon?: ReactNode; meter?: number; tone?: "warning" }) {
  return (
    <li className={`inline-flex flex-none items-center gap-1.5 rounded-full border px-2.5 py-1 ${tone === "warning" ? "border-warning/30 bg-warning-soft text-warning" : "border-line bg-panel text-ink-muted"}`}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {label}
      {meter !== undefined && (
        <span aria-hidden="true" className="h-1.5 w-10 overflow-hidden rounded-full bg-ink/8">
          <span className="block h-full rounded-full bg-success" style={{ width: `${Math.min(100, meter)}%` }} />
        </span>
      )}
      <strong className={`font-bold tabular-nums ${tone === "warning" ? "" : "text-ink"}`}>{value}</strong>
    </li>
  );
}

const LEGEND: { label: string; style: CSSProperties }[] = [
  { label: "Confirmada", style: barStyle({ status: "confirmed" }) },
  { label: "Sin pagar (retenida)", style: barStyle({ status: "pending_deposit" }) },
  { label: "Reprogramada", style: barStyle({ status: "rescheduled" }) },
  { label: "En estadía", style: barStyle({ status: "checked_in" }) },
  { label: "Finalizada", style: barStyle({ status: "completed" }) },
  { label: "Bloqueo", style: { background: BLOCK_BG } },
  { label: "Booking.com", style: BOOKING_STYLE },
];

function Legend() {
  return (
    <ul aria-label="Leyenda" className="no-scrollbar -mx-4 flex gap-x-3 gap-y-1 overflow-x-auto px-4 text-[12px] text-ink-muted sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {LEGEND.map((l) => (
        <li key={l.label} className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden="true" className="h-3 w-4 rounded-[4px]" style={l.style} />
          {l.label}
        </li>
      ))}
    </ul>
  );
}

/* ───────────── Línea de tiempo (3 días, semana y mes en pantallas anchas) ───────────── */

type TimelineProps = { days: string[]; rows: Unit[]; view: CalView; today: string; width: number; onDay: (d: string) => void; onNew: (d: NewReservationDraft) => void };
type Line = { kind: "group"; cabin: CabinType; units: Unit[] } | { kind: "unit"; u: Unit };

// Agrupada por tipo de domo: cada tipo muestra por día cuántas unidades quedan libres y su tarifa (lo que se necesita
// para vender por WhatsApp); debajo, una fila por unidad con sus reservas, bloqueos y noches de Booking.
// Arrastrar sobre noches libres de una unidad (con el mouse) abre «Nueva reserva» con ese domo y esas fechas.
function Timeline({ days, rows, view, today, width, onDay, onNew }: TimelineProps) {
  const { data, cabinLabel, now } = useAdmin();
  const calBlocks = useCalBlocks();
  const tip = useTip();
  const scroller = useRef<HTMLDivElement>(null);
  const cellAnchor = useRef<HTMLElement | null>(null);
  const [cell, setCell] = useState<{ u: Unit; d: string } | null>(null);
  const [sel, setSel] = useState<{ u: Unit; a: string; b: string } | null>(null);
  const drag = useRef<{ u: Unit; a: string; b: string; el: HTMLElement; moved: boolean } | null>(null);
  const mouseClick = useRef(false);
  const n = days.length;
  const from = days[0];
  const to = days[n - 1];
  const idx = (d: string) => nightsBetween(from, d);
  const compact = width < 640;
  // Columna de nombres y ancho mínimo de media jornada según el espacio: sin desplazamiento horizontal salvo que no haya otra opción.
  const label = compact ? 104 : 168;
  const half = view === "mes" ? 10 : view === "semana" ? (compact ? 14 : 34) : compact ? 22 : 48;
  const showRates = half >= 22;

  const lines = useMemo<Line[]>(() => {
    const out: Line[] = [];
    let group = "";
    for (const u of rows) {
      if (u.cabin.id !== group) {
        group = u.cabin.id;
        out.push({ kind: "group", cabin: u.cabin, units: rows.filter((x) => x.cabin.id === group) });
      }
      out.push({ kind: "unit", u });
    }
    return out;
  }, [rows]);

  // Abre desplazado hasta hoy si el periodo no cabe en pantalla.
  useEffect(() => {
    const el = scroller.current;
    if (!el || today < from || today > to) return;
    el.scrollLeft = Math.max(0, idx(today) * half * 2 - el.clientWidth / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from]);

  const free = (u: Unit, d: string) => !data.reservations.some((r) => occupies(r, u) && r.checkIn <= d && d < r.checkOut) && !calBlocks.some((b) => blocks(b, u) && b.from <= d && d <= b.to);
  const visible = data.reservations.filter((r) => r.checkIn <= to && r.checkOut > from && rows.some((u) => occupies(r, u)));

  // Noches libres seguidas desde `a` hacia `target` (dentro del periodo y desde hoy): la selección no salta reservas.
  const reach = (u: Unit, a: string, target: string) => {
    const dir = target >= a ? 1 : -1;
    let b = a;
    while (b !== target) {
      const next = addDays(b, dir);
      if (next < today || next < from || next > to || !free(u, next)) break;
      b = next;
    }
    return b;
  };

  // Arrastre con el mouse: se sigue al puntero por toda la ventana hasta soltar.
  const startDrag = (e: ReactPointerEvent<HTMLButtonElement>, u: Unit, d: string) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    e.preventDefault();
    mouseClick.current = true;
    drag.current = { u, a: d, b: d, el: e.currentTarget, moved: false };
    setSel({ u, a: d, b: d });
    const move = (ev: PointerEvent) => {
      const g = drag.current;
      const hit = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-cell]");
      if (!g || !hit || hit.dataset.unit !== g.u.key || !hit.dataset.day) return;
      const b = reach(g.u, g.a, hit.dataset.day);
      if (b === g.b) return;
      g.b = b;
      g.moved ||= b !== g.a;
      setSel({ u: g.u, a: g.a, b });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const g = drag.current;
      drag.current = null;
      setSel(null);
      // El clic que sigue a soltar el botón ya quedó resuelto aquí; después, los clics vuelven a contar.
      setTimeout(() => (mouseClick.current = false), 0);
      if (!g) return;
      if (g.moved) {
        const [lo, hi] = g.a < g.b ? [g.a, g.b] : [g.b, g.a];
        onNew({ cabinTypeId: g.u.cabin.id, unit: g.u.unit, checkIn: lo, checkOut: addDays(hi, 1) });
      } else {
        cellAnchor.current = g.el;
        setCell({ u: g.u, d: g.a });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const rowHeight = compact ? 46 : 52;
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `${label}px repeat(${n * 2}, minmax(${half}px, 1fr))`,
    gridTemplateRows: `auto ${lines.map((l) => (l.kind === "group" ? "32px" : `${rowHeight}px`)).join(" ")}`,
    minWidth: label + n * 2 * half,
  };
  const rate = cell ? nightlyRate(cell.u.cabin, data.seasons, cell.d) : null;

  return (
    <div className="flex min-h-[300px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-panel">
      <div ref={scroller} className={`relative min-h-0 flex-1 overflow-auto overscroll-x-contain ${sel ? "cursor-col-resize select-none" : ""}`}>
        <div role="grid" aria-label="Ocupación por domo" aria-rowcount={lines.length + 1} className="grid" style={gridStyle}>
          {/* Encabezado de días */}
          <div role="row" className="contents">
            <div role="columnheader" className="sticky top-0 left-0 z-30 flex items-end border-r border-b border-line bg-panel px-3 pb-2 text-[12px] font-semibold text-ink-muted">
              Domo
            </div>
            {days.map((d, i) => {
              const dt = parseISO(d);
              const wd = dt.getUTCDay();
              const isToday = d === today;
              const firstOfMonth = dt.getUTCDate() === 1 && i > 0;
              return (
                <div
                  key={d}
                  role="columnheader"
                  aria-label={fmtDate(d, true)}
                  className={`@container sticky top-0 z-20 flex flex-col items-center justify-end gap-0.5 border-b border-line px-0.5 pt-2 pb-1.5 ${wd === 0 || wd === 6 ? "bg-canvas" : "bg-panel"} ${i ? (firstOfMonth ? "border-l-2 border-l-line-strong" : "border-l border-l-line/70") : ""}`}
                  style={{ gridColumn: `${2 + i * 2} / span 2` }}
                >
                  <DayName wd={wd} className={`max-w-full truncate text-[10.5px] font-semibold tracking-[.04em] uppercase ${isToday ? "text-ink" : "text-ink-subtle"}`} />
                  <span className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-[12.5px] font-bold tabular-nums ${isToday ? "bg-ink text-white" : "text-ink"}`}>{dt.getUTCDate()}</span>
                </div>
              );
            })}
          </div>

          {lines.map((line, li) => {
            const gridRow = 2 + li;
            if (line.kind === "group") {
              const total = line.cabin.units;
              const all = units([line.cabin], "");
              return (
                <div key={`g-${line.cabin.id}`} role="row" className="contents">
                  <div role="rowheader" className="sticky left-0 z-10 flex min-w-0 items-center gap-2 border-r border-b border-line bg-canvas px-3" style={{ gridRow }}>
                    <span className="truncate text-[12px] font-bold tracking-[.02em] text-ink">{line.cabin.nombre.replace(/^Domo\s+/i, "")}</span>
                    {!line.cabin.activa && <span className="flex-none rounded-full bg-ink/8 px-1.5 text-[10.5px] font-semibold text-ink-muted">Inactivo</span>}
                  </div>
                  {days.map((d, i) => {
                    const f = all.filter((u) => free(u, d)).length;
                    const r = nightlyRate(line.cabin, data.seasons, d);
                    const text = `${line.cabin.nombre} · ${fmtDate(d)}: ${f === 0 ? "sin unidades libres" : `${f} de ${total} libres`} · ${cop(r.couple)} la noche en pareja${r.season ? ` (${r.season.nombre})` : ""}`;
                    const tone = f === 0 ? "text-error" : f < total ? "text-warning" : "text-ink-subtle/70";
                    return (
                      <div
                        key={d}
                        role="gridcell"
                        aria-label={text}
                        {...tip(() => text)}
                        className={`@container flex items-center justify-center gap-1 border-b border-line bg-canvas px-0.5 ${i ? "border-l border-l-line/70" : ""} ${d === today ? "bg-highlight/12" : ""}`}
                        style={{ gridRow, gridColumn: `${2 + i * 2} / span 2` }}
                      >
                        <span className={`text-[11.5px] font-bold tabular-nums ${tone}`}>
                          {f === 0 ? (
                            <>
                              <span className="@min-[52px]:hidden">0</span>
                              <span className="hidden @min-[52px]:inline">Lleno</span>
                            </>
                          ) : (
                            f
                          )}
                        </span>
                        {showRates && f > 0 && <span className={`hidden text-[10.5px] font-semibold tabular-nums @min-[72px]:inline ${r.season ? "text-info" : "text-ink-subtle"}`}>{kfmt(r.couple)}</span>}
                      </div>
                    );
                  })}
                </div>
              );
            }

            const { u } = line;
            return (
              <div key={u.key} role="row" className="contents">
                <div role="rowheader" className="sticky left-0 z-10 flex min-w-0 items-center gap-2 border-r border-b border-line bg-panel py-1 pr-2 pl-5 sm:pl-6" style={{ gridRow }}>
                  <span aria-hidden="true" className="h-5 w-[3px] flex-none rounded-full bg-line-strong" />
                  <span className="truncate text-[12.5px] font-semibold text-ink sm:text-[13px]">{compact ? u.short : u.label}</span>
                </div>
                {days.map((d, i) => {
                  const wd = parseISO(d).getUTCDay();
                  const isFree = free(u, d);
                  return (
                    <div
                      key={d}
                      role="gridcell"
                      aria-label={isFree ? `${fmtDate(d)} libre` : undefined}
                      className={`group relative border-b border-line ${i ? "border-l border-l-line/60" : ""} ${d === today ? "bg-highlight/10" : wd === 0 || wd === 6 ? "bg-canvas/60" : ""}`}
                      style={{ gridRow, gridColumn: `${2 + i * 2} / span 2` }}
                    >
                      {isFree && d >= today && (
                        <button
                          type="button"
                          tabIndex={-1}
                          data-cell
                          data-unit={u.key}
                          data-day={d}
                          aria-label={`${u.label}, ${fmtDate(d)}: libre. Reservar o bloquear`}
                          aria-haspopup="dialog"
                          {...tip(() => `${fmtDate(d)} · ${cabinLabel(u.cabin.id, u.unit)} libre. Clic para reservar o bloquear; arrastra para elegir varias noches.`)}
                          onPointerDown={(e) => {
                            tip(() => null).onPointerDown?.();
                            startDrag(e, u, d);
                          }}
                          onClick={(e) => {
                            // Con el mouse, el clic ya lo resolvió el arrastre (al soltar).
                            if (mouseClick.current) {
                              mouseClick.current = false;
                              return;
                            }
                            cellAnchor.current = e.currentTarget;
                            setCell({ u, d });
                          }}
                          className="absolute inset-1 grid place-items-center rounded-lg text-ink-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-success-soft hover:text-success focus-visible:opacity-100 pointer-coarse:active:bg-ink/6 pointer-coarse:active:opacity-100"
                        >
                          <PlusIcon size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Bloqueos y noches de Booking.com */}
                {calBlocks
                  .filter((b) => blocks(b, u) && b.from <= to && b.to >= from)
                  .map((b) => {
                    const start = b.from < from ? 2 : 2 + idx(b.from) * 2;
                    const end = b.to > to ? 2 + n * 2 : 2 + (idx(b.to) + 1) * 2;
                    // Si sigue antes o después del periodo visible, ese lado queda recto y sin margen (como las reservas).
                    const cut = { l: b.from < from, r: b.to > to };
                    return (
                      <Link
                        key={b.id}
                        href={blockHref(b)}
                        aria-label={`${isChannelBlock(b) ? "Booking.com" : `Bloqueo ${b.reason}`}, ${fmtDate(b.from)} a ${fmtDate(b.to)}`}
                        {...tip(() => <BlockTip b={b} cabin={cabinLabel(b.cabinTypeId, b.unit)} />)}
                        className={`@container relative z-1 my-auto flex h-[calc(100%-12px)] min-w-0 items-center gap-1.5 overflow-hidden px-2 text-left text-[12px] font-semibold text-ink-muted transition-[filter,box-shadow] duration-150 hover:shadow-panel hover:brightness-95 ${
                          cut.l ? "rounded-l-none" : "ml-0.5 rounded-l-[7px]"
                        } ${cut.r ? "rounded-r-none" : "mr-0.5 rounded-r-[7px]"}`}
                        style={{ gridRow, gridColumn: `${start} / ${end}`, ...blockStyle(b) }}
                      >
                        {isChannelBlock(b) ? <RefreshIcon size={13} className="hidden flex-none @min-[48px]:block" /> : <BanIcon size={13} className="hidden flex-none @min-[48px]:block" />}
                        <span className="truncate">{b.reason}</span>
                      </Link>
                    );
                  })}

                {/* Reservas: de la tarde de llegada a la mañana de salida */}
                {visible
                  .filter((r) => occupies(r, u))
                  .map((r) => {
                    const start = r.checkIn < from ? 2 : 3 + idx(r.checkIn) * 2;
                    const end = r.checkOut > to ? 2 + n * 2 : 3 + idx(r.checkOut) * 2;
                    const cut = { l: r.checkIn < from, r: r.checkOut > to };
                    const first = r.guest.fullName.split(" ")[0];
                    const pending = r.status === "pending_deposit";
                    const owed = pendingOf(r).total;
                    // Media jornada al borde del periodo: el padding normal + el borde no caben en la columna.
                    const narrowBar = end - start <= 1;
                    return (
                      <Link
                        key={r.code}
                        href={paths.reserva(r.code)}
                        aria-label={`${r.guest.fullName}, ${r.code}, ${statusOf(r.status).label}, ${fmtDate(r.checkIn)} a ${fmtDate(r.checkOut)}`}
                        {...tip(() => <ReservationTip r={r} cabin={cabinLabel(r.cabinTypeId, r.unit)} />)}
                        className={`@container relative z-2 my-auto flex h-[calc(100%-12px)] min-w-0 items-center gap-1.5 overflow-hidden text-left text-ink transition-[filter,box-shadow,transform] duration-150 hover:z-3 hover:shadow-panel hover:brightness-[.97] motion-safe:hover:-translate-y-px ${narrowBar ? "px-1" : "pr-1.5 pl-2.5"} ${
                          cut.l ? "rounded-l-none" : "rounded-l-[7px]"
                        } ${cut.r ? "rounded-r-none" : "rounded-r-[7px]"} ${r.status === "completed" ? "opacity-75" : ""}`}
                        style={{ gridRow, gridColumn: `${start} / ${end}`, ...barStyle(r) }}
                      >
                        {/* El contenido crece con el ancho de la barra: nombre → noches y código → lo que falta por cobrar o el plazo. */}
                        <span className="flex min-w-0 flex-1 flex-col justify-center">
                          <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] leading-tight font-bold">
                            {r.status === "checked_in" && <span aria-hidden="true" className="size-1.5 flex-none rounded-full bg-success" />}
                            <span className="truncate @min-[120px]:hidden">{first}</span>
                            <span className="hidden truncate @min-[120px]:inline">{r.guest.fullName}</span>
                          </span>
                          <span className="hidden truncate text-[11px] leading-tight text-ink-muted @min-[96px]:block">
                            {plural(nightsBetween(r.checkIn, r.checkOut), "noche", "noches")} · {r.code}
                            {!pending && owed > 0 ? <span className="hidden @min-[200px]:inline">{` · debe ${cop(owed)}`}</span> : null}
                          </span>
                        </span>
                        {pending && (
                          <span className="hidden flex-none items-center gap-0.5 rounded-full bg-white/80 px-1.5 py-px text-[10.5px] font-bold text-warning tabular-nums @min-[86px]:inline-flex">
                            <ClockIcon size={11} />
                            {shortLeft(r.depositDueAt, now)}
                          </span>
                        )}
                      </Link>
                    );
                  })}

                {/* Selección al arrastrar: noches elegidas y lo que costarían (2 personas). */}
                {sel?.u.key === u.key &&
                  (() => {
                    const [lo, hi] = sel.a < sel.b ? [sel.a, sel.b] : [sel.b, sel.a];
                    const nights = nightsBetween(lo, hi) + 1;
                    const q = computeQuote(u.cabin, lo, addDays(hi, 1), 2, data.seasons);
                    return (
                      <div
                        aria-hidden="true"
                        className="@container pointer-events-none relative z-4 my-auto flex h-[calc(100%-12px)] min-w-0 items-center justify-center overflow-hidden rounded-[7px] border-2 border-dashed border-focus bg-success-soft/90 px-1.5 text-[11.5px] font-bold text-success"
                        style={{ gridRow, gridColumn: `${3 + idx(lo) * 2} / ${Math.min(2 + n * 2, 3 + (idx(hi) + 1) * 2)}` }}
                      >
                        <span className="truncate">
                          {plural(nights, "noche", "noches")}
                          <span className="hidden @min-[150px]:inline">{` · ${cop(q.total)}`}</span>
                        </span>
                      </div>
                    );
                  })()}
              </div>
            );
          })}
        </div>
        {!visible.length && !calBlocks.some((b) => b.from <= to && b.to >= from) && (
          <p className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-2 rounded-full bg-panel/95 px-4 py-2 text-[13px] font-medium whitespace-nowrap text-ink-muted shadow-panel">Sin reservas en este periodo</p>
        )}
      </div>
      <p className="hidden border-t border-line bg-canvas/50 px-4 py-2 text-[12px] text-ink-muted pointer-fine:block">
        Arrastra sobre los días libres de un domo para crear una reserva con esas fechas, o haz clic en un día libre para reservar o bloquear.
      </p>

      {/* Fecha libre: acciones al tocar o hacer clic (en móvil, hoja inferior) */}
      <Popover open={!!cell} onClose={() => setCell(null)} anchor={cellAnchor} label="Fecha libre">
        {cell && (
          <div className="flex w-[290px] flex-col gap-3 p-4 max-sm:w-full">
            <div>
              <p className="text-[12px] font-bold tracking-[.04em] text-success uppercase">Libre</p>
              <p className="mt-0.5 text-[15px] font-bold text-ink">{cabinLabel(cell.u.cabin.id, cell.u.unit)}</p>
              <p className="text-[13px] text-ink-muted">{fmtFullDate(cell.d)}</p>
              {rate && <p className="mt-1 text-[13px] text-ink">{`Noche en pareja: ${cop(rate.couple)}${rate.season ? ` · ${rate.season.nombre}` : ""}`}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                variant="primary"
                icon={<PlusIcon size={14} />}
                className="justify-start"
                onClick={() => {
                  const c = cell;
                  setCell(null);
                  onNew({ cabinTypeId: c.u.cabin.id, unit: c.u.unit, checkIn: c.d, checkOut: addDays(c.d, 1) });
                }}
              >
                Nueva reserva desde este día
              </Button>
              <Link href={paths.bloqueos({ nuevo: 1, domo: cell.u.cabin.id, unidad: cell.u.unit, fecha: cell.d })} className={buttonClass("secondary", "md", "justify-start")}>
                <BanIcon size={15} />
                Bloquear desde este día
              </Link>
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => {
                  setCell(null);
                  onDay(cell.d);
                }}
              >
                Ver la agenda del día
              </Button>
            </div>
          </div>
        )}
      </Popover>
    </div>
  );
}

/* ───────────── Mes en pantallas angostas: cuadrícula mensual ───────────── */

// Cada día muestra una franja por unidad (reserva, bloqueo o libre) y cuántas quedan libres. Tocar un día abre su agenda.
function MonthGrid({ month, rows, today, onPick }: { month: string; rows: Unit[]; today: string; onPick: (d: string) => void }) {
  const { data } = useAdmin();
  const calBlocks = useCalBlocks();
  const tip = useTip();
  const start = mondayOf(month);
  const end = addDays(mondayOf(lastOfMonth(month)), 6);
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const many = rows.length > 6;

  const stateOf = (u: Unit, d: string) => {
    const r = data.reservations.find((x) => occupies(x, u) && x.checkIn <= d && d < x.checkOut);
    if (r) return { kind: "res" as const, r };
    const b = calBlocks.find((x) => blocks(x, u) && x.from <= d && d <= x.to);
    return b ? { kind: "block" as const, b } : { kind: "free" as const };
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-panel">
      <div role="row" className="grid grid-cols-7 border-b border-line bg-canvas/70">
        {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
          <div key={wd} role="columnheader" className="@container py-2 text-center">
            <DayName wd={wd} className="text-[11px] font-semibold tracking-[.04em] text-ink-muted uppercase" />
          </div>
        ))}
      </div>
      <div role="grid" aria-label="Ocupación del mes" className="grid min-h-0 flex-1 auto-rows-[minmax(64px,1fr)] grid-cols-7 overflow-y-auto">
        {days.map((d, i) => {
          const inMonth = d.slice(0, 7) === month.slice(0, 7);
          const states = rows.map((u) => ({ u, s: stateOf(u, d) }));
          const freeCount = states.filter((x) => x.s.kind === "free").length;
          const arrivals = data.reservations.filter((r) => r.checkIn === d && rows.some((u) => occupies(r, u))).length;
          const summary = `${fmtDate(d, true)}: ${freeCount === 0 ? "sin domos libres" : `${freeCount} de ${rows.length} libres`}${arrivals ? `, ${plural(arrivals, "llegada", "llegadas")}` : ""}`;
          return (
            <button
              key={d}
              type="button"
              aria-label={`${summary}. Ver la agenda del día`}
              onClick={() => onPick(d)}
              {...tip(() => (
                <span className="flex flex-col gap-1">
                  <strong>{fmtDate(d, true)}</strong>
                  {states.map(({ u, s }) => (
                    <span key={u.key}>
                      {u.label}: {s.kind === "res" ? `${s.r.guest.fullName} (${statusOf(s.r.status).label})` : s.kind === "block" ? (isChannelBlock(s.b) ? "Booking.com" : `Bloqueada · ${s.b.reason}`) : "Libre"}
                    </span>
                  ))}
                </span>
              ))}
              className={`@container flex min-w-0 flex-col gap-1.5 border-line p-1.5 text-left transition-colors hover:bg-canvas sm:p-2 ${i % 7 ? "border-l" : ""} ${i >= 7 ? "border-t" : ""} ${inMonth ? "" : "bg-canvas/50 text-ink-subtle"}`}
            >
              <span className="flex items-center justify-between gap-1">
                <span className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-[12.5px] font-bold tabular-nums ${d === today ? "bg-ink text-white" : inMonth ? "text-ink" : "text-ink-subtle"}`}>{parseISO(d).getUTCDate()}</span>
                {arrivals > 0 && (
                  <span aria-hidden="true" className="hidden items-center gap-0.5 text-[10.5px] font-bold text-success @min-[64px]:flex">
                    <LoginIcon size={11} />
                    {arrivals}
                  </span>
                )}
              </span>
              {/* Una franja por unidad con el color de acento del estado (el mismo de las barras de la línea de tiempo); libre = casi transparente. */}
              {many ? (
                <span aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-ink/6">
                  <span className="block h-full rounded-full bg-ink/55" style={{ width: `${((rows.length - freeCount) / rows.length) * 100}%` }} />
                </span>
              ) : (
                <span aria-hidden="true" className="flex flex-col gap-[3px]">
                  {states.map(({ u, s }) => (
                    <span
                      key={u.key}
                      className="h-[5px] w-full rounded-full"
                      style={
                        s.kind === "res"
                          ? s.r.status === "pending_deposit"
                            ? { background: `repeating-linear-gradient(90deg, ${statusOf(s.r.status).bg} 0 4px, transparent 4px 6px)` }
                            : { background: `color-mix(in srgb, ${statusOf(s.r.status).bg} 100%, black ${s.r.status === "completed" ? 30 : 12}%)` }
                          : s.kind === "block"
                            ? { background: isChannelBlock(s.b) ? "var(--color-status-booking)" : "repeating-linear-gradient(135deg, var(--color-status-block) 0 3px, transparent 3px 5px)" }
                            : { background: "color-mix(in srgb, var(--color-ink) 7%, transparent)" }
                      }
                    />
                  ))}
                </span>
              )}
              <span aria-hidden="true" className={`mt-auto text-[11px] font-bold tabular-nums ${freeCount === 0 ? "text-error" : "text-success"}`}>
                <span className="@min-[60px]:hidden">{freeCount === 0 ? "0" : freeCount}</span>
                <span className="hidden @min-[60px]:inline">{freeCount === 0 ? "Lleno" : `${freeCount} libre${freeCount > 1 ? "s" : ""}`}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── Día: agenda por domo ───────────── */

function DayAgenda({ day, rows, onNew }: { day: string; rows: Unit[]; onNew: (d: NewReservationDraft) => void }) {
  const { data, cabinLabel, today, now } = useAdmin();
  const calBlocks = useCalBlocks();
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-3 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((u) => {
        const stay = data.reservations.find((r) => occupies(r, u) && r.checkIn <= day && day < r.checkOut);
        const leaving = data.reservations.find((r) => occupies(r, u) && r.checkOut === day);
        const block = calBlocks.find((b) => blocks(b, u) && b.from <= day && day <= b.to);
        const arriving = stay && stay.checkIn === day;
        const state = block ? (isChannelBlock(block) ? { label: "Booking.com", tone: "bg-info-soft text-info" } : { label: "Bloqueada", tone: "bg-ink/8 text-ink-muted" }) : arriving ? { label: "Llega hoy", tone: "bg-success-soft text-success" } : stay ? { label: "Ocupada", tone: "bg-info-soft text-info" } : { label: "Libre", tone: "bg-success-soft text-success" };
        const night = stay ? nightsBetween(stay.checkIn, day) + 1 : 0;
        const total = stay ? nightsBetween(stay.checkIn, stay.checkOut) : 0;
        const rate = nightlyRate(u.cabin, data.seasons, day);
        return (
          <article key={u.key} className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4 shadow-panel">
            <header className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold text-ink">{cabinLabel(u.cabin.id, u.unit)}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${state.tone}`}>{state.label}</span>
            </header>
            {leaving && (
              <Link href={paths.reserva(leaving.code)} className="flex items-center gap-2.5 rounded-xl bg-canvas px-3 py-2 text-left text-[13px] transition-colors hover:bg-ink/6">
                <LogoutIcon size={15} className="text-ink-muted" />
                <span className="min-w-0 flex-1 truncate">
                  Sale <strong>{leaving.guest.fullName}</strong> · check-out {fmtTime(data.site.settings.checkOutTime)}
                </span>
              </Link>
            )}
            {stay ? (
              <Link href={paths.reserva(stay.code)} className="flex flex-col gap-2 rounded-xl p-3 text-left transition-[filter] hover:brightness-[.97]" style={barStyle(stay)}>
                <span className="flex items-center justify-between gap-2">
                  <strong className="truncate text-[14px] text-ink">{stay.guest.fullName}</strong>
                  <StatusPill status={stay.status} size="sm" />
                </span>
                <span className="text-[12.5px] text-ink-muted">
                  {stay.code} · {plural(stay.adults + stay.children, "huésped", "huéspedes")}
                  {arriving && stay.estimatedArrival ? ` · llega ${stay.estimatedArrival}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/70">
                    <span className="block h-full rounded-full bg-ink/60" style={{ width: `${(night / total) * 100}%` }} />
                  </span>
                  <span className="text-[12px] font-semibold text-ink tabular-nums">
                    Noche {night} de {total}
                  </span>
                </span>
                {stay.status === "pending_deposit" ? (
                  <span className="flex items-center gap-1 text-[12.5px] font-semibold text-warning">
                    <ClockIcon size={13} />
                    {`Sin pagar · la retención vence en ${shortLeft(stay.depositDueAt, now)}`}
                  </span>
                ) : (
                  pendingOf(stay).total > 0 && <span className="text-[12.5px] font-semibold text-warning">Pendiente por cobrar {cop(pendingOf(stay).total)}</span>
                )}
              </Link>
            ) : block ? (
              <Link href={blockHref(block)} className="flex flex-col gap-1 rounded-xl p-3 text-left" style={blockStyle(block)}>
                <strong className="text-[14px] text-ink">{isChannelBlock(block) ? "Reserva o cierre en Booking.com" : block.reason}</strong>
                <span className="text-[12.5px] text-ink-muted">
                  {isChannelBlock(block) ? `${fmtDate(block.from)} → ${fmtDate(addDays(block.to, 1))} (salida)` : `${fmtDate(block.from)} → ${fmtDate(block.to)}`}
                  {block.notes ? ` · ${block.notes}` : ""}
                </span>
              </Link>
            ) : (
              <div className="flex flex-col gap-2 rounded-xl border border-dashed border-line-strong px-3 py-3 text-[13px] text-ink-muted">
                <span>{`Disponible esta noche · ${cop(rate.couple)} en pareja${rate.season ? ` (${rate.season.nombre})` : ""}`}</span>
                {day >= today && (
                  <span className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="primary" icon={<PlusIcon size={13} />} onClick={() => onNew({ cabinTypeId: u.cabin.id, unit: u.unit, checkIn: day, checkOut: addDays(day, 1) })}>
                      Reservar
                    </Button>
                    <Link href={paths.bloqueos({ nuevo: 1, domo: u.cabin.id, unidad: u.unit, fecha: day })} className={buttonClass("ghost", "sm")}>
                      <BanIcon size={14} />
                      Bloquear
                    </Link>
                  </span>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
