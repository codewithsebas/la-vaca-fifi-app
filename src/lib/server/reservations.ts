import "server-only";
import { findUnit, importDocNumber, newReservationCode, type Occupancy } from "@/lib/booking";
import { addDays, nightsBetween } from "@/lib/format";
import type { Tables, TablesInsert } from "@/lib/supabase/database.types";
import type { ImportRow, Quote } from "@/lib/types";
import { loadOccupancy, type Db } from "@/lib/server/db";

type NewReservation = Omit<TablesInsert<"reservations">, "code" | "unit">;
type HoldResult = { row: Tables<"reservations"> } | { error: "DATES_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT" | "ID_TAKEN" };

// Solo la unidad pedida (el equipo eligió una cabaña concreta en el calendario): las demás cuentan como ocupadas.
function onlyUnit(occ: Occupancy, units: number, typeId: string, unit: number, ci: string, co: string): Occupancy {
  const others = Array.from({ length: units }, (_, i) => i + 1).filter((u) => u !== unit);
  return { reservations: occ.reservations, blocks: [...occ.blocks, ...others.map((u) => ({ cabinTypeId: typeId, unit: u, from: ci, to: addDays(co, -1) }))] };
}

// Retiene una cabaña para una reserva nueva (del sitio o del panel) y la inserta pendiente de abono.
// La restricción de exclusión resuelve reservas simultáneas: si otra solicitud tomó la unidad, se recalcula y se intenta de nuevo.
export async function holdReservation(sb: Db, row: NewReservation, opts: { units: number; unit?: number | null; code?: string }): Promise<HoldResult> {
  const typeId = row.cabin_type_id;
  for (let attempt = 0; attempt < 4; attempt++) {
    const loaded = await loadOccupancy(sb, row.check_in, addDays(row.check_out, -1), typeId);
    const occ = opts.unit ? onlyUnit(loaded, opts.units, typeId, opts.unit, row.check_in, row.check_out) : loaded;
    const unit = findUnit(occ, opts.units, typeId, row.check_in, row.check_out);
    if (!unit) return { error: "DATES_UNAVAILABLE" };
    const { data, error } = await sb
      .from("reservations")
      .insert({ ...row, code: opts.code ?? newReservationCode(), unit })
      .select("*")
      .single();
    if (!error) return { row: data };
    if (error.code === "23P01") continue;
    if (error.code === "23505" && error.message.includes("idempotency")) return { error: "IDEMPOTENCY_CONFLICT" };
    // Código repetido: se genera otro, salvo si lo generó el navegador (operaciones sin conexión).
    if (error.code === "23505" && opts.code) return { error: "ID_TAKEN" };
    if (error.code === "23505") continue;
    throw error;
  }
  return { error: "DATES_UNAVAILABLE" };
}

