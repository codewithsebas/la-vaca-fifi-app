// Reglas de pago compartidas por el sitio, el panel y el servidor (funciones puras).
// La fuente de verdad son la base de datos y la API: aquí solo se interpreta lo que ya respondieron.
import type { PayMethod, PaymentKind, PaymentStatus, PublicReservation, Quote } from "@/lib/types";

/* ───────────── Pagos que registra el equipo ───────────── */

export const PAY_METHODS: { value: PayMethod; label: string }[] = [
  { value: "cash", label: "Efectivo" },
  { value: "transfer", label: "Transferencia" },
];

// Detalle que queda en el pago: el medio y, si hay, la nota ("Transferencia · Bancolombia, ref. 4521").
export function manualPaymentNote(method: PayMethod | undefined, note: string | undefined) {
  const label = PAY_METHODS.find((m) => m.value === method)?.label ?? "";
  const text = String(note ?? "").trim();
  return [label, text].filter(Boolean).join(" · ").slice(0, 300);
}

/* ───────────── Plazo para pagar el abono ───────────── */

// Plazos que el equipo puede dar para pagar el abono (minutos). Si no se registra a tiempo, las fechas se liberan.
export const HOLD_OPTIONS: { value: number; label: string }[] = [
  { value: 60, label: "1 hora" },
  { value: 180, label: "3 horas" },
  { value: 360, label: "6 horas" },
  { value: 720, label: "12 horas" },
  { value: 1440, label: "24 horas" },
  { value: 2880, label: "48 horas" },
];
export const DEFAULT_HOLD = 1440;
// Horas que se retienen las fechas de una reserva hecha en la web mientras el huésped paga el abono por transferencia.
export const WEB_HOLD_HOURS = DEFAULT_HOLD / 60;
// Plazo mínimo útil.
const MIN_HOLD_MS = 10 * 6e4;

// Fecha límite para pagar el abono: ahora + el plazo elegido, pero nunca después del día de llegada (23:59, hora de
// Colombia): las fechas no se retienen más allá de la estadía. `capped`: el plazo se acortó por eso.
export function manualDueAt(checkIn: string, minutes: number, now = Date.now()) {
  const limit = Date.parse(`${checkIn}T23:59:00-05:00`);
  const wanted = now + minutes * 6e4;
  const due = Math.min(wanted, limit);
  return { dueAt: new Date(due).toISOString(), capped: due < wanted, tooShort: due - now < MIN_HOLD_MS };
}

// Porcentaje del abono de una reserva según su cotización (el configurado cuando se cotizó; puede ser distinto del actual).
export const depositPctOf = (q: Quote) => (q.total ? Math.round((q.deposit / q.total) * 100) : 0);

type Money = { quote: Quote; paid?: number; depositPaidAt?: string | null };

// Total, lo pagado y lo que falta. Antes del abono, el saldo es el total menos el abono esperado.
export function moneyOf(r: Money) {
  const total = r.quote.total;
  const paid = r.paid ?? 0;
  const due = Math.max(0, total - paid);
  return { total, paid, due, deposit: r.quote.deposit, balance: r.depositPaidAt ? due : r.quote.balance };
}

/**
 * Etapa de la reserva para el huésped:
 * awaiting_deposit   fechas retenidas, falta el abono o el total (la reserva aún no está confirmada)
 * hold_expired       la retención venció sin abono
 * confirmed          reserva confirmada (si queda saldo, se paga antes de llegar o en recepción)
 * balance_due        en estadía con saldo pendiente
 * paid_in_full       en estadía con todo pagado (el equipo ya puede hacer el check-out)
 * completed / cancelled
 */
export type Stage = "awaiting_deposit" | "hold_expired" | "confirmed" | "balance_due" | "paid_in_full" | "completed" | "cancelled";

type StageInput = Pick<PublicReservation, "status" | "depositDueAt" | "balancePaidAt" | "quote" | "paid" | "depositPaidAt">;

// `now`: hora del servidor ajustada. Un plazo que ya pasó en el reloj se muestra vencido mientras llega la confirmación del servidor.
export function stageOf(r: StageInput, now = Date.now()): Stage {
  switch (r.status) {
    case "pending_deposit":
      return Date.parse(r.depositDueAt) <= now ? "hold_expired" : "awaiting_deposit";
    case "expired":
      return "hold_expired";
    case "confirmed":
    case "rescheduled":
      return "confirmed";
    case "checked_in":
      return r.balancePaidAt || moneyOf(r).due === 0 ? "paid_in_full" : "balance_due";
    case "completed":
      return "completed";
    default:
      return "cancelled";
  }
}

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: "info" | "warning" | "success" | "danger" | "neutral" }> = {
  initiated: { label: "Pago iniciado", tone: "info" },
  pending: { label: "Pago en proceso", tone: "warning" },
  approved: { label: "Pago registrado", tone: "success" },
  declined: { label: "Pago rechazado", tone: "danger" },
  error: { label: "Error en el pago", tone: "danger" },
  expired: { label: "Sin completar", tone: "neutral" },
};

const METHOD: Record<string, string> = { MANUAL: "Registrado por el equipo" };
export const methodLabel = (m: string) => METHOD[m] ?? m;

export const kindLabel = (k: PaymentKind) => (k === "deposit" ? "Abono" : k === "full" ? "Pago total" : "Saldo");
