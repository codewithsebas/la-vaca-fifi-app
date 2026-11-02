import type { NextRequest } from "next/server";
import { BATHROOM_BLOCK_REASONS } from "@/lib/booking";
import { isISO, nightsBetween } from "@/lib/format";
import { type Db, isExclusionViolation, loadBathrooms } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, requireStaff, route } from "@/lib/server/http";
import type { BathroomBlockInput } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validate(b: BathroomBlockInput | null) {
  if (!b || !UUID.test(String(b.bathroomId)) || !isISO(b.from) || !isISO(b.to) || b.to < b.from || nightsBetween(b.from, b.to) > 366)
    return { error: fail(400, "INVALID_BODY") };
  if (!BATHROOM_BLOCK_REASONS.includes(b.reason)) return { error: fail(400, "INVALID_REASON") };
  const notes = String(b.notes ?? "").trim();
  if (notes.length > 500 || (b.reason === "Otro" && !notes)) return { error: fail(400, "INVALID_NOTES") };
  return { row: { bathroom_id: b.bathroomId, from_date: b.from, to_date: b.to, reason: b.reason, notes } };
}

const answer = async (sb: Db) => json(await loadBathrooms(sb));

// POST /api/admin/bathroom-blocks { bathroomId, from, to, reason, notes } → bloquea un baño (hasta `to` incluido).
export const POST = route(async (req: NextRequest) => {
  const { sb, error } = await requireStaff();
  if (error) return error;
  const v = validate(await readJson<BathroomBlockInput>(req));
  if (v.error) return v.error;
  try {
    await sb.from("bathroom_blocks").insert(v.row).throwOnError();
  } catch (e) {
    if (isExclusionViolation(e)) return fail(409, "BLOCK_OVERLAP");
    throw e;
  }
  return answer(sb);
});

// PUT /api/admin/bathroom-blocks { id, bathroomId, from, to, reason, notes } → edita un bloqueo.
export const PUT = route(async (req: NextRequest) => {
  const { sb, error } = await requireStaff();
  if (error) return error;
  const b = await readJson<BathroomBlockInput>(req);
  if (!b || !UUID.test(String(b.id))) return fail(400, "INVALID_BODY");
  const v = validate(b);
  if (v.error) return v.error;
  try {
    const { data } = await sb.from("bathroom_blocks").update(v.row).eq("id", b.id!).select("id").throwOnError();
    if (!data.length) return fail(404, "NOT_FOUND");
  } catch (e) {
    if (isExclusionViolation(e)) return fail(409, "BLOCK_OVERLAP");
    throw e;
  }
  return answer(sb);
});

// DELETE /api/admin/bathroom-blocks?id=<uuid> → solo administradores.
export const DELETE = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin("delete");
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return fail(400, "INVALID_ID");
  await sb.from("bathroom_blocks").delete().eq("id", id).throwOnError();
  return answer(sb);
});
