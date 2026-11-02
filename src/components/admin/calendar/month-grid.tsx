"use client";

import { LoginIcon } from "@/components/ui/icons";
import { addDays, fmtDate, parseISO, plural, statusOf } from "@/lib/format";
import { useAdmin } from "@/components/admin/context";
import { useTip } from "@/components/ui/floating";
import { DayName, type Unit, barColor, blocks, lastOfMonth, mondayOf, occupies, useCalBlocks } from "@/components/admin/calendar/shared";

// Cada día muestra una franja por unidad (reserva, bloqueo o libre) y cuántas quedan libres. Tocar un día abre su agenda.
export function MonthGrid({ month, rows, today, onPick }: { month: string; rows: Unit[]; today: string; onPick: (d: string) => void }) {
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-panel">
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
          const summary = `${fmtDate(d, true)}: ${freeCount === 0 ? "sin cabañas libres" : `${freeCount} de ${rows.length} libres`}${arrivals ? `, ${plural(arrivals, "llegada", "llegadas")}` : ""}`;
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
                      {u.label}:{" "}
                      {s.kind === "res" ? `${s.r.guest.fullName} (${statusOf(s.r.status).label})` : s.kind === "block" ? `Bloqueada · ${s.b.reason}` : "Libre"}
                    </span>
                  ))}
                </span>
              ))}
              className={`@container flex min-w-0 flex-col gap-1.5 border-line p-1.5 text-left transition-colors hover:bg-canvas sm:p-2 ${i % 7 ? "border-l" : ""} ${i >= 7 ? "border-t" : ""} ${inMonth ? "" : "bg-canvas/50 text-ink-subtle"}`}
            >
              <span className="flex items-center justify-between gap-1">
                <span
                  className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-[12.5px] font-bold tabular-nums ${d === today ? "bg-ink text-paper" : inMonth ? "text-ink" : "text-ink-subtle"}`}
                >
                  {parseISO(d).getUTCDate()}
                </span>
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
                            ? { background: `repeating-linear-gradient(90deg, ${barColor(s.r.status)} 0 4px, transparent 4px 6px)` }
                            : { background: barColor(s.r.status) }
                          : s.kind === "block"
                            ? { background: "repeating-linear-gradient(135deg, var(--color-status-block) 0 3px, transparent 3px 5px)" }
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

/* ───────────── Día: agenda por cabaña ───────────── */
