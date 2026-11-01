"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { BanIcon, ChevronLeftIcon, ChevronRightIcon, HomeIcon, LoginIcon, LogoutIcon, MoonIcon, PlusIcon, WalletIcon } from "@/components/ui/icons";
import { ACTIVE_STATUSES } from "@/lib/booking";
import { MONTHS, MS, addDays, fmtDate, fmtFullDate, isISO, monthStart, parseISO, plural } from "@/lib/format";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin, useParam } from "@/components/admin/context";
import { DatePicker } from "@/components/admin/date-picker";
import { NewReservationDialog, type NewReservationDraft } from "@/components/admin/new-reservation";
import { PREF, usePref } from "@/components/admin/prefs";
import { paths } from "@/components/admin/routes";
import { Button, EmptyState, IconButton, Segmented, Skeleton, buttonClass } from "@/components/admin/ui";
import {
  BLOCK_BG,
  CALENDAR_VIEWS,
  type CalView,
  MONTH_TIMELINE_MIN,
  autoView,
  barStyle,
  blocks,
  lastOfMonth,
  mondayOf,
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
        {/* En móvil: fecha y cabaña lado a lado, la vista debajo y «Nueva reserva» a todo el ancho; así la cuadrícula empieza más arriba. */}
        <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <div className="min-w-0 sm:w-[168px]">
            <DatePicker value={anchor} onChange={(d) => d && setAnchor(d)} clearable={false} placeholder="Ir a fecha" className="h-8 min-h-8 text-[13px]" />
          </div>
          <div className="min-w-0 sm:w-[190px]">
            <Combobox
              value={filter}
              onChange={setFilter}
              options={cabinOptions}
              icon={<HomeIcon size={15} className="text-ink-muted" />}
              className="h-8 min-h-8 text-[13px]"
            />
          </div>
          <Segmented
            className="col-span-2 w-full justify-self-stretch sm:w-auto [&>*]:flex-1 [&>*]:justify-center sm:[&>*]:flex-none"
            label="Vista del calendario"
            value={view}
            onChange={(v) => setViewParam(v)}
            options={CALENDAR_VIEWS}
          />
          <Button
            variant="primary"
            size="sm"
            icon={<PlusIcon size={14} />}
            onClick={() => setDraft({ cabinTypeId: filter || undefined })}
            className="col-span-2 w-full sm:w-auto"
          >
            Nueva reserva
          </Button>
        </div>
      </header>

      {!rows.length ? (
        <div className="rounded-2xl border border-line bg-panel p-4 shadow-panel">
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
    <li
      className={`inline-flex flex-none items-center gap-1.5 rounded-full border px-2.5 py-1 ${tone === "warning" ? "border-warning/30 bg-warning-soft text-warning" : "border-line bg-panel text-ink-muted"}`}
    >
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
];

function Legend() {
  return (
    <ul
      aria-label="Leyenda"
      className="-mx-4 no-scrollbar flex gap-x-3 gap-y-1 overflow-x-auto px-4 text-[12px] text-ink-muted sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
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
