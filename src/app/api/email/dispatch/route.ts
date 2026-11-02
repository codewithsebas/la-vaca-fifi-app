import { after, type NextRequest } from "next/server";
import { processOutbox } from "@/lib/server/mailer";
import { siteUrl } from "@/lib/server/site";

// POST /api/email/dispatch → envía los correos de la bandeja que ya tienen turno (email_outbox).
// Lo llama la base de datos (pg_net) al encolarse un correo y el cron de pendientes. Como el despacho de push, no necesita
// autenticación: solo envía lo que ya está en cola, cada correo una sola vez, y nunca recibe datos de quien llama.
export function POST(req: NextRequest) {
  after(() => processOutbox(siteUrl(req.nextUrl.origin)));
  return Response.json({ ok: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
