"use client";

// Módulo de Pagos (/admin/pagos): la operación del dinero. Transacciones en línea, pagos recibidos y lo pendiente por cobrar.
// El análisis (tendencias, comparaciones, distribución) vive en Finanzas.
import Link from "next/link";
import { useState } from "react";
import { AlertIcon, ClockIcon, DownloadIcon, FileTextIcon, HomeIcon, TrendIcon, WalletIcon } from "@/components/icons";
import { balanceDue, finance, pendingOf, paymentsOf, type Payment } from "@/lib/admin-metrics";
import { cop, countdown, download, fmtDate, plural, timeAgo } from "@/lib/format";
import { PAYMENT_STATUS, kindLabel, methodLabel } from "@/lib/payments";
import type { PaymentRecord, Reservation } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin, useParam } from "./context";
import { PeriodFilter, usePeriod } from "./period";
import { ProofCard } from "./proofs";
import { MODULES, paths } from "./routes";
import { csv } from "./shared";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Segmented, StatCard, Tabs } from "./ui";

type Tab = "transacciones" | "comprobantes" | "recibidos" | "por-cobrar";
type TxFilter = "todas" | "en-curso" | "aprobadas" | "rechazadas" | "reembolsar" | "sin-completar";
const TX_FILTER: Record<TxFilter, (p: PaymentRecord) => boolean> = {
  todas: () => true,
  "en-curso": (p) => p.status === "initiated" || p.status === "pending",
  aprobadas: (p) => p.status === "approved" && !p.needsRefund,
  rechazadas: (p) => p.status === "declined" || p.status === "error",
  reembolsar: (p) => p.needsRefund,
  "sin-completar": (p) => p.status === "expired",
};
type ProofFilter = "por-revisar" | "aprobados" | "rechazados" | "todos";
type Due = "todo" | "abonos" | "saldos";
const PROOF_FILTER: Record<ProofFilter, string | null> = { "por-revisar": "pending", aprobados: "approved", rechazados: "rejected", todos: null };

export function PaymentsView() {
  const { data, today } = useAdmin();
  const [tabP, setTab] = useParam<Tab>("vista", "transacciones");
  const pendingProofs = data.proofs.filter((p) => p.status === "pending");
  // Los comprobantes son del flujo anterior (transferencia): la pestaña solo aparece si hay alguno.
  const tab: Tab = tabP === "comprobantes" && !data.proofs.length ? "transacciones" : tabP;
  const open = data.payments.filter(TX_FILTER["en-curso"]);
  const refunds = data.payments.filter(TX_FILTER.reembolsar);
  const due = data.reservations.filter((r) => pendingOf(r).total > 0);
  const deposits = due.filter((r) => pendingOf(r).deposit > 0);
  const balances = due.filter((r) => pendingOf(r).balance > 0);
  const month = finance(data.reservations, data.blocks, data.cabinTypes, { from: today.slice(0, 8) + "01", to: today });

  return (
    <>
      <PageHeader
        title={MODULES.pagos.label}
        description={MODULES.pagos.description}
        actions={
          <Link href={paths.finanzas()} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink underline-offset-2 hover:underline">
            <TrendIcon size={15} />
            Ver análisis en Finanzas
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {refunds.length ? (
          <StatCard label="Pagos por reembolsar" value={refunds.length} hint={cop(refunds.reduce((s, p) => s + p.amount, 0))} icon={<AlertIcon size={15} />} tone="danger" />
        ) : (
          <StatCard label="Pagos en curso" value={open.length} hint={open.length ? "en la pasarela o en el banco" : "Ninguno ahora"} icon={<WalletIcon size={15} />} tone={open.length ? "info" : undefined} />
        )}
        <StatCard label="Abonos pendientes" value={cop(deposits.reduce((s, r) => s + pendingOf(r).deposit, 0))} hint={plural(deposits.length, "retención sin abono", "retenciones sin abono")} icon={<ClockIcon size={15} />} tone={deposits.length ? "warning" : undefined} />
        <StatCard label="Saldos por cobrar" value={cop(balances.reduce((s, r) => s + pendingOf(r).balance, 0))} hint={`${plural(balances.length, "estadía", "estadías")} · se pagan tras el check-in`} icon={<WalletIcon size={15} />} />
        <StatCard label="Recibido este mes" value={cop(month.received)} hint={plural(month.payments.length, "pago", "pagos")} icon={<TrendIcon size={15} />} tone="success" />
      </div>

      <Tabs
        label="Pagos"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "transacciones", label: "Transacciones", icon: <WalletIcon size={15} />, count: open.length + refunds.length },
          { value: "recibidos", label: "Pagos recibidos", icon: <TrendIcon size={15} /> },
          { value: "por-cobrar", label: "Por cobrar", icon: <ClockIcon size={15} /> },
          ...(data.proofs.length ? [{ value: "comprobantes" as const, label: "Comprobantes", icon: <FileTextIcon size={15} />, count: pendingProofs.length }] : []),
        ]}
      />

      <div key={tab} className="flex flex-col gap-4 motion-safe:animate-fade-in">
        {tab === "transacciones" ? <TransactionsTab /> : tab === "comprobantes" ? <ProofsTab /> : tab === "recibidos" ? <ReceivedTab /> : <DueTab rows={due} />}
      </div>
    </>
  );
}

