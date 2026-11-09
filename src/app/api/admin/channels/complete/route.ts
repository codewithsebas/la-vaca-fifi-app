import type { NextRequest } from "next/server";
import { newReservationCode, normalizePhone, validateStayCompletion } from "@/lib/booking";
import { nightsBetween } from "@/lib/format";
import { loadCabinTypes, loadDepositPct, toReservation } from "@/lib/server/db";
import { businessError, fail, json, readJson, requireStaff, route } from "@/lib/server/http";
import { flatQuote } from "@/lib/server/reservations";
import { createServiceClient } from "@/lib/supabase/server";
import type { ChannelStayCompletion } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/admin/channels/complete → 201 Reservation. Convierte una noche de Booking en una reserva con los datos del
// huésped (copiados del extranet): entra confirmada, sin pagos ni correos, y la noche queda enlazada a ella. La cabaña y las
// fechas las pone la noche de Booking; todo ocurre en una sola transacción (complete_channel_stay).
export const POST = route(async (req: NextRequest) => {
  const { error } = await requireStaff();
  if (error) return error;
  const b = await readJson<ChannelStayCompletion>(req);
  if (!b || typeof b.stayId !== "string" || !UUID.test(b.stayId) || !b.guest) return fail(400, "INVALID_BODY");

  const sb = createServiceClient();
  const { data: stay } = await sb.from("channel_stays").select("cabin_type_id, check_in, check_out").eq("id", b.stayId).maybeSingle().throwOnError();
  if (!stay) return fail(404, "NOT_FOUND");
  const { types } = await loadCabinTypes(sb);
  const fields = validateStayCompletion(
    b,
    types.find((t) => t.id === stay.cabin_type_id),
  );
  if (Object.keys(fields).length) return fail(422, "VALIDATION_ERROR", { fields });

  const [depositPct, { data: settings }] = await Promise.all([
    loadDepositPct(sb),
    sb.from("site_settings").select("check_in_start").maybeSingle().throwOnError(),
  ]);
  const g = b.guest;
  const phone = normalizePhone(g.phone);
  const guest = {
    fullName: g.fullName.trim(),
    docType: g.docType,
    // Sin documento: el número es el teléfono, así el cliente sigue agrupado.
    docNumber: g.docType === "SD" ? phone.replace(/\D/g, "").slice(0, 15) : g.docNumber.trim().toUpperCase(),
    email: (g.email ?? "").trim(),
    phone,
    city: (g.city ?? "").trim(),
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newReservationCode();
    const { error: rpcError } = await sb.rpc("complete_channel_stay", {
      p_stay: b.stayId,
      p_code: code,
      p_ref: (b.ref ?? "").trim(),
      p_adults: b.adults,
      p_children: b.children,
      p_arrival: (settings?.check_in_start ?? "15:00").slice(0, 5),
      p_guest: guest,
      p_notes: (b.notes ?? "").trim(),
      p_quote: flatQuote(b.total, nightsBetween(stay.check_in, stay.check_out), depositPct),
    });
    if (!rpcError) {
      const { data: row } = await sb.from("reservations").select("*, reservation_notes(text, created_at)").eq("code", code).single().throwOnError();
      return json(toReservation(row), 201);
    }
    // Hay una reserva confirmada en esa cabaña y esas noches: la decisión es del equipo.
    if (rpcError.code === "23P01") return fail(409, "DATES_UNAVAILABLE");
    if (rpcError.code === "23505" && rpcError.message.includes("external_ref")) return fail(409, "DUPLICATE");
    if (rpcError.code === "23505") continue; // código repetido: se genera otro
    const known = businessError(rpcError);
    if (known) return fail(known.status, known.error);
    throw rpcError;
  }
  return fail(409, "DUPLICATE");
});
