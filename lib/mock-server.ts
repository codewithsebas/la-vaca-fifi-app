// Adaptador simulado: implementa el contrato de la API sobre localStorage.
// Se activa con NEXT_PUBLIC_USE_MOCK_API=1 (demos sin backend). Solo corre en el navegador.
import {
  availability, channelBlocks, clashingReservations, computeQuote, depositDueAt, findUnit, newReservationCode, normalizePhone, slugify, unavailableDates, unitFree, validateManualReservation, validateReservation, webFirst, withTotal,
} from "./booking";
import { config } from "./config";
import { addDays, sleep, todayISO } from "./format";
import { BALANCE_MINUTES, HOLD_OPTIONS, manualDueAt, payPath } from "./payments";
import { defaultContent, defaultTexts, mergeTexts, type SiteContent, type SiteService } from "./site";
import { mergeTheme } from "./theme";
import type {
  AdminNotification, ApiResult, Block, BlockInput, CabinInput, CabinType, ChannelCalendar, ChannelCalendarInput, ChannelStay, ClientProfile, EmailRecord, NotificationKind, PaymentKind, PaymentRecord, PaymentStatus, PublicReservation, RateSeason, Rates, Reservation,
  ManualReservationInput, ReservationInput, SeasonInput, SiteInput,
} from "./types";

export type MockSettings = { post: "success" | "409" | "422" | "429" | "network" | "slow" };

const DBK = "vf-mock-db-v1";
// Otras pestañas escuchan esta clave (evento storage) para simular la disponibilidad en tiempo real.
export const MOCK_DB_KEY = DBK;
const SETTINGS_KEY = "vf-mock-settings";
const AUTH_KEY = "vf-admin";

type Db = {
  reservations: Reservation[];
  blocks: Block[];
  cabins: CabinType[];
  seasons: RateSeason[];
  clients: Record<string, ClientProfile>;
  notifications: AdminNotification[];
  payments: PaymentRecord[];
  emails: EmailRecord[];
  idem: Record<string, string>;
  site?: SiteContent;
  // Booking.com (se agregan al cargar si la base simulada se creó antes de existir).
  channelCalendars?: ChannelCalendar[];
  channelStays?: ChannelStay[];
};

