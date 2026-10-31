import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import type { Db } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, route } from "@/lib/server/http";
import { isServiceIcon } from "@/lib/service-icons";
import { SERVICE_LIMITS, type SiteService } from "@/lib/site";

// Servicios de la sección «Servicios incluidos». Cada cambio se publica de inmediato (revalida el sitio) y responde
// con la lista completa en orden, también los ocultos.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Input = { id?: unknown; title?: unknown; description?: unknown; icon?: unknown; note?: unknown; visible?: unknown; order?: unknown };
type Fields = Omit<SiteService, "id">;

const text = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

function parse(b: Input): { fields: Fields } | { errors: Record<string, string> } {
  const fields: Fields = {
    title: text(b.title),
    description: text(b.description),
    icon: String(b.icon ?? ""),
    note: text(b.note),
    visible: b.visible !== false,
  };
  const errors: Record<string, string> = {};
  if (!fields.title || fields.title.length > SERVICE_LIMITS.title) errors.title = `Escribe el nombre del servicio (máximo ${SERVICE_LIMITS.title} caracteres).`;
  if (fields.description.length > SERVICE_LIMITS.description) errors.description = `La descripción admite hasta ${SERVICE_LIMITS.description} caracteres.`;
  if (fields.note.length > SERVICE_LIMITS.note) errors.note = `La etiqueta admite hasta ${SERVICE_LIMITS.note} caracteres.`;
  if (!isServiceIcon(fields.icon)) errors.icon = "Elige un ícono de la lista.";
  return Object.keys(errors).length ? { errors } : { fields };
}

async function list(sb: Db): Promise<SiteService[]> {
  const { data } = await sb.from("site_services").select("id, title, description, icon, note, visible").order("sort").order("created_at").throwOnError();
  return data;
}

async function done(sb: Db) {
  revalidatePath("/", "layout");
  return json(await list(sb));
}

// POST /api/admin/services { title, description, icon, note, visible } → crea al final de la lista.
export const POST = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const b = await readJson<Input>(req);
  if (!b) return fail(400, "INVALID_BODY");
  const p = parse(b);
  if ("errors" in p) return fail(422, "VALIDATION_ERROR", { fields: p.errors });
  const { data: last } = await sb.from("site_services").select("sort").order("sort", { ascending: false }).limit(SERVICE_LIMITS.max).throwOnError();
  if (last.length >= SERVICE_LIMITS.max) return fail(422, "VALIDATION_ERROR", { fields: { title: `Puedes tener hasta ${SERVICE_LIMITS.max} servicios.` } });
  await sb
    .from("site_services")
    .insert({ ...p.fields, sort: (last[0]?.sort ?? 0) + 1 })
    .throwOnError();
  return done(sb);
});

// PUT /api/admin/services { id, title, description, icon, note, visible } → edita (también mostrar u ocultar).
export const PUT = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const b = await readJson<Input>(req);
  if (!b || typeof b.id !== "string" || !UUID.test(b.id)) return fail(400, "INVALID_BODY");
  const p = parse(b);
  if ("errors" in p) return fail(422, "VALIDATION_ERROR", { fields: p.errors });
  const { data } = await sb.from("site_services").update(p.fields).eq("id", b.id).select("id").throwOnError();
  if (!data.length) return fail(404, "NOT_FOUND");
  return done(sb);
});

// PATCH /api/admin/services { order: [id, …] } → nuevo orden.
export const PATCH = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const b = await readJson<Input>(req);
  const order = Array.isArray(b?.order) ? b.order.filter((id): id is string => typeof id === "string" && UUID.test(id)) : [];
  if (!order.length || order.length > SERVICE_LIMITS.max) return fail(400, "INVALID_ORDER");
  await Promise.all(
    order.map((id, i) =>
      sb
        .from("site_services")
        .update({ sort: i + 1 })
        .eq("id", id)
        .throwOnError(),
    ),
  );
  return done(sb);
});

// DELETE /api/admin/services?id=… → elimina.
export const DELETE = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !UUID.test(id)) return fail(400, "INVALID_ID");
  await sb.from("site_services").delete().eq("id", id).throwOnError();
  return done(sb);
});
