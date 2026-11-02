import type { NextRequest } from "next/server";
import { fail, json, readJson, requireStaff, route } from "@/lib/server/http";
import type { PanelUser, ProfileInput } from "@/lib/types";

// PUT /api/admin/profile { name?, password? } → el perfil propio: nombre y contraseña nueva. Devuelve { me }.
export const PUT = route(async (req: NextRequest) => {
  const { sb, me, error } = await requireStaff();
  if (error) return error;
  const b = await readJson<ProfileInput>(req);
  if (!b || (b.name === undefined && b.password === undefined)) return fail(400, "INVALID_BODY");
  const fields: Record<string, string> = {};
  const name = b.name === undefined ? undefined : String(b.name).trim();
  if (name !== undefined && (name.length < 2 || name.length > 80)) fields.name = "Escribe tu nombre (2 a 80 caracteres).";
  if (b.password !== undefined && String(b.password).length < 8) fields.password = "Mínimo 8 caracteres.";
  if (Object.keys(fields).length) return fail(422, "VALIDATION_ERROR", { fields });
  const { error: upErr } = await sb.auth.updateUser({
    ...(name !== undefined && { data: { full_name: name } }),
    ...(b.password !== undefined && { password: b.password }),
  });
  if (upErr) {
    if (/password/i.test(upErr.message))
      return fail(422, "VALIDATION_ERROR", { fields: { password: "La contraseña no cumple los requisitos o es igual a la anterior." } });
    throw upErr;
  }
  // La sesión se renueva para que el nombre nuevo llegue también en el token.
  await sb.auth.refreshSession();
  const updated: PanelUser = { ...me, ...(name !== undefined && { name }) };
  return json({ me: updated });
});
