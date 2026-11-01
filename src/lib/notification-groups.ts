import type { NotificationKind } from "@/lib/types";

// Grupos de avisos del panel. Los usan el sonido (por navegador) y las notificaciones push (por dispositivo).
export type NotificationGroup = "reservas" | "pagos" | "cambios";

export const NOTIFICATION_GROUPS: { id: NotificationGroup; label: string; description: string; kinds: NotificationKind[] }[] = [
  {
    id: "reservas",
    label: "Reservas confirmadas",
    description: "Cuando se registra el abono de una reserva y queda confirmada.",
    kinds: ["reservation_created", "reservation_confirmed"],
  },
  {
    id: "pagos",
    label: "Pagos",
    description: "Saldos pagados y comprobantes.",
    kinds: ["balance_paid", "proof_uploaded", "proof_approved", "proof_rejected"],
  },
  {
    id: "cambios",
    label: "Cancelaciones, vencimientos y fallos",
    description: "Reservas canceladas, retenciones que vencen sin abono y correos que no se pudieron enviar.",
    kinds: ["reservation_cancelled", "reservation_expired", "email_failed"],
  },
];

export const GROUP_IDS = NOTIFICATION_GROUPS.map((g) => g.id);
export const isGroup = (v: unknown): v is NotificationGroup => typeof v === "string" && (GROUP_IDS as string[]).includes(v);
// Grupo de un aviso (un tipo desconocido cae en "cambios", el más general).
export const groupOf = (kind: string): NotificationGroup => NOTIFICATION_GROUPS.find((g) => (g.kinds as string[]).includes(kind))?.id ?? "cambios";
