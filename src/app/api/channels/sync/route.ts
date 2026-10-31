import { timingSafeEqual } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { syncBeds24 } from "@/lib/server/beds24-sync";
import { syncCalendars } from "@/lib/server/channels";
import { fail, json, readJson, route } from "@/lib/server/http";
import { dispatchPush } from "@/lib/server/push";
import { env } from "@/lib/server/env";

// El primer repaso con Beds24 puede crear allá varias reservas de la web seguidas.
export const maxDuration = 60;

// POST /api/channels/sync { mode } (Authorization: Bearer CHANNEL_SYNC_SECRET) → sincroniza con Booking.com.
// La llama la base de datos (pg_cron → request_channel_sync, con el mismo secreto guardado en Vault):
//   mode 'all' cada 5 minutos: calendarios iCal enlazados y repaso completo con Beds24.
//   mode 'push' en cuanto cambia una reserva o un bloqueo de una unidad enlazada con Beds24: solo ajusta Beds24.
export const POST = route(async (req: NextRequest) => {
  const secret = env.channelSyncSecret;
  if (!secret) return fail(503, "NOT_CONFIGURED");
  const given = Buffer.from(
    req.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim() ?? "",
  );
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return fail(401, "UNAUTHORIZED");

  const mode = (await readJson<{ mode?: string }>(req))?.mode === "push" ? "push" : "all";
  const [results, beds24] = await Promise.all([mode === "all" ? syncCalendars({ minAgeMs: 60_000, notifyErrors: true }) : [], syncBeds24(mode)]);
  // Avisos de reacomodos, posibles sobreventas o errores: salen como notificación push después de responder.
  const all = [...results, ...(beds24?.ok ? beds24.results : [])];
  if (all.some((r) => r.moved.length || r.conflicts.length || !r.ok) || (beds24 && (!beds24.ok || beds24.conflicts.length))) after(dispatchPush);
  return json({ results, beds24 });
});
