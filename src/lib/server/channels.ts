import "server-only";
import { BLOCKING_STATUSES } from "@/lib/booking";
import { config } from "@/lib/config";
import { addDays, fmtDate, nightsBetween, todayISO } from "@/lib/format";
import { buildIcs, parseIcs, type IcsEvent } from "@/lib/server/ical";
import type { Tables } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/server";
import type { ChannelCalendar, ChannelSyncResult, NotificationKind } from "@/lib/types";
import { type Db, isMissingTable } from "@/lib/server/db";
import { env } from "@/lib/server/env";

// Booking.com por calendarios iCal (extranet → Tarifas y disponibilidad → Sincronizar calendarios), en ambos sentidos.
// En Booking hay una habitación por cabaña física (una unidad cada una), así que cada calendario es una cabaña del panel.
//   Booking → panel: se lee el enlace de exportación de cada cabaña y sus noches quedan en channel_stays, que ocupan esa
//   cabaña como un bloqueo. Si caen sobre una reserva del panel que Booking aún no conocía, se avisa de una posible sobreventa.
//   Panel → Booking: /api/ical/<token> publica las noches ocupadas de la cabaña (reservas activas y bloqueos); Booking lo
//   importa a su ritmo y las cierra allá.
// Se lee cada 5 minutos (pg_cron → /api/channels/sync) y cuando el panel lo pide. sync_started_at hace de candado.

type CalendarRow = Tables<"channel_calendars">;
type StayRow = Tables<"channel_stays">;

// `base`: dirección pública del panel (siteUrl), para el enlace que Booking importa.
export function calendarOf(c: CalendarRow, base: string): ChannelCalendar {
  return {
    id: c.id,
    label: c.label,
    cabinTypeId: c.cabin_type_id,
    unit: c.unit,
    importUrl: c.import_url,
    exportUrl: `${base}/api/ical/${c.export_token}`,
    lastSyncedAt: c.last_synced_at,
    lastFetchedAt: c.last_fetched_at,
    lastStatus: (c.last_status as ChannelCalendar["lastStatus"]) ?? null,
    lastError: c.last_error,
    lastEventCount: c.last_event_count,
  };
}

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
    return !env.isProduction && u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname);
  } catch {
    return false;
  }
}

