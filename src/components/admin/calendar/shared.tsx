"use client";

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { MONTHS, WD, WD_FULL, WD_MIN, addDays, cop, countdown, fmtDate, nightsBetween, parseISO, plural, statusOf } from "@/lib/format";
import { cabinName, channelBlocks, isChannelBlock } from "@/lib/booking";
import { pendingOf } from "@/lib/admin-metrics";
import type { Block, CabinType, Reservation } from "@/lib/types";
import { useAdmin } from "@/components/admin/context";
import { paths } from "@/components/admin/routes";

// finde: viernes a domingo (las noches que más se venden). 2semanas: de lunes a domingo de la semana siguiente.
export type CalView = "dia" | "finde" | "semana" | "2semanas" | "mes";

export const CALENDAR_VIEWS: { value: CalView; label: string }[] = [
  { value: "finde", label: "Fin de semana" },
  { value: "semana", label: "Semana" },
  { value: "2semanas", label: "2 semanas" },
  { value: "mes", label: "Mes" },
];

// Vista inicial según el ancho disponible del calendario (no el de la ventana): semana en celular y tableta, mes en escritorio.
export const autoView = (w: number): CalView => (w < 900 ? "semana" : "mes");
// Por debajo de este ancho (el celular) el mes se muestra como cuadrícula mensual: una quincena no cabe legible.
export const MONTH_TIMELINE_MIN = 640;

export const lastOfMonth = (m: string) => {
  const d = parseISO(m);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};
// Meses del desplegable: un año atrás y dos adelante (más el de la fecha abierta, si queda fuera).
export function monthOptions(today: string, anchor: string) {
  const t = parseISO(today);
  const iso = (i: number) => new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + i, 1)).toISOString().slice(0, 10);
  const current = iso(0);
  const list = Array.from({ length: 37 }, (_, i) => iso(i - 12));
  const open = `${anchor.slice(0, 7)}-01`;
  if (!list.includes(open)) list.push(open);
  return list.sort().map((m) => {
    const d = parseISO(m);
    const name = MONTHS[d.getUTCMonth()];
    return {
      value: m,
      label: `${name[0].toUpperCase()}${name.slice(1)} ${d.getUTCFullYear()}`,
      description: m === current ? "Mes actual" : undefined,
    };
  });
}
export const mondayOf = (d: string) => addDays(d, -((parseISO(d).getUTCDay() + 6) % 7));
// Viernes del fin de semana de una fecha: el de esa semana si ya es viernes, sábado o domingo; si no, el que viene.
export const fridayOf = (d: string) => {
  const wd = parseISO(d).getUTCDay();
  return addDays(d, wd === 0 ? -2 : wd === 6 ? -1 : 5 - wd);
};
export const BLOCK_BG =
  "repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-status-block) 32%, var(--color-panel)) 0 5px, color-mix(in srgb, var(--color-status-block) 14%, var(--color-panel)) 5px 10px)";
// Noches ocupadas en Booking.com: azul de Booking. No se editan aquí (se gestionan en el extranet de Booking).
export const BOOKING_STYLE: CSSProperties = {
  background: "color-mix(in srgb, var(--color-status-booking) 22%, var(--color-panel))",
  boxShadow: "inset 3px 0 0 var(--color-status-booking)",
};
export const blockStyle = (b?: Block): CSSProperties => (b && isChannelBlock(b) ? BOOKING_STYLE : { background: BLOCK_BG });
export const blockHref = (b: Block) => (isChannelBlock(b) ? paths.booking : paths.bloqueos({ editar: b.id }));

// Bloqueos del panel y noches de Booking.com juntos: el calendario los dibuja igual (Booking con su color y sin editar).
export function useCalBlocks() {
  const { data } = useAdmin();
  return useMemo(() => [...data.blocks, ...channelBlocks(data.channelStays ?? [])], [data.blocks, data.channelStays]);
}

