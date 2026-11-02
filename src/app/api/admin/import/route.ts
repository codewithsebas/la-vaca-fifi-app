import type { NextRequest } from "next/server";
import { importDocNumber, invalidImportRow, newReservationCode } from "@/lib/booking";
import { config } from "@/lib/config";
import { nightsBetween } from "@/lib/format";
import { loadCabinTypes } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, route } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/lib/supabase/database.types";
import type { ImportResult, ImportRow, Quote } from "@/lib/types";

const MAX_ROWS = 500;

// POST /api/admin/import { rows: ImportRow[] } → crea las reservas de un archivo, una por fila. Cada fila responde por
// separado: creada (con su código), ya importada (misma referencia), fechas ocupadas en esa cabaña o datos no válidos.
// Entran confirmadas (o finalizadas / canceladas), sin pagos registrados; el equipo registra los pagos después.
export const POST = route(async (req: NextRequest) => {
  const { error } = await requireAdmin("import");
  if (error) return error;
  const b = await readJson<{ rows?: ImportRow[] }>(req);
  const rows = Array.isArray(b?.rows) ? b.rows : null;
  if (!rows || !rows.length || rows.length > MAX_ROWS) return fail(400, "INVALID_BODY");

  // Todas las filas en la misma solicitud: la conexión de servicio (las reglas las aplica la base de datos).
  const sb = createServiceClient();
  const [{ units }, { data: settings }] = await Promise.all([loadCabinTypes(sb), sb.from("site_settings").select("check_in_start, deposit_pct").maybeSingle()]);
  const depositPct = settings?.deposit_pct ?? config.depositPct;
  const arrival = (settings?.check_in_start ?? "15:00").slice(0, 5);
  const results: ImportResult[] = [];

  for (const r of rows) {
    const why = invalidImportRow(r, units);
    if (why) {
      results.push({ ref: String(r?.ref ?? ""), ok: false, error: why });
      continue;
    }
    const nights = nightsBetween(r.checkIn, r.checkOut);
    const total = Math.round(r.total);
    const deposit = Math.round((total * depositPct) / 100);
    const quote: Quote = {
      base: total,
      extraGuests: 0,
      extraAmount: 0,
      total,
      deposit,
      balance: total - deposit,
      pricePerNight: Math.round(total / nights),
      extraPerNight: 0,
      nights,
    };
    const phone = String(r.phone ?? "")
      .replace(/\D/g, "")
      .slice(0, 15);
    const row: Omit<TablesInsert<"reservations">, "code"> = {
      source: "import",
      external_ref: r.ref.trim(),
      channel: String(r.channel ?? "")
        .trim()
        .slice(0, 40),
      commission: Math.round(r.commission),
      status: r.status,
      cabin_type_id: r.cabinTypeId,
      unit: r.unit,
      check_in: r.checkIn,
      check_out: r.checkOut,
      adults: 2,
      children: 0,
      pet: { hasPet: false, smallBreedConfirmed: false },
      decoration: { requested: false, occasion: "", notes: "" },
      estimated_arrival: arrival,
      guest_full_name: r.guest.trim(),
      guest_doc_type: "SD",
      guest_doc_number: importDocNumber(r),
      guest_email: String(r.email ?? "").trim(),
      guest_phone: phone ? `+${phone}` : "",
      guest_city: "",
      special_requests: String(r.notes ?? "")
        .trim()
        .slice(0, 500),
      consents: { policies: false, dataProcessing: false, marketing: false },
      quote,
      deposit_due_at: new Date().toISOString(),
    };
    let done: ImportResult | null = null;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      const code = newReservationCode();
      const { error: insErr } = await sb.from("reservations").insert({ ...row, code });
      if (!insErr) done = { ref: r.ref, ok: true, code };
      else if (insErr.code === "23P01") done = { ref: r.ref, ok: false, error: "Las fechas ya están ocupadas en esa cabaña." };
      else if (insErr.code === "23505" && insErr.message.includes("external_ref")) done = { ref: r.ref, ok: false, error: "Ya se había importado." };
      else if (insErr.code !== "23505") done = { ref: r.ref, ok: false, error: "No se pudo crear." };
    }
    results.push(done ?? { ref: r.ref, ok: false, error: "No se pudo crear." });
  }
  return json({ results });
});
