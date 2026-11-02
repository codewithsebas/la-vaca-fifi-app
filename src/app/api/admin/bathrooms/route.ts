import type { NextRequest } from "next/server";
import { can } from "@/lib/permissions";
import { type Db, loadBathrooms, loadCabinTypes } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, requireStaff, route } from "@/lib/server/http";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";
import type { BathroomInput, BathroomStatus } from "@/lib/types";

const STATUSES: BathroomStatus[] = ["available", "unavailable", "maintenance"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Columnas a guardar a partir del cuerpo; solo las que vienen (al editar puede cambiar una sola cosa, como el estado).
async function columns(sb: Db, b: BathroomInput) {
  const row: TablesUpdate<"bathrooms"> = {};
  const fields: Record<string, string> = {};
  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (!name || name.length > 60) fields.name = "Escribe un nombre de hasta 60 caracteres.";
    row.name = name;
  }
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) fields.status = "Estado no válido.";
    row.status = b.status;
    row.status_updated_at = new Date().toISOString();
  }
  if (b.notes !== undefined) {
    const notes = String(b.notes).trim();
    if (notes.length > 300) fields.notes = "Máximo 300 caracteres.";
    row.notes = notes;
  }
  if (b.cabinTypeId !== undefined || b.unit !== undefined) {
    const type = b.cabinTypeId || null;
    const unit = type && b.unit ? Number(b.unit) : null;
    if (type) {
      const { units } = await loadCabinTypes(sb);
      if (!(type in units)) fields.cabinTypeId = "Esa cabaña no existe.";
      else if (unit !== null && (!Number.isInteger(unit) || unit < 1 || unit > (units[type] ?? 0))) fields.unit = "Esa unidad no existe.";
    }
    row.cabin_type_id = type;
    row.unit = unit;
  }
  return { row, fields };
}

const answer = async (sb: Db) => json(await loadBathrooms(sb));

// POST /api/admin/bathrooms { name, status?, cabinTypeId?, unit?, notes? } → crea un baño. Solo administradores.
export const POST = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin("bathrooms");
  if (error) return error;
  const b = await readJson<BathroomInput>(req);
  if (!b || b.name === undefined) return fail(400, "INVALID_BODY");
  const { row, fields } = await columns(sb, { status: "available", ...b });
  if (Object.keys(fields).length) return fail(422, "VALIDATION_ERROR", { fields });
  await sb
    .from("bathrooms")
    .insert(row as TablesInsert<"bathrooms">)
    .throwOnError();
  return answer(sb);
});

// PUT /api/admin/bathrooms { id, ...cambios } → estado y notas los cambia todo el equipo; nombre y cabaña, solo
// administradores.
export const PUT = route(async (req: NextRequest) => {
  const { sb, me, error } = await requireStaff();
  if (error) return error;
  const b = await readJson<BathroomInput>(req);
  if (!b || !UUID.test(String(b.id))) return fail(400, "INVALID_BODY");
  if ((b.name !== undefined || b.cabinTypeId !== undefined || b.unit !== undefined) && !can(me.role, "bathrooms")) return fail(403, "FORBIDDEN");
  const { row, fields } = await columns(sb, b);
  if (Object.keys(fields).length) return fail(422, "VALIDATION_ERROR", { fields });
  if (!Object.keys(row).length) return fail(400, "INVALID_BODY");
  const { data } = await sb.from("bathrooms").update(row).eq("id", b.id!).select("id").throwOnError();
  if (!data.length) return fail(404, "NOT_FOUND");
  return answer(sb);
});

// DELETE /api/admin/bathrooms?id=<uuid> → borra el baño y sus bloqueos. Solo administradores.
export const DELETE = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin("delete");
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return fail(400, "INVALID_ID");
  await sb.from("bathrooms").delete().eq("id", id).throwOnError();
  return answer(sb);
});
