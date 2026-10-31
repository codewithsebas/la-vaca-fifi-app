import "server-only";
import { randomBytes } from "node:crypto";
import { ACTIVE_STATUSES, CHANNEL_ID, planChannelMoves, poolFirst, unitFree, type ChannelSpan, type Pool, type Units } from "@/lib/booking";
import { config } from "@/lib/config";
import { addDays, fmtDate, nightsBetween, sleep, todayISO } from "@/lib/format";
import { buildIcs, parseIcs, type IcsEvent } from "@/lib/ical";
import type { Tables } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/server";
import type { CabinType, ChannelSyncResult, NotificationKind } from "@/lib/types";
import { type Db, isExclusionViolation, isMissingTable, loadCabinTypes, loadOccupancy } from "@/lib/server/db";

// Sincronización de disponibilidad con Booking.com por calendarios iCal (extranet → Sincronizar calendarios).
// Cada tipo de alojamiento de Booking (una unidad allá) cubre un grupo de cabañas del mismo tipo en la app (poolOf).
//   Booking → app: se lee el enlace de exportación de cada tipo y sus fechas quedan en channel_stays, cada una en un
//   cabaña libre del grupo (cuentan como bloqueos en la disponibilidad). Si no queda ninguno libre, la reserva de la web
//   que esté encima se reacomoda a otra unidad libre del mismo tipo o se avisa al equipo de una posible sobreventa.
//   App → Booking: /api/ical/<token> cierra las noches en que todas las cabañas del grupo están ocupadas; Booking lo
//   importa a su ritmo.
// Se lee cada 5 minutos (pg_cron → /api/channels/sync), justo antes de asignar una reserva nueva y al consultar
// disponibilidad si hace rato no se lee. sync_started_at hace de candado: dos lecturas del mismo calendario no se cruzan.

type CalendarRow = Tables<"channel_calendars">;

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 1_000_000;
const HISTORY_DAYS = 400; // fechas pasadas que se guardan (ocupación del último año)
const HORIZON_DAYS = 800; // fechas futuras que se aceptan
const MAX_NIGHTS = 366;

// Solo https. En desarrollo también http hacia este equipo (para probar con un archivo .ics local).
export function validImportUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return true;
    return process.env.NODE_ENV !== "production" && u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname);
  } catch {
    return false;
  }
}

export const newExportToken = () => randomBytes(24).toString("hex");

export const unitName = (types: CabinType[], typeId: string, unit: number) =>
  `${(types.find((t) => t.id === typeId)?.nombre ?? typeId).replace(/^Cabaña\s+/i, "")} ${unit}`;

