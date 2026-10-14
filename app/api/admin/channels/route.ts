import { after, type NextRequest } from "next/server";
import { Beds24Error, beds24Client, connectBeds24 } from "@/lib/server/beds24";
import { syncBeds24 } from "@/lib/server/beds24-sync";
import { type Db, isMissingTable, loadCabinTypes, loadChannels } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, route } from "@/lib/server/http";
import { newExportToken, syncCalendars, validImportUrl } from "@/lib/server/channels";
import { siteUrl } from "@/lib/server/payments";
import { dispatchPush } from "@/lib/server/push";
import { createServiceClient } from "@/lib/supabase/server";
import type { ChannelCalendarInput, ChannelSyncResult } from "@/lib/types";

// Enlazar una habitación de Beds24 hace el primer repaso completo (puede subir varias reservas de la web).
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = (fields: Record<string, string>) => fail(422, "VALIDATION_ERROR", { fields });
// La migración de canales todavía no está aplicada en la base de datos.
const notReady = () => fail(503, "CHANNELS_NOT_READY");

async function respond(req: NextRequest, sb: Db, results?: ChannelSyncResult[]) {
  const channels = await loadChannels(sb, siteUrl(req.nextUrl.origin));
  if (results?.some((r) => r.moved.length || r.conflicts.length)) after(dispatchPush);
  return json({ ...channels, ...(results && { results }) });
}

// Repaso completo con Beds24 (si está en uso): sus lecturas se suman a las del iCal; un error cuenta como lectura fallida.
async function withBeds24(results: ChannelSyncResult[]): Promise<ChannelSyncResult[]> {
  const b = await syncBeds24("all");
  if (!b) return results;
  if (!b.ok) return [...results, { calendarId: "beds24", ok: false, events: 0, added: 0, removed: 0, moved: [], conflicts: [], error: b.error }];
  if (b.conflicts.length) after(dispatchPush);
  return [...results, ...b.results];
}

// GET /api/admin/channels → calendarios de Booking enlazados, sus fechas y el estado de Beds24.
export const GET = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  return respond(req, sb);
});

// PUT /api/admin/channels { cabinTypeId, unit, units?, label, importUrl, beds24RoomId? } → enlaza un tipo de alojamiento
// de Booking con un domo (unit) y, si cubre varios, con los demás de `units` (un grupo: Booking vende uno por noche).
// Por iCal: importUrl (vacío la desenlaza); si cambia, las fechas del anterior se borran y se lee el nuevo de inmediato.
// Por Beds24 (un solo domo): beds24RoomId (habitación de la cuenta conectada); deja de usar el iCal y hace un repaso
// completo. beds24RoomId null la desenlaza de Beds24 (lo ya creado allá se queda y sigue cerrando esas noches en Booking).
export const PUT = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const b = await readJson<ChannelCalendarInput>(req);
  if (!b) return fail(400, "INVALID_BODY");
  const { units } = await loadCabinTypes(sb);
  const unit = Number(b.unit);
  if (!units[b.cabinTypeId] || !Number.isInteger(unit) || unit < 1 || unit > units[b.cabinTypeId]!) return fail(400, "INVALID_UNIT");
  const label = String(b.label ?? "").trim();
  const roomId = b.beds24RoomId == null ? null : Number(b.beds24RoomId);
  const importUrl = roomId ? null : String(b.importUrl ?? "").trim() || null;
  if (label.length > 80) return invalid({ label: "Máximo 80 caracteres." });
  if (importUrl && (importUrl.length > 1000 || !validImportUrl(importUrl))) return invalid({ importUrl: "Pega el enlace de exportación del extranet (empieza por https://)." });
  // El enlace de la app es el que va en Booking (Importar calendario); aquí va el que exporta Booking.
  if (importUrl?.includes("/api/ical/")) return invalid({ importUrl: "Ese es el enlace de la app, el que se pega en Booking.com. Aquí va el enlace de exportación de Booking.com (Exportar calendario)." });

  const { data: all, error: e1 } = await sb.from("channel_calendars").select("*");
  if (e1) {
    if (isMissingTable(e1)) return notReady();
    throw e1;
  }
  const current = all.find((c) => c.cabin_type_id === b.cabinTypeId && c.unit === unit);
  const taken = importUrl && all.find((c) => c.import_url === importUrl && c.id !== current?.id);
  if (taken) return invalid({ importUrl: `Ese enlace ya está en otro domo (${taken.label || `unidad ${taken.unit}`}).` });
  // Domos que cubre este tipo de Booking: la de este calendario y las que se sumen, del mismo tipo y en un solo grupo.
  const pool = [unit, ...new Set((b.units ?? [unit]).map(Number).filter((u) => u !== unit))];
  if (pool.some((u) => !Number.isInteger(u) || u < 1 || u > units[b.cabinTypeId]!)) return fail(400, "INVALID_UNIT");
  const others = all.filter((c) => c.id !== current?.id && c.cabin_type_id === b.cabinTypeId && [c.unit, ...c.extra_units].some((u) => pool.includes(u)));
  const inOther = others.find((c) => c.import_url || c.beds24_room_id);
  if (inOther) return invalid({ units: `Alguno de esos domos ya lo cubre ${inOther.label || `otro tipo de Booking.com`}.` });
  // Calendarios sin enlazar de los domos que se suman al grupo: sobran (el domo queda en este).
  const spare = others.filter((c) => c.unit !== unit).map((c) => c.id);
  if (roomId !== null && pool.length > 1) return invalid({ units: "Con Beds24, cada habitación se enlaza con un solo domo." });
  const extra = pool.slice(1);
  const regrouped = !!current && (current.extra_units.length !== extra.length || current.extra_units.some((u) => !extra.includes(u)));
  if (roomId !== null) {
    if (!Number.isInteger(roomId) || roomId < 1) return invalid({ beds24RoomId: "Elige una habitación de Beds24." });
    const other = all.find((c) => c.beds24_room_id === roomId && c.id !== current?.id);
    if (other) return invalid({ beds24RoomId: `Esa habitación ya está enlazada con ${other.label || `la unidad ${other.unit}`}.` });
    if (roomId !== current?.beds24_room_id) {
      const client = await beds24Client(createServiceClient());
      if (!client) return fail(409, "BEDS24_NOT_CONNECTED");
      try {
        if (!(await client.rooms()).some((r) => r.id === roomId)) return invalid({ beds24RoomId: "Esa habitación no existe en la cuenta de Beds24." });
      } catch (e) {
        if (e instanceof Beds24Error) return invalid({ beds24RoomId: e.message });
        throw e;
      }
    }
  }

  if (spare.length) await sb.from("channel_calendars").delete().in("id", spare).throwOnError();
  const changed = (current?.import_url ?? null) !== importUrl;
  const linking = roomId !== null && roomId !== (current?.beds24_room_id ?? null);
  const reset = changed ? { last_synced_at: null, sync_started_at: null, last_status: null, last_error: "", last_event_count: 0 } : {};
  const { data: saved } = await sb
    .from("channel_calendars")
    .upsert({ cabin_type_id: b.cabinTypeId, unit, extra_units: extra, channel: "booking", label, import_url: importUrl, beds24_room_id: roomId, ...reset }, { onConflict: "cabin_type_id,unit,channel" })
    .select("id")
    .single()
    .throwOnError();
  // Las fechas del enlace anterior ya no dicen nada de este (solo la sincronización escribe en channel_stays). Al pasar a
  // Beds24 se conservan las que trajo el iCal: siguen bloqueando la web hasta que pasen (por si Beds24 no las tiene).
  if (changed && !linking && current) await createServiceClient().from("channel_stays").delete().eq("calendar_id", current.id).throwOnError();
  if (linking) return respond(req, sb, await withBeds24([]));
  // Con otro enlace se lee de inmediato; con otro grupo también, para acomodar sus fechas en los domos del grupo.
  const results = (changed || regrouped) && importUrl ? await syncCalendars({ calendarId: saved.id, minAgeMs: 0, notifyErrors: false }) : undefined;
  return respond(req, sb, results);
});

