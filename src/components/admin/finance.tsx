"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { ArrowRightIcon, CalendarIcon, ClockIcon, HomeIcon, ReceiptIcon, TrendIcon, UsersIcon, WalletIcon } from "@/components/ui/icons";
import { delta, finance, pendingOf, previousRange, recordsByCode } from "@/lib/admin-metrics";
import { cop, fmtDate, plural } from "@/lib/format";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin, useParam } from "@/components/admin/context";
import { useTip } from "@/components/ui/floating";
import { PeriodFilter, usePeriod } from "@/components/admin/period";
import { MODULES, paths } from "@/components/admin/routes";
import { ACCENT, Card, CardHeader, EmptyState, PageHeader, StatCard, buttonClass, type Accent } from "@/components/admin/ui";

// "$1.250.000" → "$1,3 M" para ejes y etiquetas compactas.
const short = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M` : n >= 1e3 ? `$${Math.round(n / 1e3)} mil` : cop(n);

// Variación contra el periodo anterior; sin base para comparar no se muestra.
const vs = (now: number, before: number) => delta(now, before) ?? undefined;

// Análisis del negocio por periodo: arriba los filtros y cuatro indicadores; luego el ingreso en el tiempo junto a lo que
// falta por cobrar, y al final de dónde viene el ingreso. Los movimientos uno a uno se gestionan en Pagos.
export function FinanceView() {
  const { data } = useAdmin();
  const period = usePeriod("30");
  const [cabinId, setCabinId] = useParam("cabana", "");
  const range = period.range;
  const prev = previousRange(range);
  const records = useMemo(() => recordsByCode(data.payments), [data.payments]);
  const now = useMemo(() => finance(data.reservations, data.blocks, data.cabinTypes, range, cabinId, records), [data, range.from, range.to, cabinId, records]); // eslint-disable-line react-hooks/exhaustive-deps
  const before = useMemo(() => finance(data.reservations, data.blocks, data.cabinTypes, prev, cabinId, records), [data, prev.from, prev.to, cabinId, records]); // eslint-disable-line react-hooks/exhaustive-deps
  // Lo pendiente hoy (no depende del periodo): abonos de fechas retenidas y saldos de estadías confirmadas o en curso.
  const due = data.reservations.filter((r) => (!cabinId || r.cabinTypeId === cabinId) && pendingOf(r).total > 0);
  const awaiting = due.filter((r) => pendingOf(r).deposit > 0);
  const balances = due.filter((r) => pendingOf(r).balance > 0);
  // Los enlaces a Pagos conservan el periodo y la cabaña elegida aquí.
  const same = {
    periodo: period.preset === "30" ? null : period.preset,
    desde: period.preset === "personalizado" ? range.from : null,
    hasta: period.preset === "personalizado" ? range.to : null,
    cabana: cabinId || null,
  };

  return (
    <>
      <PageHeader
        title={MODULES.finanzas.label}
        description="Cuánto entró, qué falta por cobrar y cómo se ocupan las cabañas."
        actions={
          <Link href={paths.pagos({ vista: "recibidos", ...same })} className={buttonClass()}>
            <ReceiptIcon size={15} />
            Ver pagos del periodo
          </Link>
        }
      />

      {/* Filtros en una sola barra: periodo y cabaña a la izquierda, las fechas que se están viendo a la derecha. */}
      <Card className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
        <PeriodFilter period={period} />
        <div className="w-full sm:w-[220px]">
          <Combobox
            value={cabinId}
            onChange={setCabinId}
            options={[{ value: "", label: "Todas las cabañas" }, ...data.cabinTypes.map((c) => ({ value: c.id, label: c.nombre }))]}
            icon={<HomeIcon size={15} className="text-ink-muted" />}
          />
        </div>
        <p className="text-[13px] text-ink-muted lg:ml-auto">
          <span className="font-semibold text-ink">{period.label}</span> · {period.daysLabel}
          <span className="max-sm:hidden"> · frente a los {period.daysLabel} anteriores</span>
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-3 min-[460px]:grid-cols-2 xl:grid-cols-4">
        <StatCard
          accent="pink"
          label="Ingresos recibidos"
          value={cop(now.received)}
          delta={vs(now.received, before.received)}
          hint={plural(now.payments.length, "pago registrado", "pagos registrados")}
          icon={<TrendIcon size={15} />}
        />
        <StatCard
          accent="green"
          label="Reservas confirmadas"
          value={now.confirmedCount}
          delta={vs(now.confirmedCount, before.confirmedCount)}
          hint="con su abono en el periodo"
          icon={<CalendarIcon size={15} />}
        />
        <StatCard
          accent="yellow"
          label="Ocupación"
          value={`${Math.round(now.occupancy * 100)} %`}
          delta={before.available && now.available ? Math.round((now.occupancy - before.occupancy) * 100) : undefined}
          deltaUnit="pp"
          hint={`${now.occupied} de ${now.available} noches`}
          icon={<HomeIcon size={15} />}
        />
        <StatCard
          accent="blue"
          label="Ticket promedio"
          value={now.ticket ? cop(now.ticket) : "—"}
          delta={now.ticket && before.ticket ? vs(now.ticket, before.ticket) : undefined}
          hint="por reserva confirmada"
          icon={<UsersIcon size={15} />}
        />
      </div>

      {/* El gráfico se estira hasta el alto de la columna derecha: sin huecos debajo. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <RevenueChart buckets={now.buckets} deposits={now.depositsTotal} balances={now.balancesTotal} />
        <div className="flex min-w-0 flex-col gap-4 self-start">
          <Receivables
            deposits={awaiting.reduce((s, r) => s + pendingOf(r).deposit, 0)}
            depositCount={awaiting.length}
            balances={balances.reduce((s, r) => s + pendingOf(r).balance, 0)}
            balanceCount={balances.length}
            cabinId={cabinId}
          />
          <StaysMeter stays={now.stays} />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <BarList
          id="fi-cabin"
          title="Ingresos por cabaña"
          subtitle="¿Qué cabaña genera más?"
          rows={now.byCabin}
          total={now.received}
          icon={<HomeIcon size={18} />}
        />
        <BarList
          id="fi-type"
          title="Ingresos por tipo de estadía"
          subtitle="Pareja, familia (con niños), grupo (3 o más adultos) o individual."
          rows={now.byType}
          total={now.received}
          icon={<UsersIcon size={18} />}
        />
      </div>
    </>
  );
}

/* ───────────── Por cobrar hoy ───────────── */

// Lo que falta por cobrar de todas las reservas activas (no depende del periodo), con atajos a Pagos.
function Receivables({
  deposits,
  depositCount,
  balances,
  balanceCount,
  cabinId,
}: {
  deposits: number;
  depositCount: number;
  balances: number;
  balanceCount: number;
  cabinId: string;
}) {
  const row = (accent: Accent, icon: ReactNode, label: string, hint: string, amount: number, tipo: "abonos" | "saldos") => (
    <li>
      <Link
        href={paths.pagos({ vista: "por-cobrar", tipo, cabana: cabinId || null })}
        className="flex items-center gap-3 rounded-[18px] bg-paper/70 p-3 pr-3.5 transition-colors hover:bg-paper"
      >
        <span aria-hidden="true" className={`grid size-10 flex-none place-items-center rounded-full text-ink ${ACCENT[accent].bg}`}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-ink">{label}</span>
          <span className="block text-[12.5px] text-ink-muted">{hint}</span>
        </span>
        <span className="flex-none rounded-full bg-panel px-3 py-1 text-[13px] font-bold text-ink tabular-nums">{cop(amount)}</span>
      </Link>
    </li>
  );
  return (
    <Card aria-labelledby="fi-due" className="flex flex-col gap-4 p-5 sm:p-6">
      <CardHeader
        id="fi-due"
        icon={<WalletIcon size={18} />}
        accent="blue"
        title="Por cobrar hoy"
        subtitle="De todas las reservas activas, sin importar el periodo."
      />
      <p className="text-[30px] leading-none font-bold tracking-[-0.03em] text-ink tabular-nums">{cop(deposits + balances)}</p>
      <ul className="flex flex-col gap-2">
        {row("yellow", <ClockIcon size={16} />, "Abonos por recibir", plural(depositCount, "reserva sin abono", "reservas sin abono"), deposits, "abonos")}
        {row("green", <WalletIcon size={16} />, "Saldos por cobrar", plural(balanceCount, "reserva confirmada", "reservas confirmadas"), balances, "saldos")}
      </ul>
      <Link href={paths.pagos({ vista: "por-cobrar", cabana: cabinId || null })} className={buttonClass("secondary", "sm", "self-start")}>
        Ver en Pagos
        <ArrowRightIcon size={14} />
      </Link>
    </Card>
  );
}

/* ───────────── Ingresos en el tiempo (columnas apiladas: abonos + saldos) ───────────── */

// La columna entera recibe el ratón, pero el tooltip apunta a la barra (justo encima de ella, no al tope del gráfico).
const BAR_TIP = { anchor: (el: HTMLElement) => el.querySelector<HTMLElement>("[data-bar]") };

export function RevenueChart({ buckets, deposits, balances }: { buckets: ReturnType<typeof finance>["buckets"]; deposits: number; balances: number }) {
  const tip = useTip();
  const max = Math.max(1, ...buckets.map((b) => b.deposit + b.balance));
  const top = buckets.reduce((m, b, i) => (b.deposit + b.balance > buckets[m].deposit + buckets[m].balance ? i : m), 0);
  const every = Math.ceil(buckets.length / 10); // etiquetas del eje x sin amontonarse
  const empty = buckets.every((b) => !b.deposit && !b.balance);
  const by = buckets[0]?.from === buckets[0]?.to ? "Por día" : buckets[0]?.label.startsWith("Sem.") ? "Por semana" : "Por mes";

  return (
    <Card aria-labelledby="fi-trend" className="flex flex-col gap-5 p-5 sm:p-6">
      <CardHeader id="fi-trend" icon={<TrendIcon size={18} />} accent="pink" title="Ingresos en el tiempo" subtitle={by} />
      {/* Totales del periodo, con el color de cada serie (también sirven de leyenda). */}
      <dl className="grid grid-cols-3 gap-2 rounded-[18px] bg-paper/60 px-4 py-3">
        {[
          { k: "Total", v: deposits + balances, dot: "" },
          { k: "Abonos", v: deposits, dot: "bg-series-1" },
          { k: "Saldos", v: balances, dot: "bg-series-2" },
        ].map((x) => (
          <div key={x.k} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[.06em] text-ink-muted uppercase">
              {x.dot && <span aria-hidden="true" className={`size-2.5 flex-none rounded-full ${x.dot}`} />}
              {x.k}
            </dt>
            <dd className="truncate text-[17px] font-bold tracking-[-0.01em] text-ink tabular-nums">{cop(x.v)}</dd>
          </div>
        ))}
      </dl>
      {empty ? (
        <EmptyState
          compact
          icon={<TrendIcon size={18} />}
          title="Sin ingresos en este periodo"
          text="Cuando se registren abonos o saldos, verás aquí su evolución."
        />
      ) : (
        <div className="flex flex-1 flex-col pl-12">
          <div className="relative min-h-[240px] flex-1">
            {[1, 0.5, 0].map((f) => (
              <div key={f} aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: `${(1 - f) * 100}%` }}>
                <span className="absolute top-0 right-full -translate-y-1/2 pr-2 text-[11px] whitespace-nowrap text-ink-subtle tabular-nums">
                  {short(max * f)}
                </span>
              </div>
            ))}
            <ol className="relative flex h-full items-end gap-[2px]">
              {buckets.map((b, i) => {
                const total = b.deposit + b.balance;
                return (
                  <li
                    key={b.key}
                    role="img"
                    aria-label={`${b.label}: ${cop(total)} (abonos ${cop(b.deposit)}, saldos ${cop(b.balance)})`}
                    {...tip(
                      () => (
                        <span className="flex flex-col gap-0.5">
                          <strong>{b.from === b.to ? fmtDate(b.from, true) : `${fmtDate(b.from)} → ${fmtDate(b.to)}`}</strong>
                          <span>Total {cop(total)}</span>
                          <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-full bg-series-1 ring-[1.5px] ring-current" />
                            Abonos {cop(b.deposit)}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-full bg-series-2 ring-[1.5px] ring-current" />
                            Saldos {cop(b.balance)}
                          </span>
                        </span>
                      ),
                      BAR_TIP,
                    )}
                    className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                  >
                    {/* Las piezas apiladas se separan con 3 px del color de fondo. */}
                    <span
                      aria-hidden="true"
                      data-bar
                      className="flex w-full max-w-[18px] flex-col-reverse gap-[3px] overflow-hidden rounded-full transition-[filter] group-hover:brightness-90"
                      style={{ height: `${(total / max) * 100}%` }}
                    >
                      {b.deposit > 0 && <span className="w-full rounded-full bg-series-1" style={{ flex: b.deposit }} />}
                      {b.balance > 0 && <span className="w-full rounded-full bg-series-2" style={{ flex: b.balance }} />}
                    </span>
                    {i === top && total > 0 && (
                      <span className="absolute -top-5 text-[11.5px] font-bold whitespace-nowrap text-ink tabular-nums">{short(total)}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
          {/* Solo se rotula una de cada `every` columnas: la etiqueta se centra en su barra y ocupa el espacio de las vecinas. */}
          <ol aria-hidden="true" className="mt-2 flex h-4 gap-[2px] text-[11px] text-ink-muted">
            {buckets.map((b, i) => (
              <li key={b.key} className="relative min-w-0 flex-1">
                {i % every === 0 && <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{b.label.replace(/^Sem\. /, "")}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}

/* ───────────── Cobro de las estadías del periodo ───────────── */

export function StaysMeter({ stays }: { stays: ReturnType<typeof finance>["stays"] }) {
  const pct = stays.value ? Math.round((stays.received / stays.value) * 100) : 0;
  return (
    <Card aria-labelledby="fi-stays" className="flex flex-col gap-4 p-5 sm:p-6">
      <CardHeader
        id="fi-stays"
        icon={<CalendarIcon size={18} />}
        accent="green"
        title="Estadías del periodo"
        subtitle={stays.count ? `${plural(stays.count, "reserva llega", "reservas llegan")} en estas fechas` : "Llegadas en estas fechas"}
      />
      {stays.count ? (
        <>
          <div className="flex items-end justify-between gap-3">
            <p className="text-[30px] leading-none font-bold tracking-[-0.03em] text-ink tabular-nums">{pct} %</p>
            <p className="text-right text-[12.5px] text-ink-muted">
              cobrado de
              <strong className="block text-[14px] font-bold text-ink tabular-nums">{cop(stays.value)}</strong>
            </p>
          </div>
          <span aria-hidden="true" className="block h-2.5 overflow-hidden rounded-full bg-ink/8">
            <span className="block h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </span>
          <dl className="grid grid-cols-2 gap-2 text-[12.5px]">
            <div className="rounded-[16px] bg-paper/70 px-3.5 py-2.5">
              <dt className="text-ink-muted">Cobrado</dt>
              <dd className="text-[14px] font-bold text-ink tabular-nums">{cop(stays.received)}</dd>
            </div>
            <div className="rounded-[16px] bg-paper/70 px-3.5 py-2.5">
              <dt className="text-ink-muted">Falta por cobrar</dt>
              <dd className="text-[14px] font-bold text-ink tabular-nums">{cop(stays.pending)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="rounded-[16px] border border-dashed border-line-strong px-4 py-3 text-[13px] text-ink-muted">No hay llegadas en este periodo.</p>
      )}
    </Card>
  );
}

/* ───────────── Listas con barra (ranking) ───────────── */

export function BarList({
  id,
  title,
  subtitle,
  rows,
  total,
  icon,
}: {
  id: string;
  title: string;
  subtitle: string;
  rows: { id: string; label: string; value: number }[];
  total: number;
  icon?: ReactNode;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card aria-labelledby={id} className="flex flex-col gap-4 p-5 sm:p-6">
      <CardHeader id={id} icon={icon} title={title} subtitle={subtitle} />
      {total ? (
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => {
            const pct = Math.round((r.value / total) * 100);
            return (
              <li key={r.id} className="flex items-center gap-3 rounded-[16px] bg-paper/60 px-3.5 py-2.5">
                <span
                  aria-hidden="true"
                  className={`grid size-7 flex-none place-items-center rounded-full text-[12px] font-bold ${i === 0 && r.value ? "bg-ink text-paper" : "bg-panel text-ink-muted"}`}
                >
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex items-baseline justify-between gap-3 text-[13.5px]">
                    <span className="truncate font-semibold text-ink">{r.label}</span>
                    <span className="flex-none text-ink-muted tabular-nums">
                      <strong className="font-bold text-ink">{cop(r.value)}</strong> · {pct} %
                    </span>
                  </span>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-ink/8">
                    <span className="block h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${(r.value / max) * 100}%` }} />
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-[16px] border border-dashed border-line-strong px-4 py-3 text-[13px] text-ink-muted">Sin ingresos en este periodo.</p>
      )}
    </Card>
  );
}
