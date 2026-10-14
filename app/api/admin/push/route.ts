import type { NextRequest } from "next/server";
import { isGroup } from "@/lib/notification-groups";
import { fail, json, readJson, requireAdmin, route } from "@/lib/server/http";
import { deviceLabel, isPushEndpoint, pushConfigured, sendTestPush } from "@/lib/server/push";
import { createServiceClient } from "@/lib/supabase/server";

// Dispositivos del equipo que reciben notificaciones push. La tabla solo la toca el servidor (clave secreta),
// siempre después de verificar la sesión de administrador; cada quien gestiona sus propios dispositivos.

type Keys = { p256dh?: unknown; auth?: unknown };
type Body =
  | { action: "subscribe"; subscription?: { endpoint?: unknown; keys?: Keys }; groups?: unknown; replaces?: unknown }
  | { action: "groups"; endpoint?: unknown; groups?: unknown }
  | { action: "test"; endpoint?: unknown };

const groupsOf = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter(isGroup))] : null);
const view = (s: { groups: string[]; device: string; last_success_at: string | null } | null) => (s ? { groups: s.groups, device: s.device, lastSuccessAt: s.last_success_at } : null);

// GET /api/admin/push?endpoint=… → ¿está configurado el envío y registrado este dispositivo?
export const GET = route(async (req: NextRequest) => {
  const { uid, error } = await requireAdmin();
  if (error) return error;
  const endpoint = req.nextUrl.searchParams.get("endpoint");
  if (!isPushEndpoint(endpoint) || !uid) return json({ configured: pushConfigured(), subscription: null });
  const { data } = await createServiceClient().from("push_subscriptions").select("groups, device, last_success_at").eq("endpoint", endpoint).eq("user_id", uid).maybeSingle().throwOnError();
  return json({ configured: pushConfigured(), subscription: view(data) });
});

// POST /api/admin/push { action: "subscribe" | "groups" | "test", … }
export const POST = route(async (req: NextRequest) => {
  const { uid, error } = await requireAdmin();
  if (error) return error;
  if (!uid) return fail(401, "UNAUTHORIZED");
  if (!pushConfigured()) return fail(503, "PUSH_NOT_CONFIGURED");
  const b = await readJson<Body>(req);
  const sb = createServiceClient();

  if (b?.action === "subscribe") {
    const s = b.subscription;
    const p256dh = s?.keys?.p256dh;
    const auth = s?.keys?.auth;
    if (!isPushEndpoint(s?.endpoint) || typeof p256dh !== "string" || typeof auth !== "string") return fail(400, "INVALID_SUBSCRIPTION");
    const groups = groupsOf(b.groups);
    // Mismo dispositivo con otra sesión: la suscripción pasa al administrador que la registra ahora.
    const { data } = await sb
      .from("push_subscriptions")
      .upsert({ endpoint: s.endpoint, p256dh, auth, user_id: uid, device: deviceLabel(req.headers.get("user-agent")), ...(groups && { groups }) }, { onConflict: "endpoint" })
      .select("groups, device, last_success_at")
      .single()
      .throwOnError();
    // El navegador renovó la suscripción (pushsubscriptionchange): se borra la anterior.
    if (isPushEndpoint(b.replaces) && b.replaces !== s.endpoint) await sb.from("push_subscriptions").delete().eq("endpoint", b.replaces).eq("user_id", uid).throwOnError();
    return json(view(data));
  }

  if (!isPushEndpoint(b?.endpoint)) return fail(400, "INVALID_BODY");
  const { data: sub } = await sb.from("push_subscriptions").select("*").eq("endpoint", b.endpoint).eq("user_id", uid).maybeSingle().throwOnError();
  if (!sub) return fail(404, "NOT_SUBSCRIBED");

  if (b.action === "groups") {
    const groups = groupsOf(b.groups);
    if (!groups) return fail(400, "INVALID_GROUPS");
    const { data } = await sb.from("push_subscriptions").update({ groups }).eq("id", sub.id).select("groups, device, last_success_at").single().throwOnError();
    return json(view(data));
  }
  if (b.action === "test") {
    const outcome = await sendTestPush(sub);
    if (outcome === "gone") return fail(410, "SUBSCRIPTION_GONE");
    if (outcome === "error") return fail(502, "PUSH_FAILED");
    return json({ ok: true });
  }
  return fail(400, "INVALID_BODY");
});

// DELETE /api/admin/push?endpoint=… → este dispositivo deja de recibir notificaciones.
export const DELETE = route(async (req: NextRequest) => {
  const { uid, error } = await requireAdmin();
  if (error) return error;
  const endpoint = req.nextUrl.searchParams.get("endpoint");
  if (!isPushEndpoint(endpoint) || !uid) return fail(400, "INVALID_ENDPOINT");
  await createServiceClient().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", uid).throwOnError();
  return json({ ok: true });
});
