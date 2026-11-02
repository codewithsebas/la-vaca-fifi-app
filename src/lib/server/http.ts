import "server-only";
import { createSessionClient, MissingSupabaseConfig } from "@/lib/supabase/server";
import type { Db } from "@/lib/server/db";
import { can, isRole, type Permission } from "@/lib/permissions";
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
  return { sb, uid, me: { id: uid ?? "", email, name, role } };
}

// Solo administradores, o un permiso concreto (recepción tiene algunos: lib/permissions.ts).
export async function requireAdmin(perm?: Permission): Promise<Staff> {
  const s = await requireStaff();
  if (s.error) return s;
  if (perm ? !can(s.me.role, perm) : s.me.role !== "admin") return { error: fail(403, "FORBIDDEN") };
  return s;
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
