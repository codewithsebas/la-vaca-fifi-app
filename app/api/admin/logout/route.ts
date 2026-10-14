import { json, route } from "@/lib/server/http";
import { createSessionClient } from "@/lib/supabase/server";

export const POST = route(async () => {
  const sb = await createSessionClient();
  await sb.auth.signOut();
  return json({});
});
