import { after } from "next/server";
import { syncCalendars } from "@/lib/server/channels";
import { dispatchPush } from "@/lib/server/push";

// POST /api/channels/sync → lee los calendarios de Booking.com enlazados. Lo llama el cron de la base de datos (pg_net)
// cada 5 minutos. Como la lectura del buzón, no necesita autenticación: no recibe datos de quien llama, solo lee enlaces
// fijos, y cada calendario se lee como mucho una vez por minuto (candado en la base de datos).
export function POST() {
  after(async () => {
    const results = await syncCalendars({ minAgeMs: 60_000, notifyErrors: true }).catch((e) => {
      console.error("Calendarios de Booking:", e);
      return [];
    });
    // Posibles sobreventas o calendarios que dejaron de leerse: salen como notificación push.
    if (results.some((r) => r.conflicts.length || !r.ok)) await dispatchPush();
  });
  return Response.json({ ok: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
