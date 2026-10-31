import { after, type NextRequest } from "next/server";
import { publicView, runDeadlines, toPublicPayment } from "@/lib/server/db";
import { fail, json, route } from "@/lib/server/http";
import { processOutbox } from "@/lib/server/mailer";
import { dispatchPush } from "@/lib/server/push";
import { fetchWompiTransaction, settleTransaction, siteUrl } from "@/lib/server/payments";
import { createServiceClient } from "@/lib/supabase/server";
import type { PaymentState } from "@/lib/types";

const REF = /^[A-Z0-9-]{8,60}$/;

// GET /api/payments/status?ref&id → estado del pago y de su reserva (la página a la que vuelve el huésped).
// `id` es la transacción que Wompi agrega al volver: se consulta en Wompi (nunca se confía en la URL) y se registra.
// Mientras un pago siga en proceso, cada consulta lo refresca en Wompi: el resultado llega aunque el evento se demore.
export const GET = route(async (req: NextRequest) => {
  const ref = (req.nextUrl.searchParams.get("ref") ?? "").trim().toUpperCase();
  const txId = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!REF.test(ref)) return fail(404, "NOT_FOUND");

  const sb = createServiceClient();
  const find = async () => (await sb.from("payments").select("*").eq("reference", ref).maybeSingle().throwOnError()).data;
  const p = await find();
  if (!p) return fail(404, "NOT_FOUND");

  if (p.provider === "wompi" && p.status !== "approved") {
    const ids = new Set<string>(txId ? [txId] : []);
    if (p.status === "pending") {
      const { data: open } = await sb.from("payment_transactions").select("id").eq("payment_id", p.id).eq("status", "pending").throwOnError();
      open.forEach((t) => ids.add(t.id));
    }
    let changed = false;
    for (const id of ids) {
      const tx = await fetchWompiTransaction(id);
      if (tx && tx.reference === p.reference) changed = (await settleTransaction(sb, p, tx)).changed || changed;
    }
    if (changed) after(() => processOutbox(siteUrl(req.nextUrl.origin)).then(() => dispatchPush()));
  }

  await runDeadlines();
  const fresh = (await find())!;
  const { data: r } = await sb.from("reservations").select("*").eq("code", fresh.reservation_code).single().throwOnError();
  const state: PaymentState = { payment: toPublicPayment(fresh), reservation: await publicView(sb, r) };
  return json(state);
});
