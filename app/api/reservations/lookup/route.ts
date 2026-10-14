import type { NextRequest } from "next/server";
import { PAY_TOKEN } from "@/lib/payments";
import { publicView, runDeadlines } from "@/lib/server/db";
import { fail, json, route } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/server";

// GET /api/reservations/lookup?code&email → datos públicos de la reserva si el correo coincide: estado, montos,
// plazos y sus intentos de pago (nunca la valoración interna ni datos del equipo), con la clave de su canal
// en tiempo real (solo la recibe quien conoce el código y el correo) y la hora del servidor.
// GET /api/reservations/lookup?token → lo mismo para el enlace de pago que envía el equipo (/pagar/<token>), con
// `termsAccepted`: si el huésped ya aceptó las políticas (las reservas del panel las aceptan ahí, antes de pagar).
export const GET = route(async (req: NextRequest) => {
  const p = req.nextUrl.searchParams;
  const token = p.get("token") ?? "";
  const sb = createServiceClient();

  if (token) {
    if (!PAY_TOKEN.test(token)) return fail(404, "NOT_FOUND");
    await runDeadlines();
    const { data: row } = await sb.from("reservations").select("*").eq("pay_token", token).maybeSingle().throwOnError();
    if (!row) return fail(404, "NOT_FOUND");
    const consents = row.consents as { policies?: boolean; dataProcessing?: boolean } | null;
    return json({ ...(await publicView(sb, row)), termsAccepted: !!(consents?.policies && consents.dataProcessing) });
  }

  const code = (p.get("code") ?? "").trim().toUpperCase();
  const email = (p.get("email") ?? "").trim().toLowerCase();
  if (!/^[A-Z0-9]{2,5}-[A-Z0-9]{3,8}$/.test(code) || !email) return fail(404, "NOT_FOUND");

  await runDeadlines();
  const { data: row } = await sb.from("reservations").select("*").eq("code", code).maybeSingle().throwOnError();
  // Mismo 404 si el código no existe o el correo no coincide: no revela qué códigos existen.
  if (!row || row.guest_email.toLowerCase() !== email) return fail(404, "NOT_FOUND");
  return json(await publicView(sb, row));
});
