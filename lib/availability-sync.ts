"use client";

// Disponibilidad en tiempo real para el sitio público (canal público "availability", ver live-sync.ts).
// La base de datos publica un aviso cuando cambia la ocupación: { cabinTypeId, from, to } (noches afectadas, sin datos personales).
import { isISO } from "./format";
import { useBroadcastSync, type SyncStatus } from "./live-sync";

export type { SyncStatus } from "./live-sync";
export type AvailabilityChange = { cabinTypeId: string | null; from: string | null; to: string | null };
// null = resincronizar todo (al reconectar, al volver a la pestaña o cuando el aviso no trae rango).
export type AvailabilityChanges = AvailabilityChange[] | null;

function parse(payload: unknown): AvailabilityChange | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  const cabin = typeof p.cabinTypeId === "string" && /^[a-z0-9-]{2,40}$/.test(p.cabinTypeId) ? p.cabinTypeId : null;
  const from = isISO(p.from) ? p.from : null;
  const to = isISO(p.to) ? p.to : null;
  return from && to && from <= to ? { cabinTypeId: cabin, from, to } : cabin ? { cabinTypeId: cabin, from: null, to: null } : null;
}

// ¿Los cambios tocan estas noches (first a last, inclusive) de esta cabaña (o de cualquiera si no se indica)?
export function touches(changes: AvailabilityChanges, first: string, last: string, cabinTypeId?: string | null) {
  if (!changes) return true;
  return changes.some((c) => (!cabinTypeId || !c.cabinTypeId || c.cabinTypeId === cabinTypeId) && (!c.from || !c.to || (c.from <= last && c.to >= first)));
}

/**
 * Llama a `onChange` cuando cambia la disponibilidad (agrupado y limitado en frecuencia; `null` = resincronizar todo).
 * `enabled`: conectarse solo cuando hace falta (en la portada, cuando el visitante empieza a elegir fechas).
 */
export const useAvailabilitySync = (onChange: (changes: AvailabilityChanges) => void, enabled = true): SyncStatus =>
  useBroadcastSync(enabled ? "availability" : null, "availability_changed", parse, onChange);
