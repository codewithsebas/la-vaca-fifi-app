import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVE_STATUSES, channelBlocks, type Occupancy, type Units } from "@/lib/booking";
import type { Database, Tables } from "@/lib/supabase/database.types";
import type {
  AdminNotification, Beds24Status, Block, CabinType, ChannelCalendar, ChannelStay, ClientEntry, ClientProfile, DocType, EmailKind, EmailRecord, EmailStatus, NotificationKind, PaymentKind, PaymentProof, PaymentProvider, PaymentRecord,
  PaymentStatus, ProofStatus, PublicPayment, PublicReservation, Quote, RateSeason, Reservation, ReservationSource, Severity, Trust,
} from "@/lib/types";
import { addDays, todayISO } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/server";
import { photoUrl } from "./site";

// Las consultas usan .throwOnError(): un fallo de la base de datos rechaza la promesa (→ 500 en route()).
export type Db = SupabaseClient<Database>;
type ReservationRow = Tables<"reservations">;

export function toCabinType(row: Tables<"cabin_types">): CabinType {
  return {
    id: row.id,
    nombre: row.nombre,
    precioPareja: row.precio_pareja,
    personaAdicional: row.persona_adicional,
    maxPersonas: row.max_personas,
    units: row.units,
    badge: row.badge,
    descripcion: row.descripcion,
    caracteristicas: row.caracteristicas,
    fotos: row.fotos.map(photoUrl),
    activa: row.activa,
    sort: row.sort,
  };
}

// Todos los domos (el panel) o solo los activos (sitio público, disponibilidad y nuevas reservas).
export async function loadCabinTypes(sb: Db, { activeOnly = false } = {}) {
  let q = sb.from("cabin_types").select("*").order("sort").order("created_at");
  if (activeOnly) q = q.eq("activa", true);
  const { data: rows } = await q.throwOnError();
  const units: Units = {};
  rows.forEach((r) => (units[r.id] = r.units));
  return { rows, types: rows.map(toCabinType), units };
}

export const toSeason = (s: Tables<"rate_seasons">): RateSeason => ({
  id: s.id,
  cabinTypeId: s.cabin_type_id,
  nombre: s.nombre,
  from: s.from_date,
  to: s.to_date,
  precioPareja: s.precio_pareja,
  personaAdicional: s.persona_adicional,
  activa: s.activa,
});

export async function loadSeasons(sb: Db, { activeOnly = false } = {}) {
  let q = sb.from("rate_seasons").select("*").order("from_date");
  if (activeOnly) q = q.eq("activa", true);
  const { data } = await q.throwOnError();
  return data.map(toSeason);
}

// Tarifas vigentes para cotizar: domos activos, unidades y temporadas activas.
export async function loadPricing(sb: Db) {
  const [{ types, units }, seasons] = await Promise.all([loadCabinTypes(sb, { activeOnly: true }), loadSeasons(sb, { activeOnly: true })]);
  return { types, units, seasons };
}

// Reservas activas, bloqueos y fechas ocupadas en Booking que tocan alguna noche entre firstNight y lastNight (inclusive).
// Las de Booking entran como bloqueos (channelBlocks): cuentan igual en toda la lógica de disponibilidad.
export async function loadOccupancy(sb: Db, firstNight: string, lastNight: string, cabinTypeId?: string): Promise<Occupancy> {
  let rq = sb
    .from("reservations")
    .select("code, cabin_type_id, unit, check_in, check_out, status")
    .in("status", ACTIVE_STATUSES)
    .lte("check_in", lastNight)
    .gt("check_out", firstNight);
  let bq = sb.from("blocks").select("cabin_type_id, unit, from_date, to_date").lte("from_date", lastNight).gte("to_date", firstNight);
  if (cabinTypeId) {
    rq = rq.eq("cabin_type_id", cabinTypeId);
    bq = bq.eq("cabin_type_id", cabinTypeId);
  }
  const [{ data: rs }, { data: bs }, stays] = await Promise.all([rq.throwOnError(), bq.throwOnError(), loadChannelStays(sb, firstNight, lastNight, cabinTypeId)]);
  return {
    reservations: rs.map((r) => ({ code: r.code, cabinTypeId: r.cabin_type_id, unit: r.unit, checkIn: r.check_in, checkOut: r.check_out, status: r.status })),
    blocks: [...bs.map((b) => ({ cabinTypeId: b.cabin_type_id, unit: b.unit, from: b.from_date, to: b.to_date })), ...channelBlocks(stays)],
  };
}

/* ───────────── Booking.com (calendarios iCal) ───────────── */