/* ───────────── Transacciones ───────────── */

// Cada intento de pago (en línea o registrado por el equipo) con su estado: iniciado, en proceso, aprobado, rechazado, sin completar.
function TransactionsTab() {
  const { data, now } = useAdmin();
  const [filterP, setFilter] = useParam<TxFilter>("estado", "todas");
  const filter: TxFilter = filterP in TX_FILTER ? filterP : "todas";
  const [limit, setLimit] = useState(30);
  const byCode = new Map(data.reservations.map((r) => [r.code, r]));
  const list = data.payments.filter(TX_FILTER[filter]);
  const count = (k: TxFilter) => data.payments.filter(TX_FILTER[k]).length;
  return (
    <>
      <Segmented
        label="Estado del pago"
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setLimit(30);
        }}
        options={[
          { value: "todas", label: "Todas" },
          { value: "en-curso", label: "En curso", count: count("en-curso") },
          { value: "aprobadas", label: "Aprobadas" },
          { value: "rechazadas", label: "Rechazadas", count: count("rechazadas") },
          ...(count("reembolsar") ? [{ value: "reembolsar" as const, label: "Por reembolsar", count: count("reembolsar") }] : []),
          { value: "sin-completar", label: "Sin completar" },
        ]}
      />
      <Card aria-labelledby="pg-tx" className="flex flex-col gap-3 p-4 sm:p-5">
        <CardHeader id="pg-tx" icon={<WalletIcon size={18} />} title={plural(list.length, "transacción", "transacciones")} subtitle="La reserva se confirma solo con el abono aprobado. Se actualiza en tiempo real." />
        {list.length ? (
          <ul className="-mx-2 flex flex-col">
            {list.slice(0, limit).map((p) => {
              const r = byCode.get(p.reservationCode);
              const st = PAYMENT_STATUS[p.status];
              return (
                <li key={p.id}>
                  <Link href={paths.reserva(p.reservationCode)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-canvas">
                    <span className="min-w-[200px] flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">
                        {r?.guest.fullName ?? p.reservationCode} <span className="font-medium text-ink-muted">· {p.reservationCode}</span>
                      </span>
                      <span className="block truncate text-[12px] text-ink-muted">
                        {kindLabel(p.kind)} · {p.provider === "manual" ? "registrado por el equipo" : p.provider === "wompi" ? "Wompi" : "pasarela simulada"}
                        {p.method && p.provider !== "manual" ? ` · ${methodLabel(p.method)}` : ""} · {timeAgo(p.approvedAt ?? p.createdAt, now)}
                        {p.detail && (p.status === "declined" || p.status === "error" || p.needsRefund) ? ` · ${p.detail}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {p.needsRefund && <Badge tone="danger">Por reembolsar</Badge>}
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <span className="w-[92px] text-right text-[13.5px] font-semibold text-ink tabular-nums">{cop(p.amount)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState compact icon={<WalletIcon size={18} />} title="No hay transacciones en este filtro" text={filter === "todas" ? "Cuando un huésped pague el abono o el saldo, aparecerá aquí." : undefined} />
        )}
        {list.length > limit && (
          <Button size="sm" variant="ghost" className="self-center" onClick={() => setLimit(limit + 50)}>
            Ver más
          </Button>
        )}
      </Card>
    </>
  );
}

/* ───────────── Comprobantes ───────────── */

function ProofsTab() {
  const { data } = useAdmin();
  const [filter, setFilter] = useParam<ProofFilter>("estado", "por-revisar");
  const status = filter in PROOF_FILTER ? PROOF_FILTER[filter] : "pending";
  const list = data.proofs.filter((p) => !status || p.status === status);
  const count = (s: string) => data.proofs.filter((p) => p.status === s).length;
  const byCode = new Map(data.reservations.map((r) => [r.code, r]));

  return (
    <>
      <Segmented
        label="Estado del comprobante"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "por-revisar", label: "Por revisar", count: count("pending") },
          { value: "aprobados", label: "Aprobados", count: count("approved") },
          { value: "rechazados", label: "Rechazados", count: count("rejected") },
          { value: "todos", label: "Todos" },
        ]}
      />
      {list.length ? (
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {list.map((p) => (
            <ProofCard key={p.id} p={p} r={byCode.get(p.reservationCode)} showReservation />
          ))}
        </ul>
      ) : (
        <Card className="p-4">
          <EmptyState
            icon={<FileTextIcon size={18} />}
            title={filter === "por-revisar" ? "No hay comprobantes por revisar" : "No hay comprobantes en este filtro"}
            text={filter === "por-revisar" ? "Cuando un huésped suba su comprobante te llegará una notificación y aparecerá aquí." : undefined}
          />
        </Card>
      )}
    </>
  );
}

/* ───────────── Pagos recibidos ───────────── */

function ReceivedTab() {
  const { data, cabin } = useAdmin();
  const period = usePeriod("30");
  const [cabinId, setCabinId] = useParam("cabana", "");
  const rows = data.reservations
    .filter((r) => !cabinId || r.cabinTypeId === cabinId)
    .flatMap(paymentsOf)
    .filter((p) => p.date >= period.range.from && p.date <= period.range.to)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = rows.reduce((s, p) => s + p.amount, 0);

  const exportCsv = () =>
    download(
      `pagos-${period.range.from}-a-${period.range.to}.csv`,
      csv([["Fecha", "Reserva", "Huésped", "Cabaña", "Concepto", "Valor"], ...rows.map((p) => [p.date, p.r.code, p.r.guest.fullName, cabin(p.r.cabinTypeId)?.nombre ?? p.r.cabinTypeId, p.kind === "deposit" ? "Abono" : "Saldo", p.amount])]),
      "text/csv;charset=utf-8",
    );

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <PeriodFilter period={period} />
        <div className="w-full sm:w-[220px]">
          <Combobox value={cabinId} onChange={setCabinId} options={[{ value: "", label: "Todas las cabañas" }, ...data.cabinTypes.map((c) => ({ value: c.id, label: c.nombre }))]} icon={<HomeIcon size={15} className="text-ink-muted" />} />
        </div>
      </div>
      <Card aria-labelledby="pg-rec" className="flex flex-col gap-3 p-4 sm:p-5">
        <CardHeader
          id="pg-rec"
          icon={<WalletIcon size={18} />}
          title={`${cop(total)} recibidos`}
          subtitle={`${plural(rows.length, "pago", "pagos")} · ${period.label}`}
          actions={
            rows.length ? (
              <Button size="sm" icon={<DownloadIcon size={14} />} onClick={exportCsv}>
                Descargar CSV
              </Button>
            ) : undefined
          }
        />
        {rows.length ? <PaymentsTable rows={rows} /> : <EmptyState compact icon={<WalletIcon size={18} />} title="No se recibieron pagos en este periodo" text="Prueba con un periodo más largo." />}
      </Card>
    </>
  );
}

function PaymentsTable({ rows }: { rows: Payment[] }) {
  const { cabin } = useAdmin();
  const [limit, setLimit] = useState(25);
  return (
    <>
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        <table className="w-full min-w-[520px] text-[13.5px]">
          <thead className="border-y border-line bg-canvas/70 text-left text-[12px] text-ink-muted">
            <tr>
              {["Fecha", "Reserva", "Concepto", "Valor"].map((h) => (
                <th key={h} scope="col" className={`px-4 py-2 font-semibold sm:px-5 ${h === "Valor" ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.slice(0, limit).map((p) => (
              <tr key={`${p.r.code}-${p.kind}`} className="transition-colors hover:bg-canvas/60">
                <td className="px-4 py-2.5 whitespace-nowrap text-ink-muted sm:px-5">{fmtDate(p.date)}</td>
                <td className="px-4 py-2.5 sm:px-5">
                  <Link href={paths.reserva(p.r.code)} className="group block">
                    <span className="block font-semibold text-ink underline-offset-2 group-hover:underline">{p.r.guest.fullName}</span>
                    <span className="block text-[12px] text-ink-muted">
                      {p.r.code} · {cabin(p.r.cabinTypeId)?.nombre}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-2.5 sm:px-5">
                  <span className="inline-flex items-center gap-1.5 text-ink">
                    <span aria-hidden="true" className={`size-2 rounded-[2px] ${p.kind === "deposit" ? "bg-series-1" : "bg-series-2"}`} />
                    {p.kind === "deposit" ? "Abono" : "Saldo"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-ink tabular-nums sm:px-5">{cop(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <Button size="sm" variant="ghost" className="self-center" onClick={() => setLimit(limit + 50)}>
          Ver más pagos
        </Button>
      )}
    </>
  );
}

/* ───────────── Por cobrar ───────────── */

function DueTab({ rows }: { rows: Reservation[] }) {
  const { now } = useAdmin();
  const [kind, setKind] = useParam<Due>("tipo", "todo");
  const list = rows.filter((r) => kind === "todo" || (kind === "abonos" ? pendingOf(r).deposit > 0 : pendingOf(r).balance > 0)).sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1));
  const total = list.reduce((s, r) => s + (kind === "abonos" ? pendingOf(r).deposit : kind === "saldos" ? pendingOf(r).balance : pendingOf(r).total), 0);
  const [limit, setLimit] = useState(25);

  return (
    <>
      <Segmented
        label="Qué falta por cobrar"
        value={kind}
        onChange={setKind}
        options={[
          { value: "todo", label: "Todo" },
          { value: "abonos", label: "Abonos", count: rows.filter((r) => pendingOf(r).deposit > 0).length },
          { value: "saldos", label: "Saldos", count: rows.filter((r) => pendingOf(r).balance > 0).length },
        ]}
      />
      <Card aria-labelledby="pg-due" className="flex flex-col gap-3 p-4 sm:p-5">
        <CardHeader id="pg-due" icon={<ClockIcon size={18} />} title={`${cop(total)} por cobrar`} subtitle="Abonos de fechas retenidas y saldos de estadías confirmadas o en curso, ordenados por fecha de llegada." />
        {list.length ? (
          <ul className="-mx-2 flex flex-col">
            {list.slice(0, limit).map((r) => {
              const p = pendingOf(r);
              const bd = balanceDue(r, now);
              return (
                <li key={r.code}>
                  <Link href={paths.reserva(r.code)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-canvas">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">{r.guest.fullName}</span>
                      <span className="block truncate text-[12px] text-ink-muted">
                        {r.code} · llega {fmtDate(r.checkIn)}
                        {p.deposit ? ` · retención vence en ${countdown(r.depositDueAt)}` : bd ? (bd.overdue ? " · saldo vencido sin pagar" : ` · saldo vence en ${countdown(bd.dueAt!)}`) : " · saldo tras el check-in"}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[13.5px] font-semibold text-ink tabular-nums">{cop(kind === "abonos" ? p.deposit : kind === "saldos" ? p.balance : p.total)}</span>
                      <span className="block text-[11.5px] text-ink-muted">{p.deposit ? `Abono ${cop(p.deposit)}` : "Saldo"}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState compact icon={<ClockIcon size={18} />} title="No hay pagos pendientes" />
        )}
        {list.length > limit && (
          <Button size="sm" variant="ghost" className="self-center" onClick={() => setLimit(limit + 50)}>
            Ver más
          </Button>
        )}
      </Card>
    </>
  );
}
