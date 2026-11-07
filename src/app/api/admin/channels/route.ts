import type { NextRequest } from "next/server";
import { calendarOf, syncCalendars, validImportUrl } from "@/lib/server/channels";
import { channelStayOf, isMissingTable } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, route } from "@/lib/server/http";
import { originOf, siteUrl } from "@/lib/server/site";
import { createServiceClient } from "@/lib/supabase/server";
import { addDays, todayISO } from "@/lib/format";

// Calendarios de Booking.com, uno por cabaña (solo administradores: el enlace de Booking es secreto).
// GET → calendarios y sus noches de Booking.
// PATCH { id, importUrl } → guarda (o quita, con null) el enlace de exportación de Booking y lo lee enseguida.
// POST { id? } → lee ahora uno o todos.

async function load(base: string) {
  const sb = createServiceClient();
  const [c, s] = await Promise.all([
    sb.from("channel_calendars").select("*"),
    sb.from("channel_stays").select("*").gte("check_out", addDays(todayISO(), -400)).order("check_in"),
  ]);
  const error = c.error ?? s.error;
  if (error) {
    if (isMissingTable(error)) return { calendars: [], stays: [] };
    throw error;
  }
  const num = (label: string) => Number(label.replace(/\D/g, "")) || 0;
  const calendars = c.data!.map((x) => calendarOf(x, base)).sort((a, b) => num(a.label) - num(b.label) || a.label.localeCompare(b.label));
  return { calendars, stays: s.data!.map(channelStayOf) };
}

export const GET = route(async (req: NextRequest) => {
  const { error } = await requireAdmin();
  if (error) return error;
  return json(await load(siteUrl(originOf(req))));
});

export const PATCH = route(async (req: NextRequest) => {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await readJson<{ id?: string; importUrl?: string | null }>(req);
  if (!body?.id || typeof body.id !== "string") return fail(400, "INVALID_INPUT");
  const url = typeof body.importUrl === "string" ? body.importUrl.trim() : null;
  if (url && (url.length > 1000 || !validImportUrl(url))) return fail(400, "INVALID_URL");
  const sb = createServiceClient();
  const { data } = await sb
    .from("channel_calendars")
    .update({ import_url: url || null, last_status: null, last_error: "", sync_started_at: null })
    .eq("id", body.id)
    .select("id")
    .throwOnError();
  if (!data.length) return fail(404, "NOT_FOUND");
  // Sin enlace, sus fechas de Booking dejan de ocupar (se conservan como canceladas para el historial).
  if (!url) await sb.from("channel_stays").update({ removed_at: new Date().toISOString() }).eq("calendar_id", body.id).is("removed_at", null).throwOnError();
  const results = url ? await syncCalendars({ minAgeMs: 0, notifyErrors: false, calendarId: body.id }) : [];
  return json({ ...(await load(siteUrl(originOf(req)))), results });
});

export const POST = route(async (req: NextRequest) => {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await readJson<{ id?: string }>(req);
  const results = await syncCalendars({ minAgeMs: 15_000, notifyErrors: false, calendarId: typeof body?.id === "string" ? body.id : undefined });
  return json({ ...(await load(siteUrl(originOf(req)))), results });
});
