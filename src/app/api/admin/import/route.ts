import type { NextRequest } from "next/server";
import { invalidImportRow } from "@/lib/booking";
import { config } from "@/lib/config";
import { loadCabinTypes } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, syncRoute } from "@/lib/server/http";
import { insertImported } from "@/lib/server/reservations";
import { createServiceClient } from "@/lib/supabase/server";
import type { ImportResult, ImportRow } from "@/lib/types";

const MAX_ROWS = 500;

const ERRORS = { DATES_UNAVAILABLE: "Las fechas ya están ocupadas en esa cabaña.", DUPLICATE: "Ya se había importado.", FAILED: "No se pudo crear." };

// POST /api/admin/import { rows: ImportRow[] } → crea las reservas de un archivo, una por fila. Cada fila responde por
// separado: creada (con su código), ya importada (misma referencia), fechas ocupadas en esa cabaña o datos no válidos.
// Entran confirmadas (o finalizadas / canceladas), sin pagos registrados; el equipo registra los pagos después.
export const POST = syncRoute(async (req: NextRequest) => {
  const { error } = await requireAdmin("import");
  if (error) return error;
  const b = await readJson<{ rows?: ImportRow[] }>(req);
  const rows = Array.isArray(b?.rows) ? b.rows : null;
  if (!rows || !rows.length || rows.length > MAX_ROWS) return fail(400, "INVALID_BODY");

  // Todas las filas en la misma solicitud: la conexión de servicio (las reglas las aplica la base de datos).
  const sb = createServiceClient();
  const [{ units }, { data: settings }] = await Promise.all([loadCabinTypes(sb), sb.from("site_settings").select("check_in_start, deposit_pct").maybeSingle()]);
  const ctx = { depositPct: settings?.deposit_pct ?? config.depositPct, arrival: (settings?.check_in_start ?? "15:00").slice(0, 5) };
  const results: ImportResult[] = [];

  for (const r of rows) {
    const why = invalidImportRow(r, units);
    if (why) {
      results.push({ ref: String(r?.ref ?? ""), ok: false, error: why });
      continue;
    }
    const done = await insertImported(sb, r, ctx);
    results.push("code" in done ? { ref: r.ref, ok: true, code: done.code } : { ref: r.ref, ok: false, error: ERRORS[done.error] });
  }
  return json({ results });
});
