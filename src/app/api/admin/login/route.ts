import type { NextRequest } from "next/server";
import { fail, json, readJson, route } from "@/lib/server/http";
import { createSessionClient } from "@/lib/supabase/server";
import { isRole } from "@/lib/permissions";

// POST /api/admin/login { email, password } → sesión de Supabase Auth en cookies (solo cuentas del equipo: admin o recepcion).
export const POST = route(async (req: NextRequest) => {
  const b = await readJson<{ email?: string; password?: string }>(req);
  if (!b?.email || !b.password) return fail(400, "INVALID_BODY");
  const sb = await createSessionClient();
  const { data, error } = await sb.auth.signInWithPassword({ email: b.email.trim(), password: b.password });
  if (error || !data.user) return fail(401, "INVALID_CREDENTIALS");
  if (!isRole((data.user.app_metadata as { role?: string }).role)) {
    await sb.auth.signOut();
    return fail(403, "FORBIDDEN");
  }
  return json({});
});
