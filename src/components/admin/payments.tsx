"use client";

// Módulo de Pagos (/admin/pagos): la operación del dinero. Pagos recibidos, comprobantes y lo pendiente por cobrar.
// El análisis (tendencias, comparaciones, distribución) vive en Finanzas.
import Link from "next/link";
import { ClockIcon, DownloadIcon, FileTextIcon, HomeIcon, TrendIcon, WalletIcon } from "@/components/ui/icons";
import { balanceDue, finance, pendingOf, paymentsOf, recordsByCode, type Payment } from "@/lib/admin-metrics";
import { cop, download, fmtDate, plural } from "@/lib/format";
import type { Reservation } from "@/lib/types";
import { StatusPill } from "@/components/ui/status-pill";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin, useParam } from "@/components/admin/context";
import { PeriodFilter, usePeriod } from "@/components/admin/period";
import { ProofCard } from "@/components/admin/proofs";
import { MODULES, paths } from "@/components/admin/routes";
import { csv, norm } from "@/components/admin/shared";
import { LIST_CARD, LIST_MOBILE_ROW, LIST_ROW, LIST_ROW_HOVER, LIST_ROW_LATEST, ListSearch, ListTableHead } from "@/components/admin/list-table";
import { RowActions } from "@/components/admin/reservations";
import { Paginator, usePaged } from "@/components/admin/paginator";
import { can } from "@/lib/permissions";
import { Badge, Button, Card, EmptyState, PageHeader, StatCard, Tabs } from "@/components/admin/ui";

type Tab = "recibidos" | "por-cobrar" | "comprobantes";
type ProofFilter = "por-revisar" | "aprobados" | "rechazados" | "todos";
type Due = "todo" | "abonos" | "saldos";
const PROOF_FILTER: Record<ProofFilter, string | null> = { "por-revisar": "pending", aprobados: "approved", rechazados: "rejected", todos: null };

