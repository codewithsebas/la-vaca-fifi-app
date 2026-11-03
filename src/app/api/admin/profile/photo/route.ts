import type { NextRequest } from "next/server";
import { fail, json, requireStaff, syncRoute } from "@/lib/server/http";
import { PHOTO_BUCKET, photoUrl } from "@/lib/server/site";
import type { Db } from "@/lib/server/db";
import { createServiceClient } from "@/lib/supabase/server";
import type { PanelUser } from "@/lib/types";

// Foto de perfil propia: el archivo va al bucket público de imágenes, en la carpeta de la cuenta (avatars/<id>/), y su
// ruta en user_metadata.avatar_path. Se sube con la clave de servicio porque el bucket solo deja escribir a
// administradores y recepción también tiene foto; la ruta la arma el servidor con el id de la sesión, nunca el navegador.

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 5 * 1024 * 1024;

// Guarda la ruta nueva (o ninguna) en la cuenta, renueva la sesión para que llegue en el token y borra la anterior.
async function setAvatar(sb: Db, uid: string, path: string | null) {
  const { data } = await sb.auth.getUser();
  const previous = (data.user?.user_metadata as { avatar_path?: string | null } | undefined)?.avatar_path;
  const { error } = await sb.auth.updateUser({ data: { avatar_path: path } });
  if (error) throw error;
  await sb.auth.refreshSession();
  if (previous && previous !== path && previous.startsWith(`avatars/${uid}/`)) await createServiceClient().storage.from(PHOTO_BUCKET).remove([previous]);
}

// POST /api/admin/profile/photo (multipart: file) → sube la foto (ya recortada en el navegador). Devuelve { me }.
export const POST = syncRoute(async (req: NextRequest) => {
  const { sb, uid, me, error } = await requireStaff();
  if (error) return error;
  if (!uid) return fail(401, "UNAUTHORIZED");
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return fail(400, "INVALID_BODY");
  const ext = TYPES[file.type];
  if (!ext) return fail(415, "UNSUPPORTED_TYPE");
  if (file.size > MAX_BYTES) return fail(413, "TOO_LARGE");

  // Nombre único por subida: la URL cambia y ningún navegador ni CDN muestra la foto anterior.
  const path = `avatars/${uid}/${Date.now()}.${ext}`;
  const { error: upErr } = await createServiceClient()
    .storage.from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (upErr) throw upErr;
  await setAvatar(sb, uid, path);
  return json({ me: { ...me, photo: photoUrl(path) } satisfies PanelUser });
});

// DELETE /api/admin/profile/photo → quita la foto (vuelven las iniciales). Devuelve { me }.
export const DELETE = syncRoute(async () => {
  const { sb, uid, me, error } = await requireStaff();
  if (error) return error;
  if (!uid) return fail(401, "UNAUTHORIZED");
  await setAvatar(sb, uid, null);
  return json({ me: { ...me, photo: null } satisfies PanelUser });
});
