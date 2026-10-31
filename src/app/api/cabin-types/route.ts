import { loadCabinTypes } from "@/lib/server/db";
import { json, route } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/server";

export const GET = route(async () => {
  const { types } = await loadCabinTypes(createServiceClient(), { activeOnly: true });
  return json(types);
});
