import type { NextRequest } from "next/server";
import { availability } from "@/lib/booking";
import { addDays, isISO, nightsBetween } from "@/lib/format";
import { loadOccupancy, loadPricing, runDeadlines } from "@/lib/server/db";
import { fail, json, route } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/server";

// GET /api/availability?checkIn&checkOut&adults&children → opciones por tipo de cabaña con su cotización. Un grupo más
// grande que cualquier cabaña (hasta 60) se reparte en varias: cada opción trae unitsFree y la tarifa por personas.
export const GET = route(async (req: NextRequest) => {
  const p = req.nextUrl.searchParams;
  const ci = p.get("checkIn");
  const co = p.get("checkOut");
  const guests = (parseInt(p.get("adults") ?? "") || 0) + (parseInt(p.get("children") ?? "") || 0);
  if (!isISO(ci) || !isISO(co) || co <= ci || nightsBetween(ci, co) > 60 || guests < 1 || guests > 60) return fail(400, "INVALID_QUERY");

  const sb = createServiceClient();
  await runDeadlines();
  const [{ types, units, seasons, depositPct }, occ] = await Promise.all([loadPricing(sb), loadOccupancy(sb, ci, addDays(co, -1))]);
  return json(availability(occ, types, units, ci, co, guests, seasons, depositPct));
});
