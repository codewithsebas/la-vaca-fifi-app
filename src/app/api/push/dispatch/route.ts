import { after } from "next/server";
import { dispatchPush } from "@/lib/server/push";

// POST /api/push/dispatch → envía los avisos del panel pendientes como notificaciones push.
// Lo llama la base de datos (pg_net) al crearse un aviso. No necesita autenticación: solo despacha lo que ya está
// en cola, cada aviso una sola vez, y nunca recibe datos de quien llama. Responde enseguida y envía después.
export function POST() {
  after(dispatchPush);
  return Response.json({ ok: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
