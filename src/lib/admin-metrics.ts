// Cálculos del panel (clientes y finanzas) sobre los datos ya cargados. Funciones puras: sin red ni estado.
import { ACTIVE_STATUSES } from "@/lib/booking";
import { MS, addDays, dateOf, nightsBetween, parseISO } from "@/lib/format";
import type { Block, CabinType, ClientProfile, PaymentRecord, Reservation, ReservationStatus } from "@/lib/types";

// Reservas que se concretaron (el abono se pagó).
const SECURED: ReservationStatus[] = ["confirmed", "rescheduled", "checked_in", "completed"];

/* ───────────── Dinero de una reserva ───────────── */

export type Payment = { date: string; amount: number; kind: "deposit" | "balance"; r: Reservation };

// Pagos registrados aprobados, agrupados por reserva (para los reportes).
export function recordsByCode(records: PaymentRecord[]) {
  const by = new Map<string, PaymentRecord[]>();
  for (const p of records) if (p.status === "approved" && p.approvedAt) by.set(p.reservationCode, [...(by.get(p.reservationCode) ?? []), p]);
  return by;
}

// Pagos recibidos de una reserva: sus pagos registrados (fecha y valor reales, también los parciales; el primero es el abono)
// o, si no tiene registros (reservas anteriores a los pagos registrados), los que se deducen de sus fechas de abono y saldo.
export function paymentsOf(r: Reservation, own?: PaymentRecord[]): Payment[] {
  if (own?.length) return own.map((p) => ({ date: dateOf(p.approvedAt!), amount: p.amount, kind: p.kind === "balance" ? "balance" : "deposit", r }));
  const out: Payment[] = [];
  const deposit = r.depositPaidAt ? Math.min(r.quote.deposit, r.paid || r.quote.deposit) : 0;
  if (r.depositPaidAt) out.push({ date: dateOf(r.depositPaidAt), amount: deposit, kind: "deposit", r });
  if (r.balancePaidAt) out.push({ date: dateOf(r.balancePaidAt), amount: Math.max(0, (r.paid || r.quote.total) - deposit), kind: "balance", r });
  return out;
}

const receivedOf = (r: Reservation, own?: PaymentRecord[]) => paymentsOf(r, own).reduce((s, p) => s + p.amount, 0);

// Valor de la reserva para el negocio: el total si se concretó; si se canceló con abono, el abono (no es reembolsable).
export const valueOf = (r: Reservation) => (SECURED.includes(r.status) ? r.quote.total : r.status === "cancelled" && r.depositPaidAt ? r.quote.deposit : 0);

// Lo que falta por cobrar hoy: abonos de fechas retenidas y saldos de estadías confirmadas o en curso.
export function pendingOf(r: Reservation) {
  const deposit = r.status === "pending_deposit" || (SECURED.includes(r.status) && !r.depositPaidAt && r.status !== "completed") ? r.quote.deposit : 0;
  const balance =
    ["pending_deposit", "confirmed", "rescheduled", "checked_in"].includes(r.status) && !r.balancePaidAt ? Math.max(0, r.quote.total - r.paid - deposit) : 0;
  return { deposit, balance, total: deposit + balance };
}

// Saldo de una estadía en curso: null si no aplica (aún sin check-in o ya pagado).
export function balanceDue(r: Reservation): { amount: number } | null {
  if (r.status !== "checked_in" || r.balancePaidAt) return null;
  const amount = Math.max(0, r.quote.total - r.paid);
  return amount ? { amount } : null;
}

// Estado del pago en una frase corta para listas.
export function paymentState(r: Reservation): { label: string; tone: "success" | "warning" | "neutral" | "danger" } {
  if (r.status === "expired") return { label: "Sin abono", tone: "danger" };
  if (r.status === "cancelled") return r.depositPaidAt ? { label: "Abono retenido", tone: "neutral" } : { label: "Sin pago", tone: "neutral" };
  if (balanceDue(r)) return { label: "Saldo por pagar", tone: "warning" };
  if (r.balancePaidAt || r.status === "completed" || r.status === "checked_in") return { label: "Pagada", tone: "success" };
  if (r.depositPaidAt || SECURED.includes(r.status)) return { label: "Abono recibido", tone: "success" };
  return { label: "Esperando el abono", tone: "warning" };
}

/* ───────────── Clientes ───────────── */

export type ClientSummary = {
  key: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  docType: string;
  docNumber: string;
  reservations: Reservation[]; // más reciente primero
  stays: number; // reservas concretadas
  nights: number;
  value: number;
  firstAt: string; // primera reserva (creación)
  lastStay: string | null; // última salida ya ocurrida
  nextStay: Reservation | null; // próxima llegada vigente
  isNew: boolean;
  isRecurring: boolean;
  profile: ClientProfile | null;
  incidents: number;
  flagged: boolean; // confianza baja, no recomendado o incidencias graves
};

