import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { ACTIVE_STATUSES, BLOCK_REASONS } from "@/lib/booking";
import { isISO, nightsBetween } from "@/lib/format";
import { type Db, isExclusionViolation, loadCabinTypes, toBlock } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, requireStaff, route } from "@/lib/server/http";
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

// POST /api/admin/blocks { cabinTypeId, unit | "all", from, to, reason, notes } → bloquea fechas (hasta `to` incluido).
export const POST = route(async (req: NextRequest) => {
  const { sb, error } = await requireStaff();
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
  try {
    await sb.from("blocks").insert(rows).throwOnError();
  } catch (e) {
    if (isExclusionViolation(e)) return fail(409, "BLOCK_OVERLAP");
    throw e;
  }
  return json(await allBlocks(sb));
});

// PUT /api/admin/blocks { id, cabinTypeId, unit, from, to, reason, notes } → edita un bloqueo.
export const PUT = route(async (req: NextRequest) => {
  const { sb, error } = await requireStaff();
  if (error) return error;
  const b = await readJson<BlockInput & { id: string }>(req);
  if (!b || !UUID.test(String(b.id)) || b.unit === "all") return fail(400, "INVALID_BODY");
  const v = await validate(sb, b);
  if (v.error) return v.error;
  const conflicts = await clashes(sb, b.cabinTypeId, v.units, b.from, b.to);
  if (conflicts.length) return fail(409, "RESERVATION_CONFLICT", { conflicts });
  try {
    const { data } = await sb
      .from("blocks")
      .update({ cabin_type_id: b.cabinTypeId, unit: v.units[0], from_date: b.from, to_date: b.to, reason: b.reason, notes: v.notes })
      .eq("id", b.id)
      .select("id")
      .throwOnError();
    if (!data.length) return fail(404, "NOT_FOUND");
  } catch (e) {
    if (isExclusionViolation(e)) return fail(409, "BLOCK_OVERLAP");
    throw e;
  }
  return json(await allBlocks(sb));
});

// DELETE /api/admin/blocks?id=<uuid>
export const DELETE = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin("delete");
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return fail(400, "INVALID_ID");
  await sb.from("blocks").delete().eq("id", id).throwOnError();
  return json(await allBlocks(sb));
});
