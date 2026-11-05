"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BanIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HomeIcon,
  LoginIcon,
  LogoutIcon,
  MoonIcon,
  PlusIcon,
  WalletIcon,
} from "@/components/ui/icons";
import { ACTIVE_STATUSES } from "@/lib/booking";
import { MONTHS, MS, addDays, fmtDate, fmtFullDate, isISO, monthStart, parseISO, plural } from "@/lib/format";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin, useParam } from "@/components/admin/context";
import { NewReservationDialog, type NewReservationDraft } from "@/components/admin/new-reservation";
import { ReservationModal } from "@/components/admin/reservation-detail";
import { PREF, usePref } from "@/components/admin/prefs";
import { paths } from "@/components/admin/routes";
import { Button, EmptyState, IconButton, ModalPresence, Skeleton, buttonClass } from "@/components/admin/ui";
import {
  CALENDAR_VIEWS,
  type CalView,
  MONTH_TIMELINE_MIN,
  autoView,
  blocks,
  lastOfMonth,
  fridayOf,
  mondayOf,
  monthOptions,
  occupies,
  units,
  useCalBlocks,
  useWidth,
} from "@/components/admin/calendar/shared";
import { Timeline } from "@/components/admin/calendar/timeline";
import { MonthGrid } from "@/components/admin/calendar/month-grid";
import { DayAgenda } from "@/components/admin/calendar/day-agenda";

