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
};

const navBtn = "btn-icon size-11 border-2 border-card-muted bg-transparent text-on-light disabled:opacity-35";

// Calendario de un mes para elegir llegada y salida. Semana de lunes a domingo.
export function RangeCalendar({ view, today, checkIn, checkOut, pick, unavailable = {}, loading, hint, onPick, onMonth }: Props) {
  const vd = parseISO(view);
  const y = vd.getUTCFullYear();
  const m = vd.getUTCMonth();
  const lead = (vd.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const prevDisabled = view <= today.slice(0, 7) + "-01";

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Mes anterior"
          disabled={prevDisabled}
          onClick={() => onMonth(addDays(view, -1).slice(0, 7) + "-01")}
          className={navBtn}
        >
          <ChevronLeftIcon />
        </button>
        <strong aria-live="polite" className="display text-[1.65rem] tracking-[.02em]">
          {MONTHS[m]} {y}
        </strong>
        <button type="button" aria-label="Mes siguiente" onClick={() => onMonth(addDays(view, 32).slice(0, 7) + "-01")} className={navBtn}>
          <ChevronRightIcon />
        </button>
      </div>
      <p className="text-[.86rem] font-bold">{hint}</p>
      <div aria-hidden="true" className="grid grid-cols-7 text-center text-[.72rem] font-extrabold tracking-[.06em]">
        {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      {loading ? (
        <div role="status" aria-label="Cargando disponibilidad" className="grid grid-cols-7 gap-[3px]">
          {Array.from({ length: 35 }, (_, i) => (
            <span key={i} className="skeleton h-11 rounded-sm" />
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
                className={`h-11 rounded-full border-0 text-[.9rem] hover:shadow-[inset_0_0_0_2px_var(--color-on-light)] disabled:opacity-35 disabled:hover:shadow-none ${
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