// Reserva con varias cabañas: todas con las mismas fechas, insertadas en una sola sentencia (todas o ninguna).
// La primera es la principal: su código es el del grupo. `unit` de cada una: la pedida por el equipo o null (la primera libre).
export async function holdGroup(
  sb: Db,
  rows: (NewReservation & { unit: number | null })[],
  opts: { units: Record<string, number>; code?: string },
): Promise<{ rows: Tables<"reservations">[] } | { error: "DATES_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT" | "ID_TAKEN" }> {
  const { check_in: ci, check_out: co } = rows[0];
  for (let attempt = 0; attempt < 4; attempt++) {
    const occByType = new Map<string, Occupancy>();
    for (const typeId of new Set(rows.map((r) => r.cabin_type_id))) occByType.set(typeId, await loadOccupancy(sb, ci, addDays(co, -1), typeId));
    const units: number[] = [];
    for (const r of rows) {
      const typeId = r.cabin_type_id;
      const total = opts.units[typeId] ?? 0;
      const loaded = occByType.get(typeId)!;
      const occ = r.unit ? onlyUnit(loaded, total, typeId, r.unit, ci, co) : loaded;
      const unit = findUnit(occ, total, typeId, ci, co);
      if (!unit) return { error: "DATES_UNAVAILABLE" };
      units.push(unit);
      // La siguiente cabaña del mismo tipo no puede tomar esta.
      occByType.set(typeId, { ...loaded, blocks: [...loaded.blocks, { cabinTypeId: typeId, unit, from: ci, to: addDays(co, -1) }] });
    }
    const codes: string[] = [];
    while (codes.length < rows.length) {
      const c = codes.length === 0 && opts.code ? opts.code : newReservationCode();
      if (!codes.includes(c)) codes.push(c);
    }
    const { data, error } = await sb
      .from("reservations")
      .insert(rows.map((r, i) => ({ ...r, code: codes[i], unit: units[i], group_code: codes[0], ...(i > 0 && { idempotency_key: null }) })))
      .select("*");
    if (!error) return { rows: codes.map((c) => data.find((d) => d.code === c)!) };
    if (error.code === "23P01") continue;
    if (error.code === "23505" && error.message.includes("idempotency")) return { error: "IDEMPOTENCY_CONFLICT" };
    if (error.code === "23505" && opts.code) return { error: "ID_TAKEN" };
    if (error.code === "23505") continue;
    throw error;
  }
  return { error: "DATES_UNAVAILABLE" };
}

// Reserva que ya se hizo por otro canal (archivo importado o Booking): entra confirmada, finalizada o cancelada, sin
// pagos registrados; el equipo registra los pagos después. `r` ya viene validada (invalidImportRow).
export async function insertImported(
  sb: Db,
  r: ImportRow,
  ctx: { depositPct: number; arrival: string },
): Promise<{ code: string } | { error: "DATES_UNAVAILABLE" | "DUPLICATE" | "FAILED" }> {
  const nights = nightsBetween(r.checkIn, r.checkOut);
  const total = Math.round(r.total);
  const deposit = Math.round((total * ctx.depositPct) / 100);
  const quote: Quote = {
    base: total,
    extraGuests: 0,
    extraAmount: 0,
    total,
    deposit,
    balance: total - deposit,
    pricePerNight: Math.round(total / nights),
    extraPerNight: 0,
    nights,
  };
  const phone = String(r.phone ?? "")
    .replace(/\D/g, "")
    .slice(0, 15);
  const row: Omit<TablesInsert<"reservations">, "code"> = {
    source: "import",
    external_ref: r.ref.trim(),
    channel: String(r.channel ?? "")
      .trim()
      .slice(0, 40),
    commission: Math.round(r.commission),
    status: r.status,
    cabin_type_id: r.cabinTypeId,
    unit: r.unit,
    check_in: r.checkIn,
    check_out: r.checkOut,
    adults: 2,
    children: 0,
    pet: { hasPet: false, smallBreedConfirmed: false },
    decoration: { requested: false, occasion: "", notes: "" },
    estimated_arrival: ctx.arrival,
    guest_full_name: r.guest.trim(),
    guest_doc_type: "SD",
    guest_doc_number: importDocNumber(r),
    guest_email: String(r.email ?? "").trim(),
    guest_phone: phone ? `+${phone}` : "",
    guest_city: "",
    special_requests: String(r.notes ?? "")
      .trim()
      .slice(0, 500),
    consents: { policies: false, dataProcessing: false, marketing: false },
    quote,
    deposit_due_at: new Date().toISOString(),
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newReservationCode();
    const { error } = await sb.from("reservations").insert({ ...row, code });
    if (!error) return { code };
    if (error.code === "23P01") return { error: "DATES_UNAVAILABLE" };
    if (error.code === "23505" && error.message.includes("external_ref")) return { error: "DUPLICATE" };
    if (error.code !== "23505") return { error: "FAILED" };
  }
  return { error: "FAILED" };
}
