"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { BanIcon, BathIcon, ChevronDownIcon, PlusIcon, RefreshIcon } from "@/components/ui/icons";
import { computeQuote, isChannelBlock, nightlyRate } from "@/lib/booking";
import { addDays, cop, fmtDate, fmtFullDate, nightsBetween, parseISO, plural, statusOf } from "@/lib/format";
import type { CabinType } from "@/lib/types";
import { useAdmin, useParam } from "@/components/admin/context";
import { Popover, useTip } from "@/components/ui/floating";
import { type NewReservationDraft } from "@/components/admin/new-reservation";
import { bathroomIssues } from "@/components/admin/bathrooms";
import { paths } from "@/components/admin/routes";
import { Button, buttonClass } from "@/components/admin/ui";
import {
  BlockTip,
  CalendarLegend,
  DayName,
  ReservationTip,
  type Unit,
  barStyle,
  blockHref,
  blockStyle,
  blocks,
  kfmt,
  occupies,
  openInModal,
  units,
  useCalBlocks,
} from "@/components/admin/calendar/shared";

type TimelineProps = {
  days: string[];
  rows: Unit[];
  today: string;
  width: number;
  onDay: (d: string) => void;
  onNew: (d: NewReservationDraft) => void;
  onOpen: (code: string) => void;
  footer?: boolean; // leyenda y ayuda al pie (la primera quincena del mes no la lleva)
  className?: string;
};
// "idle": las unidades de un tipo sin reservas ni bloqueos en el periodo. Cerradas, quedan en esa sola línea; abiertas,
// se muestran todas y la línea queda al final del tipo para volver a cerrarlas.
type Line = { kind: "group"; cabin: CabinType; units: Unit[] } | { kind: "unit"; u: Unit } | { kind: "idle"; cabin: CabinType; units: Unit[]; open: boolean };

