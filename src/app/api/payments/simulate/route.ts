import { randomBytes } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { publicView, runDeadlines, toPublicPayment } from "@/lib/server/db";
import { fail, json, readJson, route } from "@/lib/server/http";
import { processOutbox } from "@/lib/server/mailer";
import { dispatchPush } from "@/lib/server/push";
import { settleTransaction, simulatorAllowed, siteUrl } from "@/lib/server/payments";
import { createServiceClient } from "@/lib/supabase/server";
import type { PaymentState } from "@/lib/types";

const OUTCOME = { approve: "approved", decline: "declined", pending: "pending", error: "error" } as const;

// POST /api/payments/simulate { ref, outcome } → resultado de la pasarela simulada (solo desarrollo o ALLOW_PAYMENT_SIMULATOR=1).
// Pasa por la misma función de la base de datos que los eventos de Wompi: mismas reglas, mismos avisos, mismo correo.
export const POST = route(async (req: NextRequest) => {
  if (!simulatorAllowed()) return fail(404, "NOT_FOUND");
  const b = await readJson<{ ref?: string; outcome?: keyof typeof OUTCOME }>(req);
  const status = b?.outcome ? OUTCOME[b.outcome] : undefined;
  if (!b?.ref || !status) return fail(400, "INVALID_BODY");

  const sb = createServiceClient();
  await runDeadlines();
  const { data: p } = await sb.from("payments").select("*").eq("reference", String(b.ref).toUpperCase()).maybeSingle().throwOnError();
  if (!p) return fail(404, "NOT_FOUND");
  if (p.provider !== "simulado") return fail(422, "NOT_SIMULATED");

  // Como en Wompi: una transacción pendiente se resuelve (no se crea otra), y una ventana de pago vencida ya no acepta pagos nuevos.
  const { data: open } = await sb.from("payment_transactions").select("id").eq("payment_id", p.id).eq("status", "pending").limit(1).throwOnError();
  if (!open.length && p.expires_at && Date.parse(p.expires_at) < Date.now()) return fail(409, "CHECKOUT_EXPIRED");
  const result = await settleTransaction(sb, p, {
    id: open[0]?.id ?? `SIM-${randomBytes(6).toString("hex").toUpperCase()}`,
    reference: p.reference,
    status,
    amountInCents: p.amount * 100,
    currency: "COP",
    method: "SIMULADO",
    detail: status === "declined" ? "Fondos insuficientes (simulado)" : status === "error" ? "Error de comunicación con el banco (simulado)" : "",
  });
  if (result.changed) after(() => processOutbox(siteUrl(req.nextUrl.origin)).then(() => dispatchPush()));

  const { data: fresh } = await sb.from("payments").select("*").eq("id", p.id).single().throwOnError();
  const { data: r } = await sb.from("reservations").select("*").eq("code", p.reservation_code).single().throwOnError();
  const state: PaymentState = { payment: toPublicPayment(fresh), reservation: await publicView(sb, r) };
  return json(state);
});
