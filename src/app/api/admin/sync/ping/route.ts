import { json, requireStaff, route } from "@/lib/server/http";

// GET /api/admin/sync/ping → hay conexión de verdad con el servidor, y quién tiene la sesión (401 sin sesión, 403 sin rol).
export const GET = route(async () => {
  const { me, error } = await requireStaff();
  if (error) return error;
  return json({ me, serverNow: new Date().toISOString() });
});
