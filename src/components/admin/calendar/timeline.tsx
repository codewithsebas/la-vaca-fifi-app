"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { BanIcon, ClockIcon, PlusIcon, RefreshIcon } from "@/components/ui/icons";
import { computeQuote, isChannelBlock, nightlyRate } from "@/lib/booking";
import { addDays, cop, fmtDate, fmtFullDate, nightsBetween, parseISO, plural, statusOf } from "@/lib/format";
import { pendingOf } from "@/lib/admin-metrics";
import type { CabinType } from "@/lib/types";
import { useAdmin } from "@/components/admin/context";
import { Popover, useTip } from "@/components/ui/floating";
import { type NewReservationDraft } from "@/components/admin/new-reservation";
import { paths } from "@/components/admin/routes";
import { Button, buttonClass } from "@/components/admin/ui";
import {
  BlockTip,
  type CalView,
  DayName,
  ReservationTip,
  type Unit,
  barStyle,
  blockHref,
  blockStyle,
  blocks,
  kfmt,
  occupies,
  shortLeft,
  units,
  useCalBlocks,
} from "@/components/admin/calendar/shared";

type TimelineProps = {
  days: string[];
  rows: Unit[];
  view: CalView;
  today: string;
  width: number;
  onDay: (d: string) => void;
  onNew: (d: NewReservationDraft) => void;
};
type Line = { kind: "group"; cabin: CabinType; units: Unit[] } | { kind: "unit"; u: Unit };

// Agrupada por tipo de cabaña: cada tipo muestra por día cuántas unidades quedan libres y su tarifa (lo que se necesita
// para vender por WhatsApp); debajo, una fila por unidad con sus reservas, bloqueos y noches de Booking.
// Arrastrar sobre noches libres de una unidad (con el mouse) abre «Nueva reserva» con esa cabaña y esas fechas.
export function Timeline({ days, rows, view, today, width, onDay, onNew }: TimelineProps) {
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

  const free = (u: Unit, d: string) =>
    !data.reservations.some((r) => occupies(r, u) && r.checkIn <= d && d < r.checkOut) && !calBlocks.some((b) => blocks(b, u) && b.from <= d && d <= b.to);
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
        <div role="grid" aria-label="Ocupación por cabaña" aria-rowcount={lines.length + 1} className="grid" style={gridStyle}>
          {/* Encabezado de días */}
          <div role="row" className="contents">
            <div
              role="columnheader"
              className="sticky top-0 left-0 z-30 flex items-end border-r border-b border-line bg-panel px-3 pb-2 text-[12px] font-semibold text-ink-muted"
            >
              Cabaña
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
                  <DayName
                    wd={wd}
                    className={`max-w-full truncate text-[10.5px] font-semibold tracking-[.04em] uppercase ${isToday ? "text-ink" : "text-ink-subtle"}`}
                  />
                  <span
                    className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-[12.5px] font-bold tabular-nums ${isToday ? "bg-ink text-white" : "text-ink"}`}
                  >
                    {dt.getUTCDate()}
                  </span>
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
                  <div
                    role="rowheader"
                    className="sticky left-0 z-10 flex min-w-0 items-center gap-2 border-r border-b border-line bg-canvas px-3"
                    style={{ gridRow }}
                  >
                    <span className="truncate text-[12px] font-bold tracking-[.02em] text-ink">{line.cabin.nombre.replace(/^Cabaña\s+/i, "")}</span>
                    {!line.cabin.activa && <span className="flex-none rounded-full bg-ink/8 px-1.5 text-[10.5px] font-semibold text-ink-muted">Inactivo</span>}
                  </div>
                  {days.map((d, i) => {
                    const f = all.filter((u) => free(u, d)).length;
                    const r = nightlyRate(line.cabin, data.seasons, d);
                    const text = `${line.cabin.nombre} · ${fmtDate(d)}: ${f === 0 ? "sin unidades libres" : `${f} de ${total} libres`} · ${cop(r.couple)} la noche para 2 personas${r.season ? ` (${r.season.nombre})` : ""}`;
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
                        {showRates && f > 0 && (
                          <span className={`hidden text-[10.5px] font-semibold tabular-nums @min-[72px]:inline ${r.season ? "text-info" : "text-ink-subtle"}`}>
                            {kfmt(r.couple)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            }

            const { u } = line;
            return (
              <div key={u.key} role="row" className="contents">
                <div
                  role="rowheader"
                  className="sticky left-0 z-10 flex min-w-0 items-center gap-2 border-r border-b border-line bg-panel py-1 pr-2 pl-5 sm:pl-6"
                  style={{ gridRow }}
                >
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
                          {...tip(
                            () => `${fmtDate(d)} · ${cabinLabel(u.cabin.id, u.unit)} libre. Clic para reservar o bloquear; arrastra para elegir varias noches.`,
                          )}
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
                        {isChannelBlock(b) ? (
                          <RefreshIcon size={13} className="hidden flex-none @min-[48px]:block" />
                        ) : (
                          <BanIcon size={13} className="hidden flex-none @min-[48px]:block" />
                        )}
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
          <p className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-2 rounded-full bg-panel/95 px-4 py-2 text-[13px] font-medium whitespace-nowrap text-ink-muted shadow-panel">
            Sin reservas en este periodo
          </p>
        )}
      </div>
      <p className="hidden border-t border-line bg-canvas/50 px-4 py-2 text-[12px] text-ink-muted pointer-fine:block">
        Arrastra sobre los días libres de una cabaña para crear una reserva con esas fechas, o haz clic en un día libre para reservar o bloquear.
      </p>

      {/* Fecha libre: acciones al tocar o hacer clic (en móvil, hoja inferior) */}
      <Popover open={!!cell} onClose={() => setCell(null)} anchor={cellAnchor} label="Fecha libre">
        {cell && (
          <div className="flex w-[290px] flex-col gap-3 p-4 max-sm:w-full">
            <div>
              <p className="text-[12px] font-bold tracking-[.04em] text-success uppercase">Libre</p>
              <p className="mt-0.5 text-[15px] font-bold text-ink">{cabinLabel(cell.u.cabin.id, cell.u.unit)}</p>
              <p className="text-[13px] text-ink-muted">{fmtFullDate(cell.d)}</p>
              {rate && <p className="mt-1 text-[13px] text-ink">{`Noche para 2: ${cop(rate.couple)}${rate.season ? ` · ${rate.season.nombre}` : ""}`}</p>}
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
              <Link
                href={paths.bloqueos({ nuevo: 1, cabana: cell.u.cabin.id, unidad: cell.u.unit, fecha: cell.d })}
                className={buttonClass("secondary", "md", "justify-start")}
              >
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
