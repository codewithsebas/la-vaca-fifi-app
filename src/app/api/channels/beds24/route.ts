import { timingSafeEqual } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { loadCredentials } from "@/lib/server/beds24";
import { beds24Webhook } from "@/lib/server/beds24-sync";
import { fail, json, readJson, route } from "@/lib/server/http";
import { dispatchPush } from "@/lib/server/push";
import { createServiceClient } from "@/lib/supabase/server";

// POST /api/channels/beds24?key=<webhook_key> → aviso de Beds24 (Settings → Properties → Access → Booking webhook,
// versión 2 sin datos personales) cuando entra, cambia o se cancela una reserva. La clave de la URL es la única llave: se
// ve y se copia en el panel (módulo Booking.com). Beds24 reintenta si la respuesta no es 200.
export const POST = route(async (req: NextRequest) => {
  const sb = createServiceClient();
  const cred = await loadCredentials(sb);
  const given = Buffer.from(req.nextUrl.searchParams.get("key") ?? "");
  const expected = Buffer.from(cred?.webhook_key ?? "");
  if (!cred || given.length !== expected.length || !timingSafeEqual(given, expected)) return fail(401, "UNAUTHORIZED");

  const results = await beds24Webhook(await readJson(req));
  // Reacomodos o posibles sobreventas: salen como notificación push después de responder.
  if (results.some((r) => r.moved.length || r.conflicts.length)) after(dispatchPush);
  return json({ ok: true });
});
