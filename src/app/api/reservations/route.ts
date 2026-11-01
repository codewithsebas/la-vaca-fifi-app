import type { NextRequest } from "next/server";
import { computeQuote, depositDueAt, validateReservation } from "@/lib/booking";
import { todayISO } from "@/lib/format";
import { loadPricing, runDeadlines, toPublic } from "@/lib/server/db";
import { fail, json, readJson, route } from "@/lib/server/http";
import { holdReservation } from "@/lib/server/reservations";
import { verifyTurnstile } from "@/lib/server/turnstile";
import { createServiceClient } from "@/lib/supabase/server";
import type { ReservationInput } from "@/lib/types";

const validation = (fields: Record<string, string>) => fail(422, "VALIDATION_ERROR", { fields });

// POST /api/reservations (cabecera Idempotency-Key) → 201 con las fechas retenidas mientras se paga el abono.
// Todavía no es una reserva confirmada: el huésped paga por transferencia, sube el comprobante y el equipo la confirma.
// La restricción de exclusión de la base de datos impide que dos personas retengan la misma cabaña en las mismas noches.
export const POST = route(async (req: NextRequest) => {
  const b = await readJson<ReservationInput>(req);
  if (!b) return fail(400, "INVALID_BODY");
  if (b.website) return validation({ website: "Solicitud rechazada." });
  if (!(await verifyTurnstile(b.captchaToken, req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null)))
    return validation({ captchaToken: "No pudimos verificar que no eres un robot. Inténtalo de nuevo." });

  const sb = createServiceClient();
  const idemKey = req.headers.get("idempotency-key")?.slice(0, 100) || null;
  const findByKey = async (key: string) => (await sb.from("reservations").select("*").eq("idempotency_key", key).maybeSingle().throwOnError()).data;
  if (idemKey) {
    const existing = await findByKey(idemKey);
    if (existing) return json(toPublic(existing), 201);
  }

  await runDeadlines();
  const { types, units, seasons } = await loadPricing(sb);
  const fields = validateReservation(b, types, todayISO());
  if (Object.keys(fields).length) return validation(fields);

  const type = types.find((t) => t.id === b.cabinTypeId)!;
  const guests = Number(b.adults) + Number(b.children);
  const held = await holdReservation(
    sb,
    {
      cabin_type_id: type.id,
      check_in: b.checkIn,
      check_out: b.checkOut,
      adults: Number(b.adults),
      children: Number(b.children),
      pet: { hasPet: !!b.pet?.hasPet, smallBreedConfirmed: !!(b.pet?.hasPet && b.pet.smallBreedConfirmed) },
      decoration: b.decoration?.requested
        ? { requested: true, occasion: b.decoration.occasion, notes: (b.decoration.notes ?? "").trim() }
        : { requested: false, occasion: "", notes: "" },
      estimated_arrival: b.estimatedArrival,
      guest_full_name: b.guest.fullName.trim(),
      guest_doc_type: b.guest.docType,
      guest_doc_number: b.guest.docNumber.trim(),
      guest_email: b.guest.email.trim(),
      guest_phone: b.guest.phone.trim(),
      guest_city: b.guest.city.trim(),
      special_requests: (b.specialRequests ?? "").trim(),
      consents: { policies: true, dataProcessing: true, marketing: !!b.consents.marketing },
      quote: computeQuote(type, b.checkIn, b.checkOut, guests, seasons),
      idempotency_key: idemKey,
      deposit_due_at: depositDueAt(),
    },
    { units: units[type.id] ?? 0 },
  );
  if ("row" in held) return json(toPublic(held.row), 201);
  if (held.error === "IDEMPOTENCY_CONFLICT" && idemKey) {
    const existing = await findByKey(idemKey);
    if (existing) return json(toPublic(existing), 201);
  }
  return fail(409, "DATES_UNAVAILABLE");
});
