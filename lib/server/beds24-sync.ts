import "server-only";
import { after } from "next/server";
import { ACTIVE_STATUSES, findUnit, type Occupancy, type Units } from "@/lib/booking";
import { addDays, fmtDate, todayISO } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/server";
import type { CabinType, ChannelSyncResult, NotificationKind } from "@/lib/types";
import { type Beds24Booking, type Beds24Client, Beds24Error, beds24Client, loadCredentials, OCCUPYING } from "./beds24";
import { applyStays, notify, type StayEvent, unitName } from "./channels";
import { type Db, isMissingTable, loadCabinTypes } from "./db";

// Booking.com en tiempo real por Beds24, en ambos sentidos:
//   Web → Beds24: antes de guardar una reserva o un bloqueo en una unidad enlazada, la app lo crea en Beds24 con
//   checkAvailability (holdRoom). Si Booking ya vendió alguna de esas noches, Beds24 lo rechaza y la web no lo vende; si
//   lo acepta, Beds24 cierra esas noches en Booking al instante. Cancelaciones, vencimientos y demás cambios los ajusta
//   pushBeds24, que la base de datos pide en cuanto cambia una reserva o un bloqueo de una unidad enlazada (y el cron).
//   Beds24 → web: cada reserva de Booking llega por webhook (en torno a un minuto) y se guarda en channel_stays, como las
//   del iCal; el cron de cada 5 minutos relee todas las vigentes por si se perdió algún aviso.

type CalendarRow = Tables<"channel_calendars">;
type LinkRow = Tables<"channel_bookings">;
type Client = NonNullable<Beds24Client>;
export type Mapped = CalendarRow & { beds24_room_id: number };
type Source = "reservation" | "block";
type Want = { source: Source; sourceId: string; cal: Mapped; checkIn: string; checkOut: string; label: string; adults?: number; children?: number };

const REF = "ecr:"; // apiReference de lo que crea la app en Beds24: «ecr:<id en channel_bookings>»
const IN_FLIGHT_MS = 2 * 60_000; // un intento pendiente más reciente que esto sigue en curso
const RETRY_MS = 30 * 60_000; // lo que Beds24 rechazó por falta de disponibilidad se reintenta pasado este tiempo
const UNAVAILABLE = "Sin disponibilidad en Beds24";

const nightsOf = (ci: string, co: string) => {
  const out: string[] = [];
  for (let d = ci; d < co; d = addDays(d, 1)) out.push(d);
  return out;
};
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);
const emptyResult = (calendarId: string): ChannelSyncResult => ({ calendarId, ok: true, events: 0, added: 0, removed: 0, moved: [], conflicts: [] });
// Lo que llega de Beds24 se guarda sin datos del huésped: solo de dónde viene.
const toEvent = (b: Beds24Booking): StayEvent => ({
  uid: `beds24:${b.id}`,
  checkIn: b.arrival,
  checkOut: b.departure,
  summary: (b.status === "black" ? "Cerrado en Beds24" : b.channel === "booking" ? "Booking.com" : b.apiSource || "Beds24").slice(0, 200),
});
// Una vez al día por aviso: un choque que sigue sin resolverse no se repite en cada repaso.
async function notifyOnce(sb: Db, kind: NotificationKind, title: string, body: string, code: string | null) {
  const { data } = await sb.from("admin_notifications").select("id").eq("kind", kind).eq("title", title.slice(0, 200)).gt("created_at", new Date(Date.now() - 864e5).toISOString()).limit(1).throwOnError();
  if (!data.length) await notify(sb, kind, title, body, code);
}
const quietly = (what: string, p: PromiseLike<unknown>): Promise<void> =>
  Promise.resolve(p).then(
    () => {},
    (e) => console.error(`Beds24 (${what}):`, e),
  );

export async function mappedRooms(sb: Db): Promise<Mapped[]> {
  const { data, error } = await sb.from("channel_calendars").select("*").not("beds24_room_id", "is", null);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return data as Mapped[];
}

/* ───────────── Web → Beds24 ───────────── */