// Mientras la migración de canales no esté aplicada, las tablas no existen: se trata como «sin calendarios de Booking»
// para que el sitio y el panel sigan funcionando. Cualquier otro error sí se propaga.
export const isMissingTable = (e: unknown) => ["PGRST205", "42P01"].includes((e as { code?: string } | null)?.code ?? "");

export const toChannelStay = (s: Tables<"channel_stays">): ChannelStay => ({
  id: s.id,
  calendarId: s.calendar_id,
  cabinTypeId: s.cabin_type_id,
  unit: s.unit,
  checkIn: s.check_in,
  checkOut: s.check_out,
  summary: s.summary,
  firstSeenAt: s.first_seen_at,
  removedAt: s.removed_at,
});

// `base`: dirección pública del sitio (siteUrl), para el enlace que Booking importa.
export const toChannelCalendar = (c: Tables<"channel_calendars">, base: string): ChannelCalendar => ({
  id: c.id,
  channel: "booking",
  label: c.label,
  cabinTypeId: c.cabin_type_id,
  unit: c.unit,
  units: [c.unit, ...c.extra_units],
  importUrl: c.import_url,
  exportUrl: `${base}/api/ical/${c.export_token}`,
  lastSyncedAt: c.last_synced_at,
  lastFetchedAt: c.last_fetched_at,
  lastStatus: (c.last_status as ChannelCalendar["lastStatus"]) ?? null,
  lastError: c.last_error,
  lastEventCount: c.last_event_count,
  beds24RoomId: c.beds24_room_id,
});

// Calendarios de Booking y sus fechas desde hace un año (las canceladas también, para el historial), y el estado de la
// conexión con Beds24 (sin el token; la tabla solo la lee la clave de servicio). Para el panel.
export async function loadChannels(sb: Db, base: string): Promise<{ calendars: ChannelCalendar[]; stays: ChannelStay[]; beds24: Beds24Status | null }> {
  const [c, s, b] = await Promise.all([
    sb.from("channel_calendars").select("*").order("cabin_type_id").order("unit"),
    sb.from("channel_stays").select("*").gte("check_out", addDays(todayISO(), -400)).order("check_in"),
    createServiceClient().from("channel_credentials").select("webhook_key, last_pull_at, last_push_at, last_webhook_at, last_error, last_error_at").eq("provider", "beds24").maybeSingle(),
  ]);
  const error = c.error ?? s.error ?? b.error;
  if (error) {
    if (isMissingTable(error)) return { calendars: [], stays: [], beds24: null };
    throw error;
  }
  const cred = b.data;
  const beds24: Beds24Status | null = cred && {
    webhookUrl: `${base}/api/channels/beds24?key=${cred.webhook_key}`,
    lastPullAt: cred.last_pull_at,
    lastPushAt: cred.last_push_at,
    lastWebhookAt: cred.last_webhook_at,
    lastError: cred.last_error,
    lastErrorAt: cred.last_error_at,
  };
  return { calendars: c.data!.map((x) => toChannelCalendar(x, base)), stays: s.data!.map(toChannelStay), beds24 };
}

// Fechas de Booking vigentes (sin removed_at) que tocan alguna noche entre firstNight y lastNight.
export async function loadChannelStays(sb: Db, firstNight: string, lastNight: string, cabinTypeId?: string): Promise<ChannelStay[]> {
  let q = sb.from("channel_stays").select("*").is("removed_at", null).lte("check_in", lastNight).gt("check_out", firstNight);
  if (cabinTypeId) q = q.eq("cabin_type_id", cabinTypeId);
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return data.map(toChannelStay);
}

// Plazos de pago (retenciones sin abono, intentos sin completar y saldos sin pagar tras el check-in).
// pg_cron los aplica cada minuto; la API los aplica también antes de leer para no mostrar un estado de hace un minuto.
export async function runDeadlines() {
  await createServiceClient().rpc("run_payment_deadlines").throwOnError();
}

type PaymentRow = Tables<"payments">;

export const toPublicPayment = (p: PaymentRow): PublicPayment => ({
  reference: p.reference,
  kind: p.kind as PaymentKind,
  status: p.status as PaymentStatus,
  amount: p.amount,
  provider: p.provider as PaymentProvider,
  method: p.method,
  detail: p.status_detail,
  createdAt: p.created_at,
  expiresAt: p.expires_at,
  approvedAt: p.approved_at,
  needsRefund: p.needs_refund,
});

export const toPayment = (p: PaymentRow): PaymentRecord => ({ ...toPublicPayment(p), id: p.id, reservationCode: p.reservation_code });

export const toEmail = (e: Tables<"email_outbox">): EmailRecord => ({
  id: e.id,
  kind: e.kind as EmailKind,
  reservationCode: e.reservation_code,
  to: e.to_email,
  subject: e.subject,
  status: e.status as EmailStatus,
  attempts: e.attempts,
  lastError: e.last_error,
  sentAt: e.sent_at,
  createdAt: e.created_at,
  updatedAt: e.updated_at,
});

