// Reglas de reserva compartidas por el servidor (Supabase) y el modo simulado.
import { config, type CabinTypeId } from "@/lib/config";
import { DEFAULT_HOLD, HOLD_OPTIONS } from "@/lib/payments";
import { addDays, isISO, nightsBetween } from "@/lib/format";
import type { Availability, CabinType, FieldErrors, ManualReservationInput, Quote, RateSeason, ReservationInput, ReservationStatus } from "@/lib/types";

export const ACTIVE_STATUSES: ReservationStatus[] = ["pending_deposit", "confirmed", "rescheduled", "checked_in"];

// Motivos de bloqueo ("Otro" exige una descripción).
export const BLOCK_REASONS = ["Mantenimiento", "Uso propio", "Evento privado", "Otro"];

// Lo mínimo para saber qué unidades están ocupadas.
export type Occupancy = {
  reservations: { code: string; cabinTypeId: string; unit: number; checkIn: string; checkOut: string; status: ReservationStatus }[];
  blocks: { cabinTypeId: string; unit: number; from: string; to: string }[];
};

export type Units = Partial<Record<CabinTypeId, number>>;

type Priced = Pick<CabinType, "id" | "precioPareja" | "personaAdicional">;

// Tarifa de una noche: la temporada activa que la cubre o, si no hay, la tarifa base de la cabaña.
export function nightlyRate(t: Priced, seasons: RateSeason[], night: string) {
  const s = seasons.find((x) => x.activa && x.cabinTypeId === t.id && x.from <= night && night <= x.to);
  return s ? { couple: s.precioPareja, extra: s.personaAdicional, season: s } : { couple: t.precioPareja, extra: t.personaAdicional, season: null };
}

// Cotización noche a noche (cada noche puede caer en una temporada distinta).
export function computeQuote(t: Priced, checkIn: string, checkOut: string, guests: number, seasons: RateSeason[] = []): Quote {
  const nights = nightsBetween(checkIn, checkOut);
  const extraGuests = Math.max(0, guests - 2);
  let base = 0;
  let extraAmount = 0;
  let seasonNights = 0;
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) {
    const r = nightlyRate(t, seasons, d);
    base += r.couple;
    extraAmount += extraGuests * r.extra;
    if (r.season) seasonNights++;
  }
  const total = base + extraAmount;
  const deposit = Math.round((total * config.depositPct) / 100);
  return {
    base,
    extraGuests,
    extraAmount,
    total,
    deposit,
    balance: total - deposit,
    nights,
    seasonNights,
    pricePerNight: nights ? Math.round(base / nights) : t.precioPareja,
    extraPerNight: nights && extraGuests ? Math.round(extraAmount / (nights * extraGuests)) : t.personaAdicional,
  };
}

// Precio especial acordado por el equipo: el total cambia, el abono se recalcula con el mismo porcentaje y la diferencia
// con la tarifa queda en `adjustment` (negativo = descuento).
export function withTotal(q: Quote, total: number): Quote {
  const deposit = Math.round((total * config.depositPct) / 100);
  return { ...q, total, deposit, balance: total - deposit, adjustment: total - (q.base + q.extraAmount) };
}

// Celular con indicativo: "300 123 4567" → "+573001234567" (Colombia por defecto); "+1 555…" se conserva.
export function normalizePhone(p: string) {
  const digits = String(p || "").replace(/\D/g, "");
  if (/^3\d{9}$/.test(digits)) return "+57" + digits;
  if (
    String(p || "")
      .trim()
      .startsWith("+") ||
    /^57\d{10}$/.test(digits)
  )
    return "+" + digits;
  return digits ? "+" + digits : "";
}

const SPECIAL_TOTAL = { min: 10_000, max: 100_000_000 };

