"use client";

import Link from "next/link";
import { BanIcon, ClockIcon, LogoutIcon, PlusIcon } from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/status-pill";
import { nightlyRate } from "@/lib/booking";
import { addDays, cop, fmtDate, nightsBetween, plural } from "@/lib/format";
import { pendingOf } from "@/lib/admin-metrics";
import { fmtTime } from "@/lib/site";
import { useAdmin } from "@/components/admin/context";
import { type NewReservationDraft } from "@/components/admin/new-reservation";
import { paths } from "@/components/admin/routes";
import { Button, buttonClass } from "@/components/admin/ui";
import { type Unit, barStyle, blockHref, blockStyle, blocks, occupies, openInModal, shortLeft, useCalBlocks } from "@/components/admin/calendar/shared";

export function DayAgenda({
  day,
  rows,
  onNew,
  onOpen,
}: {
  day: string;
  rows: Unit[];
  onNew: (d: NewReservationDraft) => void;
  onOpen: (code: string) => void;
}) {
  const { data, cabinLabel, today, now } = useAdmin();
  const calBlocks = useCalBlocks();
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-3 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((u) => {
        const stay = data.reservations.find((r) => occupies(r, u) && r.checkIn <= day && day < r.checkOut);
        const leaving = data.reservations.find((r) => occupies(r, u) && r.checkOut === day);
        const block = calBlocks.find((b) => blocks(b, u) && b.from <= day && day <= b.to);
        const arriving = stay && stay.checkIn === day;
        const state = block
          ? { label: "Bloqueada", tone: "bg-ink/8 text-ink-muted" }
          : arriving
            ? { label: "Llega hoy", tone: "bg-success-soft text-success" }
            : stay
              ? { label: "Ocupada", tone: "bg-info-soft text-info" }
              : { label: "Libre", tone: "bg-success-soft text-success" };
        const night = stay ? nightsBetween(stay.checkIn, day) + 1 : 0;
        const total = stay ? nightsBetween(stay.checkIn, stay.checkOut) : 0;
        const rate = nightlyRate(u.cabin, data.seasons, day);
        return (
          <article key={u.key} className="flex flex-col gap-3 rounded-[22px] bg-panel p-4">
            <header className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold text-ink">{cabinLabel(u.cabin.id, u.unit)}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${state.tone}`}>{state.label}</span>
            </header>
            {leaving && (
              <Link
                href={paths.reserva(leaving.code)}
                onClick={openInModal(onOpen, leaving.code)}
                className="flex items-center gap-2.5 rounded-[14px] bg-canvas/70 px-3 py-2 text-left text-[13px] transition-colors hover:bg-canvas"
              >
                <LogoutIcon size={15} className="text-ink-muted" />
                <span className="min-w-0 flex-1 truncate">
                  Sale <strong>{leaving.guest.fullName}</strong> · check-out {fmtTime(data.site.settings.checkOutTime)}
                </span>
              </Link>
            )}
            {stay ? (
              <Link
                href={paths.reserva(stay.code)}
                onClick={openInModal(onOpen, stay.code)}
                className="flex flex-col gap-2 rounded-[16px] p-3 text-left transition-[filter] hover:brightness-[.97]"
                style={barStyle(stay)}
              >
                <span className="flex items-center justify-between gap-2">
                  <strong className="truncate text-[14px] text-ink">{stay.guest.fullName}</strong>
                  <StatusPill status={stay.status} size="sm" />
                </span>
                <span className="text-[12.5px] text-ink-muted">
                  {stay.code} · {plural(stay.adults + stay.children, "huésped", "huéspedes")}
                  {arriving && stay.estimatedArrival ? ` · llega ${stay.estimatedArrival}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper/70">
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
                  pendingOf(stay).total > 0 && (
                    <span className="text-[12.5px] font-semibold text-warning">Pendiente por cobrar {cop(pendingOf(stay).total)}</span>
                  )
                )}
              </Link>
            ) : block ? (
              <Link href={blockHref(block)} className="flex flex-col gap-1 rounded-[16px] p-3 text-left" style={blockStyle()}>
                <strong className="text-[14px] text-ink">{block.reason}</strong>
                <span className="text-[12.5px] text-ink-muted">
                  {`${fmtDate(block.from)} → ${fmtDate(block.to)}`}
                  {block.notes ? ` · ${block.notes}` : ""}
                </span>
              </Link>
            ) : (
              <div className="flex flex-col gap-2 rounded-[16px] border border-dashed border-line-strong px-3 py-3 text-[13px] text-ink-muted">
                <span>{`Disponible esta noche · ${cop(rate.couple)} para 2${rate.season ? ` (${rate.season.nombre})` : ""}`}</span>
                {day >= today && (
                  <span className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<PlusIcon size={13} />}
                      onClick={() => onNew({ cabinTypeId: u.cabin.id, unit: u.unit, checkIn: day, checkOut: addDays(day, 1) })}
                    >
                      Reservar
                    </Button>
                    <Link href={paths.bloqueos({ nuevo: 1, cabana: u.cabin.id, unidad: u.unit, fecha: day })} className={buttonClass("ghost", "sm")}>
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
