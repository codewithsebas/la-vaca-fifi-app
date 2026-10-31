import "server-only";
import { createSessionClient, MissingSupabaseConfig } from "@/lib/supabase/server";
import type { Db } from "@/lib/server/db";

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

// Sesión de Supabase Auth con rol de administrador (app_metadata, que el usuario no puede editar).
export async function requireAdmin(): Promise<{ sb: Db; uid: string | null; error?: never } | { sb?: never; uid?: never; error: Response }> {
  const sb = await createSessionClient();
  const { data } = await sb.auth.getClaims();
  if (!data?.claims) return { error: fail(401, "UNAUTHORIZED") };
  const role = (data.claims.app_metadata as { role?: string } | undefined)?.role;
  if (role !== "admin") return { error: fail(403, "FORBIDDEN") };
  return { sb, uid: typeof data.claims.sub === "string" ? data.claims.sub : null };
}
