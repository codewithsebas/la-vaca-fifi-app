import "server-only";
import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { newReservationCode, poolFirst, type Occupancy } from "@/lib/booking";
import { addDays } from "@/lib/format";
import type { Tables, TablesInsert } from "@/lib/supabase/database.types";
import { claimUnit } from "./beds24-sync";
import { atMost, channelPools, syncSoon } from "./channels";
import { loadOccupancy, type Db } from "./db";

export type NewReservation = Omit<TablesInsert<"reservations">, "code" | "unit">;
export type HoldResult = { row: Tables<"reservations"> } | { error: "DATES_UNAVAILABLE" | "CHANNEL_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT" };

// Secreto del enlace de pago (/pagar/<token>): 144 bits aleatorios en base64url.
export const newPayToken = () => randomBytes(18).toString("base64url");

// Solo la unidad pedida (el equipo eligió una cabaña concreta en el calendario): las demás cuentan como ocupadas.
function onlyUnit(occ: Occupancy, units: number, typeId: string, unit: number, ci: string, co: string): Occupancy {
  const others = Array.from({ length: units }, (_, i) => i + 1).filter((u) => u !== unit);
  return { reservations: occ.reservations, blocks: [...occ.blocks, ...others.map((u) => ({ cabinTypeId: typeId, unit: u, from: ci, to: addDays(co, -1) }))] };
}

// Retiene una cabaña para una reserva nueva (del sitio o del panel) y la inserta pendiente de abono.
// Antes lee los calendarios de Booking del tipo si hace más de 90 s que no se leen (máximo 2,5 s de espera: si Booking
// tarda, se sigue con la última lectura y esa termina en segundo plano). Si la unidad se vende en Booking por Beds24,
// primero se retiene allá. La restricción de exclusión resuelve reservas simultáneas: si otra solicitud tomó la unidad,
// se recalcula y se intenta de nuevo.
export async function holdReservation(sb: Db, row: NewReservation, opts: { units: number; unit?: number | null }): Promise<HoldResult> {
  const typeId = row.cabin_type_id;
  const sync = syncSoon({ cabinTypeId: typeId, minAgeMs: 90_000 });
  after(() => sync);
  await atMost(sync, 2500);
  const pools = await channelPools(sb, typeId);

  for (let attempt = 0; attempt < 4; attempt++) {
    const loaded = await loadOccupancy(sb, row.check_in, addDays(row.check_out, -1), typeId);
    const occ = opts.unit ? onlyUnit(loaded, opts.units, typeId, opts.unit, row.check_in, row.check_out) : loaded;
    const code = newReservationCode();
    const claim = await claimUnit(occ, {
      units: opts.units,
      cabinTypeId: typeId,
      checkIn: row.check_in,
      checkOut: row.check_out,
      // Primero las que no se venden en Booking y luego las de los grupos con más cabañas libres: así cada tipo de
      // Booking conserva una libre el mayor tiempo posible.
      prefer: poolFirst(occ, opts.units, typeId, row.check_in, row.check_out, pools),
      source: "reservation",
      sourceId: code,
      label: `Web ${code}`,
      adults: row.adults,
      children: row.children ?? 0,
    });
    // Sin Beds24 no se vende una cabaña que también está en Booking: mejor pedir que se intente en un momento.
    if (!claim.hold) return { error: claim.channelDown ? "CHANNEL_UNAVAILABLE" : "DATES_UNAVAILABLE" };
    const { data, error } = await sb
      .from("reservations")
      .insert({ ...row, code, unit: claim.unit })
      .select("*")
      .single();
    if (!error) {
      await claim.hold.commit();
      return { row: data };
    }
    await claim.hold.release();
    if (error.code === "23P01") continue;
    if (error.code === "23505" && error.message.includes("idempotency")) return { error: "IDEMPOTENCY_CONFLICT" };
    if (error.code === "23505") continue; // código o enlace repetido: se genera otro
    throw error;
  }
  return { error: "DATES_UNAVAILABLE" };
}