// Escenarios de prueba para el envío: localStorage.setItem('vf-mock-settings', '{"post":"409"}')
function mockSettings(): MockSettings {
  try {
    return { post: "success", ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { post: "success" };
  }
}

const seedCabins = (): CabinType[] =>
  Object.values(config.cabins).map((c, i) => ({
    id: c.id, nombre: c.full, precioPareja: c.couple, personaAdicional: c.extra, maxPersonas: c.max, units: config.unidades[c.id] ?? 1,
    badge: c.badge, descripcion: c.description, caracteristicas: c.features, fotos: [], activa: true, sort: i + 1,
  }));

const activeTypes = (db: Db) => db.cabins.filter((c) => c.activa).sort((a, b) => a.sort - b.sort);
const unitsOf = (db: Db) => Object.fromEntries(db.cabins.map((c) => [c.id, c.units])) as Record<string, number>;
const quoteFor = (db: Db, typeId: string, ci: string, co: string, guests: number) => computeQuote(db.cabins.find((t) => t.id === typeId)!, ci, co, guests, db.seasons);
const keyOf = (r: Pick<Reservation, "guest">) => `${r.guest.docType}:${r.guest.docNumber.toUpperCase()}`;

function notify(db: Db, kind: NotificationKind, title: string, body: string, code: string | null, read = false) {
  const id = (db.notifications[0]?.id ?? 0) + 1;
  db.notifications.unshift({ id, kind, title, body, reservationCode: code, readAt: read ? new Date().toISOString() : null, createdAt: new Date().toISOString() });
  db.notifications = db.notifications.slice(0, 150);
}

function seed(): Db {
  const t = todayISO();
  const now = Date.now();
  const mk = (code: string, status: Reservation["status"], type: string, unit: number, inOff: number, n: number, g: number, name: string, due: number, doc: string, createdDaysAgo: number): Reservation => {
    const ci = addDays(t, inOff);
    const created = new Date(now - createdDaysAgo * 864e5).toISOString();
    const paid = ["confirmed", "rescheduled", "checked_in", "completed", "cancelled"].includes(status) && code !== "VF-D0106" ? created : null;
    return {
      code, status, cabinTypeId: type, unit, checkIn: ci, checkOut: addDays(ci, n), adults: g, children: 0,
      pet: { hasPet: false, smallBreedConfirmed: false }, decoration: { requested: false, occasion: "", notes: "" }, estimatedArrival: "16:00",
      guest: { fullName: name, docType: "CC", docNumber: doc, email: code.toLowerCase() + "@ejemplo.com", phone: "+57 300 000 00" + code.slice(-2), city: "Ibagué" },
      specialRequests: "", consents: { policies: true, dataProcessing: true, marketing: false },
      quote: null as unknown as Reservation["quote"], depositDueAt: new Date(now + due * 36e5).toISOString(), createdAt: created, notes: [], demo: true,
      depositPaidAt: paid, balancePaidAt: status === "completed" ? addDays(ci, 0) + "T20:00:00.000Z" : null, clientKey: "",
      paid: 0, checkedInAt: null, balanceDueAt: null, balanceOverdueAt: null,
    };
  };
  const rs = [
    mk("VF-D0101", "confirmed", "doble", 1, 0, 2, 2, "Ana Gómez", 0, "1010101010", 9),
    mk("VF-D0102", "checked_in", "familiar", 1, -2, 2, 4, "Luis Martínez", 0, "2020202020", 14),
    mk("VF-D0103", "pending_deposit", "doble", 1, 3, 2, 2, "Marta Rojas", 18, "3030303030", 1),
    mk("VF-D0104", "pending_deposit", "familiar", 1, 6, 3, 2, "Jorge Silva", 3.5, "4040404040", 0),
    mk("VF-D0105", "confirmed", "doble", 1, 8, 2, 2, "Ana Gómez", 0, "1010101010", 4),
    mk("VF-D0106", "cancelled", "doble", 1, 9, 2, 2, "Pablo Ríos", 0, "6060606060", 6),
    mk("VF-D0107", "completed", "doble", 1, -6, 2, 2, "Clara Vélez", 0, "7070707070", 25),
    mk("VF-D0108", "rescheduled", "familiar", 1, 14, 2, 4, "Tomás Arango", 0, "8080808080", 20),
    mk("VF-D0109", "expired", "doble", 1, 6, 1, 2, "Irene Cano", -2, "9090909090", 3),
    mk("VF-D0110", "completed", "familiar", 1, -40, 3, 2, "Ana Gómez", 0, "1010101010", 60),
    mk("VF-D0111", "completed", "familiar", 1, -25, 2, 4, "Luis Martínez", 0, "2020202020", 45),
  ];
  const db: Db = {
    reservations: rs,
    blocks: [{ id: "b1", cabinTypeId: "familiar", unit: 1, from: addDays(t, 20), to: addDays(t, 22), reason: "Mantenimiento", notes: "Pintura del balcón" }],
    cabins: seedCabins(),
    seasons: [{ id: "s1", cabinTypeId: "familiar", nombre: "Temporada alta de fin de año", from: `${t.slice(0, 4)}-12-15`, to: `${Number(t.slice(0, 4)) + 1}-01-15`, precioPareja: 550000, personaAdicional: 60000, activa: true }],
    clients: {
      "CC:1010101010": { clientKey: "CC:1010101010", rating: 5, trust: "alta", tags: ["Paga puntual", "Celebra aniversario"], preferences: "Prefiere la Cabaña Familiar con Vista.", summary: "Huésped frecuente, muy cuidadosa.", updatedAt: new Date().toISOString(), entries: [] },
    },
    notifications: [],
    payments: [],
    emails: [],
    idem: {},
  };
  rs.forEach((r) => {
    r.quote = quoteFor(db, r.cabinTypeId, r.checkIn, r.checkOut, r.adults + r.children);
    r.clientKey = keyOf(r);
    r.paid = (r.depositPaidAt ? r.quote.deposit : 0) + (r.balancePaidAt ? r.quote.balance : 0);
    if (r.status === "checked_in" || r.status === "completed") r.checkedInAt = r.balancePaidAt ?? new Date(now - 20 * 6e4).toISOString();
    if (r.depositPaidAt) db.payments.push(mockPayment(r, "deposit", "approved", "manual", r.depositPaidAt, r.quote.deposit));
    if (r.balancePaidAt) db.payments.push(mockPayment(r, "balance", "approved", "manual", r.balancePaidAt, r.quote.balance));
  });
  // Luis Martínez está en estadía con el saldo por pagar (vence en 40 minutos).
  const stay = rs.find((r) => r.code === "VF-D0102")!;
  stay.balanceDueAt = new Date(now + 40 * 6e4).toISOString();
  // Las retenciones de la demo vencen en minutos, como en el sitio real.
  rs.filter((r) => r.status === "pending_deposit").forEach((r, i) => (r.depositDueAt = new Date(now + (25 - i * 10) * 6e4).toISOString()));
  notify(db, "reservation_confirmed", "Nueva reserva confirmada · Ana Gómez", "Cabaña Doble · VF-D0105", "VF-D0105");
  return db;
}

// Secreto del enlace de pago simulado (24 caracteres base64url, como en el servidor).
const mockToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))).replace(/\+/g, "-").replace(/\//g, "_");
const randomTail = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");

function mockPayment(r: Reservation, kind: PaymentKind, status: PaymentStatus, provider: "simulado" | "manual", at = new Date().toISOString(), amount?: number): PaymentRecord {
  return {
    id: crypto.randomUUID(), reservationCode: r.code, reference: `${r.code}-${kind === "deposit" ? "A" : kind === "full" ? "T" : "S"}-${provider === "manual" ? "M" : ""}${randomTail()}`, kind, status,
    amount: amount ?? (kind === "deposit" ? r.quote.deposit : r.quote.total - r.paid), provider, method: provider === "manual" ? "MANUAL" : "", detail: provider === "manual" ? "Registrado por el equipo" : "",
    createdAt: at, expiresAt: kind === "balance" ? (r.status === "checked_in" ? r.balanceDueAt : new Date(Date.now() + 36e5).toISOString()) : r.depositDueAt, approvedAt: status === "approved" ? at : null, needsRefund: false,
  };
}

// Mismas reglas que apply_approved_payment en la base de datos.
function applyPayment(db: Db, p: PaymentRecord): "confirmed" | "balance_paid" | "duplicate" | "not_applicable" {
  const r = db.reservations.find((x) => x.code === p.reservationCode)!;
  const now = new Date().toISOString();
  if (p.kind === "deposit" || p.kind === "full") {
    if (r.depositPaidAt) return "duplicate";
    if (r.status !== "pending_deposit" && r.status !== "expired") return "not_applicable";
    Object.assign(r, { status: "confirmed", depositPaidAt: now, paid: r.paid + p.amount, ...(p.kind === "full" && { balancePaidAt: now }) });
    notify(db, "reservation_confirmed", `Nueva reserva confirmada · ${r.guest.fullName}`, `${db.cabins.find((c) => c.id === r.cabinTypeId)?.nombre ?? ""} · ${r.code}`, r.code, p.provider === "manual");
    if (!db.emails.some((e) => e.reservationCode === r.code && e.kind === "reservation_confirmed"))
      db.emails.unshift({ id: crypto.randomUUID(), kind: "reservation_confirmed", reservationCode: r.code, to: r.guest.email, subject: `Reserva confirmada ${r.code}`, status: "sent", attempts: 1, lastError: "", sentAt: now, createdAt: now, updatedAt: now });
  } else {
    if (r.balancePaidAt || r.paid >= r.quote.total) return "duplicate";
    if (!["confirmed", "rescheduled", "checked_in"].includes(r.status)) return "not_applicable";
    Object.assign(r, { balancePaidAt: now, paid: r.paid + p.amount });
    notify(db, "balance_paid", `Saldo pagado · ${r.code}`, r.guest.fullName, r.code, p.provider === "manual");
  }
  const sameStage = (k: PaymentKind) => (p.kind === "balance" ? k === "balance" : k !== "balance");
  db.payments.forEach((x) => x !== p && x.reservationCode === r.code && sameStage(x.kind) && x.status === "initiated" && Object.assign(x, { status: "expired", detail: "Ya no es necesario: el pago se completó con otro intento" }));
  return p.kind === "balance" ? "balance_paid" : "confirmed";
}

// Booking.com simulado: las dos cabañas de la demo enlazadas y algunas noches vendidas allá.
function seedChannels(d: Db) {
  const t = todayISO();
  const ago = (min: number) => new Date(Date.now() - min * 6e4).toISOString();
  const cal = (id: string, cabinTypeId: string, unit: number, label: string, events: number): ChannelCalendar => ({
    id, channel: "booking", label, cabinTypeId, unit, units: [unit], importUrl: `https://admin.booking.com/hotel/hoteladmin/ical.html?t=demo-${id}`,
    exportUrl: `${location.origin}/api/ical/demo${id}`, lastSyncedAt: ago(3), lastFetchedAt: ago(40), lastStatus: "ok", lastError: "", lastEventCount: events, beds24RoomId: null,
  });
  const stay = (id: string, calendarId: string, cabinTypeId: string, unit: number, inOff: number, n: number, removed = false): ChannelStay => ({
    id, calendarId, cabinTypeId, unit, checkIn: addDays(t, inOff), checkOut: addDays(t, inOff + n), summary: "CLOSED - Not available", firstSeenAt: ago(60 * 24), removedAt: removed ? ago(60 * 20) : null,
  });
  d.channelCalendars ??= [cal("c1", "doble", 1, "Habitación Doble con baño privado", 1), cal("c2", "familiar", 1, "Habitación Familiar con baño privado", 1)];
  d.channelStays ??= [stay("cs1", "c1", "doble", 1, 12, 2), stay("cs2", "c2", "familiar", 1, 10, 2), stay("cs3", "c2", "familiar", 1, 17, 2, true)];
  return d as Db & Required<Pick<Db, "channelCalendars" | "channelStays">>;
}
const channelsOf = (d: Db) => {
  const c = seedChannels(d);
  return { calendars: c.channelCalendars, stays: c.channelStays };
};

// Contenido del sitio simulado; los datos guardados antes de existir los servicios o los colores toman los de por defecto.
const siteOf = (d: Db): SiteContent => ({ ...defaultContent, ...d.site, services: d.site?.services ?? defaultContent.services, theme: mergeTheme(d.site?.theme) });

function save(d: Db) {
  try {
    localStorage.setItem(DBK, JSON.stringify(d));
  } catch {}
}
function load(): Db {
  try {
    const d = JSON.parse(localStorage.getItem(DBK) || "null");
    if (d) return d;
  } catch {}
  const d = seed();
  save(d);
  return d;
}

const pub = (db: Db, r: Reservation): PublicReservation => ({
  code: r.code, status: r.status, checkIn: r.checkIn, checkOut: r.checkOut, cabinTypeId: r.cabinTypeId, quote: r.quote, depositDueAt: r.depositDueAt,
  depositPaidAt: r.depositPaidAt, balancePaidAt: r.balancePaidAt, paid: r.paid, checkedInAt: r.checkedInAt, balanceDueAt: r.balanceDueAt, balanceOverdueAt: r.balanceOverdueAt,
  guestFirstName: r.guest.fullName.split(" ")[0], liveKey: "simulado", serverNow: new Date().toISOString(),
  payments: db.payments.filter((p) => p.reservationCode === r.code).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 8),
});