export function PaymentsView() {
  const { data, today } = useAdmin();
  const money = can(data.me.role, "finance");
  const tabs: Tab[] = money ? ["recibidos", "por-cobrar", "comprobantes"] : ["por-cobrar", "comprobantes"];
  const [tabP, setTab] = useParam<Tab>("vista", tabs[0]);
  const tab: Tab = tabs.includes(tabP) ? tabP : tabs[0];
  const pendingProofs = data.proofs.filter((p) => p.status === "pending");
  const due = data.reservations.filter((r) => pendingOf(r).total > 0);
  const deposits = due.filter((r) => pendingOf(r).deposit > 0);
  const balances = due.filter((r) => pendingOf(r).balance > 0);
  const month = finance(data.reservations, data.blocks, data.cabinTypes, { from: today.slice(0, 8) + "01", to: today }, "", recordsByCode(data.payments));

  return (
    <>
      <PageHeader
        title={MODULES.pagos.label}
        description={MODULES.pagos.description}
        actions={
          money ? (
            <Link href={paths.finanzas()} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink underline-offset-2 hover:underline">
              <TrendIcon size={15} />
              Ver análisis en Finanzas
            </Link>
          ) : undefined
        }
      />
      <div className={`grid grid-cols-2 gap-3 ${money ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <StatCard
          accent="blue"
          label="Comprobantes por revisar"
          value={pendingProofs.length}
          hint={pendingProofs.length ? "transferencias por confirmar" : "Ninguno ahora"}
          icon={<FileTextIcon size={15} />}
          tone={pendingProofs.length ? "info" : undefined}
        />
        <StatCard
          accent="yellow"
          label="Abonos pendientes"
          value={cop(deposits.reduce((s, r) => s + pendingOf(r).deposit, 0))}
          hint={plural(deposits.length, "retención sin abono", "retenciones sin abono")}
          icon={<ClockIcon size={15} />}
          tone={deposits.length ? "warning" : undefined}
        />
        <StatCard
          accent="green"
          label="Saldos por cobrar"
          value={cop(balances.reduce((s, r) => s + pendingOf(r).balance, 0))}
          hint={plural(balances.length, "estadía", "estadías")}
          icon={<WalletIcon size={15} />}
        />
        {money && (
          <StatCard
            accent="pink"
            label="Recibido este mes"
            value={cop(month.received)}
            hint={plural(month.payments.length, "pago", "pagos")}
            icon={<TrendIcon size={15} />}
            tone="success"
          />
        )}
      </div>

      <Tabs
        label="Pagos"
        value={tab}
        onChange={setTab}
        tabs={[
          ...(money ? [{ value: "recibidos" as Tab, label: "Pagos recibidos", icon: <TrendIcon size={15} /> }] : []),
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
  const paged = usePaged(list, "comprobantes", filter);

  return (
    <>
      <div className="w-full sm:w-[260px]">
        <label htmlFor="pg-estado" className="sr-only">
          Estado del comprobante
        </label>
        <Combobox
          id="pg-estado"
          value={filter}
          onChange={(v) => setFilter(v as ProofFilter)}
          searchable={false}
          options={[
            { value: "por-revisar", label: "Por revisar", description: plural(count("pending"), "comprobante", "comprobantes") },
            { value: "aprobados", label: "Aprobados", description: plural(count("approved"), "comprobante", "comprobantes") },
            { value: "rechazados", label: "Rechazados", description: plural(count("rejected"), "comprobante", "comprobantes") },
            { value: "todos", label: "Todos" },
          ]}
        />
      </div>
      {list.length ? (
        <>
          <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {paged.rows.map((p) => (
              <ProofCard key={p.id} p={p} r={byCode.get(p.reservationCode)} showReservation />
            ))}
          </ul>
          <Paginator p={paged} noun="comprobantes" className="rounded-[20px] bg-panel px-4 py-3" />
        </>
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
  const [q, setQ] = useParam("q", "");
  const nq = norm(q.trim());
  const records = recordsByCode(data.payments);
  const rows = data.reservations
    .filter(
      (r) =>
        (!cabinId || r.cabinTypeId === cabinId) &&
        (!nq || [r.code, r.guest.fullName, r.guest.phone, r.guest.docNumber].some((v) => norm(v || "").includes(nq))),
    )
    .flatMap((r) => paymentsOf(r, records.get(r.code)))
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
      <div className="flex flex-wrap items-center gap-2">
        <ListSearch
          id="pg-q"
          label="Buscar pagos"
          value={q}
          onChange={setQ}
          placeholder="Nombre, código, celular o documento"
          className="w-full sm:w-[300px]"
        />
        <PeriodFilter period={period} />
        <div className="w-full sm:w-[220px]">
          <Combobox
            value={cabinId}
            onChange={setCabinId}
            options={[{ value: "", label: "Todas las cabañas" }, ...data.cabinTypes.map((c) => ({ value: c.id, label: c.nombre }))]}
            icon={<HomeIcon size={14} className="text-ink-muted" />}
          />
        </div>
        {rows.length > 0 && (
          <Button icon={<DownloadIcon size={14} />} onClick={exportCsv} className="ml-auto">
            Descargar CSV
          </Button>
        )}
      </div>
      {rows.length ? (
        <PaymentsTable rows={rows} total={total} reset={`${period.range.from}|${period.range.to}|${cabinId}|${nq}`} />
      ) : (
        <Card className="p-4">
          <EmptyState icon={<WalletIcon size={18} />} title="No hay pagos con esos filtros" text="Prueba con un periodo más largo u otra búsqueda." />
        </Card>
      )}
    </>
  );
}

function PaymentsTable({ rows, total, reset }: { rows: Payment[]; total: number; reset: string }) {
  const { cabinLabel, openReservation } = useAdmin();
  const paged = usePaged(rows, "pagos-recibidos", reset);
  const latest = rows[0];
  const concept = (p: Payment) => (
    <span className="inline-flex items-center gap-1.5 text-ink">
      <span aria-hidden="true" className={`size-2 rounded-[2px] ${p.kind === "deposit" ? "bg-series-1" : "bg-series-2"}`} />
      {p.kind === "deposit" ? "Abono" : "Saldo"}
    </span>
  );
  return (
    <>
      <Card className={LIST_CARD}>
        <table className="w-full text-[14px]">
          <ListTableHead columns={["Reserva", "Huésped", "Cabaña", "Fecha", "Concepto", "Valor", "Acciones"]} right={["Valor", "Acciones"]} />
          <tbody className="divide-y divide-line">
            {paged.rows.map((p) => (
              <tr
                key={`${p.r.code}-${p.kind}`}
                onClick={() => openReservation(p.r.code)}
                className={`${LIST_ROW} ${p === latest ? LIST_ROW_LATEST : LIST_ROW_HOVER}`}
              >
                <td className="px-4 py-3">
                  <Link
                    href={paths.reserva(p.r.code)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-sm font-bold whitespace-nowrap text-ink underline-offset-2 hover:underline"
                  >
                    {p.r.code}
                  </Link>
                </td>
                <td className="px-4 py-3 font-semibold text-ink">{p.r.guest.fullName}</td>
                <td className="px-4 py-3 text-ink">{cabinLabel(p.r.cabinTypeId, p.r.unit)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-ink">{fmtDate(p.date)}</td>
                <td className="px-4 py-3">{concept(p)}</td>
                <td className="px-4 py-3 text-right font-semibold text-ink tabular-nums">{cop(p.amount)}</td>
                <td className="px-4 py-3">
                  <RowActions r={p.r} only={[]} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line bg-canvas/70">
            <tr>
              <td colSpan={5} className="px-4 py-2.5 text-right text-[13px] font-semibold text-ink-muted">
                Total recibido
              </td>
              <td className="px-4 py-2.5 text-right font-bold text-ink tabular-nums">{cop(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        <Paginator p={paged} noun="pagos" className="border-t border-line px-4 py-3" />
      </Card>
      <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:hidden">
        {paged.rows.map((p) => (
          <li key={`${p.r.code}-${p.kind}`}>
            <Link href={paths.reserva(p.r.code)} className={`${LIST_MOBILE_ROW} ${p === latest ? "bg-yellow-soft/70" : "bg-paper"}`}>
              <span className="flex w-full items-center justify-between gap-2">
                <strong className="text-[13px] font-bold text-ink-muted">{p.r.code}</strong>
                <strong className="font-semibold text-ink tabular-nums">{cop(p.amount)}</strong>
              </span>
              <span className="font-semibold text-ink">{p.r.guest.fullName}</span>
              <span className="flex w-full items-center justify-between gap-2 text-[13px] text-ink-muted">
                <span>{`${cabinLabel(p.r.cabinTypeId, p.r.unit)} · ${fmtDate(p.date)}`}</span>
                {concept(p)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Paginator p={paged} noun="pagos" className="rounded-[20px] bg-paper px-4 py-3 ring-1 ring-line xl:hidden" />
    </>
  );
}

/* ───────────── Por cobrar ───────────── */

function DueTab({ rows }: { rows: Reservation[] }) {
  const { data, cabinLabel, openReservation } = useAdmin();
  const [kind, setKind] = useParam<Due>("tipo", "todo");
  const [q, setQ] = useParam("q", "");
  const [cabinId, setCabinId] = useParam("cabana", "");
  const nq = norm(q.trim());
  const list = rows
    .filter(
      (r) =>
        (kind === "todo" || (kind === "abonos" ? pendingOf(r).deposit > 0 : pendingOf(r).balance > 0)) &&
        (!cabinId || r.cabinTypeId === cabinId) &&
        (!nq || [r.code, r.guest.fullName, r.guest.phone, r.guest.docNumber].some((v) => norm(v || "").includes(nq))),
    )
    .sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1));
  const amount = (r: Reservation) => (kind === "abonos" ? pendingOf(r).deposit : kind === "saldos" ? pendingOf(r).balance : pendingOf(r).total);
  const total = list.reduce((s, r) => s + amount(r), 0);
  const paged = usePaged(list, "por-cobrar", [kind, nq, cabinId].join("|"));
  const detail = (r: Reservation) => {
    return r.status === "pending_deposit"
      ? "Sin confirmar, no aparta las fechas"
      : balanceDue(r)
        ? "En estadía, saldo por cobrar"
        : "Saldo antes de llegar o en recepción";
  };

  return (
    <>
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-3">
        <ListSearch id="pg-due-q" label="Buscar por cobrar" value={q} onChange={setQ} placeholder="Nombre, código, celular o documento" />
        <div className="min-w-0">
          <label htmlFor="pg-tipo" className="sr-only">
            Qué falta por cobrar
          </label>
          <Combobox
            id="pg-tipo"
            value={kind}
            onChange={(v) => setKind(v as Due)}
            searchable={false}
            options={[
              { value: "todo", label: "Todo por cobrar" },
              { value: "abonos", label: "Abonos", description: plural(rows.filter((r) => pendingOf(r).deposit > 0).length, "reserva", "reservas") },
              { value: "saldos", label: "Saldos", description: plural(rows.filter((r) => pendingOf(r).balance > 0).length, "reserva", "reservas") },
            ]}
          />
        </div>
        <div className="min-w-0">
          <Combobox
            value={cabinId}
            onChange={setCabinId}
            options={[{ value: "", label: "Todas las cabañas" }, ...data.cabinTypes.map((c) => ({ value: c.id, label: c.nombre }))]}
            icon={<HomeIcon size={14} className="text-ink-muted" />}
          />
        </div>
      </div>
      {list.length ? (
        <>
          <Card className={LIST_CARD}>
            <table className="w-full text-[14px]">
              <ListTableHead columns={["Reserva", "Huésped", "Cabaña", "Llegada", "Por cobrar", "Estado", "Acciones"]} right={["Por cobrar", "Acciones"]} />
              <tbody className="divide-y divide-line">
                {paged.rows.map((r) => (
                  <tr key={r.code} onClick={() => openReservation(r.code)} className={`${LIST_ROW} ${LIST_ROW_HOVER}`}>
                    <td className="px-4 py-3">
                      <Link
                        href={paths.reserva(r.code)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-sm font-bold whitespace-nowrap text-ink underline-offset-2 hover:underline"
                      >
                        {r.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block font-semibold text-ink">{r.guest.fullName}</span>
                      <span className="block text-[12.5px] text-ink-muted">{detail(r)}</span>
                    </td>
                    <td className="px-4 py-3 text-ink">{cabinLabel(r.cabinTypeId, r.unit)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink">{fmtDate(r.checkIn)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="block font-semibold text-ink tabular-nums">{cop(amount(r))}</span>
                      <span className="block text-[12px] text-ink-muted">{pendingOf(r).deposit ? "Abono" : "Saldo"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} size="sm" />
                    </td>
                    <td className="px-4 py-3">
                      <RowActions r={r} only={["pay"]} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line bg-canvas/70">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 text-right text-[13px] font-semibold text-ink-muted">
                    Total por cobrar
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-ink tabular-nums">{cop(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
            <Paginator p={paged} noun="reservas" className="border-t border-line px-4 py-3" />
          </Card>
          <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:hidden">
            {paged.rows.map((r) => (
              <li key={r.code}>
                <Link href={paths.reserva(r.code)} className={`${LIST_MOBILE_ROW} bg-paper`}>
                  <span className="flex w-full items-center justify-between gap-2">
                    <strong className="text-[13px] font-bold text-ink-muted">{r.code}</strong>
                    <strong className="font-semibold text-ink tabular-nums">{cop(amount(r))}</strong>
                  </span>
                  <span className="font-semibold text-ink">{r.guest.fullName}</span>
                  <span className="text-[13px] text-ink-muted">{`Llega ${fmtDate(r.checkIn)} · ${detail(r)}`}</span>
                  <Badge tone={pendingOf(r).deposit ? "warning" : "neutral"}>{pendingOf(r).deposit ? "Abono" : "Saldo"}</Badge>
                </Link>
              </li>
            ))}
          </ul>
          <Paginator p={paged} noun="reservas" className="rounded-[20px] bg-paper px-4 py-3 ring-1 ring-line xl:hidden" />
        </>
      ) : (
        <Card className="p-4">
          <EmptyState icon={<ClockIcon size={18} />} title={rows.length ? "No hay pagos pendientes con esos filtros" : "No hay pagos pendientes"} />
        </Card>
      )}
    </>
  );
}
