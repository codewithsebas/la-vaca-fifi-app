"use client";

// Página de una reserva (/admin/reservas/[codigo]): acciones, pagos, correos, comprobantes, notas, cliente y datos de la estadía.
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  AlertIcon,
  CheckIcon,
  ClockIcon,
  FileTextIcon,
  LinkIcon,
  ListIcon,
  LockIcon,
  MailIcon,
  NoteIcon,
  RefreshIcon,
  UsersIcon,
  WalletIcon,
  WhatsAppIcon,
} from "@/components/ui/icons";
import { KeyValues, StatusPill } from "@/components/ui/status-pill";
import { balanceDue, buildClients, typeMarks } from "@/lib/admin-metrics";
import { api } from "@/lib/client/api";
import { channelBlocks } from "@/lib/booking";
import { config } from "@/lib/config";
import { addDays, cop, countdown, dateOf, fmtClock, fmtDate, fmtDateTime, nightsBetween, plural, timeAgo, waTo } from "@/lib/format";
import { BALANCE_MINUTES, DEFAULT_HOLD, HOLD_OPTIONS, PAYMENT_STATUS, kindLabel, manualDueAt, methodLabel } from "@/lib/payments";
import type { EmailRecord, PaymentRecord, Reservation } from "@/lib/types";
import { useAdmin } from "@/components/admin/context";
import { ProofCard } from "@/components/admin/proofs";
import { PayLinkShare, fmtDeadline, payUrlOf } from "@/components/admin/pay-link-share";
import { paths } from "@/components/admin/routes";
import { TRUST, type ConfirmCfg, adminInput } from "@/components/admin/shared";
import { Badge, Button, Card, CardHeader, EmptyState, Field, FieldError, PageHeader, Segmented, Stars, buttonClass } from "@/components/admin/ui";

const OCC: Record<string, string> = { aniversario: "Aniversario", cumpleanos: "Cumpleaños", propuesta: "Propuesta", otra: "Otra" };

type Action = { label: string; primary: boolean; danger: boolean; disabled?: string; run: () => void };
type ActionId = "confirm" | "balance" | "checkin" | "checkout" | "cancel" | "reschedule";