// Mismos plazos que run_payment_deadlines.
function expire(db: Db) {
  let changed = false;
  const now = Date.now();
  db.reservations.forEach((r) => {
    const processing = db.payments.some((p) => p.reservationCode === r.code && p.kind !== "balance" && p.status === "pending");
    if (r.status === "pending_deposit" && Date.parse(r.depositDueAt) < now && (!processing || Date.parse(r.depositDueAt) < now - 2 * 36e5)) {
      r.status = "expired";
      changed = true;
    }
    if (r.status === "checked_in" && !r.balancePaidAt && r.balanceDueAt && Date.parse(r.balanceDueAt) < now && !r.balanceOverdueAt) {
      r.balanceOverdueAt = new Date().toISOString();
      notify(db, "balance_overdue", `Saldo vencido sin pagar · ${r.code}`, r.guest.fullName, r.code);
      changed = true;
    }
  });
  db.payments.forEach((p) => {
    if (p.status === "initiated" && p.expiresAt && Date.parse(p.expiresAt) < now) {
      Object.assign(p, { status: "expired", detail: "Venció sin completar el pago" });
      changed = true;
    }
  });
  if (changed) save(db);
}

const occ = (db: Db) => ({
  reservations: db.reservations.map((r) => ({ code: r.code, cabinTypeId: r.cabinTypeId, unit: r.unit, checkIn: r.checkIn, checkOut: r.checkOut, status: r.status })),
  blocks: [...db.blocks, ...channelBlocks(channelsOf(db).stays)],
});

