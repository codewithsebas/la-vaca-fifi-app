import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { type Db, loadCabinTypes } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, route } from "@/lib/server/http";
import { PHOTO_BUCKET, photoPath } from "@/lib/server/site";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 12;

const done = async (sb: Db) => {
  revalidatePath("/", "layout");
  return json((await loadCabinTypes(sb)).types);
};

async function cabinPhotos(sb: Db, id: string) {
  const { data } = await sb.from("cabin_types").select("fotos").eq("id", id).maybeSingle().throwOnError();
  return data?.fotos ?? null;
}

// POST /api/admin/cabins/photos (multipart: cabinId, file) → agrega una foto a la galería de la cabaña.
export const POST = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const form = await req.formData().catch(() => null);
  const id = String(form?.get("cabinId") ?? "");
  const file = form?.get("file");
  if (!(file instanceof File)) return fail(400, "INVALID_BODY");
  const ext = TYPES[file.type];
  if (!ext) return fail(415, "UNSUPPORTED_TYPE");
  if (file.size > MAX_BYTES) return fail(413, "TOO_LARGE");
  const fotos = await cabinPhotos(sb, id);
  if (!fotos) return fail(404, "NOT_FOUND");
  if (fotos.length >= MAX_PHOTOS) return fail(422, "TOO_MANY_PHOTOS");

  const path = `cabins/${id}/${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (upErr) throw upErr;
  await sb.from("cabin_types").update({ fotos: [...fotos, path] }).eq("id", id).throwOnError();
  return done(sb);
});

// PUT /api/admin/cabins/photos { cabinId, fotos: [urls] } → reordena (la primera es la portada).
export const PUT = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const b = await readJson<{ cabinId: string; fotos: string[] }>(req);
  const fotos = b && (await cabinPhotos(sb, String(b.cabinId)));
  if (!b || !fotos || !Array.isArray(b.fotos)) return fail(400, "INVALID_BODY");
  const next = b.fotos.map((u) => photoPath(String(u)));
  if (next.length !== fotos.length || next.some((p) => !p || !fotos.includes(p))) return fail(400, "INVALID_ORDER");
  await sb.from("cabin_types").update({ fotos: next as string[] }).eq("id", b.cabinId).throwOnError();
  return done(sb);
});

// DELETE /api/admin/cabins/photos?cabinId=&url= → quita la foto de la galería y de Storage.
export const DELETE = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const id = req.nextUrl.searchParams.get("cabinId") ?? "";
  const path = photoPath(req.nextUrl.searchParams.get("url") ?? "");
  const fotos = await cabinPhotos(sb, id);
  if (!fotos) return fail(404, "NOT_FOUND");
  if (!path || !fotos.includes(path)) return fail(400, "INVALID_PHOTO");
  await sb.from("cabin_types").update({ fotos: fotos.filter((p) => p !== path) }).eq("id", id).throwOnError();
  await sb.storage.from(PHOTO_BUCKET).remove([path]);
  return done(sb);
});
