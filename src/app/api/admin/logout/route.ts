import { json, route } from "@/lib/server/http";
import { logActivity } from "@/lib/server/activity";
import { isRole } from "@/lib/permissions";
import { createSessionClient } from "@/lib/supabase/server";

// POST /api/admin/logout → cierra la sesión (y lo deja en el registro de actividad).
export const POST = route(async () => {
  const sb = await createSessionClient();
  const { data } = await sb.auth.getClaims();
  const c = data?.claims;
  const role = (c?.app_metadata as { role?: string } | undefined)?.role;
  if (c && typeof c.sub === "string" && isRole(role)) {
    const name = String((c.user_metadata as { full_name?: string } | undefined)?.full_name ?? "").trim();
    const email = typeof c.email === "string" ? c.email : "";
    await logActivity({ id: c.sub, email, name, role }, { action: "logout", entity: "session", entityId: c.sub, label: name || email });
  }
  await sb.auth.signOut();
  return json({});
});
