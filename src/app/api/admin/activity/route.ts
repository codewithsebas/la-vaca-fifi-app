import type { NextRequest } from "next/server";
import { isRole } from "@/lib/permissions";
import { isMissingTable } from "@/lib/server/db";
import { fail, json, requireAdmin, route } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/server";
import type { ActivityAction, ActivityEntry, ActivityPage } from "@/lib/types";

// GET /api/admin/activity → registro de actividad, filtrado y por páginas. Solo superadministradores (permiso «activity»;
// la tabla, además, solo la lee un superadministrador por RLS).
// ?view=changes|sessions · actor=<uuid> · action=insert|update|delete|login|logout|login_failed|sync · entity=<tabla>
// · entityId · from=YYYY-MM-DD · to=YYYY-MM-DD (incluido, hora de Colombia) · page · size

const ACTIONS: ActivityAction[] = ["insert", "update", "delete", "login", "logout", "login_failed", "sync"];
const SESSION_ACTIONS: ActivityAction[] = ["login", "logout", "login_failed"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TZ = "-05:00"; // Colombia, sin horario de verano

type Row = {
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  label: string | null;
  changes: unknown;
  refs: unknown;
  occurred_at: string;
  received_at: string;
  ip: string | null;
  user_agent: string | null;
};

const toEntry = (r: Row): ActivityEntry => ({
  id: r.id,
  actor: { id: r.actor_id, email: r.actor_email, name: r.actor_name, role: isRole(r.actor_role) ? r.actor_role : null },
  action: r.action as ActivityAction,
  entity: r.entity,
  entityId: r.entity_id,
  label: r.label,
  changes: (r.changes as ActivityEntry["changes"]) ?? null,
  refs: (r.refs as ActivityEntry["refs"]) ?? null,
  occurredAt: r.occurred_at,
  receivedAt: r.received_at,
  ip: r.ip,
  userAgent: r.user_agent,
});

// Quién aparece en el filtro de usuarios: las cuentas del equipo (también las desactivadas o con otro rol hoy).
async function actorsOf() {
  const out: ActivityPage["actors"] = [];
  try {
    const admin = createServiceClient().auth.admin;
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      for (const u of data.users) {
        const role = (u.app_metadata as { role?: string }).role;
        if (!isRole(role)) continue;
        out.push({ id: u.id, email: u.email ?? "", name: String((u.user_metadata as { full_name?: string }).full_name ?? "").trim(), role });
      }
      if (data.users.length < 200) break;
    }
  } catch (e) {
    console.error(e);
  }
  return out.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
}

export const GET = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin("activity");
  if (error) return error;
  const q = req.nextUrl.searchParams;
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(q.get("page")) || 1)));
  const size = Math.max(10, Math.min(200, Math.floor(Number(q.get("size")) || 50)));
  const view = q.get("view") === "sessions" ? "sessions" : "changes";

  let query = sb.from("activity_log").select("*", { count: "exact" });
  const action = q.get("action") as ActivityAction | null;
  if (view === "sessions") query = query.in("action", action && SESSION_ACTIONS.includes(action) ? [action] : SESSION_ACTIONS);
  else
    query =
      action && ACTIONS.includes(action) && !SESSION_ACTIONS.includes(action)
        ? query.eq("action", action)
        : query.not("action", "in", `(${SESSION_ACTIONS.join(",")})`);
  const actor = q.get("actor");
  if (actor && UUID.test(actor)) query = query.eq("actor_id", actor);
  const entity = q.get("entity");
  if (entity && /^[a-z_]{1,40}$/.test(entity)) query = query.eq("entity", entity);
  const entityId = q.get("entityId");
  if (entityId) query = query.eq("entity_id", entityId.slice(0, 120));
  const from = q.get("from");
  if (from && DAY.test(from)) query = query.gte("occurred_at", `${from}T00:00:00${TZ}`);
  const to = q.get("to");
  if (to && DAY.test(to)) query = query.lte("occurred_at", `${to}T23:59:59.999${TZ}`);

  const [{ data, count, error: dbErr }, actors] = await Promise.all([
    query
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .range((page - 1) * size, page * size - 1),
    actorsOf(),
  ]);
  // La base aún no tiene la migración del registro (20261119010000): se dice tal cual, no como un error de conexión.
  if (dbErr) {
    if (isMissingTable(dbErr)) return fail(503, "ACTIVITY_NOT_MIGRATED");
    throw dbErr;
  }
  return json({ items: (data as Row[]).map(toEntry), total: count ?? 0, page, size, actors } satisfies ActivityPage);
});
