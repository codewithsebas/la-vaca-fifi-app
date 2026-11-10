"use client";

import { MONTHS, addDays, parseISO } from "@/lib/format";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";

type Props = {
  view: string; // primer día del mes visible (AAAA-MM-01)
  today: string;
  checkIn: string | null;
  checkOut: string | null;
  pick: "in" | "out";
  unavailable?: Record<string, boolean>;
  loading?: boolean;
  hint: string;
  onPick: (iso: string) => void;
  onMonth: (view: string) => void;
  compact?: boolean; // más pequeño, para la tarjeta de reserva de la portada
};

const navBtn = "btn-icon border-2 border-card-muted bg-transparent text-on-light disabled:opacity-35";

// Calendario de un mes para elegir llegada y salida. Semana de lunes a domingo.
export function RangeCalendar({ view, today, checkIn, checkOut, pick, unavailable = {}, loading, hint, onPick, onMonth, compact = false }: Props) {
  const nav = `${navBtn} ${compact ? "size-9 border" : "size-11"}`;
  const day = compact ? "h-9 text-[.84rem]" : "h-11 text-[.9rem]";
  const vd = parseISO(view);
  const y = vd.getUTCFullYear();
  const m = vd.getUTCMonth();
  const lead = (vd.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const prevDisabled = view <= today.slice(0, 7) + "-01";

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label="Mes anterior" disabled={prevDisabled} onClick={() => onMonth(addDays(view, -1).slice(0, 7) + "-01")} className={nav}>
          <ChevronLeftIcon />
        </button>
        <strong
          aria-live="polite"
          className={`whitespace-nowrap ${compact ? "text-[1.02rem] font-semibold" : "display text-[clamp(1.2rem,3.5vw,1.65rem)] tracking-[.02em]"}`}
        >
          {MONTHS[m]} {y}
        </strong>
        <button type="button" aria-label="Mes siguiente" onClick={() => onMonth(addDays(view, 32).slice(0, 7) + "-01")} className={nav}>
          <ChevronRightIcon />
        </button>
      </div>
      <p className={compact ? "text-[.8rem] font-semibold" : "text-[.86rem] font-bold"}>{hint}</p>
      <div aria-hidden="true" className={`grid grid-cols-7 text-center font-extrabold tracking-[.06em] ${compact ? "text-[.66rem]" : "text-[.72rem]"}`}>
        {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      {loading ? (
        <div role="status" aria-label="Cargando disponibilidad" className="grid grid-cols-7 gap-[3px]">
          {Array.from({ length: 35 }, (_, i) => (
            <span key={i} className={`skeleton rounded-sm ${compact ? "h-9" : "h-11"}`} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-[3px]">
          {Array.from({ length: lead }, (_, i) => (
            <span key={"l" + i} />
          ))}
          {Array.from({ length: count }, (_, i) => {
            const d = i + 1;
            const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const past = iso < today;
            const un = !!unavailable[iso];
            const isIn = iso === checkIn;
            const isOut = iso === checkOut;
            const inRange = !!(checkIn && checkOut && iso > checkIn && iso < checkOut);
            const end = isIn || isOut;
            const canOut = pick === "out" && !!checkIn && iso > checkIn;
            const disabled = past || (un && !canOut);
            return (
              <button
                key={iso}
                type="button"
                disabled={disabled}
                aria-pressed={end || inRange}
                aria-label={`${d} de ${MONTHS[m]}${isIn ? ", llegada" : ""}${isOut ? ", salida" : ""}${un ? ", sin disponibilidad" : ""}${past ? ", fecha pasada" : ""}`}
                onClick={() => onPick(iso)}
                className={`${day} rounded-full border-0 hover:shadow-[inset_0_0_0_2px_var(--color-on-light)] disabled:opacity-35 disabled:hover:shadow-none ${
                  end ? "bg-cta text-cta-text" : inRange ? "bg-card-muted text-on-light" : "bg-transparent text-on-light"
                } ${end || iso === today ? "font-extrabold" : "font-medium"} ${un && !end ? "line-through" : ""}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