// Crea en Beds24 (solo si la habitación está libre) lo que la app va a ocupar. Queda pending hasta que se confirme.
// null: Booking ya tiene alguna de esas noches.
async function create(sb: Db, client: Client, w: Want) {
  const { data: row, error } = await sb
    .from("channel_bookings")
    .insert({ calendar_id: w.cal.id, source: w.source, source_id: w.sourceId, check_in: w.checkIn, check_out: w.checkOut })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new Beds24Error("Ya hay un cambio en curso con Beds24 para esta reserva.");
    throw error;
  }
  let res;
  try {
    res = await client.create({
      roomId: w.cal.beds24_room_id,
      arrival: w.checkIn,
      departure: w.checkOut,
      status: w.source === "block" ? "black" : "confirmed",
      apiReference: REF + row.id,
      label: w.label,
      numAdult: w.adults,
      numChild: w.children,
    });
  } catch (e) {
    // Puede que Beds24 sí la haya creado (p. ej. si tardó en responder): queda pending y el repaso lo averigua.
    await sb.from("channel_bookings").update({ last_error: errText(e) }).eq("id", row.id);
    throw e;
  }
  if (!res.ok) {
    await sb.from("channel_bookings").update({ state: "cancelled", last_error: `${UNAVAILABLE}: ${res.message}`.slice(0, 500) }).eq("id", row.id).throwOnError();
    return null;
  }
  await sb.from("channel_bookings").update({ beds24_id: res.id, last_error: "" }).eq("id", row.id).throwOnError();
  return { ...row, beds24_id: res.id };
}

async function release(sb: Db, client: Client, link: LinkRow) {
  if (link.beds24_id) await client.cancel(link.beds24_id);
  await sb.from("channel_bookings").update({ state: "cancelled", last_error: "" }).eq("id", link.id).throwOnError();
}

export type Hold = { commit: () => Promise<void>; release: () => Promise<void> };
const NOOP: Hold = { commit: async () => {}, release: async () => {} };

// Retiene en Beds24 las noches [checkIn, checkOut) de una unidad antes de que la app las guarde (si la unidad no se vende
// en Booking, no hace nada). null: Booking ya tiene alguna de esas noches. Lanza un error si Beds24 no responde: quien
// llama no debe vender esa unidad. commit() cuando la app guardó el cambio; release() si no lo pudo guardar. Ninguno falla:
// si algo queda a medias, el repaso (pushBeds24) lo corrige.
export async function holdRoom(x: Omit<Want, "cal"> & { cabinTypeId: string; unit: number }): Promise<Hold | null> {
  const sb = createServiceClient();
  const cal = (await mappedRooms(sb)).find((c) => c.cabin_type_id === x.cabinTypeId && c.unit === x.unit);
  if (!cal) return NOOP;
  const client = await beds24Client(sb);
  if (!client) throw new Beds24Error("Beds24 no está conectado.");
  const { data: live } = await sb.from("channel_bookings").select("*").eq("source", x.source).eq("source_id", x.sourceId).in("state", ["pending", "active"]).throwOnError();

  // Ya está en esa habitación: solo cambian las noches, y las que se suman tienen que estar libres en Beds24.
  const same = live.find((l) => l.calendar_id === cal.id && l.beds24_id && (l.state === "active" || Date.now() - Date.parse(l.created_at) > IN_FLIGHT_MS));
  if (same) {
    if (same.check_in === x.checkIn && same.check_out === x.checkOut) return NOOP;
    const added = nightsOf(x.checkIn, x.checkOut).filter((n) => !(same.check_in <= n && n < same.check_out));
    if (!(await client.free(cal.beds24_room_id, added))) return null;
    await client.move(same.beds24_id!, x.checkIn, x.checkOut);
    return {
      commit: () => quietly("guardar fechas", sb.from("channel_bookings").update({ check_in: x.checkIn, check_out: x.checkOut, state: "active" }).eq("id", same.id).throwOnError()),
      release: () => quietly("devolver fechas", client.move(same.beds24_id!, same.check_in, same.check_out)),
    };
  }

  const row = await create(sb, client, { ...x, cal });
  if (!row) return null;
  return {
    // Si cambió de unidad, lo que tenía en la otra unidad enlazada se libera.
    commit: () =>
      quietly(
        "confirmar",
        (async () => {
          await sb.from("channel_bookings").update({ state: "active" }).eq("id", row.id).throwOnError();
          for (const l of live) if (l.calendar_id !== cal.id) await release(sb, client, l);
        })(),
      ),
    release: () => quietly("liberar", release(sb, client, row)),
  };
}

