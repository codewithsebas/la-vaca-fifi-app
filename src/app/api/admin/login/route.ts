import type { NextRequest } from "next/server";
import { fail, json, readJson, route } from "@/lib/server/http";
import { logActivity } from "@/lib/server/activity";
import { createSessionClient } from "@/lib/supabase/server";
import { isRole } from "@/lib/permissions";

// POST /api/admin/login { email, password } → sesión de Supabase Auth en cookies (solo cuentas del equipo: superadmin,
// admin o recepcion). Cada ingreso, y cada intento fallido, queda en el registro de actividad con la fecha y la hora: el
// panel solo entra por aquí, así que es más confiable que leer auth.audit_log_entries (que también cuenta renovaciones de
// sesión y que Supabase puede dejar de escribir).
export const POST = route(async (req: NextRequest) => {
  const b = await readJson<{ email?: string; password?: string }>(req);
  if (!b?.email || !b.password) return fail(400, "INVALID_BODY");
  const email = b.email.trim();
  const sb = await createSessionClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password: b.password });
  if (error || !data.user) {
    await logActivity(null, { action: "login_failed", entity: "session", label: email.toLowerCase().slice(0, 160) });
    return fail(401, "INVALID_CREDENTIALS");
  }
  const u = data.user;
  const role = (u.app_metadata as { role?: string }).role;
  const name = String((u.user_metadata as { full_name?: string } | undefined)?.full_name ?? "").trim();
  if (!isRole(role)) {
    await sb.auth.signOut();
    await logActivity(null, { action: "login_failed", entity: "session", entityId: u.id, label: u.email ?? email });
    return fail(403, "FORBIDDEN");
  }
  await logActivity({ id: u.id, email: u.email ?? email, name, role }, { action: "login", entity: "session", entityId: u.id, label: name || u.email });
  return json({});
});
