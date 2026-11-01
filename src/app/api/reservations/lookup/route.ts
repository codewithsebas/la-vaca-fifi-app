import type { NextRequest } from "next/server";
import { publicView, runDeadlines } from "@/lib/server/db";
import { fail, json, route } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/server";

// GET /api/reservations/lookup?code&email → datos públicos de la reserva si el correo coincide: estado, montos,
// plazo del abono y sus pagos (nunca la valoración interna ni datos del equipo), con la clave de su canal
// en tiempo real (solo la recibe quien conoce el código y el correo) y la hora del servidor.
export const GET = route(async (req: NextRequest) => {
  const p = req.nextUrl.searchParams;
  const sb = createServiceClient();
  const code = (p.get("code") ?? "").trim().toUpperCase();
  const email = (p.get("email") ?? "").trim().toLowerCase();
  if (!/^[A-Z0-9]{2,5}-[A-Z0-9]{3,8}$/.test(code) || !email) return fail(404, "NOT_FOUND");

  await runDeadlines();
  const { data: row } = await sb.from("reservations").select("*").eq("code", code).maybeSingle().throwOnError();
  // Mismo 404 si el código no existe o el correo no coincide: no revela qué códigos existen.
  if (!row || row.guest_email.toLowerCase() !== email) return fail(404, "NOT_FOUND");
  return json(await publicView(sb, row));
});