// Reserva tomada por el equipo: los datos del huésped que exige la base de datos (nombre, documento, correo y celular)
// y el plazo del enlace de pago. No pide casilla de políticas: el huésped las acepta en la página del enlace antes de pagar.
export function validateManualReservation(b: ManualReservationInput, types: CabinType[], units: Partial<Record<string, number>>, today: string): FieldErrors {
  const f: FieldErrors = {};
  const g = b.guest ?? ({} as ManualReservationInput["guest"]);
  if (!isISO(b.checkIn) || !isISO(b.checkOut) || b.checkOut <= b.checkIn) f.checkIn = "Elige la llegada y la salida.";
  else if (b.checkIn < today) f.checkIn = "La fecha de llegada ya pasó.";
  else if (nightsBetween(b.checkIn, b.checkOut) > 30) f.checkIn = "La estadía máxima es de 30 noches.";
  const t = types.find((x) => x.id === b.cabinTypeId);
  if (!t) f.cabinTypeId = "Elige la cabaña.";
  else if (b.unit !== null && (!Number.isInteger(b.unit) || b.unit < 1 || b.unit > (units[t.id] ?? 0))) f.cabinTypeId = "Esa unidad no existe.";
  const adults = Number(b.adults);
  const children = Number(b.children);
  if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) f.adults = "Número de huéspedes no válido.";
  else if (t && adults + children > t.maxPersonas) f.adults = `Máximo ${t.maxPersonas} personas en esta cabaña.`;
  if (!g.fullName || g.fullName.trim().length < 3 || g.fullName.length > 120) f["guest.fullName"] = "Escribe el nombre completo.";
  if (!["CC", "CE", "Pasaporte", "PPT"].includes(g.docType)) f["guest.docType"] = "Elige el tipo de documento.";
  if (!g.docNumber || !/^[A-Za-z0-9]{5,15}$/.test(g.docNumber.trim())) f["guest.docNumber"] = "Escribe el número de documento (sin puntos).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((g.email || "").trim()) || g.email.length > 160)
    f["guest.email"] = "Escribe un correo válido: ahí le llega la confirmación.";
  if (!/^\+\d{8,15}$/.test(normalizePhone(g.phone))) f["guest.phone"] = "Escribe el celular (WhatsApp) con indicativo si no es de Colombia.";
  if ((g.city ?? "").length > 80) f["guest.city"] = "La ciudad es demasiado larga.";
  if (b.estimatedArrival && !/^\d{2}:\d{2}$/.test(b.estimatedArrival)) f.estimatedArrival = "Hora de llegada no válida.";
  if ((b.specialRequests ?? "").length > 1000) f.specialRequests = "El texto es demasiado largo.";
  if (b.total !== null && (!Number.isInteger(b.total) || b.total < SPECIAL_TOTAL.min || b.total > SPECIAL_TOTAL.max)) f.total = "Escribe un precio válido.";
  if (!HOLD_OPTIONS.some((o) => o.value === b.holdMinutes)) f.holdMinutes = "Elige el plazo para pagar.";
  return f;
}

// Unidades libres de un tipo la noche `date` (las reservas ocupan [checkIn, checkOut); los bloqueos incluyen `to`).
function freeUnits(occ: Occupancy, units: number, typeId: string, date: string, ignoreCode?: string) {
  const busy = new Set<number>();
  for (const r of occ.reservations)
    if (r.code !== ignoreCode && r.cabinTypeId === typeId && ACTIVE_STATUSES.includes(r.status) && r.checkIn <= date && date < r.checkOut) busy.add(r.unit);
  for (const b of occ.blocks) if (b.cabinTypeId === typeId && b.from <= date && date <= b.to) busy.add(b.unit);
  const free: number[] = [];
  for (let u = 1; u <= units; u++) if (!busy.has(u)) free.push(u);
  return free;
}

// Primera unidad libre todas las noches del rango, o 0 si no hay. `prefer`: unidades que se prueban primero, en ese orden.
export function findUnit(occ: Occupancy, units: number, typeId: string, ci: string, co: string, ignoreCode?: string, prefer: number[] = []) {
  const all = Array.from({ length: units }, (_, i) => i + 1);
  for (const u of [...prefer.filter((x) => all.includes(x)), ...all.filter((x) => !prefer.includes(x))]) {
    let ok = true;
    for (let d = ci; d < co; d = addDays(d, 1))
      if (!freeUnits(occ, units, typeId, d, ignoreCode).includes(u)) {
        ok = false;
        break;
      }
    if (ok) return u;
  }
  return 0;
}

export function unavailableDates(occ: Occupancy, units: number, typeId: string, from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (!freeUnits(occ, units, typeId, d).length) out.push(d);
  return out;
}

export function availability(
  occ: Occupancy,
  types: CabinType[],
  units: Units,
  ci: string,
  co: string,
  guests: number,
  seasons: RateSeason[] = [],
): Availability {
  const nights = nightsBetween(ci, co);
  return {
    nights,
    options: types.map((t) => {
      let left = Infinity;
      for (let d = ci; d < co; d = addDays(d, 1)) left = Math.min(left, freeUnits(occ, units[t.id] ?? 0, t.id, d).length);
      if (!isFinite(left)) left = 0;
      const fits = guests <= t.maxPersonas;
      return {
        cabinTypeId: t.id,
        available: left > 0 && fits,
        unitsLeft: left,
        reason: !fits ? "capacity" : left > 0 ? null : "dates",
        quote: computeQuote(t, ci, co, guests, seasons),
      };
    }),
  };
}

