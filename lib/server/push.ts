import "server-only";
import webpush, { WebPushError } from "web-push";
import { groupOf } from "@/lib/notification-groups";
import type { Tables } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/server";

// Notificaciones push del equipo. Cada aviso nuevo del panel (admin_notifications) se envía a los dispositivos
// suscritos que eligieron su grupo. Despacho idempotente: se "reclaman" los avisos marcando pushed_at con un UPDATE,
// así lo pueden disparar a la vez la base de datos (pg_net) y la app sin que un aviso salga dos veces.

type Sub = Tables<"push_subscriptions">;
type Note = Tables<"admin_notifications">;
type PushPayload = { title: string; body: string; url: string; tag: string };

const RECENT_MS = 2 * 3600e3; // un aviso con más de 2 horas ya no se envía (por si el despacho estuvo caído)
const TTL = 6 * 3600; // segundos que el servicio push guarda el mensaje si el dispositivo está apagado
const SUMMARY_FROM = 4; // desde cuántos avisos juntos se envía un resumen en lugar de uno por uno

// Servicios push de los navegadores: el servidor solo envía a estos dominios (nunca a una URL arbitraria).
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.mozilla\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/];
export const isPushEndpoint = (endpoint: unknown): endpoint is string => {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
};

const env = () => ({
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "",
  privateKey: process.env.VAPID_PRIVATE_KEY?.trim() ?? "",
  // Contacto para los servicios push (https o mailto:). Apple rechaza los envíos sin uno válido.
  subject: process.env.VAPID_SUBJECT?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "",
});
export const pushConfigured = () => {
  const e = env();
  return !!(e.publicKey && e.privateKey && /^(https:|mailto:)/.test(e.subject));
};

let vapidReady = false;
function vapid() {
  if (vapidReady) return;
  const e = env();
  webpush.setVapidDetails(e.subject, e.publicKey, e.privateKey);
  vapidReady = true;
}

type Outcome = "ok" | "gone" | "error";
async function send(sub: Sub, payload: PushPayload): Promise<Outcome> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
      TTL,
      urgency: "high",
      timeout: 10000,
    });
    return "ok";
  } catch (e) {
    // 404/410: el navegador anuló la suscripción (desinstalación, permisos revocados). Se borra.
    if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) return "gone";
    console.error(`Push a ${new URL(sub.endpoint).hostname} falló:`, e instanceof WebPushError ? `${e.statusCode} ${e.body}` : e);
    return "error";
  }
}

// Envía a varios dispositivos y deja la tabla al día: borra los anulados y anota el último envío exitoso.
async function deliver(sb: ReturnType<typeof createServiceClient>, jobs: { sub: Sub; payloads: PushPayload[] }[]) {
  const results = await Promise.all(jobs.map(async ({ sub, payloads }) => ({ sub, outcomes: await Promise.all(payloads.map((p) => send(sub, p))) })));
  const gone = results.filter((r) => r.outcomes.includes("gone")).map((r) => r.sub.id);
  const ok = results.filter((r) => !r.outcomes.includes("gone") && r.outcomes.includes("ok")).map((r) => r.sub.id);
  if (gone.length) await sb.from("push_subscriptions").delete().in("id", gone).throwOnError();
  if (ok.length) await sb.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).in("id", ok).throwOnError();
  return results.reduce((n, r) => n + r.outcomes.filter((o) => o === "ok").length, 0);
}

const toPayload = (n: Note): PushPayload => ({
  title: n.title,
  body: n.body,
  url: n.reservation_code
    ? `/admin/reservas/${encodeURIComponent(n.reservation_code)}`
    : n.kind === "channel_sync_failed"
      ? "/admin/booking"
      : "/admin/notificaciones",
  tag: `aviso-${n.id}`,
});

/** Envía los avisos nuevos sin leer que aún no salieron. Nunca lanza: devuelve cuántas notificaciones se entregaron. */
export async function dispatchPush(): Promise<number> {
  if (!pushConfigured()) return 0;
  try {
    vapid();
    const sb = createServiceClient();
    const { data: notes } = await sb
      .from("admin_notifications")
      .update({ pushed_at: new Date().toISOString() })
      .is("pushed_at", null)
      .is("read_at", null)
      .gte("created_at", new Date(Date.now() - RECENT_MS).toISOString())
      .select("*")
      .throwOnError();
    if (!notes.length) return 0;
    notes.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const { data: subs } = await sb.from("push_subscriptions").select("*").throwOnError();
    const jobs = subs.flatMap((sub) => {
      const mine = notes.filter((n) => sub.groups.includes(groupOf(n.kind)));
      if (!mine.length) return [];
      const payloads =
        mine.length >= SUMMARY_FROM
          ? [
              {
                title: `${mine.length} avisos nuevos`,
                body:
                  mine
                    .map((n) => n.title)
                    .slice(0, 3)
                    .join(" · ") + (mine.length > 3 ? " · …" : ""),
                url: "/admin/notificaciones",
                tag: `resumen-${mine[0].id}`,
              },
            ]
          : mine.map(toPayload);
      return [{ sub, payloads }];
    });
    return await deliver(sb, jobs);
  } catch (e) {
    console.error("No se pudieron enviar las notificaciones push:", e);
    return 0;
  }
}

/** Notificación de prueba a un dispositivo del administrador. */
export async function sendTestPush(sub: Sub): Promise<Outcome> {
  vapid();
  const outcome = await send(sub, {
    title: "Notificaciones activadas",
    body: "Así llegarán las reservas, pagos y alertas del panel a este dispositivo.",
    url: "/admin/configuracion",
    tag: "prueba",
  });
  const sb = createServiceClient();
  if (outcome === "gone") await sb.from("push_subscriptions").delete().eq("id", sub.id).throwOnError();
  if (outcome === "ok") await sb.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("id", sub.id).throwOnError();
  return outcome;
}

// "Chrome en Windows", "Safari en iPhone"… para reconocer cada dispositivo en la lista.
export function deviceLabel(ua: string | null) {
  if (!ua) return "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /OPR\//.test(ua)
        ? "Opera"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Navegador";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  return os ? `${browser} en ${os}` : browser;
}
