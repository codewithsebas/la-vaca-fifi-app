"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CalendarIcon, ClockIcon, HomeIcon, ReceiptIcon, TrendIcon, UsersIcon, WalletIcon } from "@/components/icons";
import { delta, finance, pendingOf, previousRange } from "@/lib/admin-metrics";
import { cop, fmtDate, plural } from "@/lib/format";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin, useParam } from "./context";
import { useTip } from "@/components/ui/floating";
import { PeriodFilter, usePeriod } from "./period";
import { MODULES, paths } from "./routes";
import { Card, CardHeader, EmptyState, PageHeader, StatCard, buttonClass } from "./ui";

// "$1.250.000" → "$1,3 M" para ejes y etiquetas compactas.
const short = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M` : n >= 1e3 ? `$${Math.round(n / 1e3)} mil` : cop(n);

// Análisis del negocio por periodo. Los movimientos (pagos uno a uno, pendientes, comprobantes) se gestionan en Pagos.
export function FinanceView() {
  const { data } = useAdmin();
  const period = usePeriod("30");
  const [cabinId, setCabinId] = useParam("cabana", "");
  const range = period.range;
  const prev = previousRange(range);
  const now = useMemo(() => finance(data.reservations, data.blocks, data.cabinTypes, range, cabinId, data.channelStays), [data, range.from, range.to, cabinId]); // eslint-disable-line react-hooks/exhaustive-deps
  const before = useMemo(() => finance(data.reservations, data.blocks, data.cabinTypes, prev, cabinId, data.channelStays), [data, prev.from, prev.to, cabinId]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = data.reservations.filter((r) => (!cabinId || r.cabinTypeId === cabinId) && pendingOf(r).total > 0);
  const pendingTotal = pending.reduce((s, r) => s + pendingOf(r).total, 0);
  const awaiting = pending.filter((r) => r.status === "pending_deposit");
  // Los enlaces a Pagos conservan el periodo y la cabaña elegida aquí.
  const same = {
    periodo: period.preset === "30" ? null : period.preset,
    desde: period.preset === "personalizado" ? range.from : null,
    hasta: period.preset === "personalizado" ? range.to : null,
    cabana: cabinId || null,
  };
  const toPagos = (q: Record<string, string | null>, text: string) => (
    <Link href={paths.pagos(q)} className="font-semibold text-ink underline-offset-2 hover:underline">
      {text}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={MODULES.finanzas.label}
        description="Ingresos según la fecha en que se recibió cada pago: el abono al confirmar y el saldo después del check-in."
        actions={
          <Link href={paths.pagos({ vista: "recibidos", ...same })} className={buttonClass()}>
            <ReceiptIcon size={15} />
            Ver pagos del periodo
          </Link>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
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
          {period.label} · {period.daysLabel} · comparado con los {period.daysLabel} anteriores
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="Ingresos recibidos"
          value={cop(now.received)}
          delta={delta(now.received, before.received)}
          hint={toPagos({ vista: "recibidos", ...same }, plural(now.payments.length, "pago", "pagos"))}
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
          label="Pendientes de abono"
          value={awaiting.length}
          hint={
            awaiting.length
              ? toPagos({ vista: "por-cobrar", tipo: "abonos" }, `${cop(awaiting.reduce((s, r) => s + r.quote.deposit, 0))} por recibir`)
              : "ninguna solicitud en espera"
          }
          icon={<ClockIcon size={15} />}
          tone={awaiting.length ? "warning" : undefined}
        />
        <StatCard
          label="Por cobrar hoy"
          value={cop(pendingTotal)}
          hint={toPagos({ vista: "por-cobrar" }, plural(pending.length, "reserva con pagos pendientes", "reservas con pagos pendientes"))}
          icon={<WalletIcon size={15} />}
          tone="warning"
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

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <RevenueChart buckets={now.buckets} />
        <div className="flex flex-col gap-4">
          <StaysMeter stays={now.stays} />
          <BarList id="fi-cabin" title="Ingresos por cabaña" subtitle="¿Qué cabaña genera más?" rows={now.byCabin} total={now.received} />
          <BarList
            id="fi-type"
            title="Ingresos por tipo de estadía"
            subtitle="Pareja, familia (con niños), grupo (3 o más adultos) o individual."
            rows={now.byType}
            total={now.received}
          />
        </div>
      </div>
    </>
  );
}

/* ───────────── Ingresos en el tiempo (columnas apiladas: abonos + saldos) ───────────── */

export function RevenueChart({ buckets }: { buckets: ReturnType<typeof finance>["buckets"] }) {
  const tip = useTip();
  const max = Math.max(1, ...buckets.map((b) => b.deposit + b.balance));
  const top = buckets.reduce((m, b, i) => (b.deposit + b.balance > buckets[m].deposit + buckets[m].balance ? i : m), 0);
  const every = Math.ceil(buckets.length / 10); // etiquetas del eje x sin amontonarse
  const empty = buckets.every((b) => !b.deposit && !b.balance);

  return (
    <Card aria-labelledby="fi-trend" className="flex flex-col gap-4 p-4 sm:p-5">
      <CardHeader
        id="fi-trend"
        icon={<TrendIcon size={18} />}
        title="Ingresos en el tiempo"
        subtitle={buckets[0]?.from === buckets[0]?.to ? "Por día" : buckets[0]?.label.startsWith("Sem.") ? "Por semana" : "Por mes"}
        actions={
          <ul aria-label="Leyenda" className="flex gap-3 text-[12.5px] text-ink-muted">
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-series-1" />
              Abonos
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-series-2" />
              Saldos
            </li>
          </ul>
        }
      />
      {empty ? (
        <EmptyState
          compact
          icon={<TrendIcon size={18} />}
          title="Sin ingresos en este periodo"
          text="Cuando se confirmen abonos o se cobren saldos, verás aquí su evolución."
        />
      ) : (
        <div className="pl-12">
          <div className="relative h-[240px]">
            {[1, 0.5, 0].map((f) => (
              <div key={f} aria-hidden="true" className="absolute inset-x-0 border-t border-line" style={{ top: `${(1 - f) * 100}%` }}>
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
                    {...tip(() => (
                      <span className="flex flex-col gap-0.5">
                        <strong>{b.from === b.to ? fmtDate(b.from, true) : `${fmtDate(b.from)} → ${fmtDate(b.to)}`}</strong>
                        <span>Total {cop(total)}</span>
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-[2px] bg-series-1" />
                          Abonos {cop(b.deposit)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-[2px] bg-series-2" />
                          Saldos {cop(b.balance)}
                        </span>
                      </span>
                    ))}
                    className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                  >
                    {/* Las piezas apiladas se separan con 2 px del color de fondo. */}
                    <span
                      aria-hidden="true"
                      className="flex w-full max-w-6 flex-col-reverse gap-[2px] transition-[filter] group-hover:brightness-90"
                      style={{ height: `${(total / max) * 100}%` }}
                    >
                      {b.deposit > 0 && <span className={`w-full bg-series-1 ${b.balance ? "" : "rounded-t-[4px]"}`} style={{ flex: b.deposit }} />}
                      {b.balance > 0 && <span className="w-full rounded-t-[4px] bg-series-2" style={{ flex: b.balance }} />}
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
    <Card aria-labelledby="fi-stays" className="flex flex-col gap-3 p-4 sm:p-5">
      <CardHeader
        id="fi-stays"
        icon={<CalendarIcon size={18} />}
        title="Cobro de las estadías del periodo"
        subtitle={`${plural(stays.count, "reserva que llega", "reservas que llegan")} en estas fechas: ¿cuánto ya está cobrado?`}
      />
      {stays.count ? (
        <>
          <div aria-hidden="true" className="flex h-3 gap-[2px] overflow-hidden rounded-full">
            {stays.received > 0 && <span className="bg-series-1" style={{ flex: stays.received }} />}
            {stays.pending > 0 && <span className="bg-series-2" style={{ flex: stays.pending }} />}
          </div>
          <dl className="grid grid-cols-3 gap-2 text-[12.5px]">
            <div>
              <dt className="flex items-center gap-1.5 whitespace-nowrap text-ink-muted">
                <span aria-hidden="true" className="size-2 rounded-[2px] bg-series-1" />
                Cobrado · {pct} %
              </dt>
              <dd className="font-semibold text-ink tabular-nums">{cop(stays.received)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-ink-muted">
                <span aria-hidden="true" className="size-2 rounded-[2px] bg-series-2" />
                Pendiente
              </dt>
              <dd className="font-semibold text-ink tabular-nums">{cop(stays.pending)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Valor total</dt>
              <dd className="font-semibold text-ink tabular-nums">{cop(stays.value)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="text-[13px] text-ink-muted">No hay llegadas en este periodo.</p>
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
}: {
  id: string;
  title: string;
  subtitle: string;
  rows: { id: string; label: string; value: number }[];
  total: number;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card aria-labelledby={id} className="flex flex-col gap-3 p-4 sm:p-5">
      <CardHeader id={id} title={title} subtitle={subtitle} />
      {total ? (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate font-medium text-ink">{r.label}</span>
                <span className="text-ink-muted tabular-nums">
                  <strong className="font-semibold text-ink">{cop(r.value)}</strong> · {total ? Math.round((r.value / total) * 100) : 0} %
                </span>
              </div>
              <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-ink/6">
                <span className="block h-full rounded-r-[4px] bg-chart transition-[width] duration-500" style={{ width: `${(r.value / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-muted">Sin ingresos en este periodo.</p>
      )}
    </Card>
  );
}