// Intentos de pago de una reserva para el huésped (los 8 más recientes; los manuales también cuentan como pagos).
export async function loadPublicPayments(sb: Db, code: string) {
  const { data } = await sb.from("payments").select("*").eq("reservation_code", code).order("created_at", { ascending: false }).limit(8).throwOnError();
  return data.map(toPublicPayment);
}

export function toPublic(r: ReservationRow, payments?: PublicPayment[]): PublicReservation {
  return {
    code: r.code,
    status: r.status,
    checkIn: r.check_in,
    checkOut: r.check_out,
    cabinTypeId: r.cabin_type_id,
    quote: r.quote as Quote,
    depositDueAt: r.deposit_due_at,
    depositPaidAt: r.deposit_paid_at,
    balancePaidAt: r.balance_paid_at,
    paid: r.paid_amount,
    checkedInAt: r.checked_in_at,
    balanceDueAt: r.balance_due_at,
    balanceOverdueAt: r.balance_overdue_at,
    ...(payments && { payments }),
  };
}

// Vista del huésped completa: pagos, canal en tiempo real y hora del servidor.
export async function publicView(sb: Db, r: ReservationRow): Promise<PublicReservation> {
  return { ...toPublic(r, await loadPublicPayments(sb, r.code)), guestFirstName: r.guest_full_name.split(" ")[0], liveKey: r.live_key, serverNow: new Date().toISOString() };
}

export function toReservation(r: ReservationRow & { reservation_notes?: { text: string; created_at: string }[] }): Reservation {
  return {
    ...toPublic(r),
    unit: r.unit,
    adults: r.adults,
    children: r.children,
    pet: r.pet as Reservation["pet"],
    decoration: r.decoration as Reservation["decoration"],
    estimatedArrival: r.estimated_arrival,
    guest: { fullName: r.guest_full_name, docType: r.guest_doc_type as DocType, docNumber: r.guest_doc_number, email: r.guest_email, phone: r.guest_phone, city: r.guest_city },
    specialRequests: r.special_requests,
    consents: r.consents as Reservation["consents"],
    createdAt: r.created_at,
    source: r.source as ReservationSource,
    payToken: r.pay_token,
    clientKey: r.client_key ?? `${r.guest_doc_type}:${r.guest_doc_number.toUpperCase()}`,
    notes: (r.reservation_notes ?? []).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).map((n) => ({ at: n.created_at, text: n.text })),
  };
}

export function toBlock(b: Tables<"blocks">): Block {
  return { id: b.id, cabinTypeId: b.cabin_type_id, unit: b.unit, from: b.from_date, to: b.to_date, reason: b.reason, notes: b.notes };
}

export const toProof = (p: Tables<"payment_proofs">): PaymentProof => ({
  id: p.id,
  reservationCode: p.reservation_code,
  fileName: p.file_name,
  mime: p.mime,
  size: p.size,
  note: p.note,
  status: p.status as ProofStatus,
  reviewNote: p.review_note,
  reviewedAt: p.reviewed_at,
  createdAt: p.created_at,
});

export const toNotification = (n: Tables<"admin_notifications">): AdminNotification => ({
  id: n.id,
  kind: n.kind as NotificationKind,
  title: n.title,
  body: n.body,
  reservationCode: n.reservation_code,
  readAt: n.read_at,
  createdAt: n.created_at,
});

const toEntry = (e: Tables<"client_entries">): ClientEntry => ({
  id: e.id,
  kind: e.kind as ClientEntry["kind"],
  severity: e.severity as Severity | null,
  text: e.text,
  reservationCode: e.reservation_code,
  createdAt: e.created_at,
});

// Perfiles internos de clientes con sus registros, indexados por client_key.
export async function loadClients(sb: Db, clientKey?: string) {
  let pq = sb.from("client_profiles").select("*, client_entries(*)");
  if (clientKey) pq = pq.eq("client_key", clientKey);
  const { data } = await pq.throwOnError();
  const out: Record<string, ClientProfile> = {};
  for (const p of data) {
    out[p.client_key] = {
      clientKey: p.client_key,
      rating: p.rating,
      trust: p.trust as Trust,
      tags: p.tags,
      preferences: p.preferences,
      summary: p.summary,
      updatedAt: p.updated_at,
      entries: (p.client_entries ?? []).map(toEntry).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    };
  }
  return out;
}

// 23P01: una restricción de exclusión rechazó un cruce de fechas (reservas, bloqueos o temporadas).
export const isExclusionViolation = (e: unknown) => (e as { code?: string } | null)?.code === "23P01";
