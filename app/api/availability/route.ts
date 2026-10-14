import { after, type NextRequest } from "next/server";
import { availability } from "@/lib/booking";
import { addDays, isISO, nightsBetween } from "@/lib/format";
import { syncSoon } from "@/lib/server/channels";
import { loadOccupancy, loadPricing, runDeadlines } from "@/lib/server/db";
import { fail, json, route } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/server";

// GET /api/availability?checkIn&checkOut&adults&children → opciones por tipo de domo con su cotización.
export const GET = route(async (req: NextRequest) => {
  const p = req.nextUrl.searchParams;
  const ci = p.get("checkIn");
  const co = p.get("checkOut");
  const guests = (parseInt(p.get("adults") ?? "") || 0) + (parseInt(p.get("children") ?? "") || 0);
  if (!isISO(ci) || !isISO(co) || co <= ci || nightsBetween(ci, co) > 60 || guests < 1 || guests > 20) return fail(400, "INVALID_QUERY");

  const sb = createServiceClient();
  // Si hace más de 2 minutos que no se leen los calendarios de Booking, se leen después de responder (la próxima consulta ya los ve).
  after(() => syncSoon({ minAgeMs: 120_000 }));
  await runDeadlines();
  const [{ types, units, seasons }, occ] = await Promise.all([loadPricing(sb), loadOccupancy(sb, ci, addDays(co, -1))]);
  return json(availability(occ, types, units, ci, co, guests, seasons));
});
