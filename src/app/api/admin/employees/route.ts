import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { EMAIL_RE } from "@/lib/booking";
import { isRole } from "@/lib/permissions";
import { fail, json, readJson, requireAdmin, route } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/server";
import type { Employee, EmployeeInput } from "@/lib/types";

// Empleados del panel: cuentas de Supabase Auth con rol en app_metadata («admin» o «recepcion»). Solo administradores.
// Se crean con una contraseña inicial que el administrador le entrega; cada quien la cambia en «Mi perfil».
// Desactivar no borra la cuenta: la bloquea hasta reactivarla.

const OFF = "876000h"; // ~100 años: «desactivada» hasta que un administrador la reactive

function toEmployee(u: User): Employee | null {
  const role = (u.app_metadata as { role?: string }).role;
  if (!isRole(role)) return null;
  return {
    id: u.id,
    email: u.email ?? "",
    name: String((u.user_metadata as { full_name?: string }).full_name ?? "").trim(),
    role,
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? null,
    active: !u.banned_until || Date.parse(u.banned_until) < Date.now(),
  };
}

async function listEmployees() {
  const admin = createServiceClient().auth.admin;
  const out: Employee[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    data.users.forEach((u) => {
      const e = toEmployee(u);
      if (e) out.push(e);
    });
    if (data.users.length < 200) break;
  }
  return out.sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : a.role === "admin" ? -1 : 1));
}

const activeAdmins = (list: Employee[]) => list.filter((e) => e.role === "admin" && e.active);

// GET /api/admin/employees → empleados del panel.
export const GET = route(async () => {
  const { error } = await requireAdmin("employees");
  if (error) return error;
  return json(await listEmployees());
});

// POST /api/admin/employees { email, name, role, password } → crea la cuenta, ya confirmada.
export const POST = route(async (req: NextRequest) => {
  const { error } = await requireAdmin("employees");
  if (error) return error;
  const b = await readJson<EmployeeInput>(req);
  const email = String(b?.email ?? "")
    .trim()
    .toLowerCase();
  const name = String(b?.name ?? "").trim();
  const fields: Record<string, string> = {};
  if (!EMAIL_RE.test(email) || email.length > 160) fields.email = "Escribe un correo válido.";
  if (name.length < 2 || name.length > 80) fields.name = "Escribe el nombre (2 a 80 caracteres).";
  if (!isRole(b?.role)) fields.role = "Elige el rol.";
  if (String(b?.password ?? "").length < 8) fields.password = "Mínimo 8 caracteres.";
  if (Object.keys(fields).length) return fail(422, "VALIDATION_ERROR", { fields });
  const { error: createErr } = await createServiceClient().auth.admin.createUser({
    email,
    password: b!.password!,
    email_confirm: true,
    app_metadata: { role: b!.role },
    user_metadata: { full_name: name },
  });
  if (createErr) {
    if (/already|registered|exists/i.test(createErr.message))
      return fail(422, "VALIDATION_ERROR", { fields: { email: "Ya existe una cuenta con ese correo." } });
    if (/password/i.test(createErr.message)) return fail(422, "VALIDATION_ERROR", { fields: { password: "La contraseña no cumple los requisitos." } });
    throw createErr;
  }
  return json(await listEmployees(), 201);
});

// PUT /api/admin/employees { id, name?, role?, active?, password? } → edita. Nadie se quita su propio acceso de
// administrador ni se desactiva, y siempre queda al menos un administrador activo.
export const PUT = route(async (req: NextRequest) => {
  const { me, error } = await requireAdmin("employees");
  if (error) return error;
  const b = await readJson<EmployeeInput>(req);
  if (!b?.id) return fail(400, "INVALID_BODY");
  const list = await listEmployees();
  const target = list.find((e) => e.id === b.id);
  if (!target) return fail(404, "NOT_FOUND");
  const fields: Record<string, string> = {};
  if (b.name !== undefined && (String(b.name).trim().length < 2 || String(b.name).length > 80)) fields.name = "Escribe el nombre (2 a 80 caracteres).";
  if (b.role !== undefined && !isRole(b.role)) fields.role = "Elige el rol.";
  if (b.password !== undefined && String(b.password).length < 8) fields.password = "Mínimo 8 caracteres.";
  if (Object.keys(fields).length) return fail(422, "VALIDATION_ERROR", { fields });
  const losesAdmin = target.role === "admin" && target.active && ((b.role !== undefined && b.role !== "admin") || b.active === false);
  if (target.id === me.id && (losesAdmin || b.active === false)) return fail(409, "SELF_LOCKOUT");
  if (losesAdmin && activeAdmins(list).length <= 1) return fail(409, "LAST_ADMIN");
  const update: Parameters<ReturnType<typeof createServiceClient>["auth"]["admin"]["updateUserById"]>[1] = {};
  if (b.name !== undefined) update.user_metadata = { full_name: String(b.name).trim() };
  if (b.role !== undefined) update.app_metadata = { role: b.role };
  if (b.active !== undefined) update.ban_duration = b.active ? "none" : OFF;
  if (b.password !== undefined) update.password = b.password;
  const { error: upErr } = await createServiceClient().auth.admin.updateUserById(target.id, update);
  if (upErr) throw upErr;
  return json(await listEmployees());
});

// DELETE /api/admin/employees?id= → borra la cuenta (no la propia ni la del último administrador activo).
export const DELETE = route(async (req: NextRequest) => {
  const { me, error } = await requireAdmin("employees");
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const list = await listEmployees();
  const target = list.find((e) => e.id === id);
  if (!target) return fail(404, "NOT_FOUND");
  if (target.id === me.id) return fail(409, "SELF_LOCKOUT");
  if (target.role === "admin" && target.active && activeAdmins(list).length <= 1) return fail(409, "LAST_ADMIN");
  const { error: delErr } = await createServiceClient().auth.admin.deleteUser(target.id);
  if (delErr) throw delErr;
  return json(await listEmployees());
});
