"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRightIcon,
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
  HomeIcon,
  LoginIcon,
  LogoutIcon,
  PlusIcon,
  TrendIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/status-pill";
import { balanceDue, delta, finance, pendingOf, previousRange } from "@/lib/admin-metrics";
import { ACTIVE_STATUSES, channelBlocks } from "@/lib/booking";
import { addDays, cop, countdown, fmtDate, fmtFullDate, plural } from "@/lib/format";
import type { Reservation } from "@/lib/types";
import { useAdmin } from "@/components/admin/context";
import { useTip } from "@/components/ui/floating";
import { BarList, RevenueChart, StaysMeter } from "@/components/admin/finance";
import { NewReservationDialog } from "@/components/admin/new-reservation";
import { usePeriod, type Preset } from "@/components/admin/period";
import { MODULES, paths } from "@/components/admin/routes";
import { ARRIVING, DEPARTING, rowOf } from "@/components/admin/shared";
import { Badge, Button, Card, CardHeader, CountBadge, EmptyState, PageHeader, Segmented, StatCard, buttonClass } from "@/components/admin/ui";

// Bloque del dashboard, con su título: lo de hoy, lo que viene y las cifras del negocio.
function Block({
  id,
  title,
  hint,
  actions,
  className = "",
  children,
}: {
  id: string;
  title: string;
  hint?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={`flex flex-col gap-3 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id={id} className="text-[17px] leading-tight font-extrabold tracking-[-0.01em] text-ink">
            {title}
          </h2>
          {hint && <p className="mt-0.5 text-[13px] text-ink-muted">{hint}</p>}
        </div>
        {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

function ReservationRow({ r, meta, right }: { r: Reservation; meta: string; right: ReactNode }) {
  return (
    <li>
      <Link href={paths.reserva(r.code)} className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-canvas">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] leading-snug font-semibold text-ink">{r.guest.fullName}</span>
          <span className="block text-[12.5px] leading-snug text-ink-muted">{meta}</span>
        </span>
        {right}
        <ChevronRightIcon size={16} className="text-ink-subtle transition-transform duration-150 motion-safe:group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

function ListCard({
  id,
  icon,
  title,
  count,
  empty,
  footer,
  className = "",
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  count: number;
  empty: string;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card aria-labelledby={id} className={`flex flex-col gap-3 p-4 sm:p-5 ${className}`}>
      <CardHeader
        id={id}
        icon={icon}
        title={
          <span className="flex items-center gap-2">
            {title} <CountBadge n={count} />
          </span>
        }
      />
      {count ? <ul className="-mx-2.5 flex flex-col">{children}</ul> : <EmptyState compact icon={icon} title={empty} />}
      {footer}
    </Card>
  );
}

function occupancy(d: ReturnType<typeof useAdmin>["data"], date: string) {
  let busy = 0;
  let total = 0;
  for (const c of d.cabinTypes) {
    if (!c.activa && !d.reservations.some((r) => r.cabinTypeId === c.id)) continue;
    total += c.units;
    const set = new Set<number>();
    d.reservations.forEach((r) => r.cabinTypeId === c.id && ACTIVE_STATUSES.includes(r.status) && r.checkIn <= date && date < r.checkOut && set.add(r.unit));
    [...d.blocks, ...channelBlocks(d.channelStays)].forEach((b) => b.cabinTypeId === c.id && b.from <= date && date <= b.to && set.add(b.unit));
    busy += set.size;
  }
  return { busy, total };
}

// Llegadas de la semana que se muestran en la lista; el resto se ve en el calendario.
const UPCOMING_MAX = 6;

export function Dashboard() {
  const { data, today, now, cabinLabel } = useAdmin();
  const [creating, setCreating] = useState(false);
  const R = data.reservations;
  const arr = R.filter((r) => r.checkIn === today && ARRIVING.includes(r.status));
  const dep = R.filter((r) => r.checkOut === today && DEPARTING.includes(r.status));
  // Las que ya pasaron por recepción hoy: completan la cuenta del día.
  const arrived = R.filter((r) => r.checkIn === today && r.status === "checked_in").length;
  const left = R.filter((r) => r.checkOut === today && r.status === "completed").length;
  const upcoming = R.filter((r) => r.checkIn > today && r.checkIn <= addDays(today, 7) && ARRIVING.includes(r.status)).sort((a, b) =>
    a.checkIn < b.checkIn ? -1 : 1,
  );
  // Pagos por completar: abonos de fechas retenidas y saldos de huéspedes en estadía (con su plazo), el más urgente primero.
  const deadlineOf = (r: Reservation) => (r.status === "pending_deposit" ? r.depositDueAt : (r.balanceDueAt ?? ""));
  const pend = R.filter((r) => r.status === "pending_deposit" || balanceDue(r, now)).sort((a, b) => (deadlineOf(a) < deadlineOf(b) ? -1 : 1));
  const proofFor = (code: string) => data.proofs.find((p) => p.reservationCode === code && p.status === "pending");
  const occToday = occupancy(data, today);
  const toCollect = R.reduce((s, r) => s + pendingOf(r).total, 0);

  return (
    <>
      <PageHeader
        title={MODULES.dashboard.label}
        description={fmtFullDate(today)}
        actions={
          <>
            <Link href={paths.calendario()} className={buttonClass()}>
              <CalendarIcon size={16} />
              Ver calendario
            </Link>
            <Button variant="primary" icon={<PlusIcon size={14} />} onClick={() => setCreating(true)}>
              Nueva reserva
            </Button>
          </>
        }
      />

      <Block id="d-today" title="Hoy" hint="Quién llega, quién sale y qué pagos faltan por completar.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Ocupación esta noche"
            value={`${occToday.busy} de ${occToday.total}`}
            hint={occToday.total ? `${Math.round((occToday.busy / occToday.total) * 100)} % de las cabañas` : "Sin cabañas"}
            icon={<HomeIcon size={15} />}
          />
          <StatCard
            label="Llegadas por recibir"
            value={arr.length}
            hint={
              arrived
                ? plural(arrived, "reserva ya hizo check-in", "reservas ya hicieron check-in")
                : arr.length
                  ? "ninguna ha llegado todavía"
                  : "sin llegadas programadas"
            }
            icon={<LoginIcon size={15} />}
            tone={arr.length ? "info" : undefined}
          />
          <StatCard
            label="Salidas por entregar"
            value={dep.length}
            hint={left ? plural(left, "reserva ya salió", "reservas ya salieron") : dep.length ? "ninguna ha salido todavía" : "sin salidas programadas"}
            icon={<LogoutIcon size={15} />}
            tone={dep.length ? "info" : undefined}
          />
          <StatCard
            label="Por cobrar"
            value={cop(toCollect)}
            hint={
              <Link href={paths.pagos({ vista: "por-cobrar" })} className="font-semibold text-ink underline-offset-2 hover:underline">
                Ver pagos pendientes
              </Link>
            }
            icon={<WalletIcon size={15} />}
            tone="warning"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ListCard id="d-arr" icon={<LoginIcon size={18} />} title="Llegadas hoy" count={arr.length} empty="No hay llegadas programadas hoy.">
            {arr.map((r) => {
              const x = rowOf(r, cabinLabel);
              return (
                <ReservationRow
                  key={r.code}
                  r={r}
                  meta={[x.cabin, x.code, x.arrival].filter(Boolean).join(" · ")}
                  right={<StatusPill status={r.status} size="sm" />}
                />
              );
            })}
          </ListCard>
          <ListCard id="d-dep" icon={<LogoutIcon size={18} />} title="Salidas hoy" count={dep.length} empty="No hay salidas programadas hoy.">
            {dep.map((r) => {
              const x = rowOf(r, cabinLabel);
              return <ReservationRow key={r.code} r={r} meta={`${x.cabin} · ${x.code}`} right={<StatusPill status={r.status} size="sm" />} />;
            })}
          </ListCard>
          <ListCard
            id="d-pend"
            icon={<WalletIcon size={18} />}
            title="Pagos por completar"
            count={pend.length}
            empty="No hay abonos ni saldos pendientes."
            className="md:col-span-2 xl:col-span-1"
          >
            {pend.map((r) => {
              const x = rowOf(r, cabinLabel);
              const bd = balanceDue(r, now);
              const deadline = deadlineOf(r);
              const minutes = deadline ? (Date.parse(deadline) - now) / 6e4 : 0;
              const proof = proofFor(r.code);
              return (
                <ReservationRow
                  key={r.code}
                  r={r}
                  meta={bd ? `${x.code} · saldo ${cop(bd.amount)} · en estadía` : `${x.code} · abono ${x.deposit} · llega ${fmtDate(r.checkIn)}`}
                  right={
                    bd?.overdue ? (
                      <Badge tone="danger">Saldo vencido</Badge>
                    ) : proof ? (
                      <Badge tone="info" icon={<FileTextIcon size={12} />}>
                        Comprobante
                      </Badge>
                    ) : (
                      <span
                        className={`inline-flex flex-none items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ${minutes < 10 ? "bg-error-soft text-error" : "bg-warning-soft text-warning"}`}
                      >
                        <ClockIcon size={13} />
                        <span className="sr-only">{bd ? "El saldo vence en " : "La retención vence en "}</span>
                        {countdown(deadline)}
                      </span>
                    )
                  }
                />
              );
            })}
          </ListCard>
        </div>
      </Block>

      <Block id="d-next" title="Esta semana" hint="Cómo vienen las cabañas en los próximos 7 días." className="mt-3">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <OccupancyChart />
          <ListCard
            id="d-up"
            icon={<CalendarIcon size={18} />}
            title="Próximas llegadas"
            count={upcoming.length}
            empty="No hay llegadas en los próximos 7 días."
            footer={
              upcoming.length > UPCOMING_MAX && (
                <Link href={paths.calendario()} className="self-start text-[13px] font-semibold text-ink underline-offset-2 hover:underline">
                  {`Y ${upcoming.length - UPCOMING_MAX} más: ver el calendario`}
                </Link>
              )
            }
          >
            {upcoming.slice(0, UPCOMING_MAX).map((r) => {
              const x = rowOf(r, cabinLabel);
              return (
                <ReservationRow
                  key={r.code}
                  r={r}
                  meta={`${r.checkIn === addDays(today, 1) ? "Mañana" : fmtDate(r.checkIn)} · ${x.cabin} · ${x.nights}`}
                  right={<StatusPill status={r.status} size="sm" />}
                />
              );
            })}
          </ListCard>
        </div>
      </Block>

      <FinanceBlock />

      {creating && <NewReservationDialog draft={{}} onClose={() => setCreating(false)} />}
    </>
  );
}

/* ───────────── Finanzas ───────────── */

const PERIODS: { value: Preset; label: string }[] = [
  { value: "7", label: "7 días" },
  { value: "30", label: "1 mes" },
  { value: "90", label: "3 meses" },
  { value: "365", label: "1 año" },
];

// Las cifras y gráficas de Finanzas, resumidas: el mismo cálculo, con pocos periodos para elegir. El análisis completo
// (por cabaña, rango a medida, pagos uno a uno) sigue en Finanzas, que se abre con el periodo elegido aquí.
function FinanceBlock() {
  const { data } = useAdmin();
  const period = usePeriod("30");
  const range = period.range;
  const prev = previousRange(range);
  const now = useMemo(() => finance(data.reservations, data.blocks, data.cabinTypes, range, "", data.channelStays), [data, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const before = useMemo(() => finance(data.reservations, data.blocks, data.cabinTypes, prev, "", data.channelStays), [data, prev.from, prev.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const custom = period.preset === "personalizado";
  const same = { periodo: period.preset === "30" ? null : period.preset, desde: custom ? range.from : null, hasta: custom ? range.to : null };

  return (
    <Block
      id="d-fin"
      title="Finanzas"
      hint={`${period.label} · comparado con los ${period.daysLabel} anteriores`}
      className="mt-3"
      actions={
        <>
          <Segmented label="Periodo" value={period.preset} onChange={period.setPreset} options={PERIODS} />
          <Link href={paths.finanzas(same)} className={buttonClass("secondary", "sm")}>
            Ver finanzas
            <ArrowRightIcon size={14} />
          </Link>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Ingresos recibidos"
          value={cop(now.received)}
          delta={delta(now.received, before.received)}
          hint={plural(now.payments.length, "pago", "pagos")}
          icon={<TrendIcon size={15} />}
          tone="success"
        />
        <StatCard
          label="Reservas confirmadas"
          value={now.confirmedCount}
          delta={delta(now.confirmedCount, before.confirmedCount)}
          hint="abono recibido en el periodo"
          icon={<CalendarIcon size={15} />}
        />
        <StatCard
          label="Ocupación"
          value={`${Math.round(now.occupancy * 100)} %`}
          delta={delta(now.occupancy, before.occupancy)}
          hint={`${now.occupied} de ${now.available} noches`}
          icon={<HomeIcon size={15} />}
        />
        <StatCard
          label="Ticket promedio"
          value={now.ticket ? cop(now.ticket) : "—"}
          delta={now.ticket ? delta(now.ticket, before.ticket) : undefined}
          hint="valor por reserva confirmada"
          icon={<UsersIcon size={15} />}
        />
      </div>
      <RevenueChart buckets={now.buckets} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StaysMeter stays={now.stays} />
        <BarList id="d-cabin" title="Ingresos por cabaña" subtitle="¿Qué cabaña genera más?" rows={now.byCabin} total={now.received} />
        <BarList
          id="d-type"
          title="Ingresos por tipo de estadía"
          subtitle="Pareja, familia (con niños), grupo (3 o más adultos) o individual."
          rows={now.byType}
          total={now.received}
        />
      </div>
    </Block>
  );
}

/* ───────────── Ocupación ───────────── */

// Columnas de ocupación (una serie: el título la nombra; etiqueta directa solo en hoy; el resto en el tooltip).
function OccupancyChart() {
  const { data, today } = useAdmin();
  const tip = useTip();
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i);
    const { busy, total } = occupancy(data, day);
    return { day, label: i === 0 ? "Hoy" : fmtDate(day), busy, total, pc: total ? Math.round((busy / total) * 100) : 0 };
  });
  const avg = Math.round(week.reduce((s, d) => s + d.pc, 0) / week.length);

  return (
    <Card aria-labelledby="d-week" className="flex flex-col gap-5 p-4 sm:p-5">
      <CardHeader
        id="d-week"
        icon={<HomeIcon size={18} />}
        title="Ocupación de los próximos 7 días"
        subtitle={`Promedio ${avg} % · ${plural(week[0].total, "cabaña", "cabañas")}`}
      />
      {/* Junto a una lista más alta, las columnas crecen con la tarjeta. */}
      <div className="flex flex-1 flex-col pl-9">
        <div className="relative min-h-[168px] flex-1">
          {[100, 50, 0].map((pc) => (
            <div key={pc} aria-hidden="true" className="absolute inset-x-0 border-t border-line" style={{ top: `${100 - pc}%` }}>
              <span className="absolute top-0 right-full -translate-y-1/2 pr-2 text-[11px] whitespace-nowrap text-ink-subtle tabular-nums">{pc} %</span>
            </div>
          ))}
          <ol className="absolute inset-0 grid grid-cols-7">
            {week.map((d, i) => (
              <li
                key={d.day}
                role="img"
                aria-label={`${fmtDate(d.day)}: ${d.pc} % de ocupación, ${d.busy} de ${d.total} cabañas`}
                {...tip(() => (
                  <span>
                    <strong>{fmtDate(d.day)}</strong> · {d.pc} % · {d.busy} de {d.total} cabañas
                  </span>
                ))}
                className="group relative flex h-full flex-col items-center justify-end"
              >
                <span
                  aria-hidden="true"
                  className="relative block w-6 rounded-t-[4px] bg-chart transition-[filter] group-hover:brightness-90"
                  style={{ height: d.pc ? `${d.pc}%` : 0 }}
                >
                  {i === 0 && (
                    <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-[12px] font-bold whitespace-nowrap text-ink tabular-nums">
                      {d.pc} %
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <ol aria-hidden="true" className="mt-2 grid grid-cols-7 text-center text-[12px]">
          {week.map((d, i) => (
            <li key={d.day} className={i === 0 ? "font-bold text-ink" : "text-ink-muted"}>
              {d.label}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
