import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { ACTIVE_STATUSES, slugify } from "@/lib/booking";
import { todayISO } from "@/lib/format";
import { type Db, loadCabinTypes } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, route } from "@/lib/server/http";
import { PHOTO_BUCKET } from "@/lib/server/site";
import type { CabinInput } from "@/lib/types";

const money = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 50_000_000;

function clean(b: CabinInput | null) {
  if (!b) return { errors: { body: "Datos no válidos." } };
  const errors: Record<string, string> = {};
  const nombre = String(b.nombre ?? "").trim();
  const descripcion = String(b.descripcion ?? "").trim();
  const badge = String(b.badge ?? "").trim();
  const caracteristicas = [...new Set((Array.isArray(b.caracteristicas) ? b.caracteristicas : []).map((x) => String(x).trim()).filter(Boolean))];
  if (nombre.length < 3 || nombre.length > 60) errors.nombre = "El nombre debe tener entre 3 y 60 caracteres.";
  if (descripcion.length > 1200) errors.descripcion = "La descripción admite hasta 1200 caracteres.";
  if (badge.length > 30) errors.badge = "La etiqueta admite hasta 30 caracteres.";
  if (caracteristicas.length > 20 || caracteristicas.some((x) => x.length > 60)) errors.caracteristicas = "Hasta 20 características de máximo 60 caracteres.";
  if (!Number.isInteger(b.maxPersonas) || b.maxPersonas < 1 || b.maxPersonas > 12) errors.maxPersonas = "La capacidad debe estar entre 1 y 12 personas.";
  if (!Number.isInteger(b.units) || b.units < 0 || b.units > 20) errors.units = "El número de cabañas debe estar entre 0 y 20.";
  if (!money(b.precioPareja)) errors.precioPareja = "Escribe una tarifa válida.";
  if (!money(b.personaAdicional)) errors.personaAdicional = "Escribe una tarifa válida.";
  const row = {
    nombre,
    descripcion,
    badge,
    caracteristicas,
    max_personas: b.maxPersonas,
    units: b.units,
    precio_pareja: b.precioPareja,
    persona_adicional: b.personaAdicional,
    activa: !!b.activa,
  };
  return Object.keys(errors).length ? { errors } : { row };
}

const done = async (sb: Db) => {
  revalidatePath("/", "layout");
  return json((await loadCabinTypes(sb)).types);
};

// POST /api/admin/cabins → crea una cabaña (el id sale del nombre y no cambia después).
export const POST = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const b = await readJson<CabinInput>(req);
  const v = clean(b);
  if (v.errors) return fail(422, "VALIDATION_ERROR", { fields: v.errors });
  const { rows } = await loadCabinTypes(sb);
  const base = slugify(b!.id || v.row.nombre) || "cabana";
  let id = base;
  // "nueva" es la ruta del panel para crear una cabaña (/admin/cabanas/nueva): no puede ser un id.
  for (let i = 2; rows.some((r) => r.id === id) || id === "nueva"; i++) id = `${base}-${i}`.slice(0, 40);
  const sort = rows.reduce((m, r) => Math.max(m, r.sort), 0) + 1;
  await sb
    .from("cabin_types")
    .insert({ id, sort, ...v.row })
    .throwOnError();
  return done(sb);
});

// PUT /api/admin/cabins { id, ...datos } → edita. No deja reducir unidades que tienen reservas o bloqueos vigentes.
export const PUT = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const b = await readJson<CabinInput & { id: string }>(req);
  const v = clean(b);
  if (v.errors) return fail(422, "VALIDATION_ERROR", { fields: v.errors });
  const id = String(b!.id ?? "");
  const { data: current } = await sb.from("cabin_types").select("units").eq("id", id).maybeSingle().throwOnError();
  if (!current) return fail(404, "NOT_FOUND");
  if (v.row.units < current.units) {
    const today = todayISO();
    const [{ data: rs }, { data: bs }] = await Promise.all([
      sb
        .from("reservations")
        .select("code")
        .eq("cabin_type_id", id)
        .gt("unit", v.row.units)
        .in("status", ACTIVE_STATUSES)
        .gte("check_out", today)
        .limit(5)
        .throwOnError(),
      sb.from("blocks").select("id").eq("cabin_type_id", id).gt("unit", v.row.units).gte("to_date", today).limit(5).throwOnError(),
    ]);
    if (rs.length || bs.length)
      return fail(422, "VALIDATION_ERROR", {
        fields: {
          units: `Hay reservas o bloqueos vigentes en las unidades que quitarías${rs.length ? ` (${rs.map((r) => r.code).join(", ")})` : ""}. Reprográmalos primero.`,
        },
      });
  }
  await sb.from("cabin_types").update(v.row).eq("id", id).throwOnError();
  return done(sb);
});

// PATCH /api/admin/cabins { order: [ids] } → nuevo orden en el sitio y en el panel.
export const PATCH = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const b = await readJson<{ order: string[] }>(req);
  const { rows } = await loadCabinTypes(sb);
  const order = Array.isArray(b?.order) ? b.order.map(String) : [];
  if (order.length !== rows.length || rows.some((r) => !order.includes(r.id))) return fail(400, "INVALID_ORDER");
  for (const [i, id] of order.entries())
    await sb
      .from("cabin_types")
      .update({ sort: i + 1 })
      .eq("id", id)
      .throwOnError();
  return done(sb);
});

// DELETE /api/admin/cabins?id= → solo si nunca tuvo reservas (si las tuvo, se desactiva en su lugar).
export const DELETE = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const { data: current } = await sb.from("cabin_types").select("fotos").eq("id", id).maybeSingle().throwOnError();
  if (!current) return fail(404, "NOT_FOUND");
  const { count } = await sb.from("reservations").select("code", { count: "exact", head: true }).eq("cabin_type_id", id).throwOnError();
  if (count) return fail(409, "HAS_RESERVATIONS", { count });
  await sb.from("cabin_types").delete().eq("id", id).throwOnError();
  if (current.fotos.length) await sb.storage.from(PHOTO_BUCKET).remove(current.fotos);
  return done(sb);
});
