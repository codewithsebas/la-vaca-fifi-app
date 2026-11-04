// Se ejecuta una vez al arrancar el servidor de Next.js.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkEnv } = await import("@/lib/server/env");
  checkEnv();
  // Lectura del buzón de Booking cada 2 minutos (no durante la compilación).
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startBookingMailPoller } = await import("@/lib/server/booking-mail");
  startBookingMailPoller();
}