// Primera unidad libre en la app que también lo esté en Beds24 (si se vende en Booking), ya retenida allá.
// hold null: no hay ninguna; channelDown: alguna no se pudo confirmar porque Beds24 no respondió.
export async function claimUnit(
  occ: Occupancy,
  x: Omit<Want, "cal"> & { cabinTypeId: string; units: number; ignoreCode?: string; prefer?: number[] },
): Promise<{ unit: number; hold: Hold } | { unit: 0; hold: null; channelDown: boolean }> {
  const work: Occupancy = { reservations: occ.reservations, blocks: [...occ.blocks] };
  let channelDown = false;
  for (;;) {
    const unit = findUnit(work, x.units, x.cabinTypeId, x.checkIn, x.checkOut, x.ignoreCode, x.prefer);
    if (!unit) return { unit: 0, hold: null, channelDown };
    try {
      const hold = await holdRoom({ ...x, unit });
      if (hold) return { unit, hold };
      // Booking vendió esas noches y la app aún no lo sabe: se relee Beds24 después de responder.
      after(() => quietly("releer", syncBeds24("all")));
    } catch (e) {
      console.error(`Beds24 (retener ${x.sourceId}):`, e);
      channelDown = true;
    }
    work.blocks.push({ cabinTypeId: x.cabinTypeId, unit, from: x.checkIn, to: addDays(x.checkOut, -1) });
  }
}