async function fetchIcs(url: string): Promise<IcsEvent[]> {
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1", "User-Agent": "La Vaca Fifi (sincronizacion de calendario)" },
    });
  } catch (e) {
    throw new Error((e as Error)?.name === "TimeoutError" ? "Booking no respondió a tiempo." : "No se pudo conectar con el enlace del calendario.");
  }
  if (!res.ok)
    throw new Error(
      res.status === 404 || res.status === 410
        ? "El enlace ya no existe (404): cópialo de nuevo desde el extranet de Booking."
        : `El enlace respondió con un error (${res.status}).`,
    );
  if (Number(res.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("El calendario es demasiado grande.");
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("El calendario es demasiado grande.");
  try {
    return parseIcs(text);
  } catch {
    throw new Error("El enlace no devuelve un calendario iCal. Usa el enlace de exportación del extranet de Booking.");
  }
}

// Fuera de producción (QA) los avisos se crean ya marcados como enviados: no salen como notificación push al celular.
async function notify(sb: Db, kind: NotificationKind, title: string, body: string, code: string | null) {
  const quiet = env.appEnv !== "pdn";
  await sb
    .from("admin_notifications")
    .insert({ kind, title: title.slice(0, 160), body: body.slice(0, 400), reservation_code: code, ...(quiet ? { pushed_at: new Date().toISOString() } : {}) })
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

// Booking a veces repite el UID en eventos con fechas distintas: la clave de cada fecha es el UID con sus noches.
const keyOf = (e: IcsEvent) => `${e.uid}|${e.checkIn}|${e.checkOut}`.slice(0, 600);

// Lo ocupado en el panel en esa cabaña (reservas activas y bloqueos) entre first y last (exclusivo), con su última edición.
async function panelBusy(sb: Db, cal: CalendarRow, first: string, last: string) {
  const [{ data: rs }, { data: bs }] = await Promise.all([
    sb
      .from("reservations")
      .select("code, check_in, check_out, updated_at")
      .eq("cabin_type_id", cal.cabin_type_id)
      .eq("unit", cal.unit)
      .in("status", BLOCKING_STATUSES)
      .lt("check_in", last)
      .gt("check_out", first)
      .throwOnError(),
    sb
      .from("blocks")
      .select("from_date, to_date, updated_at")
      .eq("cabin_type_id", cal.cabin_type_id)
      .eq("unit", cal.unit)
      .lt("from_date", last)
      .gte("to_date", first)
      .throwOnError(),
  ]);
  return [
    ...rs.map((r) => ({ code: r.code as string | null, from: r.check_in, to: r.check_out, at: r.updated_at })),
    ...bs.map((b) => ({ code: null, from: b.from_date, to: addDays(b.to_date, 1), at: b.updated_at })),
  ];
}

// Guarda las fechas de Booking de la cabaña. Lo nuevo se marca como eco si todas sus noches ya estaban ocupadas en el
// panel antes de que Booking descargara el enlace del panel (Booking las cerró por eso); si no, ocupa la cabaña y, si cae
// sobre una reserva del panel, se avisa de una posible sobreventa. Lo que ya no viene y aún no termina se canceló.
async function applyStays(sb: Db, cal: CalendarRow, events: IcsEvent[], label: string, result: ChannelSyncResult) {
  const today = todayISO();
  const { data: existing } = await sb.from("channel_stays").select("*").eq("calendar_id", cal.id).throwOnError();
  const byKey = new Map<string, StayRow>(existing.map((s) => [s.external_uid, s]));
  const incoming = new Map(events.map((e) => [keyOf(e), e]));

  const fresh = [...incoming].filter(([k]) => {
    const prev = byKey.get(k);
    return !prev || !!prev.removed_at;
  });
  const renamed = [...incoming].filter(([k, e]) => {
    const prev = byKey.get(k);
    return prev && !prev.removed_at && prev.summary !== e.summary;
  });

  if (fresh.length || renamed.length) {
    let busy: Awaited<ReturnType<typeof panelBusy>> = [];
    if (fresh.length) {
      const first = fresh.reduce((m, [, e]) => (e.checkIn < m ? e.checkIn : m), fresh[0][1].checkIn);
      const last = fresh.reduce((m, [, e]) => (e.checkOut > m ? e.checkOut : m), fresh[0][1].checkOut);
      busy = await panelBusy(sb, cal, first, last);
    }
    // Mientras Booking no haya leído el enlace del panel (al conectar la cabaña), lo que ya está ocupado en el panel son
    // las mismas reservas, que ya estaban en los dos lados: no se avisa. Después, solo es eco si el panel ya lo tenía
    // cuando Booking lo leyó; si lo ocupó después, Booking lo vendió sin saberlo: posible sobreventa.
    const fetched = cal.last_fetched_at ? Date.parse(cal.last_fetched_at) : Infinity;
    const isEcho = (e: IcsEvent) => {
      for (let d = e.checkIn; d < e.checkOut; d = addDays(d, 1)) if (!busy.some((b) => b.from <= d && d < b.to && Date.parse(b.at) < fetched)) return false;
      return true;
    };
    const rows = [...fresh.map(([k, e]) => ({ k, e, echo: isEcho(e) })), ...renamed.map(([k, e]) => ({ k, e, echo: byKey.get(k)!.echo }))];
    await sb
      .from("channel_stays")
      .upsert(
        rows.map(({ k, e, echo }) => ({
          calendar_id: cal.id,
          cabin_type_id: cal.cabin_type_id,
          unit: cal.unit,
          external_uid: k,
          check_in: e.checkIn,
          check_out: e.checkOut,
          summary: e.summary,
          echo,
          removed_at: null,
        })),
        { onConflict: "calendar_id,external_uid" },
      )
      .throwOnError();

    // Posibles sobreventas: fechas nuevas de Booking (no ecos, aún sin terminar) sobre reservas del panel. Las enlazadas a
    // una noche de Booking son esa misma estadía.
    const linked = new Set(existing.flatMap((s) => s.reservation_code ?? []));
    const warned = new Set<string>();
    for (const { e, echo } of rows.slice(0, fresh.length)) {
      if (echo || e.checkOut <= today) continue;
      for (const b of busy) {
        if (!b.code || warned.has(b.code) || !(b.from < e.checkOut && e.checkIn < b.to) || linked.has(b.code)) continue;
        warned.add(b.code);
        result.conflicts.push(b.code);
        await notify(
          sb,
          "channel_conflict",
          `Posible sobreventa con Booking.com · ${b.code}`,
          `Booking ocupó la ${label} del ${fmtDate(e.checkIn)} al ${fmtDate(e.checkOut)}, donde está la reserva ${b.code}. Revisa en el extranet si es una reserva nueva y mueve una de las dos.`,
          b.code,
        );
      }
    }
  }

  const gone = existing.filter((s) => !s.removed_at && s.check_out > today && !incoming.has(s.external_uid));
  if (gone.length)
    await sb
      .from("channel_stays")
      .update({ removed_at: new Date().toISOString() })
      .in(
        "id",
        gone.map((s) => s.id),
      )
      .throwOnError();
  // La reserva enlazada no se cancela sola: puede ser un cambio en Booking o tener pagos. Lo decide el equipo.
  for (const s of gone) {
    if (!s.reservation_code) continue;
    await notify(
      sb,
      "channel_cancelled",
      `Booking ya no tiene la reserva · ${s.reservation_code}`,
      `Booking dejó de ocupar la ${label} del ${fmtDate(s.check_in)} al ${fmtDate(s.check_out)}. Revisa en el extranet si se canceló y, si es así, cancela la reserva ${s.reservation_code} en el panel.`,
      s.reservation_code,
    );
  }

  result.added += fresh.length;
  result.removed += gone.length;
}

// Lee un calendario de Booking y actualiza sus fechas. Si falla no borra nada (la disponibilidad queda como estaba).
async function syncCalendar(sb: Db, cal: CalendarRow, notifyErrors: boolean): Promise<ChannelSyncResult> {
  const result: ChannelSyncResult = { calendarId: cal.id, ok: true, events: 0, added: 0, removed: 0, conflicts: [] };
  const today = todayISO();
  const label = cal.label || `cabaña ${cal.unit}`;
  try {
    const events = (await fetchIcs(cal.import_url!)).filter(
      (e) => e.checkOut > addDays(today, -HISTORY_DAYS) && e.checkIn < addDays(today, HORIZON_DAYS) && nightsBetween(e.checkIn, e.checkOut) <= MAX_NIGHTS,
    );
    result.events = events.length;
    await applyStays(sb, cal, events, label, result);
    await sb
      .from("channel_calendars")
      .update({ last_synced_at: new Date().toISOString(), last_status: "ok", last_error: "", last_event_count: events.length })
      .eq("id", cal.id)
      .throwOnError();
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    console.error(`Calendario de Booking ${cal.label || cal.id}:`, e);
    Object.assign(result, { ok: false, error: message });
    await sb.from("channel_calendars").update({ last_status: "error", last_error: message }).eq("id", cal.id);
    // Se avisa una vez, cuando un calendario que funcionaba deja de leerse (los errores al enlazarlo se ven en el panel).
    if (notifyErrors && cal.last_status === "ok")
      await notify(
        sb,
        "channel_sync_failed",
        `No se pudo leer Booking.com · ${label}`,
        `${message} Mientras tanto, las fechas de Booking quedan como en la última lectura.`,
        null,
      ).catch(() => {});
  }
  return result;
}

// Lee los calendarios enlazados que no se leyeron en los últimos `minAgeMs` (todos o uno).
export async function syncCalendars(opts: { minAgeMs: number; notifyErrors: boolean; calendarId?: string }): Promise<ChannelSyncResult[]> {
  const sb = createServiceClient();
  let q = sb.from("channel_calendars").select("*").not("import_url", "is", null);
  if (opts.calendarId) q = q.eq("id", opts.calendarId);
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  const due = data.filter((c) => !c.sync_started_at || Date.parse(c.sync_started_at) < Date.now() - opts.minAgeMs);
  const mine = (await Promise.all(due.map(async (c) => ((await claim(sb, c, opts.minAgeMs)) ? c : null)))).filter((c) => c !== null);
  return Promise.all(mine.map((c) => syncCalendar(sb, c, opts.notifyErrors)));
}

/* ───────────── Calendario que importa Booking ───────────── */

// Noches ocupadas de la cabaña desde ayer: reservas activas (también las retenidas mientras se paga el abono) y bloqueos.
// Nunca las que vienen de Booking (no se le devuelve su propio calendario). Sin datos personales.
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
  // La hora se toma antes de leer: todo lo ocupado hasta ese momento va en este calendario (así se reconocen los ecos).
  const fetchedAt = new Date().toISOString();
  const [{ data: rs }, { data: bs }] = await Promise.all([
    sb
      .from("reservations")
      .select("check_in, check_out")
      .eq("cabin_type_id", cal.cabin_type_id)
      .eq("unit", cal.unit)
      .in("status", BLOCKING_STATUSES)
      .gt("check_out", since)
      .throwOnError(),
    sb.from("blocks").select("from_date, to_date").eq("cabin_type_id", cal.cabin_type_id).eq("unit", cal.unit).gte("to_date", since).throwOnError(),
  ]);
  // Se anota la descarga (el panel muestra cuándo Booking leyó el panel por última vez); si falla, igual se sirve.
  await sb.from("channel_calendars").update({ last_fetched_at: fetchedAt }).eq("id", cal.id);

  const nights = new Set<string>();
  const mark = (from: string, to: string) => {
    for (let d = from < since ? since : from; d < to; d = addDays(d, 1)) nights.add(d);
  };
  for (const r of rs) mark(r.check_in, r.check_out);
  for (const b of bs) mark(b.from_date, addDays(b.to_date, 1));
  const host = new URL(base).host;
  const events: IcsEvent[] = [];
  for (const night of [...nights].sort()) {
    const prev = events.at(-1);
    if (prev && prev.checkOut === night) prev.checkOut = addDays(night, 1);
    else events.push({ uid: "", checkIn: night, checkOut: addDays(night, 1), summary: "No disponible" });
  }
  for (const e of events) e.uid = `cerrado-${cal.id.slice(0, 8)}-${e.checkIn}@${host}`;
  return buildIcs(events, { name: `${config.name} · ${cal.label}`, prodId: `-//${config.name}//Disponibilidad//ES` });
}
