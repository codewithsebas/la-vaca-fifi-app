import "server-only";
import { findUnit, newReservationCode, type Occupancy } from "@/lib/booking";
import { addDays } from "@/lib/format";
import type { Tables, TablesInsert } from "@/lib/supabase/database.types";
import { loadOccupancy, type Db } from "@/lib/server/db";

type NewReservation = Omit<TablesInsert<"reservations">, "code" | "unit">;
type HoldResult = { row: Tables<"reservations"> } | { error: "DATES_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT" };

// Solo la unidad pedida (el equipo eligió una cabaña concreta en el calendario): las demás cuentan como ocupadas.
function onlyUnit(occ: Occupancy, units: number, typeId: string, unit: number, ci: string, co: string): Occupancy {
  const others = Array.from({ length: units }, (_, i) => i + 1).filter((u) => u !== unit);
  return { reservations: occ.reservations, blocks: [...occ.blocks, ...others.map((u) => ({ cabinTypeId: typeId, unit: u, from: ci, to: addDays(co, -1) }))] };
}

// Retiene una cabaña para una reserva nueva (del sitio o del panel) y la inserta pendiente de abono.
// La restricción de exclusión resuelve reservas simultáneas: si otra solicitud tomó la unidad, se recalcula y se intenta de nuevo.
export async function holdReservation(sb: Db, row: NewReservation, opts: { units: number; unit?: number | null }): Promise<HoldResult> {
  const typeId = row.cabin_type_id;
  for (let attempt = 0; attempt < 4; attempt++) {
    const loaded = await loadOccupancy(sb, row.check_in, addDays(row.check_out, -1), typeId);
    const occ = opts.unit ? onlyUnit(loaded, opts.units, typeId, opts.unit, row.check_in, row.check_out) : loaded;
    const unit = findUnit(occ, opts.units, typeId, row.check_in, row.check_out);
    if (!unit) return { error: "DATES_UNAVAILABLE" };
    const { data, error } = await sb
      .from("reservations")
      .insert({ ...row, code: newReservationCode(), unit })
      .select("*")
      .single();
    if (!error) return { row: data };
    if (error.code === "23P01") continue;
    if (error.code === "23505" && error.message.includes("idempotency")) return { error: "IDEMPOTENCY_CONFLICT" };
    if (error.code === "23505") continue; // código repetido: se genera otro
    throw error;
  }
  return { error: "DATES_UNAVAILABLE" };
}
