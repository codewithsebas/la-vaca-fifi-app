import type { NextRequest } from "next/server";
import { toEmail } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, route } from "@/lib/server/http";
import { mailConfigured, processOutbox } from "@/lib/server/mailer";
import { siteUrl } from "@/lib/server/payments";
import { createServiceClient } from "@/lib/supabase/server";

const KEY = /^(CC|CE|Pasaporte|PPT):[A-Z0-9]{5,15}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Body =
  | { action: "send"; clientKey: string; subject: string; message: string; reservationCode?: string | null; requestId: string }
  | { action: "retry"; id: string };

// GET /api/admin/emails → si el envío está configurado (para avisarlo en el panel antes de escribir).
export const GET = route(async () => {
  const { error } = await requireAdmin();
  if (error) return error;
  return json({ configured: mailConfigured() });
});

// POST /api/admin/emails
//   { action: "send", clientKey, subject, message, reservationCode?, requestId } → envía un mensaje del equipo al cliente.
//     `requestId` (UUID del intento en el navegador) hace la solicitud idempotente: repetirla nunca envía dos correos.
//   { action: "retry", id } → reintenta ya un correo que falló.
// Responde con el registro del correo (status "sent" o "failed" con el motivo); el resultado queda en la bandeja.
export const POST = route(async (req: NextRequest) => {
  const { sb, uid, error } = await requireAdmin();
  if (error) return error;
  const b = await readJson<Body>(req);
  if (!b) return fail(400, "INVALID_BODY");
  const base = siteUrl(req.nextUrl.origin);
  const service = createServiceClient();

  if (b.action === "retry") {
    if (!UUID.test(String(b.id))) return fail(400, "INVALID_ID");
    const { data: row } = await sb.from("email_outbox").select("id, status").eq("id", b.id).maybeSingle().throwOnError();
    if (!row) return fail(404, "NOT_FOUND");
    if (row.status !== "sent") await processOutbox(base, { ids: [row.id] });
    const { data } = await service.from("email_outbox").select("*").eq("id", row.id).single().throwOnError();
    return json(toEmail(data));
  }

  if (b.action !== "send" || !KEY.test(String(b.clientKey)) || !UUID.test(String(b.requestId))) return fail(400, "INVALID_BODY");
  const subject = String(b.subject ?? "").trim();
  const message = String(b.message ?? "").trim();
  const fields: Record<string, string> = {};
  if (subject.length < 3 || subject.length > 150) fields.subject = "Escribe un asunto de 3 a 150 caracteres.";
  if (message.length < 5 || message.length > 5000) fields.message = "Escribe un mensaje de 5 a 5000 caracteres.";
  if (Object.keys(fields).length) return fail(422, "VALIDATION_ERROR", { fields });

  // El destinatario sale de la última reserva del cliente (nunca del navegador).
  const { data: latest } = await sb.from("reservations").select("code, guest_full_name, guest_email").eq("client_key", b.clientKey).order("created_at", { ascending: false }).limit(1).throwOnError();
  const client = latest[0];
  if (!client) return fail(404, "CLIENT_NOT_FOUND");
  if (!EMAIL.test(client.guest_email ?? "")) return fail(422, "NO_EMAIL");
  let code: string | null = null;
  if (b.reservationCode) {
    const { data } = await sb.from("reservations").select("code").eq("code", b.reservationCode).eq("client_key", b.clientKey).maybeSingle().throwOnError();
    code = data?.code ?? null;
  }

  const dedupe = `mensaje:${b.requestId.toLowerCase()}`;
  const { data: inserted } = await service
    .from("email_outbox")
    .upsert(
      { dedupe_key: dedupe, kind: "team_message", reservation_code: code, to_email: client.guest_email, subject, payload: { nombre: client.guest_full_name, asunto: subject, mensaje: message, codigo: code, clientKey: b.clientKey }, created_by: uid },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id")
    .throwOnError();
  const { data: row } = await service.from("email_outbox").select("*").eq("dedupe_key", dedupe).single().throwOnError();
  // Una solicitud repetida devuelve el resultado de la primera (si ya salió, no se reenvía).
  if (inserted.length || row.status !== "sent") await processOutbox(base, { ids: [row.id] });
  const { data: fresh } = await service.from("email_outbox").select("*").eq("id", row.id).single().throwOnError();
  return json(toEmail(fresh), inserted.length ? 201 : 200);
});