// Color de la barra de cada estado (app/globals.css: el pastel pleno en claro y su tono profundo en oscuro, para que la
// tinta se lea encima en los dos modos).
const BAR: Partial<Record<Reservation["status"], string>> = {
  pending_deposit: "var(--bar-pending)",
  confirmed: "var(--bar-confirmed)",
  rescheduled: "var(--bar-rescheduled)",
  checked_in: "var(--bar-checked-in)",
  completed: "var(--bar-completed)",
};
export const barColor = (status: Reservation["status"]) => BAR[status] ?? "var(--bar-completed)";

// Estilo de cada estado: píldora del color del estado. Pendiente de abono = rayado y contorno (aún no asegurada: si no se
// paga a tiempo, se libera). La línea de tiempo y la leyenda cambian ese contorno por su borde negro.
export function barStyle(r: Pick<Reservation, "status">): CSSProperties {
  const c = barColor(r.status);
  if (r.status === "pending_deposit")
    return {
      background: `repeating-linear-gradient(135deg, ${c} 0 7px, color-mix(in srgb, ${c} 50%, var(--color-panel)) 7px 14px)`,
      boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${c} 70%, var(--bar-mix))`,
    };
  return { background: c };
}

// Clic en una reserva del calendario: se abre en un modal. Con Ctrl, ⌘ o la rueda, el enlace abre la página, como siempre.
export const openInModal = (onOpen: (code: string) => void, code: string) => (e: MouseEvent) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  onOpen(code);
};

export const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

// "35 min", "5 h", "2 d": lo que le queda a una retención (cabe en una barra angosta).
export function shortLeft(iso: string, now: number) {
  const m = Math.floor((Date.parse(iso) - now) / 6e4);
  if (m <= 0) return "vencida";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

// Tarifa corta para la fila de disponibilidad: 290000 → "290k", 1250000 → "1,25M".
export const kfmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 2 })}M` : `${Math.round(n / 1000)}k`);

// Nombre del día según el ancho de su columna: «Lunes», «Lun» o «L» (container queries: decide el espacio real, no la pantalla).
// `inline`: comparte la línea con el número, así que necesita más ancho para pasar de la inicial a «Lun».
export function DayName({ wd, className = "", inline = false }: { wd: number; className?: string; inline?: boolean }) {
  return (
    <span className={className}>
      <span aria-hidden="true" className={inline ? "@min-[64px]:hidden" : "@min-[38px]:hidden"}>
        {WD_MIN[wd]}
      </span>
      <span aria-hidden="true" className={`hidden @min-[92px]:hidden ${inline ? "@min-[64px]:inline" : "@min-[38px]:inline"}`}>
        {WD[wd]}
      </span>
      <span className="sr-only @min-[92px]:not-sr-only">{WD_FULL[wd]}</span>
    </span>
  );
}

