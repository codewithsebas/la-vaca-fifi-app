import { after, type NextRequest } from "next/server";
import { computeQuote, normalizePhone, splitTotal, validateExtraCabins, validateManualReservation, withTotal } from "@/lib/booking";
import { manualDueAt } from "@/lib/payments";
import { loadPricing, runDeadlines, toReservation } from "@/lib/server/db";
import { fail, json, operationDay, readJson, requireStaff, syncRoute } from "@/lib/server/http";
import { processOutbox } from "@/lib/server/mailer";
import { holdGroup, holdReservation } from "@/lib/server/reservations";
import { siteUrl } from "@/lib/server/site";
import { createServiceClient } from "@/lib/supabase/server";
import type { ManualReservationInput, ManualReservationResult } from "@/lib/types";

const validation = (fields: Record<string, string>) => fail(422, "VALIDATION_ERROR", { fields });

// POST /api/admin/reservations → 201 { reservation }. Reserva tomada por el equipo (WhatsApp, teléfono, en persona):
// retiene la cabaña con las mismas reglas de disponibilidad que la web y queda pendiente de abono hasta el plazo elegido.
// El equipo registra el abono cuando lo recibe; si no llega a tiempo, las fechas se liberan solas.
export const POST = syncRoute(async (req: NextRequest) => {
  const { error } = await requireStaff();
  if (error) return error;
  const b = await readJson<ManualReservationInput>(req);
  if (!b || !b.guest) return fail(400, "INVALID_BODY");

  // La retención y la inserción usan la misma conexión de servicio que la web: ven todas las reservas.
  const sb = createServiceClient();
  await runDeadlines();
  const { types, units, seasons, depositPct } = await loadPricing(sb);
  const input: ManualReservationInput = { ...b, unit: b.unit ?? null, total: b.total ?? null, guest: { ...b.guest, phone: normalizePhone(b.guest.phone) } };
  const fields = { ...validateManualReservation(input, types, units, operationDay(req)), ...validateExtraCabins(input.more, types, units) };
  const due = manualDueAt(input.checkIn, input.holdMinutes);
  if (!fields.checkIn && !fields.holdMinutes && due.tooShort)
    fields.holdMinutes = "Ya no queda tiempo para pagar antes de la llegada: registra el pago manualmente.";
  if (Object.keys(fields).length) return validation(fields);

  const type = types.find((t) => t.id === input.cabinTypeId)!;
  const { data: settings } = await sb.from("site_settings").select("check_in_start").maybeSingle().throwOnError();
  // La primera cabaña y, en una reserva con varias, las demás. El precio especial es del grupo: se reparte.
  const cabins = [{ cabinTypeId: type.id, adults: input.adults, children: input.children, unit: input.unit }, ...(input.more ?? [])];
  const quotes = cabins.map((c) =>
    computeQuote(
      types.find((t) => t.id === c.cabinTypeId)!,
      input.checkIn,
      input.checkOut,
      Number(c.adults) + Number(c.children ?? 0),
      seasons,
      depositPct,
    ),
  );
  const finalQuotes = input.total ? splitTotal(quotes, input.total).map((t, i) => withTotal(quotes[i], t, depositPct)) : quotes;
  const finalTotal = finalQuotes.reduce((sum, q) => sum + q.total, 0);
  // Creada sin conexión: el usuario le dijo un valor al huésped; si las tarifas cambiaron, lo decide él.
  if (input.expectedTotal !== undefined && input.expectedTotal !== finalTotal) return fail(409, "QUOTE_CHANGED", { total: finalTotal });
  if (input.code !== undefined && !/^VF-[A-Z0-9]{5}$/.test(input.code)) return fail(400, "INVALID_BODY");
  const finalQuote = finalQuotes[0];
  const g = input.guest;
  const base = {
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
    quote: finalQuote,
    deposit_due_at: due.dueAt,
  };

  if (cabins.length > 1) {
    const group = await holdGroup(
      sb,
      cabins.map((c, i) => ({
        ...base,
        cabin_type_id: c.cabinTypeId,
        adults: Number(c.adults),
        children: Number(c.children ?? 0),
        quote: finalQuotes[i],
        unit: c.unit ?? null,
      })),
      { units: units as Record<string, number>, code: input.code },
    );
    if (!("rows" in group)) return fail(409, group.error === "ID_TAKEN" ? "ID_TAKEN" : "DATES_UNAVAILABLE");
    after(() => processOutbox(siteUrl(req.nextUrl.origin)));
    const result: ManualReservationResult = { reservation: toReservation(group.rows[0]), group: group.rows.map((r) => toReservation(r)) };
    return json(result, 201);
  }

  const held = await holdReservation(sb, base, { units: units[type.id] ?? 0, unit: input.unit, code: input.code });
  if (!("row" in held)) return fail(409, held.error === "ID_TAKEN" ? "ID_TAKEN" : "DATES_UNAVAILABLE");

  // La base de datos encoló la «Reserva recibida» para el huésped y el aviso al negocio: salen después de responder.
  after(() => processOutbox(siteUrl(req.nextUrl.origin)));
  const result: ManualReservationResult = { reservation: toReservation(held.row) };
  return json(result, 201);
});