// Agrupada por tipo de cabaña: cada tipo muestra por día cuántas unidades quedan libres y su tarifa (lo que se necesita
// para vender por WhatsApp); debajo, una fila por unidad con sus reservas, bloqueos y noches de Booking. Por defecto solo
// las unidades con algo en el periodo; las demás quedan en una línea que las despliega, tipo por tipo, como un acordeón
// (?unidades=doble,familiar: los tipos abiertos).
// Arrastrar sobre noches libres de una unidad (con el mouse) abre «Nueva reserva» con esa cabaña y esas fechas.
export function Timeline({ days, rows, today, width, onDay, onNew, onOpen, footer = true, className = "" }: TimelineProps) {
  const { data, cabinLabel } = useAdmin();
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
  const label = compact ? 112 : 184;
  // Ancho mínimo de media jornada según cuántos días se ven (las columnas crecen para llenar el ancho): pocos días, más
  // aire; un mes completo, apretado. Desde 22 px cabe la tarifa.
  const half = n <= 3 ? (compact ? 22 : 48) : n <= 7 ? (compact ? 14 : 30) : n <= 16 ? (compact ? 12 : width < 900 ? 14 : 22) : 10;
  const showRates = half >= 22;
  // Si el periodo cabe, el desplazamiento es el de la página y los días quedan fijos bajo el encabezado del panel. Solo si
  // no cabe (dos semanas en el celular) la tabla se desplaza a lo ancho; ahí los días no pueden seguir a la página.
  const overflows = label + n * 2 * half > width;
  const stick = overflows ? "top-0" : "top-16 lg:top-[76px]";

  const [openParam, setOpenParam] = useParam("unidades", "");
  const opened = useMemo(() => new Set(openParam.split(",").filter(Boolean)), [openParam]);
  const toggleGroup = (id: string) => {
    const next = new Set(opened);
    if (!next.delete(id)) next.add(id);
    setOpenParam([...next].join(","));
  };
  const visible = data.reservations.filter((r) => r.checkIn <= to && r.checkOut > from && rows.some((u) => occupies(r, u)));
  const lines = useMemo<Line[]>(() => {
    const busy = (u: Unit) => visible.some((r) => occupies(r, u)) || calBlocks.some((b) => blocks(b, u) && b.from <= to && b.to >= from);
    const out: Line[] = [];
    for (const cabin of [...new Map(rows.map((u) => [u.cabin.id, u.cabin])).values()]) {
      const all = rows.filter((x) => x.cabin.id === cabin.id);
      const idle = all.filter((u) => !busy(u));
      const open = opened.has(cabin.id);
      const shown = open ? all : all.filter(busy);
      out.push({ kind: "group", cabin, units: all }, ...shown.map((u) => ({ kind: "unit" as const, u })));
      if (idle.length) out.push({ kind: "idle", cabin, units: idle, open });
    }
    return out;
  }, [rows, visible, calBlocks, opened, from, to]);

  // Abre desplazado hasta hoy si el periodo no cabe en pantalla.
  useEffect(() => {
    const el = scroller.current;
    if (!el || today < from || today > to) return;
    el.scrollLeft = Math.max(0, idx(today) * half * 2 - el.clientWidth / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from]);

  const free = (u: Unit, d: string) =>
    !data.reservations.some((r) => occupies(r, u) && r.checkIn <= d && d < r.checkOut) && !calBlocks.some((b) => blocks(b, u) && b.from <= d && d <= b.to);

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

  const rowHeight = compact ? 48 : 56;
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `${label}px repeat(${n * 2}, minmax(${half}px, 1fr))`,
    gridTemplateRows: `auto ${lines.map((l) => (l.kind === "group" ? "38px" : l.kind === "idle" ? "36px" : `${rowHeight}px`)).join(" ")}`,
    minWidth: label + n * 2 * half,
  };
  const rate = cell ? nightlyRate(cell.u.cabin, data.seasons, cell.d) : null;

  return (
    <div className={`isolate flex flex-col overflow-clip rounded-[22px] bg-panel ${className}`}>
      <div ref={scroller} className={`relative ${overflows ? "overflow-x-auto overscroll-x-contain" : ""} ${sel ? "cursor-col-resize select-none" : ""}`}>
        <div role="grid" aria-label="Ocupación por cabaña" aria-rowcount={lines.length + 1} className="grid" style={gridStyle}>
          {/* Encabezado de días */}
          <div role="row" className="contents">
            <div
              role="columnheader"
              className={`sticky left-0 z-30 flex items-center border-r border-b border-line bg-panel px-3 text-[13px] font-semibold text-ink-muted ${stick}`}
            >
              Cabañas
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
                  className={`@container sticky z-20 border-b border-line px-0.5 py-1.5 ${stick} ${wd === 0 || wd === 6 ? "bg-canvas" : "bg-panel"} ${i ? (firstOfMonth ? "border-l-2 border-l-line-strong" : "border-l border-l-line/70") : ""}`}
                  style={{ gridColumn: `${2 + i * 2} / span 2` }}
                >
                  {/* El número al lado del día; en columnas muy angostas no cabe y va debajo. */}
                  <div className="flex flex-col items-center justify-center gap-0.5 @min-[44px]:flex-row @min-[44px]:gap-1.5">
                    <DayName
                      inline
                      wd={wd}
                      className={`max-w-full truncate text-[11.5px] font-semibold tracking-[.04em] uppercase ${isToday ? "text-ink" : "text-ink-subtle"}`}
                    />
                    <span
                      className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-[13.5px] font-bold tabular-nums ${isToday ? "bg-ink text-paper" : "text-ink"}`}
                    >
                      {dt.getUTCDate()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {lines.map((line, li) => {
            const gridRow = 2 + li;
            if (line.kind === "idle") {
              const nums = line.units.map((u) => u.unit);
              const which =
                nums.length === 1
                  ? `${nums[0]}`
                  : nums.length > 2 && nums.every((x, k) => !k || x === nums[k - 1] + 1)
                    ? `${nums[0]} a ${nums[nums.length - 1]}`
                    : nums.join(", ");
              return (
                <div key={`idle-${line.cabin.id}`} role="row" className="contents">
                  <button
                    type="button"
                    aria-expanded={line.open}
                    onClick={() => toggleGroup(line.cabin.id)}
                    className="sticky left-0 z-10 flex min-w-0 items-center gap-2 border-b border-line bg-panel py-1 pr-2 pl-5 text-left text-[12px] font-medium text-ink-muted transition-colors hover:text-ink sm:pl-6"
                    style={{ gridRow, gridColumn: `1 / span ${1 + n * 2}`, width: "fit-content" }}
                  >
                    <ChevronDownIcon size={14} className={`flex-none transition-transform duration-200 ${line.open ? "rotate-180" : ""}`} />
                    <span className="truncate">
                      {line.open ? "Ocultar" : "Mostrar"} {plural(line.units.length, "unidad", "unidades")} sin reservas ({which})
                    </span>
                  </button>
                  <div aria-hidden="true" className="border-b border-line" style={{ gridRow, gridColumn: `1 / span ${1 + n * 2}` }} />
                </div>
              );
            }
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
                    <span className="truncate text-[13.5px] font-bold tracking-[.02em] text-ink">{line.cabin.nombre.replace(/^Cabaña\s+/i, "")}</span>
                    {!line.cabin.activa && <span className="flex-none rounded-full bg-ink/8 px-1.5 text-[10.5px] font-semibold text-ink-muted">Inactivo</span>}
                  </div>
                  {days.map((d, i) => {
                    const f = all.filter((u) => free(u, d)).length;
                    const r = nightlyRate(line.cabin, data.seasons, d);
                    const text = `${line.cabin.nombre} · ${fmtDate(d)}: ${f === 0 ? "sin unidades libres" : `${f} de ${total} libres`} · ${cop(r.couple)} la noche para ${r.fromGuests} personas${r.season ? ` (${r.season.nombre})` : ""}`;
                    const tone = f === 0 ? "text-error" : f < total ? "text-warning" : "text-ink-subtle/70";
                    return (
                      <div
                        key={d}
                        role="gridcell"
                        aria-label={text}
                        {...tip(() => text)}
                        className={`@container flex items-center justify-center gap-1 border-b border-line bg-canvas px-0.5 ${i ? "border-l border-l-line/70" : ""} ${d === today ? "bg-pink/30" : ""}`}
                        style={{ gridRow, gridColumn: `${2 + i * 2} / span 2` }}
                      >
                        <span className={`text-[13px] font-bold tabular-nums ${tone}`}>
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
                          <span className={`hidden text-[11.5px] font-semibold tabular-nums @min-[72px]:inline ${r.season ? "text-info" : "text-ink-subtle"}`}>
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
            const bath = bathroomIssues(data, u.cabin.id, u.unit, from, to);
            return (
              <div key={u.key} role="row" className="contents">
                <div
                  role="rowheader"
                  className="sticky left-0 z-10 flex min-w-0 items-center gap-2 border-r border-b border-line bg-panel py-1 pr-2 pl-5 sm:pl-6"
                  style={{ gridRow }}
                >
                  <span aria-hidden="true" className="h-5 w-[3px] flex-none rounded-full bg-line-strong" />
                  <span className="truncate text-[13px] font-semibold text-ink sm:text-[14px]">{compact ? u.short : u.label}</span>
                  {bath.length > 0 && (
                    <span
                      tabIndex={0}
                      role="img"
                      aria-label={`Aviso de baño: ${bath.map((x) => x.text).join("; ")}`}
                      {...tip(() => (
                        <span className="flex flex-col gap-1">
                          <strong className="text-[13px]">Aviso de baño</strong>
                          {bath.map((x, k) => (
                            <span key={k}>{x.text}</span>
                          ))}
                          <span className="opacity-70">La cabaña sigue disponible.</span>
                        </span>
                      ))}
                      className="ml-auto grid size-6 flex-none place-items-center rounded-full bg-yellow text-ink ring-2 ring-panel"
                    >
                      <BathIcon size={13} />
                    </span>
                  )}
                </div>
                {days.map((d, i) => {
                  const wd = parseISO(d).getUTCDay();
                  const isFree = free(u, d);
                  return (
                    <div
                      key={d}
                      role="gridcell"
                      aria-label={isFree ? `${fmtDate(d)} libre` : undefined}
                      className={`group relative border-b border-line ${i ? "border-l border-l-line/60" : ""} ${d === today ? "bg-pink/15" : wd === 0 || wd === 6 ? "bg-canvas/60" : ""}`}
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
                          className="absolute inset-1 grid place-items-center rounded-[10px] text-ink-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-success-soft hover:text-success focus-visible:opacity-100 pointer-coarse:active:bg-ink/6 pointer-coarse:active:opacity-100"
                        >
                          <PlusIcon size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Bloqueos */}
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
                        className={`@container relative z-1 my-auto flex h-[30px] min-w-0 items-center gap-1.5 overflow-hidden px-2.5 text-left text-[12px] font-semibold text-ink-muted transition-[filter,box-shadow] duration-150 hover:shadow-panel hover:brightness-95 ${
                          cut.l ? "rounded-l-none" : "ml-0.5 rounded-l-full"
                        } ${cut.r ? "rounded-r-none" : "mr-0.5 rounded-r-full"}`}
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

                {/* Bloqueos de los baños de esta unidad: franja al pie de la fila; la cabaña se sigue pudiendo reservar. */}
                {(data.bathroomBlocks ?? []).map((k) => {
                  const b = (data.bathrooms ?? []).find((x) => x.id === k.bathroomId);
                  if (!b || b.cabinTypeId !== u.cabin.id || (b.unit !== null && b.unit !== u.unit) || k.to < from || k.from > to) return null;
                  const start = k.from < from ? 2 : 2 + idx(k.from) * 2;
                  const end = k.to > to ? 2 + n * 2 : 2 + (idx(k.to) + 1) * 2;
                  const text = `${b.name}: bloqueado del ${fmtDate(k.from)} al ${fmtDate(k.to)} · ${k.notes ? `${k.reason}, ${k.notes}` : k.reason}`;
                  return (
                    <span
                      key={`bath-${k.id}`}
                      role="img"
                      aria-label={text}
                      {...tip(() => (
                        <span className="flex flex-col gap-1">
                          <strong className="text-[13px]">Aviso de baño</strong>
                          <span>{text}</span>
                          <span className="opacity-70">La cabaña sigue disponible.</span>
                        </span>
                      ))}
                      className="relative z-3 mx-1 mb-[3px] h-[5px] self-end rounded-full bg-[repeating-linear-gradient(90deg,var(--color-yellow-deep)_0_7px,transparent_7px_10px)]"
                      style={{ gridRow, gridColumn: `${start} / ${end}` }}
                    />
                  );
                })}

                {/* Reservas: de la tarde de llegada a la mañana de salida */}
                {visible
                  .filter((r) => occupies(r, u))
                  .map((r) => {
                    const start = r.checkIn < from ? 2 : 3 + idx(r.checkIn) * 2;
                    const end = r.checkOut > to ? 2 + n * 2 : 3 + idx(r.checkOut) * 2;
                    const cut = { l: r.checkIn < from, r: r.checkOut > to };
                    return (
                      <Link
                        key={r.code}
                        href={paths.reserva(r.code)}
                        aria-label={`${r.guest.fullName}, ${r.code}, ${statusOf(r.status).label}, ${fmtDate(r.checkIn)} a ${fmtDate(r.checkOut)}`}
                        onClick={openInModal(onOpen, r.code)}
                        {...tip(() => <ReservationTip r={r} cabin={cabinLabel(r.cabinTypeId, r.unit)} />)}
                        className={`relative z-2 my-auto flex h-[30px] min-w-0 items-center overflow-hidden border border-ink px-2.5 text-left text-[13px] leading-none font-bold text-ink transition-[filter,box-shadow,transform] duration-150 hover:z-3 hover:shadow-panel hover:brightness-[.97] motion-safe:hover:-translate-y-px ${
                          cut.l ? "rounded-l-none border-l-0" : "rounded-l-full"
                        } ${cut.r ? "rounded-r-none border-r-0" : "rounded-r-full"}`}
                        style={{ gridRow, gridColumn: `${start} / ${end}`, ...barStyle(r), boxShadow: undefined }}
                      >
                        {/* Nombre y apellidos; si no caben, con puntos suspensivos. El nombre completo está en el tooltip. */}
                        <span className="truncate">{r.guest.fullName}</span>
                      </Link>
                    );
                  })}

                {/* Selección al arrastrar: noches elegidas y lo que costarían (2 personas). */}
                {sel?.u.key === u.key &&
                  (() => {
                    const [lo, hi] = sel.a < sel.b ? [sel.a, sel.b] : [sel.b, sel.a];
                    const nights = nightsBetween(lo, hi) + 1;
                    const q = computeQuote(u.cabin, lo, addDays(hi, 1), 2, data.seasons, data.site.settings.depositPct);
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
      {/* Leyenda y ayuda en una sola línea; si no caben, la ayuda se recorta (completa al pasar el mouse). */}
      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 border-t border-line bg-canvas/50 px-4 py-2 xl:flex-nowrap">
          <div className="flex-none">
            <CalendarLegend />
          </div>
          <p
            title="Arrastra sobre los días libres de una cabaña para crear una reserva con esas fechas, o haz clic en un día libre para reservar o bloquear."
            className="hidden min-w-0 truncate text-[12px] text-ink-subtle pointer-fine:block"
          >
            Arrastra sobre días libres para crear una reserva · clic en un día libre para reservar o bloquear
          </p>
        </div>
      )}

      {/* Fecha libre: acciones al tocar o hacer clic (en móvil, hoja inferior) */}
      <Popover open={!!cell} onClose={() => setCell(null)} anchor={cellAnchor} label="Fecha libre">
        {cell && (
          <div className="flex w-[290px] flex-col gap-3 p-4 max-sm:w-full">
            <div>
              <p className="text-[12px] font-bold tracking-[.04em] text-success uppercase">Libre</p>
              <p className="mt-0.5 text-[15px] font-bold text-ink">{cabinLabel(cell.u.cabin.id, cell.u.unit)}</p>
              <p className="text-[13px] text-ink-muted">{fmtFullDate(cell.d)}</p>
              {rate && (
                <p className="mt-1 text-[13px] text-ink">{`Noche para ${rate.fromGuests}: ${cop(rate.couple)}${rate.season ? ` · ${rate.season.nombre}` : ""}`}</p>
              )}
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
