import { after, type NextRequest } from "next/server";
import { toProof } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, route } from "@/lib/server/http";
import { processOutbox } from "@/lib/server/mailer";
import { dispatchPush } from "@/lib/server/push";
import { businessError, siteUrl } from "@/lib/server/payments";
import { PROOF_BUCKET } from "@/lib/server/proofs";
import type { ProofReview } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/admin/proofs?id= → URL firmada de 5 minutos (bucket privado; la firma usa la sesión del admin y su política de lectura).
export const GET = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return fail(400, "INVALID_ID");
  const { data: p } = await sb.from("payment_proofs").select("path, mime, file_name").eq("id", id).maybeSingle().throwOnError();
  if (!p) return fail(404, "NOT_FOUND");
  const { data, error: signErr } = await sb.storage.from(PROOF_BUCKET).createSignedUrl(p.path, 300);
  if (signErr || !data) throw signErr ?? new Error("No se pudo firmar la URL del comprobante");
  return json({ url: data.signedUrl, mime: p.mime, fileName: p.file_name });
});

// POST /api/admin/proofs { id, decision, note, confirmReservation } → aprueba o rechaza.
// Aprobar con confirmReservation registra el abono como pago recibido y confirma la reserva (si estaba pendiente o vencida),
// con las mismas reglas que un pago en línea (y el mismo correo de confirmación).
export const POST = route(async (req: NextRequest) => {
  const { sb, uid, error } = await requireAdmin();
  if (error) return error;
  const b = await readJson<ProofReview>(req);
  if (!b || !UUID.test(String(b.id)) || !["approve", "reject"].includes(b.decision)) return fail(400, "INVALID_BODY");
  const note = String(b.note ?? "").trim();
  if (note.length > 500 || (b.decision === "reject" && !note)) return fail(422, "VALIDATION_ERROR", { fields: { note: "Explica el motivo del rechazo." } });

  const { data: proof } = await sb.from("payment_proofs").select("reservation_code").eq("id", b.id).maybeSingle().throwOnError();
  if (!proof) return fail(404, "NOT_FOUND");

  const approve = b.decision === "approve";
  if (approve && b.confirmReservation) {
    const { data: r } = await sb.from("reservations").select("status, deposit_paid_at").eq("code", proof.reservation_code).single().throwOnError();
    if ((r.status === "pending_deposit" || r.status === "expired") && !r.deposit_paid_at) {
      const { error: payErr } = await sb.rpc("register_manual_payment", { p_code: proof.reservation_code, p_kind: "deposit", p_note: "Comprobante de pago aprobado" });
      if (payErr) {
        // Una retención vencida pudo perder sus fechas: otra reserva activa ya las ocupa.
        const known = businessError(payErr);
        if (known) return fail(known.status, known.error === "NO_AVAILABILITY" ? "DATES_UNAVAILABLE" : known.error);
        throw payErr;
      }
      after(() => processOutbox(siteUrl(req.nextUrl.origin)).then(() => dispatchPush()));
    }
  }

  const { data: updated } = await sb
    .from("payment_proofs")
    .update({ status: approve ? "approved" : "rejected", review_note: note, reviewed_at: new Date().toISOString(), reviewed_by: uid })
    .eq("id", b.id)
    .select("*")
    .single()
    .throwOnError();
  return json(toProof(updated));
});
