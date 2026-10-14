import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { isISO, nightsBetween } from "@/lib/format";
import { type Db, isExclusionViolation, loadSeasons } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, route } from "@/lib/server/http";
import type { SeasonInput } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 50_000_000;

async function clean(sb: Db, b: SeasonInput | null) {
  if (!b) return { errors: { body: "Datos no válidos." } };
  const errors: Record<string, string> = {};
  const nombre = String(b.nombre ?? "").trim();
  if (!nombre || nombre.length > 80) errors.nombre = "Escribe un nombre (máximo 80 caracteres).";
  if (!isISO(b.from) || !isISO(b.to) || b.to < b.from) errors.dates = "Elige un rango de fechas válido.";
  else if (nightsBetween(b.from, b.to) > 366) errors.dates = "Una temporada puede durar máximo un año.";
  if (!money(b.precioPareja)) errors.precioPareja = "Escribe una tarifa válida.";
  if (!money(b.personaAdicional)) errors.personaAdicional = "Escribe una tarifa válida.";
  const { data: cabin } = await sb.from("cabin_types").select("id").eq("id", String(b.cabinTypeId ?? "")).maybeSingle().throwOnError();
  if (!cabin) errors.cabinTypeId = "Elige un domo.";
  if (Object.keys(errors).length) return { errors };
  return { row: { cabin_type_id: b.cabinTypeId, nombre, from_date: b.from, to_date: b.to, precio_pareja: b.precioPareja, persona_adicional: b.personaAdicional, activa: !!b.activa } };
}

// Nombre de la temporada activa que se cruza, para explicar el rechazo.
async function overlapping(sb: Db, b: SeasonInput) {
  let q = sb.from("rate_seasons").select("nombre").eq("cabin_type_id", b.cabinTypeId).eq("activa", true).lte("from_date", b.to).gte("to_date", b.from).limit(1);
  if (b.id) q = q.neq("id", b.id);
  const { data } = await q.throwOnError();
  return data[0]?.nombre ?? "otra temporada";
}

const done = async (sb: Db) => {
  revalidatePath("/", "layout");
  return json(await loadSeasons(sb));
};

async function save(req: NextRequest, mode: "create" | "update") {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const b = await readJson<SeasonInput>(req);
  if (mode === "update" && !UUID.test(String(b?.id))) return fail(400, "INVALID_ID");
  const v = await clean(sb, b);
  if (v.errors) return fail(422, "VALIDATION_ERROR", { fields: v.errors });
  try {
    if (mode === "create") await sb.from("rate_seasons").insert(v.row).throwOnError();
    else {
      const { data } = await sb.from("rate_seasons").update(v.row).eq("id", b!.id!).select("id").throwOnError();
      if (!data.length) return fail(404, "NOT_FOUND");
    }
  } catch (e) {
    if (isExclusionViolation(e)) return fail(422, "VALIDATION_ERROR", { fields: { dates: `Se cruza con la temporada activa "${await overlapping(sb, b!)}" del mismo domo.` } });
    throw e;
  }
  return done(sb);
}

// POST /api/admin/seasons → crea una temporada; PUT → la edita (incluye activarla o pausarla).
export const POST = route((req: NextRequest) => save(req, "create"));
export const PUT = route((req: NextRequest) => save(req, "update"));

// DELETE /api/admin/seasons?id= → elimina. Las reservas ya hechas conservan su cotización.
export const DELETE = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return fail(400, "INVALID_ID");
  await sb.from("rate_seasons").delete().eq("id", id).throwOnError();
  return done(sb);
});
