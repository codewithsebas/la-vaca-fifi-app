import type { NotificationKind } from "./types";

// Grupos de avisos del panel. Los usan el sonido (por navegador) y las notificaciones push (por dispositivo).
export type NotificationGroup = "reservas" | "pagos" | "cambios";

export const NOTIFICATION_GROUPS: { id: NotificationGroup; label: string; description: string; kinds: NotificationKind[] }[] = [
  {
    id: "reservas",
    label: "Reservas confirmadas",
    description: "Cuando se aprueba el abono de una reserva y queda confirmada, y si Booking.com ocupa fechas ya vendidas en la web.",
    kinds: ["reservation_created", "reservation_confirmed", "channel_conflict"],
  },
  {
    id: "pagos",
    label: "Pagos",
    description: "Saldos pagados, pagos rechazados, pagos por reembolsar y comprobantes.",
    kinds: ["balance_paid", "payment_declined", "payment_refund", "proof_uploaded", "proof_approved", "proof_rejected"],
  },
  {
    id: "cambios",
    label: "Cancelaciones, vencimientos y fallos",
    description:
      "Reservas canceladas, saldos que vencen sin pagar, correos que no se pudieron enviar y avisos de Booking.com (reservas reacomodadas, calendarios que no se pudieron leer).",
    kinds: ["reservation_cancelled", "reservation_expired", "balance_overdue", "email_failed", "channel_moved", "channel_sync_failed"],
  },
];

export const GROUP_IDS = NOTIFICATION_GROUPS.map((g) => g.id);
export const isGroup = (v: unknown): v is NotificationGroup => typeof v === "string" && (GROUP_IDS as string[]).includes(v);
// Grupo de un aviso (un tipo desconocido cae en "cambios", el más general).
export const groupOf = (kind: string): NotificationGroup => NOTIFICATION_GROUPS.find((g) => (g.kinds as string[]).includes(kind))?.id ?? "cambios";
