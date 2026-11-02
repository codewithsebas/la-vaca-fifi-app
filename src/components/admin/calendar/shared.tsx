"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { WD, WD_FULL, WD_MIN, addDays, cop, countdown, fmtDate, nightsBetween, parseISO, plural, statusOf } from "@/lib/format";
import { pendingOf } from "@/lib/admin-metrics";
import type { Block, CabinType, Reservation } from "@/lib/types";
import { useAdmin } from "@/components/admin/context";
import { paths } from "@/components/admin/routes";

export type CalView = "dia" | "3dias" | "semana" | "mes";

export const CALENDAR_VIEWS: { value: CalView; label: string }[] = [
  { value: "dia", label: "Día" },
  { value: "3dias", label: "3 días" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
];

// Vista inicial según el ancho disponible del calendario (no el de la ventana): pocos días en el celular, semana en tableta, mes en escritorio.
export const autoView = (w: number): CalView => (w < 560 ? "3dias" : w < 900 ? "semana" : "mes");
// Por debajo de este ancho el mes se muestra como cuadrícula mensual: 60 medias jornadas no caben legibles.
export const MONTH_TIMELINE_MIN = 900;

export const lastOfMonth = (m: string) => {
  const d = parseISO(m);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};
export const mondayOf = (d: string) => addDays(d, -((parseISO(d).getUTCDay() + 6) % 7));
export const BLOCK_BG =
  "repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-status-block) 32%, var(--color-panel)) 0 5px, color-mix(in srgb, var(--color-status-block) 14%, var(--color-panel)) 5px 10px)";
export const blockStyle = (): CSSProperties => ({ background: BLOCK_BG });
export const blockHref = (b: Block) => paths.bloqueos({ editar: b.id });

// Bloqueos que dibuja el calendario.
export function useCalBlocks() {
  return useAdmin().data.blocks;
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
// paga a tiempo, se libera).
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
export function DayName({ wd, className = "" }: { wd: number; className?: string }) {
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
        label: `${c.nombre.replace(/^Cabaña\s+/i, "")} ${i + 1}`,
        short: `${c.nombre.replace(/^Cabaña\s+/i, "").split(" ")[0]} ${i + 1}`,
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
      <strong className="text-[13px]">{`Bloqueado · ${b.reason}`}</strong>
      <span className="text-paper/85">{cabin}</span>
      <span>{`${fmtDate(b.from)} → ${fmtDate(b.to)} · ${plural(nightsBetween(b.from, b.to) + 1, "día", "días")}`}</span>
      {b.notes && <span className="text-paper/85">{b.notes}</span>}
      <span className="mt-0.5 border-t border-paper/15 pt-1.5 text-paper/60">Clic para editar el bloqueo</span>
    </div>
  );
}

/* ───────────── Vista ───────────── */
