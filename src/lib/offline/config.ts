// Panel sin conexión (docs/plan-offline-first.md): activo solo con NEXT_PUBLIC_OFFLINE=1 y nunca en modo simulado.
import { isMockApi } from "@/lib/config";

export const offlineEnabled = process.env.NEXT_PUBLIC_OFFLINE === "1" && !isMockApi;

// Proyecto de Supabase del entorno: QA y PDN nunca comparten almacén local, aunque se abran desde el mismo origen.
export const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/^https?:\/\//, "").split(".")[0] || "local";

export const OFFLINE_MAX_DAYS = 30; // sin validar con el servidor, el panel deja de abrir sin conexión
export const CURSOR_MAX_DAYS = 60; // el registro de cambios del servidor guarda 90 días

// crypto.randomUUID solo existe en contextos seguros (https o localhost).
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