export function ReservationDetail({ code }: { code: string }) {
  const { data, ask, cabinLabel, today, now } = useAdmin();
  const r = data.reservations.find((x) => x.code === code);

  if (!r)
    return (
      <>
        <PageHeader title="Reserva no encontrada" />
        <Card className="p-4">
          <EmptyState
            icon={<ListIcon size={18} />}
            title={`No existe una reserva con el código ${code}`}
            text="Revisa el código o búscala en la lista de reservas."
            action={
              <Link href={paths.reservas()} className={buttonClass("primary")}>
                Ir a Reservas
              </Link>
            }
          />
        </Card>
      </>
    );

  const cabin = cabinLabel(r.cabinTypeId, r.unit);
  const proofs = data.proofs.filter((p) => p.reservationCode === r.code);
  const payments = data.payments.filter((p) => p.reservationCode === r.code);
  const emails = data.emails.filter((e) => e.reservationCode === r.code);
  const pendingProof = proofs.some((p) => p.status === "pending");
  const units = data.cabinTypes.find((c) => c.id === r.cabinTypeId)?.units ?? 1;
  const due = balanceDue(r, now);
  const processing = payments.find((p) => p.status === "pending");
  const refunds = payments.filter((p) => p.needsRefund);

  const act = (label: string, action: ActionId, opts: Partial<ConfirmCfg> & { primary?: boolean; disabled?: string } = {}): Action => ({
    label,
    primary: !!opts.primary,
    danger: !!opts.danger,
    disabled: opts.disabled,
    run: () =>
      ask({
        title: label,
        text: `${r.code} · ${r.guest.fullName}`,
        okLabel: label,
        done: `${label}: listo`,
        run: (cf) => {
          if (action === "reschedule") {
            if (!cf.ci || !cf.co || cf.co <= cf.ci) return Promise.resolve({ status: 400, data: null });
            return api.admin.action({ code: r.code, action, checkIn: cf.ci, checkOut: cf.co });
          }
          if (action === "confirm" || action === "balance")
            return api.admin.action({ code: r.code, action, note: cf.note ?? "", full: action === "confirm" && !!cf.option });
          return api.admin.action({ code: r.code, action });
        },
        ...opts,
      }),
  });

  const manualNote = { noteLabel: "Detalle del pago (opcional)", noteHint: "Medio y referencia: efectivo, transferencia Bancolombia #…" };
  const actions: Action[] = [];
  if (r.status === "pending_deposit" || r.status === "expired")
    actions.push(
      act(r.status === "expired" ? "Registrar pago y reactivar" : "Registrar pago manual", "confirm", {
        text: `Solo si recibiste el pago por fuera de la pasarela (efectivo o transferencia): el abono de ${cop(r.quote.deposit)} o el total de ${cop(r.quote.total)}. La reserva queda confirmada, el pago queda en el historial y se envía el correo de confirmación.`,
        details: processing ? [{ k: "Atención", v: "Hay un pago en línea en proceso: si también se aprueba, quedará marcado para reembolso." }] : undefined,
        optionLabel: `El huésped pagó el total (${cop(r.quote.total)}), no solo el abono`,
        ...manualNote,
      }),
    );
  const earlyDue = (r.status === "confirmed" || r.status === "rescheduled") && !r.balancePaidAt ? Math.max(0, r.quote.total - r.paid) : 0;
  if (r.status === "confirmed" || r.status === "rescheduled")
    actions.push(
      act("Marcar check-in", "checkin", {
        primary: true,
        text: earlyDue
          ? `El huésped verá de inmediato en «Mi reserva» que debe pagar el saldo de ${cop(earlyDue)}. Tendrá ${BALANCE_MINUTES / 60} hora para pagarlo en línea.`
          : "La estadía ya está pagada: no queda saldo por cobrar.",
      }),
    );
  if (earlyDue)
    actions.push(
      act("Registrar pago del saldo", "balance", {
        text: `Registra el saldo de ${cop(earlyDue)} recibido antes de la llegada (efectivo o transferencia).`,
        ...manualNote,
      }),
    );
  if (r.status === "checked_in") {
    if (due)
      actions.push(
        act("Registrar pago del saldo", "balance", {
          primary: true,
          text: `Registra el saldo de ${cop(due.amount)} recibido en recepción (efectivo o transferencia). Después podrás hacer el check-out.`,
          details: processing
            ? [{ k: "Atención", v: "Hay un pago en línea del saldo en proceso: si también se aprueba, quedará marcado para reembolso." }]
            : undefined,
          ...manualNote,
        }),
      );
    actions.push(act("Marcar check-out", "checkout", { primary: !due, disabled: due ? "Disponible cuando el saldo esté pagado" : undefined }));
  }
  if (["pending_deposit", "confirmed", "rescheduled"].includes(r.status)) {
    actions.push(
      act("Reprogramar", "reschedule", {
        reschedule: true,
        ci: r.checkIn,
        co: r.checkOut,
        marks: typeMarks(data.reservations, [...data.blocks, ...channelBlocks(data.channelStays)], r.cabinTypeId, units, today, addDays(today, 365), r.code),
        text: "Elige las nuevas fechas. Se valida la disponibilidad de la misma cabaña y se recalcula el total con las tarifas vigentes (lo ya pagado se conserva).",
      }),
    );
    actions.push(
      act("Cancelar reserva", "cancel", {
        danger: true,
        text: `${r.code} · ${r.depositPaidAt ? "El abono recibido no es reembolsable según las políticas." : "Las fechas quedarán libres."}`,
      }),
    );
  }

  const client = buildClients(
    data.reservations.filter((x) => x.clientKey === r.clientKey),
    data.clients,
    today,
  )[0];

  return (
    <>
      <PageHeader
        title={r.code}
        description={`${r.guest.fullName} · ${cabin} · ${fmtDate(r.checkIn)} → ${fmtDate(r.checkOut)} · ${plural(nightsBetween(r.checkIn, r.checkOut), "noche", "noches")}`}
        actions={
          <>
            {actions.map((a) => (
              <Button
                key={a.label}
                variant={a.primary ? "primary" : a.danger ? "danger-ghost" : "secondary"}
                onClick={a.run}
                disabled={!!a.disabled}
                title={a.disabled}
              >
                {a.label}
              </Button>
            ))}
            <a
              href={waTo(r.guest.phone, `Hola ${r.guest.fullName.split(" ")[0]}, te escribimos de ${config.name} por tu reserva ${r.code}.`)}
              target="_blank"
              rel="noopener"
              className={buttonClass("secondary")}
            >
              <WhatsAppIcon size={16} />
              WhatsApp
            </a>
          </>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusPill status={r.status} size="sm" />
          {r.source === "panel" && <Badge tone="neutral">Creada por el equipo</Badge>}
          {pendingProof && (
            <Badge tone="info" icon={<FileTextIcon size={12} />}>
              Comprobante por revisar
            </Badge>
          )}
          {r.status === "pending_deposit" &&
            (processing ? (
              <Badge tone="warning">Pago del abono en proceso</Badge>
            ) : (
              <Badge tone="warning">{`Retención vence en ${countdown(r.depositDueAt)}`}</Badge>
            ))}
          {due &&
            (due.overdue ? <Badge tone="danger">Saldo vencido sin pagar</Badge> : <Badge tone="warning">{`Saldo vence en ${countdown(due.dueAt!)}`}</Badge>)}
          {refunds.length > 0 && (
            <Badge tone="danger" icon={<AlertIcon size={12} />}>
              {plural(refunds.length, "pago por reembolsar", "pagos por reembolsar")}
            </Badge>
          )}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          {(r.status === "pending_deposit" || r.status === "expired") && !processing && <PayLinkCard r={r} />}
          <PaymentSummary r={r} payments={payments} />
          <EmailsCard emails={emails} />
          {proofs.length > 0 && (
            <Card aria-labelledby="dt-proofs" className="flex flex-col gap-3 p-4 sm:p-5">
              <CardHeader
                id="dt-proofs"
                icon={<FileTextIcon size={18} />}
                title="Comprobantes de pago"
                subtitle="Enviados por el huésped antes de los pagos en línea."
                actions={
                  <span className="flex items-center gap-1 text-[12px] text-ink-subtle">
                    <LockIcon size={12} />
                    Privados
                  </span>
                }
              />
              <ul className="flex flex-col gap-2">
                {proofs.map((p) => (
                  <ProofCard key={p.id} p={p} r={r} />
                ))}
              </ul>
            </Card>
          )}
          <Notes r={r} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {client && <ClientCard c={client} />}
          <DetailCard id="dt-stay" title="Estadía" rows={stayRows(r, cabin)} />
          <DetailCard id="dt-guest" title="Huésped" rows={guestRows(r)} />
        </div>
      </div>
    </>
  );
}

const stayRows = (r: Reservation, cabin: string) => [
  { k: "Llegada", v: fmtDate(r.checkIn, true) },
  { k: "Salida", v: fmtDate(r.checkOut, true) },
  { k: "Cabaña", v: cabin },
  { k: "Huéspedes", v: `${plural(r.adults, "adulto", "adultos")} · ${plural(r.children, "niño", "niños")}` },
  { k: "Llegada estimada", v: r.estimatedArrival || "—" },
  { k: "Check-in registrado", v: r.checkedInAt ? fmtDateTime(r.checkedInAt) : "—" },
  { k: "Mascota", v: r.pet?.hasPet ? "Sí" : "No" },
  {
    k: "Decoración",
    v: r.decoration?.requested ? `${OCC[r.decoration.occasion] || "Sí"}${r.decoration.notes ? " · " + r.decoration.notes : ""}` : "No",
    wide: true,
  },
  { k: "Solicitudes", v: r.specialRequests || "—", wide: true },
];

const guestRows = (r: Reservation) => [
  { k: "Nombre", v: r.guest.fullName, wide: true },
  { k: "Documento", v: `${r.guest.docType} ${r.guest.docNumber}` },
  { k: "Celular", v: r.guest.phone },
  { k: "Ciudad", v: r.guest.city || "—" },
  { k: "Promociones", v: r.consents?.marketing ? "Acepta" : "No acepta" },
  { k: "Correo", v: r.guest.email, wide: true },
  { k: "Creada", v: fmtDateTime(r.createdAt), wide: true },
];

function DetailCard({ id, title, rows }: { id: string; title: string; rows: { k: string; v: string; wide?: boolean }[] }) {
  return (
    <Card aria-labelledby={id} className="flex flex-col gap-3 p-4 sm:p-5">
      <h2 id={id} className="text-[12px] font-bold tracking-[.06em] text-ink-muted uppercase">
        {title}
      </h2>
      <KeyValues rows={rows} variant="plain" />
    </Card>
  );
}

// Enlace de pago para el huésped: compartirlo, darle un plazo nuevo o, si la retención venció, reactivarla con un plazo.
function PayLinkCard({ r }: { r: Reservation }) {
  const { setData, toast, onAuthError, now } = useAdmin();
  const [hold, setHold] = useState(DEFAULT_HOLD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const expired = r.status === "expired" || Date.parse(r.depositDueAt) <= now;
  const due = manualDueAt(r.checkIn, hold, now);
  const url = r.payToken ? payUrlOf(r.payToken) : null;

  async function apply() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.admin.action({ code: r.code, action: "payment_link", holdMinutes: hold });
      if (res.status === 401 || res.status === 403) return onAuthError();
      if (res.status !== 200 || !res.data) {
        const code = (res.data as { error?: string } | null)?.error;
        setError(
          code === "HOLD_TOO_SHORT"
            ? "Ya no queda tiempo antes de la llegada: registra el pago manualmente."
            : res.status === 409
              ? "Esas fechas ya no están libres: la reserva no se puede reactivar."
              : code === "CHANNEL_UNAVAILABLE"
                ? "No se pudo retener la cabaña en Booking.com (Beds24 no respondió). Inténtalo en un momento."
                : "No se pudo actualizar el enlace. Inténtalo de nuevo.",
        );
        return;
      }
      const updated = res.data;
      setData((d) => ({ ...d, reservations: d.reservations.map((x) => (x.code === updated.code ? updated : x)) }));
      setEditing(false);
      toast(r.status === "expired" ? "Reserva reactivada: envía el enlace al huésped" : `Nuevo plazo: hasta el ${fmtDeadline(updated.depositDueAt)}`);
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const picker = (
    <div className="flex flex-col gap-2 rounded-xl bg-canvas p-3">
      <Segmented
        label="Plazo para pagar"
        size="sm"
        value={String(hold)}
        onChange={(v) => setHold(Number(v))}
        options={HOLD_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
        className="flex-wrap"
      />
      <p className="text-[12.5px] text-ink-muted">
        {due.tooShort
          ? "Ya no queda tiempo antes de la llegada."
          : `Vencerá el ${fmtDeadline(due.dueAt)}${due.capped ? " (no puede pasar del día de llegada)" : ""}`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" loading={busy} disabled={due.tooShort} onClick={apply}>
          {r.status === "expired" ? "Reactivar y crear enlace" : url ? "Aplicar nuevo plazo" : "Crear enlace de pago"}
        </Button>
        {editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        )}
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );

  return (
    <Card aria-labelledby="dt-paylink" className="flex flex-col gap-3 p-4 sm:p-5">
      <CardHeader
        id="dt-paylink"
        icon={<LinkIcon size={18} />}
        title="Enlace de pago"
        subtitle={
          r.status === "expired"
            ? "La retención venció sin pago y las fechas se liberaron. Si siguen libres, puedes reactivarla con un plazo nuevo."
            : "El huésped paga el abono o el total con Wompi sin escribir código ni correo. Al pagar, la reserva se confirma sola."
        }
        actions={
          url && r.status === "pending_deposit" && !editing ? (
            <Button size="sm" variant="ghost" icon={<ClockIcon size={14} />} onClick={() => setEditing(true)}>
              Cambiar plazo
            </Button>
          ) : undefined
        }
      />
      {url && r.status === "pending_deposit" && !expired && <PayLinkShare r={r} url={url} compact />}
      {(!url || r.status === "expired" || editing || expired) && picker}
    </Card>
  );
}

function PaymentSummary({ r, payments }: { r: Reservation; payments: PaymentRecord[] }) {
  const { now } = useAdmin();
  const q = r.quote;
  const pct = q.total ? Math.min(100, Math.round((r.paid / q.total) * 100)) : 0;
  const due = balanceDue(r, now);
  const depositPending = payments.find((p) => (p.kind === "deposit" || p.kind === "full") && p.status === "pending");
  const balancePending = payments.find((p) => p.kind === "balance" && p.status === "pending");
  const fullPayment = payments.some((p) => p.kind === "full" && p.status === "approved" && !p.needsRefund);
  const line = (label: string, amount: number, state: ReactNode, tone: "ok" | "wait" | "bad" | "muted") => (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="flex items-center gap-2 text-[14px] text-ink">
        <span
          aria-hidden="true"
          className={`grid size-5 place-items-center rounded-full ${tone === "ok" ? "bg-success-soft text-success" : tone === "wait" ? "bg-warning-soft text-warning" : tone === "bad" ? "bg-error-soft text-error" : "bg-canvas text-ink-subtle"}`}
        >
          {tone === "ok" ? <CheckIcon size={12} /> : <span className="size-1.5 rounded-full bg-current" />}
        </span>
        {label}
      </span>
      <span className="text-right">
        <span className="block text-[14px] font-semibold text-ink tabular-nums">{cop(amount)}</span>
        <span className={`block text-[12px] ${tone === "bad" ? "font-semibold text-error" : "text-ink-muted"}`}>{state}</span>
      </span>
    </div>
  );
  const depositAmount = r.depositPaidAt ? Math.min(q.deposit, r.paid || q.deposit) : q.deposit;
  const balanceAmount = Math.max(0, q.total - depositAmount);
  return (
    <Card aria-labelledby="dt-pay" className="p-4 sm:p-5">
      <CardHeader
        id="dt-pay"
        icon={<WalletIcon size={18} />}
        title="Pago"
        actions={
          <p className="text-[13px] text-ink-muted">
            Total <strong className="text-[16px] text-ink tabular-nums">{cop(q.total)}</strong>
          </p>
        }
      />
      <div className="mt-4 flex items-center gap-2">
        <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-ink/8">
          <span className="block h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </span>
        <span className="text-[12px] font-semibold text-ink-muted tabular-nums">
          {cop(r.paid)} cobrado · {pct} %
        </span>
      </div>
      <div className="mt-2 divide-y divide-line">
        {line(
          `Abono (${config.depositPct} %)`,
          depositAmount,
          r.depositPaidAt
            ? `Recibido el ${fmtDate(dateOf(r.depositPaidAt))}${fullPayment ? " · pago total" : ""}`
            : depositPending
              ? "Pago en línea en proceso"
              : r.status === "pending_deposit"
                ? `Fechas retenidas · vence en ${countdown(r.depositDueAt)}`
                : r.status === "expired"
                  ? "No se pagó a tiempo"
                  : "No recibido",
          r.depositPaidAt ? "ok" : r.status === "pending_deposit" ? "wait" : "muted",
        )}
        {line(
          "Saldo",
          balanceAmount,
          r.balancePaidAt
            ? `Pagado el ${fmtDate(dateOf(r.balancePaidAt))}${fullPayment ? " · pago total" : r.checkedInAt && r.balancePaidAt < r.checkedInAt ? " · antes de llegar" : ""}`
            : balancePending
              ? "Pago en línea en proceso"
              : due
                ? due.overdue
                  ? `Venció a las ${due.dueAt ? fmtClock(due.dueAt) : "—"} sin pagarse · regístralo en recepción`
                  : `El huésped debe pagarlo · vence en ${countdown(due.dueAt!)}`
                : r.status === "confirmed" || r.status === "rescheduled"
                  ? `El huésped puede pagarlo ya o dentro de ${BALANCE_MINUTES / 60} hora tras el check-in`
                  : r.status === "cancelled"
                    ? "No aplica (cancelada)"
                    : "—",
          r.balancePaidAt ? "ok" : due?.overdue ? "bad" : due || r.status === "confirmed" || r.status === "rescheduled" ? "wait" : "muted",
        )}
      </div>
      {q.seasonNights ? (
        <p className="mt-1 text-[12px] text-ink-muted">{`Incluye ${plural(q.seasonNights, "noche", "noches")} con tarifa de temporada.`}</p>
      ) : null}
      <PaymentAttempts payments={payments} />
    </Card>
  );
}

// Intentos de pago (en línea y manuales): permite ver si un pago se inició, quedó en proceso, se aprobó o se rechazó.
function PaymentAttempts({ payments }: { payments: PaymentRecord[] }) {
  const { now } = useAdmin();
  const [all, setAll] = useState(false);
  if (!payments.length) return <p className="mt-3 border-t border-line pt-3 text-[13px] text-ink-muted">Aún no hay intentos de pago.</p>;
  const list = all ? payments : payments.slice(0, 4);
  return (
    <div className="mt-3 border-t border-line pt-3">
      <h3 className="mb-1 text-[12px] font-bold tracking-[.06em] text-ink-muted uppercase">Intentos de pago</h3>
      <ul className="divide-y divide-line">
        {list.map((p) => {
          const st = PAYMENT_STATUS[p.status];
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold text-ink">
                  {kindLabel(p.kind)} · {cop(p.amount)}
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {p.needsRefund && <Badge tone="danger">Por reembolsar</Badge>}
                </span>
                <span className="block text-[12px] text-ink-muted">
                  {p.provider === "manual" ? "Registrado por el equipo" : p.provider === "wompi" ? "Wompi" : "Pasarela simulada"}
                  {p.method && p.provider !== "manual" ? ` · ${methodLabel(p.method)}` : ""} · {timeAgo(p.approvedAt ?? p.createdAt, now)} · {p.reference}
                </span>
                {p.detail && !(p.provider === "manual" && p.detail === "Registrado por el equipo") && (
                  <span className={`block text-[12px] ${p.needsRefund || p.status === "declined" || p.status === "error" ? "text-error" : "text-ink-muted"}`}>
                    {p.detail}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {payments.length > 4 && (
        <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>
          {all ? "Ver menos" : `Ver los ${payments.length} intentos`}
        </Button>
      )}
    </div>
  );
}

const EMAIL_STATUS: Record<EmailRecord["status"], { label: string; tone: "success" | "warning" | "danger" | "info" }> = {
  pending: { label: "En cola", tone: "info" },
  sending: { label: "Enviando", tone: "info" },
  sent: { label: "Enviado", tone: "success" },
  failed: { label: "No enviado", tone: "danger" },
};

// Correos de la reserva: si la confirmación no salió, se ve el motivo y se puede reintentar (sin duplicarla).
function EmailsCard({ emails }: { emails: EmailRecord[] }) {
  const { reload, toast, onAuthError, now } = useAdmin();
  const [busy, setBusy] = useState<string | null>(null);
  if (!emails.length) return null;
  const retry = async (id: string) => {
    setBusy(id);
    try {
      const r = await api.admin.retryEmail(id);
      if (r.status === 401 || r.status === 403) return onAuthError();
      const e = r.data as EmailRecord | null;
      if (r.status !== 200 || !e) throw 0;
      toast(e.status === "sent" ? "Correo enviado" : `No se pudo enviar: ${e.lastError}`, e.status === "sent" ? "ok" : "error");
      await reload();
    } catch {
      toast("No se pudo reintentar el envío", "error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card aria-labelledby="dt-mail" className="flex flex-col gap-3 p-4 sm:p-5">
      <CardHeader id="dt-mail" icon={<MailIcon size={18} />} title="Correos" subtitle="La confirmación se envía sola al aprobarse el abono." />
      <ul className="flex flex-col gap-2">
        {emails.map((e) => {
          const st = EMAIL_STATUS[e.status];
          return (
            <li
              key={e.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${e.status === "failed" ? "border-error/30 bg-error-soft/40" : "border-line"}`}
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold text-ink">
                  {e.kind === "reservation_confirmed" ? "Confirmación de reserva" : e.subject || "Mensaje del equipo"}
                  <Badge tone={st.tone}>{st.label}</Badge>
                </span>
                <span className="block text-[12px] text-ink-muted">
                  {e.to} · {e.sentAt ? `enviado ${timeAgo(e.sentAt, now)}` : `${plural(e.attempts, "intento", "intentos")}`}
                </span>
                {e.status === "failed" && e.lastError && <span className="block text-[12px] text-error">{e.lastError}</span>}
              </span>
              {e.status !== "sent" && e.status !== "sending" && (
                <Button size="sm" icon={<RefreshIcon size={14} />} loading={busy === e.id} onClick={() => retry(e.id)}>
                  Reintentar
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Notes({ r }: { r: Reservation }) {
  const { ask } = useAdmin();
  const [note, setNote] = useState("");
  const addNote = () => {
    const text = note.trim();
    if (!text) return;
    ask({
      title: "Agregar nota interna",
      text: "La nota solo es visible para el equipo.",
      okLabel: "Agregar",
      done: "Nota agregada",
      run: async () => {
        const res = await api.admin.action({ code: r.code, action: "note", text });
        if (res.status < 400) setNote("");
        return res;
      },
    });
  };
  return (
    <Card aria-labelledby="dt-notes" className="flex flex-col gap-3 p-4 sm:p-5">
      <CardHeader id="dt-notes" icon={<NoteIcon size={18} />} title="Notas internas de la reserva" subtitle="Solo las ve el equipo." />
      {r.notes.length ? (
        <ol className="flex flex-col gap-2">
          {r.notes.map((n) => (
            <li key={n.at} className="rounded-xl bg-canvas px-3.5 py-2.5">
              <p className="text-[12px] text-ink-muted">{fmtDateTime(n.at)}</p>
              <p className="mt-0.5 text-[14px] whitespace-pre-wrap text-ink">{n.text}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13px] text-ink-muted">Aún no hay notas para esta reserva.</p>
      )}
      <Field label="Nueva nota">
        {(p) => <textarea {...p} rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={`${adminInput} resize-y leading-relaxed`} />}
      </Field>
      <Button variant="primary" size="sm" disabled={!note.trim()} onClick={addNote} className="self-start">
        Agregar nota
      </Button>
    </Card>
  );
}

function ClientCard({ c }: { c: ReturnType<typeof buildClients>[number] }) {
  const t = TRUST[c.profile?.trust ?? "sin_evaluar"];
  return (
    <Card aria-labelledby="dt-client" className={`p-4 sm:p-5 ${c.flagged ? "border-error/30 bg-error-soft/40" : ""}`}>
      <CardHeader
        id="dt-client"
        icon={<UsersIcon size={18} />}
        title="Cliente"
        subtitle={c.isRecurring ? `Recurrente · ${plural(c.stays, "estadía", "estadías")}` : c.stays ? "Primera estadía concretada" : "Primera reserva"}
        actions={
          <Link href={paths.cliente(c.key)} className={buttonClass("secondary", "sm")}>
            Ver ficha
          </Link>
        }
      />
      <p className="mt-3 text-[13px] text-ink-muted">Valor generado {cop(c.value)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Stars value={c.profile?.rating ?? null} size={14} />
        <Badge tone={t.tone}>{t.label}</Badge>
        {c.profile?.tags.slice(0, 3).map((tag) => (
          <Badge key={tag}>{tag}</Badge>
        ))}
      </div>
      {c.incidents > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-error">
          <AlertIcon size={14} />
          {plural(c.incidents, "incidencia registrada", "incidencias registradas")}
        </p>
      )}
      {c.profile?.preferences && <p className="mt-2 text-[13px] text-ink">Preferencias: {c.profile.preferences}</p>}
    </Card>
  );
}
