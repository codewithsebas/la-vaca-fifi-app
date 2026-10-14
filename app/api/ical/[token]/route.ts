import type { NextRequest } from "next/server";
import { exportCalendar } from "@/lib/server/channels";
import { route } from "@/lib/server/http";
import { siteUrl } from "@/lib/server/payments";

// GET /api/ical/<token> → calendario iCal de una unidad para importarlo en Booking.com (extranet → Sincronizar
// calendarios → Importar). Solo fechas ocupadas, sin datos de los huéspedes; el token es la única llave (se cambia en el panel).
export const GET = route(async (req: NextRequest, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  const ics = await exportCalendar(token.replace(/\.ics$/i, ""), siteUrl(req.nextUrl.origin));
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (!ics) return new Response("Calendario no encontrado.", { status: 404, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(ics, { headers: { ...headers, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="disponibilidad.ics"' } });
});