async function fetchIcs(url: string): Promise<IcsEvent[]> {
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1", "User-Agent": `${config.name} (sincronizacion de calendario)` },
    });
  } catch (e) {
    throw new Error((e as Error)?.name === "TimeoutError" ? "Booking no respondió a tiempo." : "No se pudo conectar con el enlace del calendario.");
  }
  if (!res.ok)
    throw new Error(
      res.status === 404 || res.status === 410
        ? "El enlace ya no existe (404): cópialo de nuevo desde el extranet."
        : `El enlace respondió con un error (${res.status}).`,
    );
  if (Number(res.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("El calendario es demasiado grande.");
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("El calendario es demasiado grande.");
  try {
    return parseIcs(text);
  } catch {
    throw new Error("El enlace no devuelve un calendario iCal. Usa el enlace de exportación del extranet.");
  }
}

export async function notify(sb: Db, kind: NotificationKind, title: string, body: string, code: string | null) {
  await sb
    .from("admin_notifications")
    .insert({ kind, title: title.slice(0, 200), body: body.slice(0, 500), reservation_code: code })
    .throwOnError();
}

// Toma el calendario si nadie lo leyó (o intentó leer) en los últimos `minAgeMs`. Devuelve false si otro lo tiene.
async function claim(sb: Db, cal: CalendarRow, minAgeMs: number) {
  const cutoff = new Date(Date.now() - minAgeMs).toISOString();
  const { data } = await sb
    .from("channel_calendars")
    .update({ sync_started_at: new Date().toISOString() })
    .eq("id", cal.id)
    .or(`sync_started_at.is.null,sync_started_at.lt."${cutoff}"`)
    .select("id")
    .throwOnError();
  return data.length > 0;
}

// Cabañas de la app que cubre un tipo de alojamiento de Booking: el primero (`unit`) y los demás del grupo.
const poolOf = (cal: Pick<CalendarRow, "unit" | "extra_units">): Pool => [cal.unit, ...cal.extra_units];

// Grupos de cabañas de un tipo enlazados con Booking, por iCal o por Beds24 (para repartir las reservas de la web).
export async function channelPools(sb: Db, cabinTypeId: string): Promise<Pool[]> {
  const { data, error } = await sb
    .from("channel_calendars")
    .select("unit, extra_units")
    .eq("cabin_type_id", cabinTypeId)
    .or("import_url.not.is.null,beds24_room_id.not.is.null");
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return data.map(poolOf);
}

// Booking vuelve a exportar como cerradas las noches que importó del enlace de la app. Una fecha suya es ese eco si en
// todas sus noches el enlace ya las cerraba (todas las cabañas del grupo ocupadas por la web, bloqueos o fechas de otros
// tipos de Booking) y Booking lo descargó después del último cambio en ellas. Si no lo había descargado, no puede ser un
// eco: es una venta de Booking. Solo aplica a los calendarios iCal (Beds24 no devuelve lo que crea la app).
async function withoutEchoes(sb: Db, cal: CalendarRow, spans: ChannelSpan[]) {
  if (!spans.length || !cal.last_fetched_at || cal.beds24_room_id) return spans;
  const pool = poolOf(cal);
  const fetched = cal.last_fetched_at;
  const first = spans.reduce((m, s) => (s.checkIn < m ? s.checkIn : m), spans[0].checkIn);
  const last = spans.reduce((m, s) => (s.checkOut > m ? s.checkOut : m), spans[0].checkOut);
  const [{ data: rs }, { data: bs }, { data: ss }] = await Promise.all([
    sb
      .from("reservations")
      .select("unit, check_in, check_out, updated_at")
      .eq("cabin_type_id", cal.cabin_type_id)
      .in("unit", pool)
      .in("status", ACTIVE_STATUSES)
      .lt("check_in", last)
      .gt("check_out", first)
      .throwOnError(),
    sb
      .from("blocks")
      .select("unit, from_date, to_date, updated_at")
      .eq("cabin_type_id", cal.cabin_type_id)
      .in("unit", pool)
      .lt("from_date", last)
      .gte("to_date", first)
      .throwOnError(),
    sb
      .from("channel_stays")
      .select("unit, check_in, check_out, first_seen_at")
      .eq("cabin_type_id", cal.cabin_type_id)
      .in("unit", pool)
      .neq("calendar_id", cal.id)
      .is("removed_at", null)
      .lt("check_in", last)
      .gt("check_out", first)
      .throwOnError(),
  ]);
  const items = [
    ...rs.map((r) => ({ unit: r.unit, from: r.check_in, to: r.check_out, at: r.updated_at })),
    ...bs.map((b) => ({ unit: b.unit, from: b.from_date, to: addDays(b.to_date, 1), at: b.updated_at })),
    ...ss.map((s) => ({ unit: s.unit, from: s.check_in, to: s.check_out, at: s.first_seen_at })),
  ];
  const closedBeforeFetch = (night: string) => {
    const on = items.filter((i) => i.from <= night && night < i.to);
    return new Set(on.map((i) => i.unit)).size >= pool.length && on.every((i) => Date.parse(i.at) < Date.parse(fetched));
  };
  return spans.filter((s) => {
    for (let d = s.checkIn; d < s.checkOut; d = addDays(d, 1)) if (!closedBeforeFetch(d)) return true;
    return false;
  });
}

// Reservas de la web que quedaron sobre fechas nuevas de Booking: se reacomodan o se avisa de la posible sobreventa.
async function resolveConflicts(sb: Db, cal: CalendarRow, changed: ChannelSpan[], units: Units, types: CabinType[], today: string, result: ChannelSyncResult) {
  const type = cal.cabin_type_id;
  const live = await withoutEchoes(
    sb,
    cal,
    changed.filter((s) => s.checkOut > today),
  );
  if (!live.length) return;
  // Primero las reservas que tocan las fechas nuevas; luego la ocupación de todas sus noches (para buscarles otra unidad).
  let first = live.reduce((m, s) => (s.checkIn < m ? s.checkIn : m), live[0].checkIn);
  let last = live.reduce((m, s) => (s.checkOut > m ? s.checkOut : m), live[0].checkOut);
  const near = await loadOccupancy(sb, first, addDays(last, -1), type);
  for (const r of near.reservations) {
    if (r.checkIn < first) first = r.checkIn;
    if (r.checkOut > last) last = r.checkOut;
  }
  const occ = await loadOccupancy(sb, first, addDays(last, -1), type);
  const pools = await channelPools(sb, type);
  const plan = planChannelMoves(occ, live, units, today, (t, ci, co, work, code) => poolFirst(work, units[t] ?? 0, t, ci, co, pools, code));
  const where = (s: ChannelSpan) => `${cal.label || unitName(types, type, cal.unit)} del ${fmtDate(s.checkIn)} al ${fmtDate(s.checkOut)}`;

  for (const m of plan.moves) {
    const stay = live.find((s) => occ.reservations.some((r) => r.code === m.code && s.checkIn < r.checkOut && r.checkIn < s.checkOut))!;
    const { data, error } = await sb
      .from("reservations")
      .update({ unit: m.to })
      .eq("code", m.code)
      .eq("unit", m.from)
      .in("status", ACTIVE_STATUSES)
      .select("code");
    if (error && !isExclusionViolation(error)) throw error;
    if (error || !data?.length) {
      // Otra reserva tomó esa unidad mientras tanto (o la reserva cambió): queda como posible sobreventa.
      plan.conflicts.push({ code: m.code, stay });
      continue;
    }
    result.moved.push(m.code);
    await notify(
      sb,
      "channel_moved",
      `Reserva reacomodada · ${m.code}`,
      `Booking.com ocupó ${where(stay)}. La reserva pasó de ${unitName(types, type, m.from)} a ${unitName(types, type, m.to)}.`,
      m.code,
    );
  }
  for (const c of plan.conflicts) {
    result.conflicts.push(c.code);
    await notify(
      sb,
      "channel_conflict",
      `Posible sobreventa con Booking.com · ${c.code}`,
      `Booking.com ocupó ${where(c.stay)}, donde está la reserva ${c.code}, y no hay otra cabaña libre. Revisa en el extranet si es una reserva nueva.`,
      c.code,
    );
  }
}

// Una fecha ocupada en Booking tal como llega del canal (iCal o Beds24). checkOut exclusivo.
export type StayEvent = { uid: string; checkIn: string; checkOut: string; summary: string };

// Guarda las fechas de Booking de una unidad y reacomoda (o avisa) las reservas de la web que quedan encima.
// full: `events` es todo lo vigente de la unidad que viene de esa fuente (un iCal, o las «beds24:» de una lectura completa
// de Beds24), así que lo que ya no viene y aún no termina se canceló. Si no (un aviso de Beds24), solo se agregan o
// cambian `events` y se quitan las de `gone`. Las fechas de otra fuente no se tocan: al pasar una unidad del iCal a
// Beds24, las que ya trajo el iCal siguen bloqueando la web hasta que pasen.
export async function applyStays(
  sb: Db,
  cal: CalendarRow,
  events: StayEvent[],
  o: { full: boolean; source?: string; gone?: string[]; units: Units; types: CabinType[]; result: ChannelSyncResult },
) {
  const today = todayISO();
  let q = sb.from("channel_stays").select("*").eq("calendar_id", cal.id);
  if (!o.full) q = q.in("external_uid", [...events.map((e) => e.uid), ...(o.gone ?? [])]);
  else if (o.source) q = q.like("external_uid", `${o.source}%`);
  const { data: existing } = await q.throwOnError();
  const byUid = new Map(existing.map((s) => [s.external_uid, s]));
  const pool = poolOf(cal);

  // Solo se escribe lo nuevo o cambiado: una lectura sin cambios no toca la base de datos (ni recarga el panel).
  // `moved`: fechas nuevas, que cambiaron de noches o que quedaron fuera del grupo (las únicas que pueden chocar con la web).
  const moved = (e: StayEvent) => {
    const prev = byUid.get(e.uid);
    return (
      !prev ||
      !!prev.removed_at ||
      prev.check_in !== e.checkIn ||
      prev.check_out !== e.checkOut ||
      !pool.includes(prev.unit) ||
      prev.cabin_type_id !== cal.cabin_type_id
    );
  };
  const changed = events.filter((e) => moved(e) || byUid.get(e.uid)!.summary !== e.summary);

  // Cada fecha nueva ocupa una cabaña del grupo libre esas noches; si no queda ninguna, la primera del grupo (y la reserva
  // de la web que esté allí se reacomoda o queda como posible sobreventa).
  const unitOf = new Map<string, number>();
  const fresh = changed.filter(moved);
  if (fresh.length) {
    const first = fresh.reduce((m, e) => (e.checkIn < m ? e.checkIn : m), fresh[0].checkIn);
    const last = fresh.reduce((m, e) => (e.checkOut > m ? e.checkOut : m), fresh[0].checkOut);
    const occ = await loadOccupancy(sb, first, addDays(last, -1), cal.cabin_type_id);
    const own = new Set(
      fresh
        .map((e) => byUid.get(e.uid)?.id)
        .filter(Boolean)
        .map((id) => `${CHANNEL_ID}${id}`),
    );
    occ.blocks = occ.blocks.filter((b) => !own.has((b as { id?: string }).id ?? ""));
    for (const e of fresh) {
      const prev = byUid.get(e.uid)?.unit;
      const order = prev && pool.includes(prev) ? [prev, ...pool.filter((u) => u !== prev)] : pool;
      const unit = order.find((u) => unitFree(occ, o.units[cal.cabin_type_id] ?? 0, cal.cabin_type_id, u, e.checkIn, e.checkOut)) ?? order[0];
      unitOf.set(e.uid, unit);
      occ.blocks.push({ cabinTypeId: cal.cabin_type_id, unit, from: e.checkIn, to: addDays(e.checkOut, -1) });
    }
  }
  if (changed.length)
    await sb
      .from("channel_stays")
      .upsert(
        changed.map((e) => ({
          calendar_id: cal.id,
          cabin_type_id: cal.cabin_type_id,
          unit: unitOf.get(e.uid) ?? byUid.get(e.uid)!.unit,
          external_uid: e.uid,
          check_in: e.checkIn,
          check_out: e.checkOut,
          summary: e.summary,
          removed_at: null,
        })),
        { onConflict: "calendar_id,external_uid" },
      )
      .throwOnError();

  // Lo que se canceló en Booking y aún no termina deja de ocupar. Lo pasado se conserva (historial de ocupación).
  const uids = new Set(events.map((e) => e.uid));
  const gone = existing
    .filter((s) => !s.removed_at && s.check_out > today && (o.full ? !uids.has(s.external_uid) : !!o.gone?.includes(s.external_uid)))
    .map((s) => s.id);
  if (gone.length) await sb.from("channel_stays").update({ removed_at: new Date().toISOString() }).in("id", gone).throwOnError();

  o.result.added += changed.length;
  o.result.removed += gone.length;
  const spans = fresh.map((e) => ({ cabinTypeId: cal.cabin_type_id, unit: unitOf.get(e.uid)!, checkIn: e.checkIn, checkOut: e.checkOut }));
  if (spans.length) await resolveConflicts(sb, cal, spans, o.units, o.types, today, o.result);
}

// Lee un calendario de Booking y actualiza sus fechas. Si falla no borra nada (la disponibilidad queda como estaba).
async function syncCalendar(sb: Db, cal: CalendarRow, units: Units, types: CabinType[], notifyErrors: boolean): Promise<ChannelSyncResult> {
  const result: ChannelSyncResult = { calendarId: cal.id, ok: true, events: 0, added: 0, removed: 0, moved: [], conflicts: [] };
  const today = todayISO();
  try {
    const events = (await fetchIcs(cal.import_url!)).filter(
      (e) => e.checkOut > addDays(today, -HISTORY_DAYS) && e.checkIn < addDays(today, HORIZON_DAYS) && nightsBetween(e.checkIn, e.checkOut) <= MAX_NIGHTS,
    );
    result.events = events.length;
    await applyStays(sb, cal, events, { full: true, units, types, result });
    await sb
      .from("channel_calendars")
      .update({ last_synced_at: new Date().toISOString(), last_status: "ok", last_error: "", last_event_count: events.length })
      .eq("id", cal.id)
      .throwOnError();
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    console.error(`Calendario de Booking ${cal.id}:`, e);
    Object.assign(result, { ok: false, error: message });
    await sb.from("channel_calendars").update({ last_status: "error", last_error: message }).eq("id", cal.id);
    // Se avisa una vez, cuando un calendario que funcionaba deja de leerse (los errores al enlazarlo se ven en el panel).
    if (notifyErrors && cal.last_status === "ok")
      await notify(
        sb,
        "channel_sync_failed",
        `No se pudo leer Booking.com · ${cal.label || unitName(types, cal.cabin_type_id, cal.unit)}`,
        `${message} Mientras tanto, las fechas de Booking quedan como en la última lectura.`,
        null,
      ).catch(() => {});
  }
  return result;
}

// Lee los calendarios enlazados que no se leyeron en los últimos `minAgeMs` (todos, los de un tipo o uno).
export async function syncCalendars(opts: {
  minAgeMs: number;
  notifyErrors: boolean;
  cabinTypeId?: string;
  calendarId?: string;
}): Promise<ChannelSyncResult[]> {
  const sb = createServiceClient();
  let q = sb.from("channel_calendars").select("*").not("import_url", "is", null).is("beds24_room_id", null);
  if (opts.cabinTypeId) q = q.eq("cabin_type_id", opts.cabinTypeId);
  if (opts.calendarId) q = q.eq("id", opts.calendarId);
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  const due = data.filter((c) => !c.sync_started_at || Date.parse(c.sync_started_at) < Date.now() - opts.minAgeMs);
  if (!due.length) return [];
  const { units, types } = await loadCabinTypes(sb);
  const mine = (await Promise.all(due.map(async (c) => ((await claim(sb, c, opts.minAgeMs)) ? c : null)))).filter((c) => c !== null);
  return Promise.all(mine.map((c) => syncCalendar(sb, c, units, types, opts.notifyErrors)));
}

// Para las rutas públicas: lee si hace falta, pero sin hacer esperar más de `waitMs` (el resto sigue en segundo plano
// con after() de quien llama). Nunca falla: si Booking no responde, se sigue con las fechas de la última lectura.
export function syncSoon(opts: { cabinTypeId?: string; minAgeMs: number }) {
  return syncCalendars({ ...opts, notifyErrors: true }).catch((e) => {
    console.error("Sincronización con Booking:", e);
    return [] as ChannelSyncResult[];
  });
}
export const atMost = <T>(p: Promise<T>, ms: number) => Promise.race([p, sleep(ms).then(() => null)]);

/* ───────────── Calendario que importa Booking ───────────── */

// Noches cerradas del grupo desde ayer, por reservas activas (incluidas las retenidas mientras se paga el abono),
// bloqueos o fechas de otros tipos de Booking. Nunca las de este tipo (no se le devuelve su propio calendario). Sin datos
// personales.
export async function exportCalendar(token: string, base: string): Promise<string | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const sb = createServiceClient();
  const { data: cal, error } = await sb.from("channel_calendars").select("*").eq("export_token", token).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  if (!cal) return null;
  const since = addDays(todayISO(), -1);
  // Se anota la descarga (el panel muestra cuándo Booking vio la web por última vez); si falla, igual se sirve el calendario.
  // La hora se toma antes de leer las reservas: todo lo vendido hasta ese momento va en este calendario.
  const fetchedAt = new Date().toISOString();
  const pool = poolOf(cal);
  const [{ data: rs }, { data: bs }, { data: ss }, { types }] = await Promise.all([
    sb
      .from("reservations")
      .select("unit, check_in, check_out")
      .eq("cabin_type_id", cal.cabin_type_id)
      .in("unit", pool)
      .in("status", ACTIVE_STATUSES)
      .gt("check_out", since)
      .throwOnError(),
    sb.from("blocks").select("unit, from_date, to_date").eq("cabin_type_id", cal.cabin_type_id).in("unit", pool).gte("to_date", since).throwOnError(),
    // Fechas de otros tipos de Booking que hayan quedado en estas cabañas (las de este tipo, Booking ya las conoce).
    sb
      .from("channel_stays")
      .select("unit, check_in, check_out")
      .eq("cabin_type_id", cal.cabin_type_id)
      .in("unit", pool)
      .neq("calendar_id", cal.id)
      .is("removed_at", null)
      .gt("check_out", since)
      .throwOnError(),
    loadCabinTypes(sb),
    sb.from("channel_calendars").update({ last_fetched_at: fetchedAt }).eq("id", cal.id),
  ]);
  // Booking vende una por noche de este tipo: se cierra allá cada noche en que ya no queda ninguna cabaña libre en el grupo.
  const busy = new Map<string, Set<number>>();
  const mark = (unit: number, from: string, to: string) => {
    for (let d = from < since ? since : from; d < to; d = addDays(d, 1)) {
      if (!busy.has(d)) busy.set(d, new Set());
      busy.get(d)!.add(unit);
    }
  };
  for (const r of rs) mark(r.unit, r.check_in, r.check_out);
  for (const b of bs) mark(b.unit, b.from_date, addDays(b.to_date, 1));
  for (const s of ss) mark(s.unit, s.check_in, s.check_out);
  const closed = [...busy]
    .filter(([, units]) => units.size >= pool.length)
    .map(([night]) => night)
    .sort();
  const host = new URL(base).host;
  const events: IcsEvent[] = [];
  for (const night of closed) {
    const prev = events.at(-1);
    if (prev && prev.checkOut === night) prev.checkOut = addDays(night, 1);
    else events.push({ uid: "", checkIn: night, checkOut: addDays(night, 1), summary: "No disponible" });
  }
  for (const e of events) e.uid = `cerrado-${cal.id.slice(0, 8)}-${e.checkIn}@${host}`;
  const name = pool.map((u) => unitName(types, cal.cabin_type_id, u)).join(" y ");
  return buildIcs(events, { name: `${config.name} · ${name}`, prodId: `-//${config.name}//Disponibilidad//ES` });
}