// Ajusta Beds24 a lo que la app tiene ocupado en las unidades enlazadas: crea lo que falta (solo si está libre), mueve lo
// que cambió de noches y libera lo cancelado, vencido, borrado o cambiado de unidad. Lo que ya pasó no se toca.
async function pushBeds24(sb: Db, client: Client, cals: Mapped[], types: CabinType[]) {
  const today = todayISO();
  const calOf = new Map(cals.map((c) => [`${c.cabin_type_id}:${c.unit}`, c]));
  const [{ data: rs }, { data: bs }, { data: links }, { data: refused }] = await Promise.all([
    sb.from("reservations").select("code, cabin_type_id, unit, check_in, check_out, adults, children").in("status", ACTIVE_STATUSES).gt("check_out", today).throwOnError(),
    sb.from("blocks").select("id, cabin_type_id, unit, from_date, to_date, reason").gte("to_date", today).throwOnError(),
    sb.from("channel_bookings").select("*").in("state", ["pending", "active"]).throwOnError(),
    sb.from("channel_bookings").select("source, source_id, calendar_id, updated_at").eq("state", "cancelled").like("last_error", `${UNAVAILABLE}%`).gt("updated_at", new Date(Date.now() - RETRY_MS).toISOString()).throwOnError(),
  ]);
  const want = new Map<string, Want>();
  for (const r of rs) {
    const cal = calOf.get(`${r.cabin_type_id}:${r.unit}`);
    if (cal) want.set(`reservation:${r.code}`, { source: "reservation", sourceId: r.code, cal, checkIn: r.check_in, checkOut: r.check_out, label: `Web ${r.code}`, adults: r.adults, children: r.children });
  }
  for (const b of bs) {
    const cal = calOf.get(`${b.cabin_type_id}:${b.unit}`);
    if (cal) want.set(`block:${b.id}`, { source: "block", sourceId: b.id, cal, checkIn: b.from_date, checkOut: addDays(b.to_date, 1), label: `Bloqueo · ${b.reason}` });
  }
  const keyOf = (l: { source: string; source_id: string }) => `${l.source}:${l.source_id}`;
  const covered = new Set<string>(); // «clave|habitación» con algo vivo en Beds24 (o en curso)
  const conflicts: Want[] = [];
  // Un fallo con una reserva no detiene las demás: se sigue y al final se informa el primero.
  const errors: unknown[] = [];
  const each = (fn: () => Promise<void>) => fn().catch((e) => void errors.push(e));

  for (const l of links)
    await each(async () => {
      const w = want.get(keyOf(l));
      if (w?.cal.id === l.calendar_id) covered.add(`${keyOf(l)}|${l.calendar_id}`);
      if (l.state === "pending") {
        // Otro proceso lo está creando: no se toca.
        if (Date.now() - Date.parse(l.created_at) < IN_FLIGHT_MS) return void covered.add(`${keyOf(l)}|${l.calendar_id}`);
        // Un intento que se cortó: se averigua en Beds24 si quedó creado.
        const id = l.beds24_id ?? (await client.byApiReference(REF + l.id))?.id ?? null;
        if (!id) {
          covered.delete(`${keyOf(l)}|${l.calendar_id}`);
          await sb.from("channel_bookings").update({ state: "cancelled" }).eq("id", l.id).throwOnError();
          return;
        }
        await sb.from("channel_bookings").update({ beds24_id: id, state: "active" }).eq("id", l.id).throwOnError();
        Object.assign(l, { beds24_id: id, state: "active" });
      }
      if (w?.cal.id === l.calendar_id) {
        if (w.checkIn === l.check_in && w.checkOut === l.check_out) return;
        const save = () => sb.from("channel_bookings").update({ check_in: w.checkIn, check_out: w.checkOut }).eq("id", l.id).throwOnError();
        // Cambió de noches en la misma unidad. Si ya se movió en Beds24 (holdRoom, a punto de confirmarlo), solo se anota;
        // si no, las noches que se suman tienen que estar libres allá.
        const [now] = await client.byIds([l.beds24_id!]);
        if (now && now.arrival === w.checkIn && now.departure === w.checkOut) return void (await save());
        const added = nightsOf(w.checkIn, w.checkOut).filter((n) => !(l.check_in <= n && n < l.check_out));
        if (!(await client.free(w.cal.beds24_room_id, added))) return void conflicts.push(w);
        await client.move(l.beds24_id!, w.checkIn, w.checkOut);
        await save();
        return;
      }
      if (!w && l.check_out <= today) return; // ya pasó: queda como historial
      await release(sb, client, l);
    });

  for (const [key, w] of want)
    await each(async () => {
      if (covered.has(`${key}|${w.cal.id}`)) return;
      // Beds24 la rechazó hace poco (Booking tiene esas noches): se reintenta más tarde, por si allá la cancelan.
      if (refused.some((f) => keyOf(f) === key && f.calendar_id === w.cal.id)) return;
      const row = await create(sb, client, w);
      if (row) await sb.from("channel_bookings").update({ state: "active" }).eq("id", row.id).throwOnError();
      else conflicts.push(w);
    });

  for (const w of conflicts) {
    const where = `${w.cal.label || unitName(types, w.cal.cabin_type_id, w.cal.unit)} del ${fmtDate(w.checkIn)} al ${fmtDate(w.checkOut)}`;
    if (w.source === "reservation")
      await notifyOnce(
        sb,
        "channel_conflict",
        `Posible sobreventa con Booking.com · ${w.sourceId}`,
        `Beds24 no pudo cerrar ${where} para la reserva ${w.sourceId}: Booking.com ya tiene alguna de esas noches. Reubícala en otra cabaña o revisa la reserva en Beds24.`,
        w.sourceId,
      );
    else
      await notifyOnce(sb, "channel_conflict", `Bloqueo sin cerrar en Booking.com · ${where}`, `El bloqueo de ${where} no se pudo cerrar en Booking.com porque allá ya hay una reserva en esas noches.`, null);
  }
  if (errors.length) throw errors[0];
  return conflicts.map((w) => w.sourceId);
}

/* ───────────── Beds24 → web ───────────── */

// Relee todas las reservas vigentes de las habitaciones enlazadas (las de Booking y los cierres hechos en Beds24).
async function pullBeds24(sb: Db, client: Client, cals: Mapped[], units: Units, types: CabinType[]) {
  const [bookings, { data: ours }] = await Promise.all([
    client.upcoming(
      cals.map((c) => c.beds24_room_id),
      addDays(todayISO(), -1),
    ),
    sb.from("channel_bookings").select("beds24_id").not("beds24_id", "is", null).throwOnError(),
  ]);
  const mine = new Set(ours.map((o) => o.beds24_id));
  const outside = bookings.filter((b) => !mine.has(b.id) && !b.apiReference?.startsWith(REF));
  const results: ChannelSyncResult[] = [];
  for (const cal of cals) {
    const result = emptyResult(cal.id);
    const events = outside.filter((b) => b.roomId === cal.beds24_room_id && OCCUPYING.includes(b.status) && b.departure > b.arrival).map(toEvent);
    result.events = events.length;
    await applyStays(sb, cal, events, { full: true, source: "beds24:", units, types, result });
    results.push(result);
  }
  return results;
}