export function buildClients(reservations: Reservation[], profiles: Record<string, ClientProfile>, today: string): ClientSummary[] {
  const by = new Map<string, Reservation[]>();
  for (const r of reservations) by.set(r.clientKey, [...(by.get(r.clientKey) ?? []), r]);
  const newSince = addDays(today, -30);
  return [...by.entries()].map(([key, list]) => {
    const rs = [...list].sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1));
    const latest = [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    const secured = rs.filter((r) => SECURED.includes(r.status));
    const firstAt = list.reduce((m, r) => (r.createdAt < m ? r.createdAt : m), list[0].createdAt);
    const past = secured.filter((r) => r.checkOut <= today).map((r) => r.checkOut);
    const upcoming = rs.filter((r) => ACTIVE_STATUSES.includes(r.status) && r.checkIn >= today).sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1));
    const profile = profiles[key] ?? null;
    const incidents = profile?.entries.filter((e) => e.kind === "incident").length ?? 0;
    return {
      key,
      name: latest.guest.fullName,
      email: latest.guest.email,
      phone: latest.guest.phone,
      city: latest.guest.city,
      docType: latest.guest.docType,
      docNumber: latest.guest.docNumber,
      reservations: rs,
      stays: secured.length,
      nights: secured.reduce((n, r) => n + nightsBetween(r.checkIn, r.checkOut), 0),
      value: rs.reduce((v, r) => v + valueOf(r), 0),
      firstAt,
      lastStay: past.length ? past.sort().at(-1)! : null,
      nextStay: upcoming[0] ?? null,
      isNew: dateOf(firstAt) >= newSince,
      isRecurring: secured.length >= 2,
      profile,
      incidents,
      flagged: !!profile && (profile.trust === "baja" || profile.trust === "no_recomendado" || profile.entries.some((e) => e.severity === "grave")),
    };
  });
}

/* ───────────── Finanzas ───────────── */

export type Range = { from: string; to: string }; // días incluidos

const daysIn = (r: Range) => nightsBetween(r.from, r.to) + 1;
export const previousRange = (r: Range): Range => ({ from: addDays(r.from, -daysIn(r)), to: addDays(r.from, -1) });
const inRange = (d: string, r: Range) => d >= r.from && d <= r.to;

type Bucket = { key: string; label: string; from: string; to: string; deposit: number; balance: number };

// Días si el rango es corto, semanas (desde el lunes) hasta ~6 meses, meses en adelante.
function bucketsFor(r: Range): Bucket[] {
  const n = daysIn(r);
  const out: Bucket[] = [];
  const mk = (from: string, to: string, label: string) => out.push({ key: from, label, from, to, deposit: 0, balance: 0 });
  const dm = (d: string) => `${parseISO(d).getUTCDate()} ${MS[parseISO(d).getUTCMonth()]}`;
  if (n <= 31) for (let d = r.from; d <= r.to; d = addDays(d, 1)) mk(d, d, dm(d));
  else if (n <= 190) {
    for (let d = addDays(r.from, -((parseISO(r.from).getUTCDay() + 6) % 7)); d <= r.to; d = addDays(d, 7))
      mk(d < r.from ? r.from : d, addDays(d, 6) > r.to ? r.to : addDays(d, 6), `Sem. ${dm(d < r.from ? r.from : d)}`);
  } else {
    let d = r.from.slice(0, 7) + "-01";
    while (d <= r.to) {
      const next = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 1)).toISOString().slice(0, 10);
      const dt = parseISO(d);
      mk(d < r.from ? r.from : d, addDays(next, -1) > r.to ? r.to : addDays(next, -1), `${MS[dt.getUTCMonth()]} ${String(dt.getUTCFullYear()).slice(2)}`);
      d = next;
    }
  }
  return out;
}

// Noches de una reserva o bloqueo que caen dentro del rango.
const overlapNights = (ci: string, coExclusive: string, r: Range) => {
  const a = ci > r.from ? ci : r.from;
  const b = coExclusive < addDays(r.to, 1) ? coExclusive : addDays(r.to, 1);
  return b > a ? nightsBetween(a, b) : 0;
};

type GuestType = "Pareja" | "Familia" | "Grupo" | "Individual";
const guestType = (r: Reservation): GuestType => (r.children > 0 ? "Familia" : r.adults >= 3 ? "Grupo" : r.adults === 1 ? "Individual" : "Pareja");

