import type { NextRequest } from "next/server";
import { toNotification } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, route } from "@/lib/server/http";

// POST /api/admin/notifications { ids: number[] } | { all: true } → marca como leídas.
export const POST = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const b = await readJson<{ ids?: number[]; all?: boolean }>(req);
  const ids = Array.isArray(b?.ids) ? b.ids.filter((n) => Number.isInteger(n) && n > 0).slice(0, 200) : [];
  if (!b || (!b.all && !ids.length)) return fail(400, "INVALID_BODY");
  let q = sb.from("admin_notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (!b.all) q = q.in("id", ids);
  await q.throwOnError();
  const { data } = await sb.from("admin_notifications").select("*").order("created_at", { ascending: false }).limit(150).throwOnError();
  return json(data.map(toNotification));
});