// Validación del lado del servidor. Las claves siguen las rutas del contrato (p. ej. "guest.email").
export function validateReservation(b: ReservationInput, types: CabinType[], today: string): FieldErrors {
  const f: FieldErrors = {};
  const g = b.guest ?? ({} as ReservationInput["guest"]);
  if (!isISO(b.checkIn) || !isISO(b.checkOut) || b.checkOut <= b.checkIn) f.checkIn = "Fechas no válidas.";
  else if (b.checkIn < today) f.checkIn = "La fecha de llegada ya pasó.";
  else if (nightsBetween(b.checkIn, b.checkOut) > 30) f.checkIn = "La estadía máxima es de 30 noches.";
  const t = types.find((x) => x.id === b.cabinTypeId);
  const adults = Number(b.adults);
  const children = Number(b.children);
  if (!t) f.cabinTypeId = "Tipo de cabaña no válido.";
  if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) f.adults = "Número de huéspedes no válido.";
  else if (t && adults + children > t.maxPersonas) f.adults = `Máximo ${t.maxPersonas} personas.`;
  if (!g.fullName || g.fullName.trim().length < 3 || g.fullName.length > 120) f["guest.fullName"] = "Escribe tu nombre completo.";
  if (!["CC", "CE", "Pasaporte", "PPT"].includes(g.docType)) f["guest.docType"] = "Elige el tipo de documento.";
  if (!g.docNumber || !/^[A-Za-z0-9]{5,15}$/.test(g.docNumber)) f["guest.docNumber"] = "Escribe el número de documento.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email || "") || g.email.length > 160) f["guest.email"] = "Escribe un correo válido.";
  if (!/^\+\d{8,15}$/.test((g.phone || "").replace(/[^\d+]/g, ""))) f["guest.phone"] = "Escribe un celular válido.";
  if (!g.city || g.city.length > 80) f["guest.city"] = "Escribe tu ciudad de procedencia.";
  if (!/^\d{2}:\d{2}$/.test(b.estimatedArrival || "")) f.estimatedArrival = "Elige la hora estimada de llegada.";
  if (b.pet?.hasPet && !b.pet.smallBreedConfirmed) f["pet.smallBreedConfirmed"] = "Confirma que te haces responsable de tu mascota.";
  if (b.decoration?.requested && !["aniversario", "cumpleanos", "propuesta", "otra"].includes(b.decoration.occasion))
    f["decoration.occasion"] = "Elige la ocasión.";
  if ((b.decoration?.notes ?? "").length > 500 || (b.specialRequests ?? "").length > 1000) f.specialRequests = "El texto es demasiado largo.";
  if (!b.consents?.policies) f["consents.policies"] = "Debes aceptar las políticas de reserva.";
  if (!b.consents?.dataProcessing) f["consents.dataProcessing"] = "Debes autorizar el tratamiento de datos.";
  return f;
}

// Código legible sin caracteres ambiguos (0/O, 1/I).
export function newReservationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return "VF-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

// Las fechas se retienen mientras se paga el abono; si no se aprueba a tiempo, la retención vence y se liberan.
export function depositDueAt(now = Date.now()) {
  return new Date(now + DEFAULT_HOLD * 6e4).toISOString();
}

// Reservas activas de una unidad que chocan con un bloqueo de `from` a `to` (incluido).
export function clashingReservations<R extends Occupancy["reservations"][number]>(rs: R[], cabinTypeId: string, unit: number, from: string, to: string) {
  return rs.filter((r) => r.cabinTypeId === cabinTypeId && r.unit === unit && ACTIVE_STATUSES.includes(r.status) && r.checkIn <= to && from < r.checkOut);
}

// ¿Está libre la unidad todas las noches de [ci, co)?
export function unitFree(occ: Occupancy, units: number, typeId: string, unit: number, ci: string, co: string, ignoreCode?: string) {
  for (let d = ci; d < co; d = addDays(d, 1)) if (!freeUnits(occ, units, typeId, d, ignoreCode).includes(unit)) return false;
  return true;
}

// "Cabaña Familiar Grande" → "familiar-grande" (id de una cabaña nueva).
export const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^caba[nñ]a\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
