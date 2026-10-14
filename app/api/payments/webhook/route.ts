import { after, type NextRequest } from "next/server";
import { fail, json, route } from "@/lib/server/http";
import { processOutbox } from "@/lib/server/mailer";
import { dispatchPush } from "@/lib/server/push";
import { parseWompiEvent, settleTransaction, siteUrl } from "@/lib/server/payments";
import { createServiceClient } from "@/lib/supabase/server";

// POST /api/payments/webhook ← eventos de Wompi (URL de eventos configurada en el panel de Wompi).
// Se valida la firma con WOMPI_EVENTS_SECRET; el registro es idempotente (Wompi reintenta si no recibe 200).
// El correo de confirmación sale después de responder: un fallo del correo nunca hace que Wompi reintente el pago.
export const POST = route(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const tx = parseWompiEvent(body, req.headers.get("x-event-checksum"));
  if (!tx) return fail(401, "INVALID_SIGNATURE");

  const sb = createServiceClient();
  const { data: p } = await sb.from("payments").select("reference, amount").eq("reference", tx.reference).maybeSingle().throwOnError();
  // Una referencia que no es nuestra (otro canal del comercio o una prueba de Wompi): se confirma la recepción y se ignora.
  if (!p) return json({ ok: true, ignored: true });
  const result = await settleTransaction(sb, p, tx);
  if (result.changed) after(() => processOutbox(siteUrl(req.nextUrl.origin)).then(() => dispatchPush()));
  return json({ ok: true });
});