export function CalendarView() {
  const { data, today } = useAdmin();
  const calBlocks = useCalBlocks();
  const [wrap, width] = useWidth();
  const pref = usePref(PREF.calendarView, "auto");
  const [viewParam, setViewParam] = useParam<CalView | "">("vista", "");
  const [dateParam, setDateParam] = useParam("fecha", "");
  const [filter, setFilter] = useParam("cabana", "");
  // Reserva abierta en el modal (?reserva=CODIGO): se conserva al recargar y se puede compartir.
  const [openCode, setOpenCode] = useParam("reserva", "");
  const [draft, setDraft] = useState<NewReservationDraft | null>(null);
  const rows = useMemo(() => units(data.cabinTypes, filter), [data.cabinTypes, filter]);

  const valid = (v: string): v is CalView => CALENDAR_VIEWS.some((x) => x.value === v);
  // La agenda de un día no se elige en el desplegable: se abre desde un día (cuadrícula del mes, día libre, dashboard).
  const view: CalView = viewParam === "dia" || valid(viewParam) ? viewParam : valid(pref) ? pref : autoView(width);
  const anchor = isISO(dateParam) ? dateParam : today;
  const setAnchor = (d: string) => setDateParam(d === today ? "" : d);
  const narrow = width < 560;
  const monthGrid = view === "mes" && width < MONTH_TIMELINE_MIN;
  const splitMonth = view === "mes" && !monthGrid && !!width;

  const from = view === "mes" ? monthStart(anchor) : view === "semana" || view === "2semanas" ? mondayOf(anchor) : view === "finde" ? fridayOf(anchor) : anchor;
  const to = view === "mes" ? lastOfMonth(from) : addDays(from, { dia: 0, finde: 2, semana: 6, "2semanas": 13 }[view]);
  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }, [from, to]);
  // Quincena visible en el mes partido: la de la fecha elegida (al cambiar de fecha o de mes, vuelve a ella).
  const halfOf = (d: string) => (view === "mes" && days[15] && d >= days[15] ? 1 : 0);
  const [half, setHalf] = useState(() => halfOf(anchor));
  const [halfFor, setHalfFor] = useState(anchor);
  if (halfFor !== anchor) {
    setHalfFor(anchor);
    setHalf(halfOf(anchor));
  }

  const stepDays = { dia: 1, finde: 7, semana: 7, "2semanas": 14, mes: 0 }[view];
  const step = (dir: number) => setAnchor(view === "mes" ? monthStart(addDays(monthStart(anchor), dir > 0 ? 32 : -1)) : addDays(anchor, dir * stepDays));
  const [prevLabel, nextLabel] = {
    dia: ["Día anterior", "Día siguiente"],
    finde: ["Fin de semana anterior", "Fin de semana siguiente"],
    semana: ["Semana anterior", "Semana siguiente"],
    "2semanas": ["2 semanas anteriores", "2 semanas siguientes"],
    mes: ["Mes anterior", "Mes siguiente"],
  }[view];
  const range = (a: string, b: string) => {
    const x = parseISO(a);
    const y = parseISO(b);
    return `${x.getUTCDate()} ${MS[x.getUTCMonth()]} – ${y.getUTCDate()} ${MS[y.getUTCMonth()]} ${y.getUTCFullYear()}`;
  };
  const title =
    view === "mes"
      ? `${MONTHS[parseISO(from).getUTCMonth()]} ${parseISO(from).getUTCFullYear()}`
      : view === "dia"
        ? narrow
          ? fmtDate(anchor, true)
          : fmtFullDate(anchor)
        : range(from, to);

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
      if (data.reservations.some((r) => occupies(r, u) && ACTIVE_STATUSES.concat(["completed"]).includes(r.status) && r.checkIn <= d && d < r.checkOut))
        busyNights++;
      else if (b) blockedNights++;
    }
  const capacity = rows.length * days.length - blockedNights;
  const occupancy = capacity ? Math.round((busyNights / capacity) * 100) : 0;

  const cabinOptions = [
    { value: "", label: "Todas las cabañas" },
    ...data.cabinTypes.filter((c) => c.units > 0).map((c) => ({ value: c.id, label: c.nombre, description: plural(c.units, "unidad", "unidades") })),
  ];
  const months = useMemo(() => monthOptions(today, anchor), [today, anchor]);
  // En el celular el mes es una cuadrícula, sin quincenas: deslizar lleva al mes anterior o al siguiente.
  const gridTouch = useRef<{ x: number; y: number } | null>(null);
  const showDay = (d: string) => {
    setAnchor(d);
    setViewParam("dia");
  };

  return (
    <div ref={wrap} className="flex flex-col gap-3">
      {/* Una línea en pantallas anchas: el periodo a la izquierda y, pegados a su derecha, el mes, la vista,
          las cabañas y «Nueva reserva». En el celular, los controles en una cuadrícula de dos columnas. */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 id="ad-title" tabIndex={-1} className="sr-only">
            Calendario
          </h1>
          <div className="flex flex-none items-center gap-0.5 rounded-full border border-line-strong p-0.5">
            <IconButton label={prevLabel} size="sm" onClick={() => step(-1)}>
              <ChevronLeftIcon size={17} />
            </IconButton>
            <Button size="sm" variant="ghost" onClick={() => setAnchor(today)} disabled={today >= from && today <= to} className="px-3">
              Hoy
            </Button>
            <IconButton label={nextLabel} size="sm" onClick={() => step(1)}>
              <ChevronRightIcon size={17} />
            </IconButton>
          </div>
          <p
            aria-live="polite"
            className="truncate text-[clamp(1.3rem,2.1vw,1.75rem)] leading-tight font-bold tracking-[-0.03em] text-ink first-letter:uppercase"
          >
            {title}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 items-center gap-2 sm:ml-auto sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
          <div className="min-w-0 sm:w-[206px]">
            <label htmlFor="cal-mes" className="sr-only">
              Mes del calendario
            </label>
            {/* Lleva al mes elegido sin cambiar la vista; el mes actual vuelve a hoy. */}
            <Combobox
              id="cal-mes"
              value={monthStart(anchor)}
              onChange={(m) => setAnchor(m === monthStart(today) ? today : m)}
              options={months}
              searchPlaceholder="Buscar mes…"
              selectedFirst
              icon={<CalendarIcon size={15} className="text-ink-muted" />}
              className="h-10 min-h-10 text-[13.5px]"
            />
          </div>
          <div className="min-w-0 sm:w-[164px]">
            <label htmlFor="cal-vista" className="sr-only">
              Vista del calendario
            </label>
            <Combobox
              id="cal-vista"
              value={view}
              onChange={(v) => setViewParam(v as CalView)}
              options={view === "dia" ? [{ value: "dia", label: "Día" }, ...CALENDAR_VIEWS] : CALENDAR_VIEWS}
              searchable={false}
              icon={<CalendarIcon size={15} className="text-ink-muted" />}
              className="h-10 min-h-10 text-[13.5px]"
            />
          </div>
          <div className="min-w-0 sm:w-[206px]">
            <Combobox
              value={filter}
              onChange={setFilter}
              options={cabinOptions}
              icon={<HomeIcon size={15} className="text-ink-muted" />}
              className="h-10 min-h-10 text-[13.5px]"
            />
          </div>
          <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setDraft({ cabinTypeId: filter || undefined })}>
            Nueva reserva
          </Button>
        </div>
      </header>

      {!rows.length ? (
        <div className="rounded-[22px] bg-panel p-4">
          <EmptyState
            icon={<HomeIcon size={18} />}
            title="No hay cabañas para mostrar"
            text="Crea una cabaña (o asígnale unidades) para ver su ocupación aquí."
            action={
              <Link href={paths.cabanas} className={buttonClass()}>
                Ir a Cabañas
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6">
            <ul
              aria-label="Resumen del periodo"
              className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 text-[12.5px] whitespace-nowrap sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
            >
              <Chip label="Ocupación" value={`${occupancy} %`} meter={occupancy} />
              <Chip label={view === "dia" ? "Llegan" : "Llegadas"} value={arrivals} icon={<LoginIcon size={13} />} />
              <Chip label={view === "dia" ? "Salen" : "Salidas"} value={departures} icon={<LogoutIcon size={13} />} />
              <Chip label="Por cobrar" value={unpaid} icon={<WalletIcon size={13} />} tone={unpaid ? "warning" : undefined} />
              <Chip label="Noches libres" value={Math.max(0, capacity - busyNights)} icon={<MoonIcon size={13} />} />
              {blockedNights > 0 && <Chip label="Bloqueadas" value={blockedNights} icon={<BanIcon size={13} />} />}
            </ul>
            {splitMonth && <HalfSwitch days={days} active={half} onChange={setHalf} />}
          </div>
          <div key={`${view}-${from}-${filter}-${monthGrid}`} className="motion-safe:animate-fade-in">
            {!width ? (
              <Skeleton className="min-h-[360px]" />
            ) : view === "dia" ? (
              <DayAgenda day={anchor} rows={rows} onNew={setDraft} onOpen={setOpenCode} />
            ) : monthGrid ? (
              <div
                className="touch-pan-y"
                onTouchStart={(e) => (gridTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
                onTouchEnd={(e) => {
                  const t = gridTouch.current;
                  gridTouch.current = null;
                  if (!t) return;
                  const dx = e.changedTouches[0].clientX - t.x;
                  if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(e.changedTouches[0].clientY - t.y)) step(dx < 0 ? 1 : -1);
                }}
              >
                <MonthGrid month={from} rows={rows} today={today} onPick={showDay} />
              </div>
            ) : view === "mes" ? (
              <MonthHalves
                days={days}
                active={half}
                onActive={setHalf}
                render={(part) => <Timeline days={part} rows={rows} today={today} width={width} onDay={showDay} onNew={setDraft} onOpen={setOpenCode} />}
              />
            ) : (
              <Timeline days={days} rows={rows} today={today} width={width} onDay={showDay} onNew={setDraft} onOpen={setOpenCode} />
            )}
          </div>
        </>
      )}
      <ModalPresence>{draft && <NewReservationDialog draft={draft} onClose={() => setDraft(null)} />}</ModalPresence>
      <ModalPresence>{openCode && <ReservationModal key={openCode} code={openCode} onClose={() => setOpenCode("")} />}</ModalPresence>
    </div>
  );
}

function Chip({ label, value, icon, meter, tone }: { label: string; value: ReactNode; icon?: ReactNode; meter?: number; tone?: "warning" }) {
  return (
    <li
      className={`inline-flex flex-none items-center gap-1.5 rounded-full border px-2.5 py-1 ${tone === "warning" ? "border-warning/30 bg-warning-soft text-warning" : "border-transparent bg-panel text-ink-muted"}`}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {label}
      {meter !== undefined && (
        <span aria-hidden="true" className="h-1.5 w-10 overflow-hidden rounded-full bg-ink/8">
          <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.min(100, meter)}%` }} />
        </span>
      )}
      <strong className={`font-bold tabular-nums ${tone === "warning" ? "" : "text-ink"}`}>{value}</strong>
    </li>
  );
}

/* ───────────── Línea de tiempo (fin de semana, semanas y mes en pantallas anchas) ───────────── */

/* ───────────── Mes en quincenas ───────────── */

// "1 – 15 nov": rango de una quincena.
const halfLabel = (p: string[]) => {
  const a = parseISO(p[0]);
  return `${a.getUTCDate()} – ${parseISO(p[p.length - 1]).getUTCDate()} ${MS[a.getUTCMonth()]}`;
};
const halvesOf = (days: string[]) => [days.slice(0, 15), days.slice(15)];

// Separación entre las dos quincenas (px) y lo que hay que arrastrar para pasar a la otra.
const HALF_GAP = 12;
const SWIPE_MIN = 48;

// El mes en dos quincenas lado a lado (1 al 15 y 16 a fin de mes), una a la vez y siempre a todo el ancho. Se pasa de una a
// otra con un desplazamiento suave: con el control de la fila de resumen (HalfSwitch), un gesto horizontal (trackpad,
// Shift + rueda) o deslizando el dedo, que la quincena sigue. Va con transform y no con desplazamiento nativo: un contenedor
// con scroll dejaría de seguir a la página y los días ya no quedarían fijos arriba.
function MonthHalves({
  days,
  active,
  onActive,
  render,
}: {
  days: string[];
  active: number;
  onActive: (k: number) => void;
  render: (part: string[]) => ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; axis: "x" | "y" | null; dx: number } | null>(null);
  const parts = halvesOf(days);
  const at = (k: number, dx = 0) => `translateX(calc(${-k * 100}% - ${k * HALF_GAP}px + ${dx}px))`;

  const onActiveRef = useRef(onActive);
  useEffect(() => {
    onActiveRef.current = onActive;
  });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let lock = 0;
    const onWheel = (e: WheelEvent) => {
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(e.shiftKey ? 0 : e.deltaY)) return;
      e.preventDefault();
      if (Date.now() < lock) return;
      lock = Date.now() + 600;
      onActiveRef.current(dx > 0 ? 1 : 0);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // El alto es el de la quincena visible: cada una mide lo que ocupan sus filas, y crece o se encoge con ellas.
  useLayoutEffect(() => {
    const el = track.current?.children[active] as HTMLElement | undefined;
    if (!el) return;
    const fit = () => {
      if (box.current) box.current.style.height = `${el.offsetHeight}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  // Al soltar, la quincena vuelve a su sitio con la transición (y React ya no la toca si no cambió `active`).
  const release = () => {
    const t = touch.current;
    touch.current = null;
    const el = track.current;
    if (!t || !el) return;
    el.style.transition = "";
    el.style.transform = at(active);
    if (t.axis === "x" && Math.abs(t.dx) > SWIPE_MIN) onActive(t.dx < 0 ? 1 : 0);
  };

  return (
    <div
      ref={box}
      className="touch-pan-y overflow-clip motion-safe:transition-[height] motion-safe:duration-300 motion-safe:ease-out"
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: null, dx: 0 })}
      onTouchMove={(e) => {
        const t = touch.current;
        const el = track.current;
        if (!t || !el) return;
        const dx = e.touches[0].clientX - t.x;
        const dy = e.touches[0].clientY - t.y;
        if (!t.axis && Math.abs(dx) + Math.abs(dy) > 8) t.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (t.axis !== "x") return;
        t.dx = dx;
        // Hacia donde no hay otra quincena, opone resistencia.
        const edge = (active === 0 && dx > 0) || (active === 1 && dx < 0);
        el.style.transition = "none";
        el.style.transform = at(active, edge ? dx / 4 : dx);
      }}
      onTouchEnd={release}
      onTouchCancel={release}
    >
      <div
        ref={track}
        className="flex items-start motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out"
        style={{ gap: HALF_GAP, transform: at(active) }}
      >
        {parts.map((p, k) => (
          <div key={p[0]} inert={k !== active} className="w-full min-w-0 flex-none">
            {render(p)}
          </div>
        ))}
      </div>
    </div>
  );
}

// Control de quincena en la fila de resumen, fuera de la tabla: ‹ 1 – 15 nov ›.
function HalfSwitch({ days, active, onChange }: { days: string[]; active: number; onChange: (k: number) => void }) {
  const parts = halvesOf(days);
  return (
    <div role="group" aria-label="Quincena" className="flex flex-none items-center gap-0.5 rounded-full border border-line-strong p-0.5">
      <IconButton label={`Primera quincena · ${halfLabel(parts[0])}`} size="sm" disabled={active === 0} onClick={() => onChange(0)}>
        <ChevronLeftIcon size={16} />
      </IconButton>
      <span aria-live="polite" className="min-w-[96px] px-1 text-center text-[13px] font-semibold text-ink tabular-nums">
        {halfLabel(parts[active])}
      </span>
      <IconButton label={`Segunda quincena · ${halfLabel(parts[1])}`} size="sm" disabled={active === 1} onClick={() => onChange(1)}>
        <ChevronRightIcon size={16} />
      </IconButton>
    </div>
  );
}
