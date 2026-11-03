import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { dateOf, todayISO } from "@/lib/format";
import { createSessionClient, MissingSupabaseConfig } from "@/lib/supabase/server";
import type { Db } from "@/lib/server/db";
import { can, isRole, type Permission } from "@/lib/permissions";
import { photoUrl } from "@/lib/server/site";
import type { PanelUser } from "@/lib/types";

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export const fail = (status: number, error: string, extra?: object) => json({ error, ...extra }, status);

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    const v = await req.json();
    return v && typeof v === "object" ? (v as T) : null;
  } catch {
    return null;
  }
}

// Envuelve un handler: configuración faltante → 503, error inesperado → 500 (con log en el servidor).
export function route<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof MissingSupabaseConfig) {
        console.error(e.message);
        return fail(503, "NOT_CONFIGURED");
      }
      console.error(e);
      return fail(500, "SERVER_ERROR");
    }
  };
}

// Foto de perfil: su ruta en Storage va en user_metadata.avatar_path (api/admin/profile/photo) → URL pública.
export const avatarOf = (meta: unknown) => {
  const path = (meta as { avatar_path?: string | null } | undefined)?.avatar_path;
  return path ? photoUrl(path) : null;
};

// Sesión del equipo (Supabase Auth). El rol va en app_metadata, que el usuario no puede editar: «admin» o «recepcion».
// `me`: quién hace la solicitud (para el panel y para los permisos de cada ruta: lib/permissions.ts).
type Staff = { sb: Db; uid: string | null; me: PanelUser; error?: never } | { sb?: never; uid?: never; me?: never; error: Response };

export async function requireStaff(): Promise<Staff> {
  const sb = await createSessionClient();
  const { data } = await sb.auth.getClaims();
  const c = data?.claims;
  if (!c) return { error: fail(401, "UNAUTHORIZED") };
  const role = (c.app_metadata as { role?: string } | undefined)?.role;
  if (!isRole(role)) return { error: fail(403, "FORBIDDEN") };
  const uid = typeof c.sub === "string" ? c.sub : null;
  const name = String((c.user_metadata as { full_name?: string } | undefined)?.full_name ?? "").trim();
  const email = typeof c.email === "string" ? c.email : "";
  return { sb, uid, me: { id: uid ?? "", email, name, role, photo: avatarOf(c.user_metadata) } };
}

// Solo administradores, o un permiso concreto (recepción tiene algunos: lib/permissions.ts).
export async function requireAdmin(perm?: Permission): Promise<Staff> {
  const s = await requireStaff();
  if (s.error) return s;
  if (perm ? !can(s.me.role, perm) : s.me.role !== "admin") return { error: fail(403, "FORBIDDEN") };
  return s;
}

/* ───────────── Operaciones del panel (sincronización sin conexión, lib/offline) ───────────── */

const OP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE_RUN_MS = 60_000; // una operación «en curso» por más tiempo se dio por caída
const MAX_OFFLINE_MS = 30 * 864e5; // lo que se acepta como fecha real de algo hecho sin conexión

// Identificador de la operación: quien la repite no la aplica dos veces.
export const opIdOf = (req: NextRequest) => {
  const id = req.headers.get("idempotency-key");
  return id && OP_ID.test(id) ? id.toLowerCase() : null;
};

// Versión de la fila que el usuario tenía a la vista al hacer el cambio.
export const baseVersionOf = (req: NextRequest) => {
  const v = Number(req.headers.get("x-base-version") ?? NaN);
  return Number.isSafeInteger(v) && v > 0 ? v : null;
};

// Cuándo se hizo la operación, si se hizo sin conexión: dentro de un plazo razonable y nunca en el futuro.
export const occurredAtOf = (req: NextRequest) => {
  const at = Date.parse(req.headers.get("x-occurred-at") ?? "");
  if (!Number.isFinite(at) || at > Date.now() || Date.now() - at > MAX_OFFLINE_MS) return null;
  return new Date(at).toISOString();
};

// El «hoy» con el que se valida una fecha: el día en que el usuario hizo la operación, aunque llegue después.
export const operationDay = (req: NextRequest) => {
  const at = occurredAtOf(req);
  return at ? dateOf(at) : todayISO();
};

// Filas que no cambiaron con la versión esperada: o alguien más las modificó o ya no existen.
export async function staleOrMissing(sb: Db, table: string, column: string, key: string, base: number | null) {
  if (base === null) return fail(404, "NOT_FOUND");
  const { count } = await (sb as unknown as SupabaseClient).from(table).select(column, { count: "exact", head: true }).eq(column, key).throwOnError();
  return count ? fail(409, "VERSION_CONFLICT") : fail(404, "NOT_FOUND");
}

// Envuelve una ruta de escritura. Con clave de idempotencia, registra la operación en sync_ops: si ya se aplicó, responde lo
// mismo sin repetirla; si es de otro usuario, la rechaza. Sin clave se comporta como siempre. Solo queda registro de lo que se
// aplicó: una operación rechazada se puede volver a intentar con la misma clave. Sin el contenido ni la respuesta: sin datos de huéspedes.
export function syncRoute(handler: (req: NextRequest) => Promise<Response>) {
  return route(async (req: NextRequest) => {
    const opId = opIdOf(req);
    if (!opId) return handler(req);
    const { sb, uid, error } = await requireStaff();
    if (error) return error;
    if (!uid) return fail(401, "UNAUTHORIZED");
    const { error: claimErr } = await sb.from("sync_ops").insert({ op_id: opId, user_id: uid, op_type: `${req.method} ${req.nextUrl.pathname}`.slice(0, 60) });
    if (claimErr) {
      if (claimErr.code !== "23505") throw claimErr;
      const { data: seen } = await sb.from("sync_ops").select("status, http_status, started_at").eq("op_id", opId).maybeSingle().throwOnError();
      if (!seen) return fail(403, "OP_FOREIGN"); // RLS: la operación es de otro usuario
      if (seen.status === "done")
        return Response.json({ replayed: true }, { status: seen.http_status ?? 200, headers: { "Cache-Control": "no-store", "X-Op-Replayed": "1" } });
      if (Date.now() - Date.parse(seen.started_at) < STALE_RUN_MS) return fail(425, "OP_IN_PROGRESS");
      await sb.from("sync_ops").update({ started_at: new Date().toISOString() }).eq("op_id", opId).throwOnError();
    }
    let res: Response;
    try {
      res = await handler(req);
    } catch (e) {
      await sb.from("sync_ops").delete().eq("op_id", opId);
      throw e;
    }
    if (res.ok) await sb.from("sync_ops").update({ status: "done", http_status: res.status, finished_at: new Date().toISOString() }).eq("op_id", opId);
    else await sb.from("sync_ops").delete().eq("op_id", opId);
    return res;
  });
}

// Errores de negocio que lanzan las funciones de la base de datos → respuesta HTTP.
const BUSINESS: Record<string, number> = {
  NOT_FOUND: 404,
  ALREADY_PAID: 409,
  INVALID_AMOUNT: 422,
  NO_AVAILABILITY: 409,
  DUPLICATE: 409,
  NOT_APPLICABLE: 422,
  BALANCE_PENDING: 422,
  DEPOSIT_REQUIRED: 422,
  FORBIDDEN: 403,
};

export function businessError(e: unknown): { status: number; error: string } | null {
  const message = (e as { message?: string } | null)?.message ?? "";
  const code = Object.keys(BUSINESS).find((k) => message === k || message.startsWith(k + " ") || message.includes(`"${k}"`));
  return code ? { status: BUSINESS[code], error: code } : null;
}
