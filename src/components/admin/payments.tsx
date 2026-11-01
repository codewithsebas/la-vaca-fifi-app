"use client";

// Módulo de Pagos (/admin/pagos): la operación del dinero. Pagos recibidos, comprobantes y lo pendiente por cobrar.
// El análisis (tendencias, comparaciones, distribución) vive en Finanzas.
import Link from "next/link";
import { useState } from "react";
import { ClockIcon, DownloadIcon, FileTextIcon, HomeIcon, TrendIcon, WalletIcon } from "@/components/ui/icons";
import { balanceDue, finance, pendingOf, paymentsOf, type Payment } from "@/lib/admin-metrics";
import { cop, countdown, download, fmtDate, plural } from "@/lib/format";
import type { Reservation } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin, useParam } from "@/components/admin/context";
import { PeriodFilter, usePeriod } from "@/components/admin/period";
import { ProofCard } from "@/components/admin/proofs";
import { MODULES, paths } from "@/components/admin/routes";
import { csv } from "@/components/admin/shared";
import { Button, Card, CardHeader, EmptyState, PageHeader, Segmented, StatCard, Tabs } from "@/components/admin/ui";

type Tab = "recibidos" | "por-cobrar" | "comprobantes";
type ProofFilter = "por-revisar" | "aprobados" | "rechazados" | "todos";
type Due = "todo" | "abonos" | "saldos";
const PROOF_FILTER: Record<ProofFilter, string | null> = { "por-revisar": "pending", aprobados: "approved", rechazados: "rejected", todos: null };

export function PaymentsView() {
  const { data, today } = useAdmin();
  const [tabP, setTab] = useParam<Tab>("vista", "recibidos");
  const tab: Tab = ["recibidos", "por-cobrar", "comprobantes"].includes(tabP) ? tabP : "recibidos";
  const pendingProofs = data.proofs.filter((p) => p.status === "pending");
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
        <StatCard
          label="Comprobantes por revisar"
          value={pendingProofs.length}
          hint={pendingProofs.length ? "transferencias por confirmar" : "Ninguno ahora"}
          icon={<FileTextIcon size={15} />}
          tone={pendingProofs.length ? "info" : undefined}
        />
        <StatCard
          label="Abonos pendientes"
          value={cop(deposits.reduce((s, r) => s + pendingOf(r).deposit, 0))}
          hint={plural(deposits.length, "retención sin abono", "retenciones sin abono")}
          icon={<ClockIcon size={15} />}
          tone={deposits.length ? "warning" : undefined}
        />
        <StatCard
          label="Saldos por cobrar"
          value={cop(balances.reduce((s, r) => s + pendingOf(r).balance, 0))}
          hint={plural(balances.length, "estadía", "estadías")}
          icon={<WalletIcon size={15} />}
        />
        <StatCard
          label="Recibido este mes"
          value={cop(month.received)}
          hint={plural(month.payments.length, "pago", "pagos")}
          icon={<TrendIcon size={15} />}
          tone="success"
        />
      </div>

      <Tabs
        label="Pagos"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "recibidos", label: "Pagos recibidos", icon: <TrendIcon size={15} /> },
          { value: "por-cobrar", label: "Por cobrar", icon: <ClockIcon size={15} /> },
          { value: "comprobantes", label: "Comprobantes", icon: <FileTextIcon size={15} />, count: pendingProofs.length },
        ]}
      />

      <div key={tab} className="flex flex-col gap-4 motion-safe:animate-fade-in">
        {tab === "comprobantes" ? <ProofsTab /> : tab === "recibidos" ? <ReceivedTab /> : <DueTab rows={due} />}
      </div>
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
      csv([
        ["Fecha", "Reserva", "Huésped", "Cabaña", "Concepto", "Valor"],
        ...rows.map((p) => [
          p.date,
          p.r.code,
          p.r.guest.fullName,
          cabin(p.r.cabinTypeId)?.nombre ?? p.r.cabinTypeId,
          p.kind === "deposit" ? "Abono" : "Saldo",
          p.amount,
        ]),
      ]),
      "text/csv;charset=utf-8",
    );

  return (
    <>
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
        {rows.length ? (
          <PaymentsTable rows={rows} />
        ) : (
          <EmptyState compact icon={<WalletIcon size={18} />} title="No se recibieron pagos en este periodo" text="Prueba con un periodo más largo." />
        )}
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
  const [kind, setKind] = useParam<Due>("tipo", "todo");
  const list = rows
    .filter((r) => kind === "todo" || (kind === "abonos" ? pendingOf(r).deposit > 0 : pendingOf(r).balance > 0))
    .sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1));
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
        <CardHeader
          id="pg-due"
          icon={<ClockIcon size={18} />}
          title={`${cop(total)} por cobrar`}
          subtitle="Abonos de fechas retenidas y saldos de estadías confirmadas o en curso, ordenados por fecha de llegada."
        />
        {list.length ? (
          <ul className="-mx-2 flex flex-col">
            {list.slice(0, limit).map((r) => {
              const p = pendingOf(r);
              const bd = balanceDue(r);
              return (
                <li key={r.code}>
                  <Link
                    href={paths.reserva(r.code)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-canvas"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">{r.guest.fullName}</span>
                      <span className="block truncate text-[12px] text-ink-muted">
                        {r.code} · llega {fmtDate(r.checkIn)}
                        {p.deposit
                          ? ` · retención vence en ${countdown(r.depositDueAt)}`
                          : bd
                            ? " · en estadía, saldo por cobrar"
                            : " · saldo antes de llegar o en recepción"}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[13.5px] font-semibold text-ink tabular-nums">
                        {cop(kind === "abonos" ? p.deposit : kind === "saldos" ? p.balance : p.total)}
                      </span>
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
