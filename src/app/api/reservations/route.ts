import { after, type NextRequest } from "next/server";
import { computeQuote, depositDueAt, validateExtraCabins, validateReservation } from "@/lib/booking";
import { todayISO } from "@/lib/format";
import { loadGroupRows, loadPricing, runDeadlines, toPublic, toPublicGroup } from "@/lib/server/db";
import { fail, json, readJson, route } from "@/lib/server/http";
import { processOutbox } from "@/lib/server/mailer";
import { holdGroup, holdReservation } from "@/lib/server/reservations";
import { siteUrl } from "@/lib/server/site";
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
  const reply = async (row: NonNullable<Awaited<ReturnType<typeof findByKey>>>) =>
    json(row.group_code ? toPublicGroup(await loadGroupRows(sb, row.group_code)) : toPublic(row), 201);
  if (idemKey) {
    const existing = await findByKey(idemKey);
    if (existing) return reply(existing);
  }

  await runDeadlines();
  const { types, units, seasons, depositPct } = await loadPricing(sb);
  const fields = { ...validateReservation(b, types, todayISO()), ...validateExtraCabins(b.more, types) };
  if (Object.keys(fields).length) return validation(fields);

  const type = types.find((t) => t.id === b.cabinTypeId)!;
  const guests = Number(b.adults) + Number(b.children);
  const row = {
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
    quote: computeQuote(type, b.checkIn, b.checkOut, guests, seasons, depositPct),
    idempotency_key: idemKey,
    deposit_due_at: depositDueAt(),
  };

  // Reserva con varias cabañas: mismas fechas y huésped; cada una con sus personas y su tarifa.
  if (b.more?.length) {
    const group = await holdGroup(
      sb,
      [
        { ...row, unit: null },
        ...b.more.map((m) => {
          const t = types.find((x) => x.id === m.cabinTypeId)!;
          const people = Number(m.adults) + Number(m.children ?? 0);
          return {
            ...row,
            cabin_type_id: t.id,
            adults: Number(m.adults),
            children: Number(m.children ?? 0),
            quote: computeQuote(t, b.checkIn, b.checkOut, people, seasons, depositPct),
            unit: null,
          };
        }),
      ],
      { units: units as Record<string, number> },
    );
    if ("rows" in group) {
      after(() => processOutbox(siteUrl(req.nextUrl.origin)));
      return json(toPublicGroup(group.rows), 201);
    }
    if (group.error === "IDEMPOTENCY_CONFLICT" && idemKey) {
      const existing = await findByKey(idemKey);
      if (existing) return reply(existing);
    }
    return fail(409, "DATES_UNAVAILABLE");
  }

  const held = await holdReservation(sb, row, { units: units[type.id] ?? 0 });
  if ("row" in held) {
    // La base de datos encoló la «Reserva recibida» para el huésped y el aviso al negocio: salen después de responder.
    after(() => processOutbox(siteUrl(req.nextUrl.origin)));
    return json(toPublic(held.row), 201);
  }
  if (held.error === "IDEMPOTENCY_CONFLICT" && idemKey) {
    const existing = await findByKey(idemKey);
    if (existing) return reply(existing);
  }
  return fail(409, "DATES_UNAVAILABLE");
});
