import type { NotificationKind } from "@/lib/types";

// Grupos de avisos del panel. Los usan el sonido (por navegador) y las notificaciones push (por dispositivo).
export type NotificationGroup = "reservas" | "pagos" | "cambios";

export const NOTIFICATION_GROUPS: { id: NotificationGroup; label: string; description: string; kinds: NotificationKind[] }[] = [
  {
    id: "reservas",
    label: "Reservas confirmadas",
    description: "Cuando se registra el abono de una reserva y queda confirmada, y cuando llega una reserva de Booking por asignar.",
    kinds: ["reservation_created", "reservation_confirmed", "booking_pending"],
  },
  {
    id: "pagos",
    label: "Pagos",
    description: "Saldos pagados, comprobantes y estadías que no se pueden finalizar por saldo pendiente.",
    kinds: ["balance_paid", "checkout_pending", "proof_uploaded", "proof_approved", "proof_rejected"],
  },
  {
    id: "cambios",
    label: "Cancelaciones, vencimientos y fallos",
    description:
      "Reservas canceladas, retenciones que vencen sin abono, cambios de Booking, posibles sobreventas, calendarios de Booking que no se pudieron leer y correos que no se pudieron enviar o leer.",
    kinds: [
      "reservation_cancelled",
      "reservation_expired",
      "email_failed",
      "booking_modified",
      "booking_cancelled",
      "booking_failed",
      "channel_conflict",
      "channel_sync_failed",
    ],
  },
];

export const GROUP_IDS = NOTIFICATION_GROUPS.map((g) => g.id);
export const isGroup = (v: unknown): v is NotificationGroup => typeof v === "string" && (GROUP_IDS as string[]).includes(v);
// Grupo de un aviso (un tipo desconocido cae en "cambios", el más general).
export const groupOf = (kind: string): NotificationGroup => NOTIFICATION_GROUPS.find((g) => (g.kinds as string[]).includes(kind))?.id ?? "cambios";