// Aviso de Beds24 (webhook v2): una reserva nueva, cambiada o cancelada. Las que creó la app se ignoran.
export async function beds24Webhook(payload: unknown): Promise<ChannelSyncResult[]> {
  const sb = createServiceClient();
  await sb.from("channel_credentials").update({ last_webhook_at: new Date().toISOString() }).eq("provider", "beds24").throwOnError();
  const b = (payload as { booking?: Partial<Beds24Booking> } | null)?.booking;
  if (!b || typeof b.id !== "number" || b.apiReference?.startsWith(REF)) return [];
  const cals = await mappedRooms(sb);
  if (!cals.length) return [];
  const { data: ours } = await sb.from("channel_bookings").select("id").eq("beds24_id", b.id).limit(1).throwOnError();
  if (ours.length) return [];

  let booking = b as Beds24Booking;
  // Si el aviso no trae lo necesario, se pide la reserva a Beds24.
  if (!b.roomId || !b.arrival || !b.departure || !b.status) {
    const client = await beds24Client(sb);
    const [full] = client ? await client.byIds([b.id]) : [];
    if (!full) return [];
    booking = full;
  }
  const { units, types } = await loadCabinTypes(sb);
  const occupying = OCCUPYING.includes(booking.status) && booking.departure > booking.arrival;
  const results: ChannelSyncResult[] = [];
  for (const cal of cals) {
    // En su habitación se agrega o actualiza; en las demás se quita (si cambió de habitación o se canceló).
    const here = occupying && cal.beds24_room_id === booking.roomId;
    const result = emptyResult(cal.id);
    await applyStays(sb, cal, here ? [toEvent(booking)] : [], { full: false, gone: here ? [] : [`beds24:${booking.id}`], units, types, result });
    if (result.added || result.removed || result.moved.length || result.conflicts.length) results.push(result);
  }
  return results;
}

/* ───────────── Repaso ───────────── */

export type Beds24Sync = { ok: true; results: ChannelSyncResult[]; conflicts: string[] } | { ok: false; error: string };

// 'push': ajustar Beds24 tras un cambio en la app. 'all' (cron y «Sincronizar ahora»): además releer las reservas
// vigentes de Beds24 (primero, para conocer lo de Booking antes de crear nada). null: Beds24 no está en uso.
export async function syncBeds24(mode: "push" | "all" = "all"): Promise<Beds24Sync | null> {
  const sb = createServiceClient();
  const cals = await mappedRooms(sb);
  const cred = cals.length ? await loadCredentials(sb) : null;
  const client = cred ? await beds24Client(sb) : null;
  if (!cred || !client) return null;
  try {
    const { units, types } = await loadCabinTypes(sb);
    const results = mode === "all" ? await pullBeds24(sb, client, cals, units, types) : [];
    const conflicts = await pushBeds24(sb, client, cals, types);
    const now = new Date().toISOString();
    await sb
      .from("channel_credentials")
      .update({ ...(mode === "all" && { last_pull_at: now }), last_push_at: now, last_error: "", last_error_at: null })
      .eq("provider", "beds24")
      .throwOnError();
    return { ok: true, results, conflicts };
  } catch (e) {
    const message = errText(e);
    console.error("Beds24:", e);
    await sb.from("channel_credentials").update({ last_error: message, last_error_at: new Date().toISOString() }).eq("provider", "beds24");
    // Se avisa una vez, cuando la conexión que funcionaba deja de responder.
    if (!cred.last_error)
      await notify(sb, "channel_sync_failed", "No se pudo sincronizar con Beds24", `${message} Mientras tanto, la web no vende las cabañas de Booking.com que Beds24 no confirme.`, null).catch(() => {});
    return { ok: false, error: message };
  }
}
