import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { ACTIVE_STATUSES, BLOCK_REASONS } from "@/lib/booking";
import { addDays, isISO, nightsBetween } from "@/lib/format";
import { type Hold, holdRoom } from "@/lib/server/beds24-sync";
import { type Db, isExclusionViolation, loadCabinTypes, toBlock } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, route } from "@/lib/server/http";
import type { BlockInput } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function allBlocks(sb: Db) {
  const { data } = await sb.from("blocks").select("*").order("from_date").throwOnError();
  return data.map(toBlock);
}

// Valida el cuerpo y devuelve las unidades afectadas (una o todas las del tipo).
async function validate(sb: Db, b: BlockInput | null) {
  if (!b || !isISO(b.from) || !isISO(b.to) || b.to < b.from || nightsBetween(b.from, b.to) > 366 || !BLOCK_REASONS.includes(b.reason))
    return { error: fail(400, "INVALID_BODY") };
  const notes = String(b.notes ?? "").trim();
  if (notes.length > 500 || (b.reason === "Otro" && !notes)) return { error: fail(400, "INVALID_NOTES") };
  const { units } = await loadCabinTypes(sb);
  const max = units[b.cabinTypeId];
  if (!max) return { error: fail(400, "INVALID_CABIN") };
  const list = b.unit === "all" ? Array.from({ length: max }, (_, i) => i + 1) : [b.unit];
  if (list.some((u) => !Number.isInteger(u) || u < 1 || u > max)) return { error: fail(400, "INVALID_UNIT") };
  return { units: list, notes };
}

// Reservas activas que impiden el bloqueo (hay que reprogramarlas o cancelarlas primero).
async function clashes(sb: Db, cabinTypeId: string, units: number[], from: string, to: string) {
  const { data } = await sb
    .from("reservations")
    .select("code")
    .eq("cabin_type_id", cabinTypeId)
    .in("unit", units)
    .in("status", ACTIVE_STATUSES)
    .lte("check_in", to)
    .gt("check_out", from)
    .throwOnError();
  return data.map((r) => r.code);
}

// Cierra esas noches en Booking (por Beds24) en las unidades que se venden allá, antes de guardar el bloqueo.
// error: Booking ya tiene una reserva en alguna (CHANNEL_CONFLICT) o Beds24 no respondió (CHANNEL_UNAVAILABLE).
async function holdBlocks(items: { id: string; cabinTypeId: string; unit: number; from: string; to: string; reason: string }[]) {
  const holds: Hold[] = [];
  const undo = () => Promise.all(holds.map((h) => h.release()));
  for (const x of items) {
    try {
      const h = await holdRoom({
        source: "block",
        sourceId: x.id,
        cabinTypeId: x.cabinTypeId,
        unit: x.unit,
        checkIn: x.from,
        checkOut: addDays(x.to, 1),
        label: `Bloqueo · ${x.reason}`,
      });
      if (!h) {
        await undo();
        return { error: fail(409, "CHANNEL_CONFLICT") };
      }
      holds.push(h);
    } catch (e) {
      console.error(e);
      await undo();
      return { error: fail(503, "CHANNEL_UNAVAILABLE") };
    }
  }
  return { commit: () => Promise.all(holds.map((h) => h.commit())), undo };
}

// POST /api/admin/blocks { cabinTypeId, unit | "all", from, to, reason, notes } → bloquea fechas (hasta `to` incluido).
export const POST = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const b = await readJson<BlockInput>(req);
  const v = await validate(sb, b);
  if (v.error) return v.error;
  const conflicts = await clashes(sb, b!.cabinTypeId, v.units, b!.from, b!.to);
  if (conflicts.length) return fail(409, "RESERVATION_CONFLICT", { conflicts });
  const rows = v.units.map((unit) => ({
    id: randomUUID(),
    cabin_type_id: b!.cabinTypeId,
    unit,
    from_date: b!.from,
    to_date: b!.to,
    reason: b!.reason,
    notes: v.notes,
  }));
  const held = await holdBlocks(
    rows.map((r) => ({ id: r.id, cabinTypeId: r.cabin_type_id, unit: r.unit, from: r.from_date, to: r.to_date, reason: r.reason })),
  );
  if (held.error) return held.error;
  try {
    await sb.from("blocks").insert(rows).throwOnError();
  } catch (e) {
    await held.undo();
    if (isExclusionViolation(e)) return fail(409, "BLOCK_OVERLAP");
    throw e;
  }
  await held.commit();
  return json(await allBlocks(sb));
});

// PUT /api/admin/blocks { id, cabinTypeId, unit, from, to, reason, notes } → edita un bloqueo.
export const PUT = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const b = await readJson<BlockInput & { id: string }>(req);
  if (!b || !UUID.test(String(b.id)) || b.unit === "all") return fail(400, "INVALID_BODY");
  const v = await validate(sb, b);
  if (v.error) return v.error;
  const conflicts = await clashes(sb, b.cabinTypeId, v.units, b.from, b.to);
  if (conflicts.length) return fail(409, "RESERVATION_CONFLICT", { conflicts });
  const held = await holdBlocks([{ id: b.id, cabinTypeId: b.cabinTypeId, unit: v.units[0], from: b.from, to: b.to, reason: b.reason }]);
  if (held.error) return held.error;
  try {
    const { data } = await sb
      .from("blocks")
      .update({ cabin_type_id: b.cabinTypeId, unit: v.units[0], from_date: b.from, to_date: b.to, reason: b.reason, notes: v.notes })
      .eq("id", b.id)
      .select("id")
      .throwOnError();
    if (!data.length) {
      await held.undo();
      return fail(404, "NOT_FOUND");
    }
  } catch (e) {
    await held.undo();
    if (isExclusionViolation(e)) return fail(409, "BLOCK_OVERLAP");
    throw e;
  }
  await held.commit();
  return json(await allBlocks(sb));
});

// DELETE /api/admin/blocks?id=<uuid>
export const DELETE = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return fail(400, "INVALID_ID");
  await sb.from("blocks").delete().eq("id", id).throwOnError();
  return json(await allBlocks(sb));
});
