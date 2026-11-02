import type { NextRequest } from "next/server";
import { computeQuote, normalizePhone, validateManualReservation, withTotal } from "@/lib/booking";
import { todayISO } from "@/lib/format";
import { manualDueAt } from "@/lib/payments";
import { loadPricing, runDeadlines, toReservation } from "@/lib/server/db";
import { fail, json, readJson, requireStaff, route } from "@/lib/server/http";
import { holdReservation } from "@/lib/server/reservations";
import { createServiceClient } from "@/lib/supabase/server";
import type { ManualReservationInput, ManualReservationResult } from "@/lib/types";

const validation = (fields: Record<string, string>) => fail(422, "VALIDATION_ERROR", { fields });

// POST /api/admin/reservations → 201 { reservation }. Reserva tomada por el equipo (WhatsApp, teléfono, en persona):
// retiene la cabaña con las mismas reglas de disponibilidad que la web y queda pendiente de abono hasta el plazo elegido.
// El equipo registra el abono cuando lo recibe; si no llega a tiempo, las fechas se liberan solas.
export const POST = route(async (req: NextRequest) => {
  const { error } = await requireStaff();
  if (error) return error;
  const b = await readJson<ManualReservationInput>(req);
  if (!b || !b.guest) return fail(400, "INVALID_BODY");

  // La retención y la inserción usan la misma conexión de servicio que la web: ven todas las reservas.
  const sb = createServiceClient();
  await runDeadlines();
  const { types, units, seasons, depositPct } = await loadPricing(sb);
  const input: ManualReservationInput = { ...b, unit: b.unit ?? null, total: b.total ?? null, guest: { ...b.guest, phone: normalizePhone(b.guest.phone) } };
  const fields = validateManualReservation(input, types, units, todayISO());
  const due = manualDueAt(input.checkIn, input.holdMinutes);
  if (!fields.checkIn && !fields.holdMinutes && due.tooShort)
    fields.holdMinutes = "Ya no queda tiempo para pagar antes de la llegada: registra el pago manualmente.";
  if (Object.keys(fields).length) return validation(fields);

  const type = types.find((t) => t.id === input.cabinTypeId)!;
  const { data: settings } = await sb.from("site_settings").select("check_in_start").maybeSingle().throwOnError();
  const quote = computeQuote(type, input.checkIn, input.checkOut, input.adults + input.children, seasons, depositPct);
  const g = input.guest;
  const held = await holdReservation(
    sb,
    {
      source: "panel",
      cabin_type_id: type.id,
      check_in: input.checkIn,
      check_out: input.checkOut,
      adults: input.adults,
      children: input.children,
      pet: { hasPet: !!input.pet?.hasPet, smallBreedConfirmed: !!input.pet?.hasPet },
      decoration: { requested: false, occasion: "", notes: "" },
      estimated_arrival: input.estimatedArrival || (settings?.check_in_start ?? "15:00").slice(0, 5),
      guest_full_name: g.fullName.trim(),
      guest_doc_type: g.docType,
      guest_doc_number: g.docNumber.trim().toUpperCase(),
      guest_email: g.email.trim(),
      guest_phone: g.phone,
      guest_city: (g.city ?? "").trim(),
      special_requests: (input.specialRequests ?? "").trim(),
      // Reserva tomada por el equipo: el huésped no pasó por los consentimientos de la web.
      consents: { policies: false, dataProcessing: false, marketing: false },
      quote: input.total ? withTotal(quote, input.total, depositPct) : quote,
      deposit_due_at: due.dueAt,
    },
    { units: units[type.id] ?? 0, unit: input.unit },
  );
  if (!("row" in held)) return fail(409, "DATES_UNAVAILABLE");

  const result: ManualReservationResult = { reservation: toReservation(held.row) };
  return json(result, 201);
});
