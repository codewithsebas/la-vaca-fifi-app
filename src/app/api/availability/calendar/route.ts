import type { NextRequest } from "next/server";
import { unavailableDates } from "@/lib/booking";
import { isISO, nightsBetween } from "@/lib/format";
import { loadCabinTypes, loadOccupancy, runDeadlines } from "@/lib/server/db";
import { fail, json, route } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/server";

// GET /api/availability/calendar?cabinTypeId&from&to → noches sin ninguna unidad libre de ese tipo.
export const GET = route(async (req: NextRequest) => {
  const p = req.nextUrl.searchParams;
  const typeId = p.get("cabinTypeId") ?? "";
  const from = p.get("from");
  const to = p.get("to");
  if (!isISO(from) || !isISO(to) || to < from || nightsBetween(from, to) > 100) return fail(400, "INVALID_QUERY");

  const sb = createServiceClient();
  await runDeadlines();
  const [{ units }, occ] = await Promise.all([loadCabinTypes(sb, { activeOnly: true }), loadOccupancy(sb, from, to, typeId)]);
  if (!(typeId in units)) return fail(400, "INVALID_CABIN_TYPE");
  return json({ unavailableDates: unavailableDates(occ, units[typeId] ?? 0, typeId, from, to) });
});
