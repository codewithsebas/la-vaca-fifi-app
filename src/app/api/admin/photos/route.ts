import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { fail, json, requireAdmin, route } from "@/lib/server/http";
import { loadSiteContent, PHOTO_BUCKET } from "@/lib/server/site";
import { PHOTO_SLOTS } from "@/lib/site";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 5 * 1024 * 1024;

const isSlot = (slot: unknown): slot is string => typeof slot === "string" && PHOTO_SLOTS.some((s) => s.id === slot);

// POST /api/admin/photos (multipart: slot, file) → sube la foto a Storage y la asigna al hueco.
export const POST = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin("content");
  if (error) return error;
  const form = await req.formData().catch(() => null);
  const slot = form?.get("slot");
  const file = form?.get("file");
  if (!isSlot(slot) || !(file instanceof File)) return fail(400, "INVALID_BODY");
  const ext = TYPES[file.type];
  if (!ext) return fail(415, "UNSUPPORTED_TYPE");
  if (file.size > MAX_BYTES) return fail(413, "TOO_LARGE");

  // Nombre único por subida: la URL cambia y ningún navegador ni CDN muestra la foto anterior.
  const path = `${slot}/${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (upErr) throw upErr;

  const { data: previous } = await sb.from("site_photos").select("path").eq("slot", slot).maybeSingle().throwOnError();
  await sb.from("site_photos").upsert({ slot, path }).throwOnError();
  if (previous && previous.path !== path) await sb.storage.from(PHOTO_BUCKET).remove([previous.path]);

  revalidatePath("/", "layout");
  return json((await loadSiteContent(sb)).photos);
});

// DELETE /api/admin/photos?slot=<hueco> → quita la foto (vuelve el marcador).
export const DELETE = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin("content");
  if (error) return error;
  const slot = req.nextUrl.searchParams.get("slot");
  if (!isSlot(slot)) return fail(400, "INVALID_SLOT");
  const { data: previous } = await sb.from("site_photos").select("path").eq("slot", slot).maybeSingle().throwOnError();
  if (previous) {
    await sb.from("site_photos").delete().eq("slot", slot).throwOnError();
    await sb.storage.from(PHOTO_BUCKET).remove([previous.path]);
  }
  revalidatePath("/", "layout");
  return json((await loadSiteContent(sb)).photos);
});