export function finance(
  reservations: Reservation[],
  blocks: Block[],
  cabins: CabinType[],
  range: Range,
  cabinId = "",
  records: Map<string, PaymentRecord[]> = new Map(),
) {
  const rs = cabinId ? reservations.filter((r) => r.cabinTypeId === cabinId) : reservations;
  const payments = rs.flatMap((r) => paymentsOf(r, records.get(r.code))).filter((p) => inRange(p.date, range));
  const deposits = payments.filter((p) => p.kind === "deposit");
  const received = payments.reduce((s, p) => s + p.amount, 0);
  const confirmed = deposits.map((p) => p.r);

  const buckets = bucketsFor(range);
  for (const p of payments) {
    const b = buckets.find((x) => p.date >= x.from && p.date <= x.to);
    if (b) b[p.kind] += p.amount;
  }

  const byCabin = cabins
    .filter((c) => !cabinId || c.id === cabinId)
    .map((c) => ({ id: c.id, label: c.nombre, value: payments.filter((p) => p.r.cabinTypeId === c.id).reduce((s, p) => s + p.amount, 0) }))
    .sort((a, b) => b.value - a.value);

  const types: GuestType[] = ["Pareja", "Familia", "Grupo", "Individual"];
  const byType = types
    .map((t) => ({ id: t, label: t, value: payments.filter((p) => guestType(p.r) === t).reduce((s, p) => s + p.amount, 0) }))
    .sort((a, b) => b.value - a.value);

  // Ocupación: noches ocupadas / noches disponibles (las bloqueadas no cuentan como disponibles). Cada unidad cuenta una sola
  // vez por noche, aunque haya registros que se crucen (p. ej. reservas importadas ya finalizadas).
  const cabs = cabins.filter((c) => !cabinId || c.id === cabinId);
  const capacity = cabs.reduce((s, c) => s + c.units, 0) * daysIn(range);
  const blocked = blocks.filter((b) => !cabinId || b.cabinTypeId === cabinId).reduce((s, b) => s + overlapNights(b.from, addDays(b.to, 1), range), 0);
  const available = Math.max(0, capacity - blocked);
  const taken = new Set<string>();
  const end = addDays(range.to, 1);
  for (const r of rs) {
    if (![...ACTIVE_STATUSES, "completed"].includes(r.status)) continue;
    for (let d = r.checkIn > range.from ? r.checkIn : range.from; d < r.checkOut && d < end; d = addDays(d, 1)) taken.add(`${r.cabinTypeId}:${r.unit}:${d}`);
  }
  const occupied = Math.min(taken.size, available);

  // Estadías del periodo (llegan dentro del rango): cuánto ya está cobrado y cuánto falta.
  const stays = rs.filter((r) => inRange(r.checkIn, range) && (SECURED.includes(r.status) || r.status === "pending_deposit"));
  const stayValue = stays.reduce((s, r) => s + r.quote.total, 0);
  const stayReceived = stays.reduce((s, r) => s + receivedOf(r, records.get(r.code)), 0);

  return {
    received,
    depositsTotal: deposits.reduce((s, p) => s + p.amount, 0),
    balancesTotal: payments.filter((p) => p.kind === "balance").reduce((s, p) => s + p.amount, 0),
    confirmedCount: confirmed.length,
    ticket: confirmed.length ? Math.round(confirmed.reduce((s, r) => s + r.quote.total, 0) / confirmed.length) : 0,
    occupancy: available ? occupied / available : 0,
    occupied,
    available,
    buckets,
    byCabin,
    byType,
    payments: payments.sort((a, b) => (a.date < b.date ? 1 : -1)),
    stays: { count: stays.length, value: stayValue, received: stayReceived, pending: Math.max(0, stayValue - stayReceived) },
  };
}

// Variación porcentual; null si no hay base para comparar.
export const delta = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : now > 0 ? null : 0);

/* ───────────── Disponibilidad para los selectores de fecha ───────────── */

type Mark = "busy" | "blocked" | "partial";

// Noches de un tipo de cabaña sin unidades libres (busy) o con una sola libre (partial), excluyendo una reserva (al reprogramarla).
export function typeMarks(reservations: Reservation[], blocks: Block[], typeId: string, units: number, from: string, to: string, ignoreCode?: string) {
  const out: Record<string, Mark> = {};
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const busy = new Set<number>();
    for (const r of reservations)
      if (r.code !== ignoreCode && r.cabinTypeId === typeId && ACTIVE_STATUSES.includes(r.status) && r.checkIn <= d && d < r.checkOut) busy.add(r.unit);
    for (const b of blocks) if (b.cabinTypeId === typeId && b.from <= d && d <= b.to) busy.add(b.unit);
    const free = units - busy.size;
    if (free <= 0) out[d] = "busy";
    else if (units > 1 && free === 1) out[d] = "partial";
  }
  return out;
}

// Días de una unidad ocupados por reservas activas (busy) o por otros bloqueos (blocked).
export function unitMarks(reservations: Reservation[], blocks: Block[], typeId: string, unit: number | "all", from: string, to: string, ignoreBlock?: string) {
  const out: Record<string, Mark> = {};
  const hit = (u: number) => unit === "all" || u === unit;
  for (const b of blocks)
    if (b.id !== ignoreBlock && b.cabinTypeId === typeId && hit(b.unit))
      for (let d = b.from > from ? b.from : from; d <= b.to && d <= to; d = addDays(d, 1)) out[d] = "blocked";
  for (const r of reservations)
    if (r.cabinTypeId === typeId && hit(r.unit) && ACTIVE_STATUSES.includes(r.status))
      for (let d = r.checkIn > from ? r.checkIn : from; d < r.checkOut && d <= to; d = addDays(d, 1)) out[d] = "busy";
  return out;
}
