import { cop, fmtDate, mask, nightsBetween, plural } from "@/lib/format";
import type { ApiResult, Reservation } from "@/lib/types";
import type { DayMark } from "@/components/admin/date-picker";
import type { Tone } from "@/components/admin/ui";

// Confirmación previa a una acción. Puede pedir fechas nuevas, una nota o una casilla, que llegan a run().
export type ConfirmCfg = {
  title: string;
  text: string;
  okLabel: string;
  done: string;
  danger?: boolean;
  reschedule?: boolean;
  ci?: string;
  co?: string;
  marks?: Record<string, DayMark>; // disponibilidad para elegir las fechas nuevas
  note?: string;
  noteLabel?: string; // si existe, se muestra un campo de texto
  noteHint?: string;
  noteRequired?: boolean;
  option?: boolean;
  optionLabel?: string; // si existe, se muestra una casilla
  details?: { k: string; v: string }[]; // resumen de lo que va a pasar
  run: (cf: ConfirmCfg) => Promise<ApiResult<unknown>>;
};

export type Ask = (cfg: ConfirmCfg) => void;

// Fila resumida de una reserva para listas y tablas.
export function rowOf(r: Reservation, cabinLabel: (id: string, unit?: number) => string) {
  return {
    code: r.code,
    name: r.guest.fullName,
    doc: `${r.guest.docType} ${mask(r.guest.docNumber)}`,
    cabin: cabinLabel(r.cabinTypeId, r.unit),
    checkIn: fmtDate(r.checkIn, true),
    checkOut: fmtDate(r.checkOut, true),
    dates: `${fmtDate(r.checkIn)} → ${fmtDate(r.checkOut)}`,
    nights: plural(nightsBetween(r.checkIn, r.checkOut), "noche", "noches"),
    total: cop(r.quote?.total),
    deposit: cop(r.quote?.deposit),
    arrival: r.estimatedArrival ? `llega ${r.estimatedArrival}` : "",
  };
}

// Campo compacto del panel (misma pieza .field-input del sitio, variante de densidad).
export const adminInput = "field-input field-compact";

// Reservas que activan acciones operativas (llegan hoy, salen hoy, etc.).
export const ARRIVING = ["pending_deposit", "confirmed", "rescheduled"];
export const DEPARTING = ["checked_in", "confirmed", "rescheduled"];

// Normaliza para buscar sin tildes ni mayúsculas.
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Descarga un CSV (separado por ; para que Excel en español lo abra en columnas).
export function csv(rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}

// Nivel de confianza de la valoración interna de un cliente.
export const TRUST: Record<string, { label: string; tone: Tone }> = {
  sin_evaluar: { label: "Sin evaluar", tone: "neutral" },
  alta: { label: "Confianza alta", tone: "success" },
  media: { label: "Confianza media", tone: "info" },
  baja: { label: "Confianza baja", tone: "warning" },
  no_recomendado: { label: "No recomendado", tone: "danger" },
};
