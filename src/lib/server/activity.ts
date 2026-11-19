import "server-only";
import { headers } from "next/headers";
import { createServiceClient, hasServiceConfig } from "@/lib/supabase/server";
import type { ActivityAction } from "@/lib/types";
import type { PanelUser } from "@/lib/types";

// Registro de actividad (tabla activity_log, migración 20261119010000). Casi todo lo registra la base de datos sola, con
// triggers en las tablas. Desde aquí se registra lo que no pasa por esas tablas: inicios y cierres de sesión, cuentas del
// equipo (viven en Supabase Auth) y la lectura manual de los calendarios de Booking.

type Entry = {
  action: ActivityAction;
  entity: string;
  entityId?: string | null;
  label?: string | null;
  changes?: Record<string, [unknown, unknown]> | null;
};

const MAX_OFFLINE_MS = 30 * 864e5; // como occurredAtOf (lib/server/http.ts)
const OP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requestInfo() {
  try {
    const h = await headers();
    const at = Date.parse(h.get("x-occurred-at") ?? "");
    const op = h.get("idempotency-key");
    const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim();
    return {
      occurredAt: Number.isFinite(at) && at <= Date.now() && Date.now() - at <= MAX_OFFLINE_MS ? new Date(at).toISOString() : null,
      opId: op && OP_ID.test(op) ? op.toLowerCase() : null,
      ip: ip.slice(0, 64) || null,
      userAgent: (h.get("user-agent") ?? "").slice(0, 300) || null,
    };
  } catch {
    return { occurredAt: null, opId: null, ip: null, userAgent: null };
  }
}

// `actor`: quién lo hizo (null en un intento de ingreso fallido: no hay cuenta). Nunca lanza: que no se pueda registrar
// algo no deshace lo que ya se hizo, pero queda en el log del servidor.
export async function logActivity(actor: Pick<PanelUser, "id" | "email" | "name" | "role"> | null, e: Entry) {
  if (!hasServiceConfig()) return;
  try {
    const info = await requestInfo();
    const { error } = await createServiceClient()
      .from("activity_log")
      .insert({
        actor_id: actor?.id || null,
        actor_email: actor?.email || null,
        actor_name: actor?.name || null,
        actor_role: actor?.role ?? null,
        action: e.action,
        entity: e.entity,
        entity_id: e.entityId ?? null,
        label: e.label?.slice(0, 200) ?? null,
        changes: (e.changes ?? null) as never,
        occurred_at: info.occurredAt ?? new Date().toISOString(),
        op_id: info.opId,
        ip: info.ip,
        user_agent: info.userAgent,
      });
    if (error) throw error;
  } catch (err) {
    console.error("No se pudo registrar la actividad", e.action, e.entity, err);
  }
}
