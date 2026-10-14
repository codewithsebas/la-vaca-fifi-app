import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { loadCabinTypes } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, route } from "@/lib/server/http";
import type { Rates } from "@/lib/types";

const money = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 50_000_000;

// PUT /api/admin/cabin-types { [id]: { precioPareja, personaAdicional, maxPersonas } } → tarifas base (una o varias cabañas).
// Las reservas existentes conservan su cotización; el sitio se regenera con los precios nuevos.
export const PUT = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const b = await readJson<Rates>(req);
  if (!b) return fail(400, "INVALID_BODY");
  const { types } = await loadCabinTypes(sb);
  for (const t of types) {
    const r = b[t.id];
    if (!r) continue;
    if (!money(r.precioPareja) || !money(r.personaAdicional) || !Number.isInteger(r.maxPersonas) || r.maxPersonas < 1 || r.maxPersonas > 12) return fail(400, "INVALID_RATES");
  }
  for (const t of types) {
    const r = b[t.id];
    if (r) await sb.from("cabin_types").update({ precio_pareja: r.precioPareja, persona_adicional: r.personaAdicional, max_personas: r.maxPersonas }).eq("id", t.id).throwOnError();
  }
  revalidatePath("/", "layout");
  return json((await loadCabinTypes(sb)).types);
});
