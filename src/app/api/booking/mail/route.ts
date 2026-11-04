import { after } from "next/server";
import { syncBookingMail } from "@/lib/server/booking-mail";

// POST /api/booking/mail → lee el buzón de Booking (correos de Ayenda) y aplica los nuevos. Lo llama el cron de la base de
// datos (pg_net). Como los despachadores de push y correos, no necesita autenticación: no recibe datos de quien llama,
// solo lee un buzón fijo, cada correo una sola vez, y no entra al buzón más de una vez por minuto.
export function POST() {
  after(() => syncBookingMail());
  return Response.json({ ok: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