// POST /api/admin/channels
//   { action: "sync" } → lee ahora los calendarios iCal enlazados y hace un repaso completo con Beds24.
//   { action: "rotate", id } → nuevo enlace iCal para Booking (el anterior deja de funcionar).
//   { action: "beds24-connect", code } → conecta Beds24 con el código de invitación (Settings → Marketplace → API).
//   { action: "beds24-rooms" } → habitaciones de la cuenta de Beds24 (para enlazarlas).
export const POST = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const b = await readJson<{ action: "sync" } | { action: "rotate"; id: string } | { action: "beds24-connect"; code: string } | { action: "beds24-rooms" }>(req);
  if (b?.action === "sync") {
    const { error: e } = await sb.from("channel_calendars").select("id").limit(1);
    if (e) {
      if (isMissingTable(e)) return notReady();
      throw e;
    }
    return respond(req, sb, await withBeds24(await syncCalendars({ minAgeMs: 10_000, notifyErrors: false })));
  }
  if (b?.action === "rotate" && UUID.test(String(b.id))) {
    const { data, error: e } = await sb.from("channel_calendars").update({ export_token: newExportToken(), last_fetched_at: null }).eq("id", b.id).select("id");
    if (e) {
      if (isMissingTable(e)) return notReady();
      throw e;
    }
    if (!data.length) return fail(404, "NOT_FOUND");
    return respond(req, sb);
  }
  if (b?.action === "beds24-connect") {
    const code = String(b.code ?? "").trim();
    if (!code || code.length > 500) return invalid({ code: "Pega el código de invitación de Beds24." });
    try {
      await connectBeds24(createServiceClient(), code);
    } catch (e) {
      if (e instanceof Beds24Error) return invalid({ code: e.message });
      if (isMissingTable(e)) return notReady();
      throw e;
    }
    return respond(req, sb, await withBeds24([]));
  }
  if (b?.action === "beds24-rooms") {
    const client = await beds24Client(createServiceClient());
    if (!client) return fail(409, "BEDS24_NOT_CONNECTED");
    try {
      return json({ rooms: await client.rooms() });
    } catch (e) {
      if (e instanceof Beds24Error) return fail(502, "BEDS24_ERROR", { message: e.message });
      throw e;
    }
  }
  return fail(400, "INVALID_BODY");
});