// Ancho real del contenedor (ResizeObserver): con él se eligen vista, columnas y etiquetas.
// Arranca con una estimación según la ventana (menú lateral desde 1024 px y márgenes del panel; el calendario usa todo
// el ancho): el observador avisa en el siguiente pintado, y una pestaña en segundo plano puede tardar en pintar.
export function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(() => {
    if (typeof window === "undefined") return 0;
    const desk = innerWidth >= 1024;
    return (desk ? innerWidth - 280 : innerWidth) - (desk ? 64 : 32);
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

export type Unit = { key: string; cabin: CabinType; unit: number; label: string; short: string };

export function units(cabins: CabinType[], filter: string): Unit[] {
  return cabins
    .filter((c) => c.units > 0 && (!filter || c.id === filter))
    .flatMap((c) =>
      Array.from({ length: c.units }, (_, i) => ({
        key: `${c.id}:${i + 1}`,
        cabin: c,
        unit: i + 1,
        label: cabinName(c, i + 1),
        short: cabinName(c, i + 1),
      })),
    );
}

export const occupies = (r: Reservation, u: Unit) => r.cabinTypeId === u.cabin.id && r.unit === u.unit && !["cancelled", "expired"].includes(r.status);
export const blocks = (b: Block, u: Unit) => b.cabinTypeId === u.cabin.id && b.unit === u.unit;

/* ───────────── Contenido de los tooltips ───────────── */

export function ReservationTip({ r, cabin }: { r: Reservation; cabin: string }) {
  const p = pendingOf(r);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-[13px]">{r.guest.fullName}</strong>
        <span className="text-paper/70">{r.code}</span>
      </div>
      <span className="text-paper/85">{cabin}</span>
      <span>
        {fmtDate(r.checkIn)} → {fmtDate(r.checkOut)} · {plural(nightsBetween(r.checkIn, r.checkOut), "noche", "noches")} ·{" "}
        {plural(r.adults + r.children, "huésped", "huéspedes")}
      </span>
      <span className="flex flex-wrap gap-x-3">
        <span>Total {cop(r.quote.total)}</span>
        {p.total > 0 && <span className="text-yellow">Pendiente {cop(p.total)}</span>}
      </span>
      {r.status === "pending_deposit" && <span className="text-yellow">{`Sin pagar · la retención vence en ${countdown(r.depositDueAt)}`}</span>}
      {r.source === "panel" && <span className="text-paper/70">Creada por el equipo</span>}
      <span className="mt-0.5 flex items-center justify-between gap-2 border-t border-paper/15 pt-1.5">
        <span className="rounded-full px-2 py-px text-[11px] font-bold text-ink" style={{ background: statusOf(r.status).bg }}>
          {statusOf(r.status).label}
        </span>
        <span className="text-paper/60">Clic para ver el detalle</span>
      </span>
    </div>
  );
}

export function BlockTip({ b, cabin }: { b: Block; cabin: string }) {
  return (
    <div className="flex flex-col gap-1">
      {isChannelBlock(b) ? (
        <>
          <strong className="text-[13px]">Booking.com · reserva o cierre</strong>
          <span className="text-paper/85">{cabin}</span>
          <span>{`${fmtDate(b.from)} → ${fmtDate(addDays(b.to, 1))} · ${plural(nightsBetween(b.from, b.to) + 1, "noche", "noches")}`}</span>
          <span className="mt-0.5 border-t border-paper/15 pt-1.5 text-paper/60">Se gestiona en el extranet de Booking.com</span>
        </>
      ) : (
        <>
          <strong className="text-[13px]">{`Bloqueado · ${b.reason}`}</strong>
          <span className="text-paper/85">{cabin}</span>
          <span>{`${fmtDate(b.from)} → ${fmtDate(b.to)} · ${plural(nightsBetween(b.from, b.to) + 1, "día", "días")}`}</span>
          {b.notes && <span className="text-paper/85">{b.notes}</span>}
          <span className="mt-0.5 border-t border-paper/15 pt-1.5 text-paper/60">Clic para editar el bloqueo</span>
        </>
      )}
    </div>
  );
}

/* ───────────── Vista ───────────── */

/* ───────────── Leyenda (pie de la tabla) ───────────── */

const LEGEND: { label: string; style: CSSProperties; bare?: boolean }[] = [
  { label: "Confirmada", style: barStyle({ status: "confirmed" }) },
  { label: "Sin pagar (retenida)", style: barStyle({ status: "pending_deposit" }) },
  { label: "Reprogramada", style: barStyle({ status: "rescheduled" }) },
  { label: "En estadía", style: barStyle({ status: "checked_in" }) },
  { label: "Finalizada", style: barStyle({ status: "completed" }) },
  { label: "Bloqueo", style: { background: BLOCK_BG }, bare: true },
  { label: "Booking.com", style: { background: "var(--color-status-booking)" }, bare: true },
];

export function CalendarLegend() {
  return (
    <ul
      aria-label="Leyenda"
      className="-mx-4 no-scrollbar flex gap-x-3 gap-y-1 overflow-x-auto px-4 text-[12px] text-ink-muted sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      {LEGEND.map((l) => (
        <li key={l.label} className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden="true" className={`h-3 w-5 rounded-full ${l.bare ? "" : "border border-ink"}`} style={{ ...l.style, boxShadow: undefined }} />
          {l.label}
        </li>
      ))}
    </ul>
  );
}