export type MockRequest = { query?: Record<string, string | number | undefined>; body?: unknown; headers?: Record<string, string> };

export async function mockRequest(method: string, path: string, opts: MockRequest): Promise<ApiResult<unknown>> {
  const st = mockSettings();
  const q = (opts.query || {}) as Record<string, string>;
  const isAdmin = path.startsWith("/admin");
  await sleep(method === "POST" && path === "/reservations" && st.post === "slow" ? 5000 : isAdmin ? 300 : 700);
  const db = load();
  expire(db);
  const ok = (data: unknown) => ({ status: 200, data });
  const invalid = (fields: Record<string, string>) => ({ status: 422, data: { error: "VALIDATION_ERROR", fields } });

  if (method === "GET" && path === "/cabin-types") return ok(activeTypes(db));

  if (method === "GET" && path === "/availability/calendar")
    return ok({ unavailableDates: unavailableDates(occ(db), unitsOf(db)[q.cabinTypeId] ?? 0, q.cabinTypeId, q.from, q.to) });

  if (method === "GET" && path === "/availability")
    return ok(availability(occ(db), activeTypes(db), unitsOf(db), q.checkIn, q.checkOut, (+q.adults || 0) + (+q.children || 0), db.seasons));

  if (method === "POST" && path === "/reservations") {
    const body = opts.body as ReservationInput;
    if (st.post === "network") throw { type: "network", message: "Simulado: sin conexión" };
    if (st.post === "429") return { status: 429, data: { error: "RATE_LIMITED" } };
    if (st.post === "409") return { status: 409, data: { error: "DATES_UNAVAILABLE" } };
    if (st.post === "422") return invalid({ "guest.docNumber": "El número de documento no coincide con el tipo elegido.", "guest.phone": "El celular debe tener 10 dígitos." });
    if (body.website) return invalid({ website: "Solicitud rechazada." });
    const key = opts.headers?.["Idempotency-Key"];
    if (key && db.idem[key]) return { status: 201, data: pub(db, db.reservations.find((r) => r.code === db.idem[key])!) };
    const f = validateReservation(body, activeTypes(db), todayISO());
    if (Object.keys(f).length) return invalid(f);
    const linked = channelsOf(db).calendars.filter((c) => c.cabinTypeId === body.cabinTypeId && c.importUrl).flatMap((c) => c.units ?? [c.unit]);
    const unit = findUnit(occ(db), unitsOf(db)[body.cabinTypeId] ?? 0, body.cabinTypeId, body.checkIn, body.checkOut, undefined, webFirst(unitsOf(db)[body.cabinTypeId] ?? 0, linked));
    if (!unit) return { status: 409, data: { error: "DATES_UNAVAILABLE" } };
    const r: Reservation = {
      ...body, code: newReservationCode(), unit, status: "pending_deposit",
      quote: quoteFor(db, body.cabinTypeId, body.checkIn, body.checkOut, body.adults + body.children),
      depositDueAt: depositDueAt(), createdAt: new Date().toISOString(), notes: [], depositPaidAt: null, balancePaidAt: null, clientKey: "",
      paid: 0, checkedInAt: null, balanceDueAt: null, balanceOverdueAt: null,
    };
    r.clientKey = keyOf(r);
    delete r.captchaToken;
    delete r.website;
    db.reservations.push(r);
    if (key) db.idem[key] = r.code;
    save(db);
    return { status: 201, data: pub(db, r) };
  }

  // ----- Pagos (pasarela simulada; mismas reglas que start_payment y settle_payment) -----
  if (method === "POST" && path === "/payments") {
    const b = (opts.body || {}) as { code?: string; email?: string; ref?: string; token?: string; accept?: boolean; kind?: PaymentKind };
    const byRef = b.ref ? db.payments.find((p) => p.reference === String(b.ref).toUpperCase())?.reservationCode : undefined;
    const r = b.token
      ? db.reservations.find((x) => x.payToken === b.token)
      : db.reservations.find((x) => (byRef ? x.code === byRef : x.code === String(b.code || "").toUpperCase() && x.guest.email.toLowerCase() === String(b.email || "").trim().toLowerCase()));
    if (!r) return { status: 404, data: { error: "NOT_FOUND" } };
    if (b.token && !(r.consents.policies && r.consents.dataProcessing)) {
      if (b.accept !== true) return { status: 422, data: { error: "TERMS_REQUIRED" } };
      r.consents = { ...r.consents, policies: true, dataProcessing: true };
    }
    const kind: PaymentKind = b.kind ?? (r.status === "pending_deposit" ? "deposit" : "balance");
    const err = (status: number, error: string) => ({ status, data: { error } });
    const sameStage = (k: PaymentKind) => (kind === "balance" ? k === "balance" : k !== "balance");
    if (db.payments.some((p) => p.reservationCode === r.code && sameStage(p.kind) && p.status === "pending")) return err(409, "PAYMENT_IN_PROGRESS");
    if (kind !== "balance") {
      if (r.depositPaidAt) return err(409, "ALREADY_PAID");
      if (r.status !== "pending_deposit") return err(422, "NOT_PAYABLE");
      if (Date.parse(r.depositDueAt) < Date.now() + 6e4) return err(409, "HOLD_EXPIRED");
    } else {
      if (!["confirmed", "rescheduled", "checked_in"].includes(r.status)) return err(422, "NOT_PAYABLE");
      if (r.balancePaidAt || r.paid >= r.quote.total) return err(409, "ALREADY_PAID");
      if (r.status === "checked_in" && (r.balanceOverdueAt || !r.balanceDueAt || Date.parse(r.balanceDueAt) < Date.now() + 3e4)) return err(422, "BALANCE_DEADLINE_PASSED");
    }
    db.payments.forEach((p) => p.reservationCode === r.code && sameStage(p.kind) && p.status === "initiated" && Object.assign(p, { status: "expired", detail: "Reemplazado por un nuevo intento de pago" }));
    const p = mockPayment(r, kind, "initiated", "simulado", undefined, kind === "full" ? r.quote.total : undefined);
    db.payments.push(p);
    save(db);
    return { status: 201, data: { reference: p.reference, checkoutUrl: `/pago-simulado?ref=${p.reference}`, expiresAt: p.expiresAt, provider: "simulado" } };
  }
  if (path === "/payments/status" || path === "/payments/simulate") {
    const ref = String((method === "GET" ? q.ref : (opts.body as { ref?: string })?.ref) || "").toUpperCase();
    const p = db.payments.find((x) => x.reference === ref);
    if (!p) return { status: 404, data: { error: "NOT_FOUND" } };
    if (method === "POST") {
      const outcome = (opts.body as { outcome?: string }).outcome;
      const status = ({ approve: "approved", decline: "declined", pending: "pending", error: "error" } as Record<string, PaymentStatus>)[outcome ?? ""];
      if (!status) return { status: 400, data: { error: "INVALID_BODY" } };
      if (p.status !== "pending" && p.expiresAt && Date.parse(p.expiresAt) < Date.now()) return { status: 409, data: { error: "CHECKOUT_EXPIRED" } };
      if (p.status !== "approved") {
        Object.assign(p, { status, method: "SIMULADO", detail: status === "declined" ? "Fondos insuficientes (simulado)" : status === "error" ? "Error de comunicación con el banco (simulado)" : "", approvedAt: status === "approved" ? new Date().toISOString() : null });
        if (status === "declined" || status === "error") notify(db, "payment_declined", `Pago rechazado · ${p.reservationCode}`, p.detail, p.reservationCode);
        if (status === "approved") {
          const applied = applyPayment(db, p);
          if (applied === "duplicate" || applied === "not_applicable") {
            Object.assign(p, { needsRefund: true, detail: "La reserva ya no admitía este pago. Requiere reembolso." });
            notify(db, "payment_refund", `Pago por reembolsar · ${p.reservationCode}`, p.detail, p.reservationCode);
          }
        }
        save(db);
      }
    }
    return ok({ payment: p, reservation: pub(db, db.reservations.find((r) => r.code === p.reservationCode)!) });
  }

  if (method === "GET" && path === "/reservations/lookup") {
    if (q.token) {
      const r = db.reservations.find((x) => x.payToken === q.token);
      return r ? ok({ ...pub(db, r), termsAccepted: !!(r.consents.policies && r.consents.dataProcessing) }) : { status: 404, data: { error: "NOT_FOUND" } };
    }
    const r = db.reservations.find(
      (x) => x.code.toUpperCase() === String(q.code || "").trim().toUpperCase() && x.guest.email.toLowerCase() === String(q.email || "").trim().toLowerCase(),
    );
    return r ? ok(pub(db, r)) : { status: 404, data: { error: "NOT_FOUND" } };
  }

  // ----- Admin (sesión simulada en sessionStorage; acepta cualquier correo y contraseña) -----
  const body = (opts.body || {}) as Record<string, string>;
  if (method === "POST" && path === "/admin/login") {
    if (!body.email || !body.password) return { status: 401, data: { error: "INVALID_CREDENTIALS" } };
    sessionStorage.setItem(AUTH_KEY, "1");
    return ok({});
  }
  if (method === "POST" && path === "/admin/logout") {
    sessionStorage.removeItem(AUTH_KEY);
    return ok({});
  }
  if (isAdmin && sessionStorage.getItem(AUTH_KEY) !== "1") return { status: 401, data: { error: "UNAUTHORIZED" } };
  if (method === "GET" && path === "/admin/data")
    return ok({
      reservations: db.reservations, blocks: db.blocks, cabinTypes: [...db.cabins].sort((a, b) => a.sort - b.sort), seasons: db.seasons, unidades: unitsOf(db),
      site: siteOf(db), proofs: [], payments: [...db.payments].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), emails: db.emails, clients: db.clients, notifications: db.notifications,
      channelCalendars: channelsOf(db).calendars, channelStays: channelsOf(db).stays, beds24: null,
    });
  // En modo simulado el contenido se guarda solo en este navegador y no cambia las páginas públicas.
  if (method === "PUT" && path === "/admin/site") {
    const b = opts.body as SiteInput;
    db.site = { settings: b.settings, policies: b.policies, photos: {}, texts: mergeTexts(b.content ?? defaultTexts), services: siteOf(db).services, theme: mergeTheme(b.theme) };
    save(db);
    return ok(db.site);
  }
  // Servicios del sitio (en modo simulado, solo en este navegador).
  if (path === "/admin/services") {
    const site = siteOf(db);
    const b = (opts.body ?? {}) as Partial<SiteService> & { order?: string[] };
    const clean = (s: Partial<SiteService>) => ({ title: String(s.title ?? "").trim(), description: String(s.description ?? "").trim(), icon: String(s.icon ?? "check"), note: String(s.note ?? "").trim(), visible: s.visible !== false });
    if ((method === "POST" || method === "PUT") && !clean(b).title) return invalid({ title: "Escribe el nombre del servicio." });
    if (method === "POST") site.services = [...site.services, { id: crypto.randomUUID(), ...clean(b) }];
    else if (method === "PUT") site.services = site.services.map((s) => (s.id === b.id ? { id: s.id, ...clean(b) } : s));
    else if (method === "PATCH") site.services = (b.order ?? []).map((id) => site.services.find((s) => s.id === id)).filter((s): s is SiteService => !!s);
    else if (method === "DELETE") site.services = site.services.filter((s) => s.id !== q.id);
    db.site = site;
    save(db);
    return ok(site.services);
  }
  if (path === "/admin/photos" || path === "/admin/cabins/photos" || path === "/admin/proofs" || path === "/admin/push") return { status: 501, data: { error: "NOT_AVAILABLE_IN_MOCK" } };

  // Reserva tomada por el equipo: mismas reglas que POST /api/admin/reservations (en modo simulado, solo en este navegador).
  if (method === "POST" && path === "/admin/reservations") {
    const raw = opts.body as ManualReservationInput;
    const b: ManualReservationInput = { ...raw, unit: raw.unit ?? null, total: raw.total ?? null, guest: { ...raw.guest, phone: normalizePhone(raw.guest?.phone ?? "") } };
    const f = validateManualReservation(b, activeTypes(db), unitsOf(db), todayISO());
    const due = manualDueAt(b.checkIn, b.holdMinutes);
    if (!f.checkIn && !f.holdMinutes && due.tooShort) f.holdMinutes = "Ya no queda tiempo para pagar antes de la llegada: registra el pago manualmente.";
    if (Object.keys(f).length) return invalid(f);
    const units = unitsOf(db)[b.cabinTypeId] ?? 0;
    const o = occ(db);
    const unit = b.unit
      ? unitFree(o, units, b.cabinTypeId, b.unit, b.checkIn, b.checkOut) ? b.unit : 0
      : findUnit(o, units, b.cabinTypeId, b.checkIn, b.checkOut, undefined, webFirst(units, channelsOf(db).calendars.filter((c) => c.cabinTypeId === b.cabinTypeId && c.importUrl).flatMap((c) => c.units ?? [c.unit])));
    if (!unit) return { status: 409, data: { error: "DATES_UNAVAILABLE" } };
    const quote = quoteFor(db, b.cabinTypeId, b.checkIn, b.checkOut, b.adults + b.children);
    const token = mockToken();
    const r: Reservation = {
      cabinTypeId: b.cabinTypeId, checkIn: b.checkIn, checkOut: b.checkOut, adults: b.adults, children: b.children,
      pet: { hasPet: !!b.pet?.hasPet, smallBreedConfirmed: !!b.pet?.hasPet }, decoration: { requested: false, occasion: "", notes: "" },
      estimatedArrival: b.estimatedArrival || siteOf(db).settings.checkInStart,
      guest: { ...b.guest, fullName: b.guest.fullName.trim(), docNumber: b.guest.docNumber.trim().toUpperCase(), email: b.guest.email.trim(), city: (b.guest.city ?? "").trim() },
      specialRequests: (b.specialRequests ?? "").trim(), consents: { policies: false, dataProcessing: false, marketing: false },
      code: newReservationCode(), unit, status: "pending_deposit", quote: b.total ? withTotal(quote, b.total) : quote, depositDueAt: due.dueAt, createdAt: new Date().toISOString(),
      notes: [], depositPaidAt: null, balancePaidAt: null, clientKey: "", paid: 0, checkedInAt: null, balanceDueAt: null, balanceOverdueAt: null, source: "panel", payToken: token,
    };
    r.clientKey = keyOf(r);
    db.reservations.push(r);
    save(db);
    return { status: 201, data: { reservation: r, payUrl: location.origin + payPath(token) } };
  }

  if (method === "POST" && path === "/admin/action") {
    const r = db.reservations.find((x) => x.code === body.code);
    if (!r) return { status: 404, data: {} };
    const map: Record<string, Reservation["status"]> = { cancel: "cancelled", checkin: "checked_in", checkout: "completed" };
    const now = new Date().toISOString();
    if (body.action === "payment_link") {
      if (r.status !== "pending_deposit" && r.status !== "expired") return { status: 422, data: { error: "INVALID_TRANSITION" } };
      const minutes = Number((opts.body as { holdMinutes?: number }).holdMinutes);
      if (!HOLD_OPTIONS.some((o) => o.value === minutes)) return { status: 400, data: { error: "INVALID_BODY" } };
      const due = manualDueAt(r.checkIn, minutes);
      if (due.tooShort) return { status: 422, data: { error: "HOLD_TOO_SHORT" } };
      if (r.status === "expired" && !unitFree(occ(db), unitsOf(db)[r.cabinTypeId] ?? 0, r.cabinTypeId, r.unit, r.checkIn, r.checkOut, r.code)) return { status: 409, data: { error: "DATES_UNAVAILABLE" } };
      Object.assign(r, { status: "pending_deposit", depositDueAt: due.dueAt, payToken: r.payToken ?? mockToken() });
      save(db);
      return ok(r);
    }
    if (body.action === "confirm" || body.action === "balance") {
      const kind: PaymentKind = body.action === "balance" ? "balance" : (opts.body as { full?: boolean }).full ? "full" : "deposit";
      const p = mockPayment(r, kind, "approved", "manual", undefined, kind === "full" ? r.quote.total - r.paid : undefined);
      const out = applyPayment(db, p);
      if (out !== "confirmed" && out !== "balance_paid") return { status: out === "duplicate" ? 409 : 422, data: { error: out.toUpperCase() } };
      db.payments.push(p);
      save(db);
      return ok(r);
    }
    if (body.action === "checkout" && !r.balancePaidAt && r.paid < r.quote.total) return { status: 422, data: { error: "BALANCE_PENDING" } };
    if (body.action === "checkin") Object.assign(r, { checkedInAt: now, balanceDueAt: r.paid < r.quote.total ? new Date(Date.now() + BALANCE_MINUTES * 6e4).toISOString() : null, balanceOverdueAt: null });
    if (body.action === "reschedule") {
      const unit = findUnit(occ(db), unitsOf(db)[r.cabinTypeId] ?? 0, r.cabinTypeId, body.checkIn, body.checkOut, r.code);
      if (!unit) return { status: 409, data: { error: "DATES_UNAVAILABLE" } };
      Object.assign(r, { checkIn: body.checkIn, checkOut: body.checkOut, unit, status: r.status === "pending_deposit" ? "pending_deposit" : "rescheduled", quote: quoteFor(db, r.cabinTypeId, body.checkIn, body.checkOut, r.adults + r.children) });
    } else if (body.action === "note") r.notes.push({ at: now, text: body.text });
    else {
      r.status = map[body.action] || r.status;
      if (body.action === "cancel") notify(db, "reservation_cancelled", `Reserva cancelada · ${r.code}`, r.guest.fullName, r.code, true);
    }
    save(db);
    return ok(r);
  }

  if (path === "/admin/blocks" && (method === "POST" || method === "PUT")) {
    const b = opts.body as BlockInput & { id?: string };
    const units = b.unit === "all" ? Array.from({ length: unitsOf(db)[b.cabinTypeId] ?? 0 }, (_, i) => i + 1) : [b.unit];
    const conflicts = units.flatMap((u) => clashingReservations(occ(db).reservations, b.cabinTypeId, u, b.from, b.to).map((r) => r.code));
    if (conflicts.length) return { status: 409, data: { error: "RESERVATION_CONFLICT", conflicts } };
    const others = db.blocks.filter((x) => x.id !== b.id);
    if (others.some((x) => x.cabinTypeId === b.cabinTypeId && units.includes(x.unit) && x.from <= b.to && b.from <= x.to)) return { status: 409, data: { error: "BLOCK_OVERLAP" } };
    if (method === "PUT") db.blocks = others.concat({ id: b.id!, cabinTypeId: b.cabinTypeId, unit: units[0], from: b.from, to: b.to, reason: b.reason, notes: b.notes });
    else units.forEach((unit, i) => db.blocks.push({ id: `b${Date.now()}${i}`, cabinTypeId: b.cabinTypeId, unit, from: b.from, to: b.to, reason: b.reason, notes: b.notes }));
    db.blocks.sort((a, z) => (a.from < z.from ? -1 : 1));
    save(db);
    return ok(db.blocks);
  }
  if (method === "DELETE" && path === "/admin/blocks") {
    db.blocks = db.blocks.filter((b) => b.id !== q.id);
    save(db);
    return ok(db.blocks);
  }

  if (path === "/admin/channels") {
    const ch = seedChannels(db);
    const done = (results?: unknown[]) => {
      save(db);
      return ok({ calendars: ch.channelCalendars, stays: ch.channelStays, beds24: null, ...(results && { results }) });
    };
    const read = (c: ChannelCalendar) => {
      Object.assign(c, { lastSyncedAt: new Date().toISOString(), lastStatus: "ok", lastError: "", lastEventCount: ch.channelStays.filter((s) => s.calendarId === c.id && !s.removedAt).length });
      return { calendarId: c.id, ok: true, events: c.lastEventCount, added: 0, removed: 0, moved: [], conflicts: [] };
    };
    if (method === "GET") return done();
    if (method === "PUT") {
      const b = opts.body as ChannelCalendarInput;
      const url = String(b.importUrl ?? "").trim() || null;
      if (url && !/^https:\/\/\S+$/.test(url)) return invalid({ importUrl: "Pega el enlace de exportación del extranet (empieza por https://)." });
      let c = ch.channelCalendars.find((x) => x.cabinTypeId === b.cabinTypeId && x.unit === b.unit);
      if (!c) {
        const id = `c${Date.now()}`;
        c = { id, channel: "booking", label: "", cabinTypeId: b.cabinTypeId, unit: b.unit, units: [b.unit], importUrl: null, exportUrl: `${location.origin}/api/ical/demo${id}`, lastSyncedAt: null, lastFetchedAt: null, lastStatus: null, lastError: "", lastEventCount: 0, beds24RoomId: null };
        ch.channelCalendars.push(c);
      }
      const changed = c.importUrl !== url;
      Object.assign(c, { label: String(b.label ?? "").trim().slice(0, 80), importUrl: url, units: b.units?.length ? b.units : [b.unit] });
      if (changed) {
        ch.channelStays = db.channelStays = ch.channelStays.filter((s) => s.calendarId !== c.id);
        Object.assign(c, { lastSyncedAt: null, lastStatus: null, lastError: "", lastEventCount: 0 });
      }
      return done(changed && url ? [read(c)] : undefined);
    }
    const b = (opts.body || {}) as { action?: string; id?: string };
    if (method === "POST" && b.action === "sync") return done(ch.channelCalendars.filter((c) => c.importUrl).map(read));
    if (method === "POST" && b.action === "rotate") {
      const c = ch.channelCalendars.find((x) => x.id === b.id);
      if (!c) return { status: 404, data: { error: "NOT_FOUND" } };
      Object.assign(c, { exportUrl: `${location.origin}/api/ical/demo${c.id}-${Date.now().toString(36)}`, lastFetchedAt: null });
      return done();
    }
    // Beds24 necesita una cuenta real: en modo simulado no se conecta.
    if (method === "POST" && (b.action === "beds24-connect" || b.action === "beds24-rooms")) return { status: 501, data: { error: "NOT_AVAILABLE_IN_MOCK" } };
  }

  if (method === "PUT" && path === "/admin/cabin-types") {
    const rates = opts.body as Rates;
    db.cabins.forEach((c) => rates[c.id] && Object.assign(c, rates[c.id]));
    save(db);
    return ok(db.cabins);
  }
  if (path === "/admin/cabins") {
    if (method === "PATCH") {
      (opts.body as { order: string[] }).order.forEach((id, i) => {
        const c = db.cabins.find((x) => x.id === id);
        if (c) c.sort = i + 1;
      });
    } else if (method === "DELETE") {
      if (db.reservations.some((r) => r.cabinTypeId === q.id)) return { status: 409, data: { error: "HAS_RESERVATIONS" } };
      db.cabins = db.cabins.filter((c) => c.id !== q.id);
      db.blocks = db.blocks.filter((b) => b.cabinTypeId !== q.id);
      db.seasons = db.seasons.filter((s) => s.cabinTypeId !== q.id);
    } else {
      const b = opts.body as CabinInput & { id?: string };
      if (!b.nombre || b.nombre.trim().length < 3) return invalid({ nombre: "El nombre debe tener entre 3 y 60 caracteres." });
      const fields = { nombre: b.nombre.trim(), descripcion: b.descripcion, caracteristicas: b.caracteristicas, badge: b.badge, maxPersonas: b.maxPersonas, units: b.units, precioPareja: b.precioPareja, personaAdicional: b.personaAdicional, activa: b.activa };
      if (method === "PUT") Object.assign(db.cabins.find((c) => c.id === b.id)!, fields);
      else {
        let id = slugify(b.nombre) || "cabana";
        for (let i = 2; db.cabins.some((c) => c.id === id) || id === "nueva"; i++) id = `${slugify(b.nombre)}-${i}`;
        db.cabins.push({ id, fotos: [], sort: db.cabins.length + 1, ...fields });
      }
    }
    save(db);
    return ok([...db.cabins].sort((a, b) => a.sort - b.sort));
  }

  if (path === "/admin/seasons") {
    if (method === "DELETE") db.seasons = db.seasons.filter((s) => s.id !== q.id);
    else {
      const b = opts.body as SeasonInput;
      const clash = b.activa && db.seasons.find((s) => s.id !== b.id && s.activa && s.cabinTypeId === b.cabinTypeId && s.from <= b.to && b.from <= s.to);
      if (clash) return invalid({ dates: `Se cruza con la temporada activa "${clash.nombre}" de la misma cabaña.` });
      if (method === "PUT") Object.assign(db.seasons.find((s) => s.id === b.id)!, b);
      else db.seasons.push({ ...b, id: `s${Date.now()}` });
    }
    db.seasons.sort((a, z) => (a.from < z.from ? -1 : 1));
    save(db);
    return ok(db.seasons);
  }

  if (path === "/admin/clients") {
    const b = opts.body as { clientKey: string; kind?: "note" | "incident"; severity?: string | null; text?: string; reservationCode?: string | null } & Partial<ClientProfile>;
    let key: string | undefined = b?.clientKey;
    if (method === "DELETE") {
      key = Object.values(db.clients).find((c) => c.entries.some((e) => e.id === +q.entry))?.clientKey;
      if (!key) return { status: 404, data: {} };
      db.clients[key].entries = db.clients[key].entries.filter((e) => e.id !== +q.entry);
    } else {
      if (!key) return { status: 404, data: {} };
      const c = (db.clients[key] ??= { clientKey: key, rating: null, trust: "sin_evaluar", tags: [], preferences: "", summary: "", updatedAt: "", entries: [] });
      if (method === "PUT") Object.assign(c, { rating: b.rating ?? null, trust: b.trust, tags: b.tags, preferences: b.preferences, summary: b.summary });
      else c.entries.unshift({ id: Date.now(), kind: b.kind!, severity: (b.kind === "incident" ? b.severity : null) as ClientProfile["entries"][number]["severity"], text: b.text!, reservationCode: b.reservationCode ?? null, createdAt: new Date().toISOString() });
      c.updatedAt = new Date().toISOString();
    }
    save(db);
    return ok(db.clients[key]);
  }

  if (method === "POST" && path === "/admin/notifications") {
    const b = opts.body as { ids?: number[]; all?: boolean };
    const now = new Date().toISOString();
    db.notifications.forEach((n) => (b.all || b.ids?.includes(n.id)) && (n.readAt ??= now));
    save(db);
    return ok(db.notifications);
  }

  // Correos: en modo simulado no salen; quedan registrados como enviados.
  if (path === "/admin/emails") {
    if (method === "GET") return ok({ configured: true });
    const b = (opts.body || {}) as { action: string; id?: string; clientKey?: string; subject?: string; message?: string; reservationCode?: string | null };
    if (b.action === "retry") {
      const e = db.emails.find((x) => x.id === b.id);
      if (!e) return { status: 404, data: { error: "NOT_FOUND" } };
      Object.assign(e, { status: "sent", attempts: e.attempts + 1, lastError: "", sentAt: new Date().toISOString() });
      save(db);
      return ok(e);
    }
    const latest = db.reservations.filter((r) => r.clientKey === b.clientKey).sort((a, z) => (a.createdAt < z.createdAt ? 1 : -1))[0];
    if (!latest) return { status: 404, data: { error: "CLIENT_NOT_FOUND" } };
    if (!b.subject || b.subject.trim().length < 3) return invalid({ subject: "Escribe un asunto de 3 a 150 caracteres." });
    if (!b.message || b.message.trim().length < 5) return invalid({ message: "Escribe un mensaje de 5 a 5000 caracteres." });
    const now = new Date().toISOString();
    const e: EmailRecord = { id: crypto.randomUUID(), kind: "team_message", reservationCode: b.reservationCode ?? null, to: latest.guest.email, subject: b.subject.trim(), status: "sent", attempts: 1, lastError: "", sentAt: now, createdAt: now, updatedAt: now };
    db.emails.unshift(e);
    save(db);
    return { status: 201, data: e };
  }

  if (method === "POST" && path === "/admin/reset") {
    save(seed());
    return ok({});
  }
  return { status: 404, data: { error: "NOT_FOUND" } };
}
