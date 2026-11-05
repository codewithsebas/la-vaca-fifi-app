import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { cleanDayRates, cleanPersonRates, invalidBaseDayRates, invalidPersonRates } from "@/lib/booking";
import { loadCabinTypes } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, syncRoute } from "@/lib/server/http";
import type { Rates } from "@/lib/types";

const money = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 50_000_000;

// PUT /api/admin/cabin-types { [id]: { precioPareja, personaAdicional, maxPersonas, preciosPersonas, dayRates } } → tarifas base (una o varias cabañas).
// Las reservas existentes conservan su cotización; el sitio se regenera con los precios nuevos.
export const PUT = syncRoute(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin("rates");
  if (error) return error;
  const b = await readJson<Rates & { _versions?: Record<string, number> }>(req);
  if (!b) return fail(400, "INVALID_BODY");
  const { types } = await loadCabinTypes(sb);
  // Tarifas guardadas sin conexión: si otra persona cambió alguna de estas cabañas, se avisa.
  if (b._versions && types.some((t) => b[t.id] && b._versions?.[t.id] !== undefined && b._versions[t.id] !== t.version)) return fail(409, "VERSION_CONFLICT");
  for (const t of types) {
    const r = b[t.id];
    if (!r) continue;
    if (!money(r.precioPareja) || !money(r.personaAdicional) || !Number.isInteger(r.maxPersonas) || r.maxPersonas < 1 || r.maxPersonas > 12)
      return fail(400, "INVALID_RATES");
    const badTiers = invalidPersonRates(r.preciosPersonas);
    if (badTiers) return fail(422, "VALIDATION_ERROR", { fields: { preciosPersonas: badTiers } });
    const badDays = invalidBaseDayRates(r.dayRates);
    if (badDays) return fail(422, "VALIDATION_ERROR", { fields: { dayRates: badDays } });
  }
  for (const t of types) {
    const r = b[t.id];
    if (r)
      await sb
        .from("cabin_types")
        .update({
          precio_pareja: r.precioPareja,
          persona_adicional: r.personaAdicional,
          max_personas: r.maxPersonas,
          ...(r.preciosPersonas !== undefined && { precios_personas: cleanPersonRates(r.preciosPersonas, r.maxPersonas) }),
          ...(r.dayRates !== undefined && {
            day_rates: cleanDayRates(r.dayRates).map((d) => ({ ...d, dates: [], preciosPersonas: cleanPersonRates(d.preciosPersonas, r.maxPersonas) })),
          }),
        })
        .eq("id", t.id)
        .throwOnError();
  }
  revalidatePath("/", "layout");
  return json((await loadCabinTypes(sb)).types);
});
