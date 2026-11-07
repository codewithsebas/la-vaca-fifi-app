// Reglas de reserva compartidas por el servidor (Supabase) y el modo simulado.
import { config, type CabinTypeId } from "@/lib/config";
import { DEFAULT_HOLD, HOLD_OPTIONS } from "@/lib/payments";
import { WD, WD_FULL, addDays, cop, fmtDate, isISO, nightsBetween, parseISO } from "@/lib/format";
import type {
  Availability,
  Block,
  CabinType,
  ChannelStay,
  ExtraCabin,
  FieldErrors,
  ImportRow,
  ManualReservationInput,
  PersonRates,
  Quote,
  RateSeason,
  ReservationInput,
  ReservationStatus,
  SeasonDayRate,
} from "@/lib/types";

export const ACTIVE_STATUSES: ReservationStatus[] = ["pending_deposit", "confirmed", "rescheduled", "checked_in"];

// Desde qué estados aplica cada acción del panel, y a cuál lleva (la API y el panel sin conexión validan lo mismo).
export const TRANSITIONS: Record<string, { from: ReservationStatus[]; to?: ReservationStatus }> = {
  confirm: { from: ["pending_deposit", "expired"] },
  balance: { from: ["confirmed", "rescheduled", "checked_in"] },
  checkin: { from: ["confirmed", "rescheduled"], to: "checked_in" },
  checkout: { from: ["checked_in"], to: "completed" },
  cancel: { from: ["pending_deposit", "confirmed", "rescheduled"], to: "cancelled" },
  reschedule: { from: ["pending_deposit", "confirmed", "rescheduled"] },
  extend_hold: { from: ["pending_deposit", "expired"] },
  note: { from: ["pending_deposit", "confirmed", "cancelled", "expired", "rescheduled", "checked_in", "completed"] },
  guest: { from: ["pending_deposit", "confirmed", "cancelled", "expired", "rescheduled", "checked_in", "completed"] },
};

// Motivos de bloqueo ("Otro" exige una descripción).
export const BLOCK_REASONS = ["Mantenimiento", "Uso propio", "Evento privado", "Otro"];
// Motivos de bloqueo de un baño ("Otro" exige una descripción).
export const BATHROOM_BLOCK_REASONS = ["Mantenimiento", "Reparación", "Limpieza profunda", "Otro"];

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Datos del huésped editados por el equipo. Sin documento (SD): el número es el teléfono.
export function validateGuest(g: { fullName?: string; docType?: string; docNumber?: string; email?: string; phone?: string; city?: string }) {
  const f: Record<string, string> = {};
  if ((g.fullName ?? "").trim().length < 3 || (g.fullName ?? "").length > 120) f.fullName = "Escribe el nombre completo.";
  if (!["CC", "CE", "Pasaporte", "PPT", "SD"].includes(g.docType ?? "")) f.docType = "Elige el tipo de documento.";
  else if (g.docType !== "SD" && !/^[A-Za-z0-9]{5,15}$/.test((g.docNumber ?? "").trim()))
    f.docNumber = "Entre 5 y 15 letras o números, sin espacios ni puntos.";
  if (g.email && (!EMAIL_RE.test(g.email.trim()) || g.email.length > 160)) f.email = "Escribe un correo válido.";
  const phone = String(g.phone ?? "").replace(/\D/g, "");
  if (phone.length < 7 || phone.length > 15) f.phone = "Escribe un celular válido.";
  if ((g.city ?? "").length > 60) f.city = "Máximo 60 caracteres.";
  return f;
}

const IMPORT_STATUSES: ImportRow["status"][] = ["confirmed", "completed", "cancelled"];

// Motivo por el que una fila importada no se puede crear (o null si está bien).
export function invalidImportRow(r: ImportRow, units: Partial<Record<string, number>>): string | null {
  if (!r || typeof r.ref !== "string" || !r.ref.trim() || r.ref.length > 80) return "Falta la referencia de la reserva.";
  if (!String(r.guest ?? "").trim() || r.guest.length > 120) return "Falta el nombre del huésped.";
  if (r.email && (!EMAIL_RE.test(r.email.trim()) || r.email.length > 160)) return "El correo no es válido.";
  if (!isISO(r.checkIn) || !isISO(r.checkOut) || r.checkOut <= r.checkIn) return "Las fechas no son válidas.";
  if (nightsBetween(r.checkIn, r.checkOut) > 60) return "La estadía supera 60 noches.";
  const max = units[r.cabinTypeId];
  if (!max) return "La cabaña no existe en el panel.";
  if (!Number.isInteger(r.unit) || r.unit < 1 || r.unit > max) return "Esa unidad no existe en la cabaña.";
  if (!Number.isFinite(r.total) || r.total < 0 || r.total > 100_000_000) return "El valor no es válido.";
  if (!Number.isFinite(r.commission) || r.commission < 0) return "La comisión no es válida.";
  if (!IMPORT_STATUSES.includes(r.status)) return "El estado no es válido.";
  return null;
}

// Documento de una reserva importada sin documento: el teléfono (agrupa al cliente); sin teléfono, la referencia.
export function importDocNumber(r: Pick<ImportRow, "ref" | "phone">) {
  const phone = String(r.phone ?? "")
    .replace(/\D/g, "")
    .slice(0, 15);
  return (phone.length >= 5 ? phone : r.ref.replace(/[^A-Za-z0-9]/g, "")).slice(0, 15).toUpperCase().padEnd(5, "0");
}

// Lo mínimo para saber qué unidades están ocupadas.
export type Occupancy = {
  reservations: { code: string; cabinTypeId: string; unit: number; checkIn: string; checkOut: string; status: ReservationStatus }[];
  blocks: { cabinTypeId: string; unit: number; from: string; to: string }[];
};

export type Units = Partial<Record<CabinTypeId, number>>;

type Priced = Pick<CabinType, "id" | "precioPareja" | "personaAdicional" | "preciosPersonas" | "dayRates">;

// Número con el que se muestra una unidad: el propio, si tiene; si no, su posición. Internamente siempre es la posición.
export const unitLabel = (c: { unitLabels?: string[] } | null | undefined, unit: number) => c?.unitLabels?.[unit - 1]?.trim() || String(unit);

// Nombre de una cabaña física, como en Booking: «Cabaña 3». El tipo (Doble, Familiar…) se muestra aparte cuando hace falta.
export const cabinName = (c: { unitLabels?: string[] } | null | undefined, unit: number) => `Cabaña ${unitLabel(c, unit)}`;

// Números de unidad limpios: uno por unidad, sin espacios y sin nada de más (al reducir unidades se descartan los que sobran).
export const cleanUnitLabels = (labels: unknown, units: number): string[] =>
  Array.from({ length: units }, (_, i) => String((Array.isArray(labels) ? labels[i] : "") ?? "").trim());

// Hasta 6 letras o números, sin repetirse dentro de la cabaña (también contra la posición de las que quedan en blanco).
export function invalidUnitLabels(labels: unknown, units: number): string | null {
  const clean = cleanUnitLabels(labels, units);
  if (clean.some((x) => x && !/^[\p{L}\p{N}-]{1,6}$/u.test(x))) return "Cada número de unidad admite hasta 6 letras o números.";
  const shown = clean.map((x, i) => x || String(i + 1));
  const repeated = shown.find((x, i) => shown.indexOf(x) !== i);
  return repeated ? `El número ${repeated} está repetido en esta cabaña.` : null;
}

// Cantidades de personas con precio propio, de menor a mayor. Sin tabla: vacío.
export const personSteps = (r?: PersonRates | null) =>
  Object.keys(r ?? {})
    .map(Number)
    .sort((a, b) => a - b);

// Precio de una noche según las personas: su fila; si no la hay, la más cercana por debajo; con menos que la primera, la primera.
export function tierPrice(r: PersonRates, guests: number) {
  const steps = personSteps(r);
  const step = [...steps].reverse().find((n) => n <= guests) ?? steps[0];
  return r[step];
}

// Desde cuánto se cobra y para cuántas personas (precios «desde» del panel y del sitio).
export function rateFrom(x: { precioPareja: number; preciosPersonas?: PersonRates }) {
  const first = personSteps(x.preciosPersonas)[0];
  return first ? { price: x.preciosPersonas![first], guests: first } : { price: x.precioPareja, guests: 2 };
}

// "2 personas: $200.000 · 3 personas: $210.000"
export const personRatesText = (r: PersonRates) =>
  personSteps(r)
    .map((n) => `${n} ${n === 1 ? "persona" : "personas"}: ${cop(r[n])}`)
    .join(" · ");

// Tabla válida: vacía, o personas enteras seguidas (entre 1 y 12) y cada una con precio. Devuelve el error en palabras.
export function invalidPersonRates(r: unknown): string | null {
  if (r === undefined || r === null) return null;
  if (typeof r !== "object" || Array.isArray(r)) return "Los precios por personas no son válidos.";
  const rates = r as PersonRates;
  const steps = personSteps(rates);
  if (steps.some((n, i) => !Number.isInteger(n) || n < 1 || n > 12 || (i > 0 && n !== steps[i - 1] + 1))) return "Los precios por personas no son válidos.";
  const bad = steps.find((n) => !Number.isInteger(rates[n]) || rates[n] <= 0 || rates[n] > 50_000_000);
  return bad ? `Escribe el precio para ${bad} ${bad === 1 ? "persona" : "personas"}.` : null;
}

// Solo las filas válidas de una tabla (personas enteras y precios), hasta la capacidad de la cabaña si se indica.
export const cleanPersonRates = (r?: PersonRates | null, max = 12): PersonRates =>
  Object.fromEntries(personSteps(r).flatMap((n) => (Number.isInteger(n) && n >= 1 && n <= max ? [[String(n), r![n]]] : [])));

// Regla de precio por día que aplica a una noche de la temporada: primero una fecha puntual, luego un día de la semana.
export function dayRateFor(s: Pick<RateSeason, "dayRates">, night: string) {
  const rules = s.dayRates ?? [];
  const dow = parseISO(night).getUTCDay();
  return rules.find((r) => r.dates.includes(night)) ?? rules.find((r) => r.weekdays.includes(dow)) ?? null;
}

// Tarifa de una noche: la temporada activa que la cubre (con su precio por día, si lo tiene) o, si no hay, la tarifa
// base de la cabaña (con su precio por día de la semana, si lo tiene).
export function nightlyRate(t: Priced, seasons: RateSeason[], night: string) {
  const s = seasons.find((x) => x.activa && x.cabinTypeId === t.id && x.from <= night && night <= x.to);
  const r = s ? dayRateFor(s, night) : dayRateFor({ dayRates: t.dayRates ?? [] }, night);
  const source = r ?? s ?? t;
  const from = rateFrom(source);
  const tiers = personSteps(source.preciosPersonas).length ? source.preciosPersonas! : null;
  // couple: lo mínimo que cuesta la noche, para fromGuests personas (2, si no hay tabla).
  return { couple: from.price, fromGuests: from.guests, extra: tiers ? 0 : source.personaAdicional, tiers, season: s ?? null, dayRate: r };
}

// "Vie y Sáb" · "Lun a Jue" · "24 dic, 31 dic": para qué noches es una regla de precio por día.
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // la semana empieza el lunes
export function dayRateLabel(r: SeasonDayRate) {
  if (r.dates.length)
    return [...r.dates]
      .sort()
      .map((d) => fmtDate(d).replace(/^\S+ /, ""))
      .join(", ");
  const days = WEEK.filter((d) => r.weekdays.includes(d));
  const run = days.length > 2 && days.every((d, i) => i === 0 || WEEK.indexOf(d) === WEEK.indexOf(days[i - 1]) + 1);
  if (run) return `${WD[days[0]]} a ${WD[days[days.length - 1]]}`;
  return days.map((d) => WD[d]).join(days.length === 2 ? " y " : ", ");
}

export const MAX_DAY_RATES = 10;

// Reglas de precio por día de una temporada: cada una con días o con fechas (dentro de la temporada), sin repetir un día
// ni una fecha entre reglas, y con precio. Devuelve el error en palabras.
export function invalidDayRates(rules: unknown, from: string, to: string): string | null {
  if (!Array.isArray(rules)) return "Los precios por día no son válidos.";
  if (rules.length > MAX_DAY_RATES) return `Máximo ${MAX_DAY_RATES} precios por día en una temporada.`;
  const days = new Set<number>();
  const dates = new Set<string>();
  for (const r of rules as SeasonDayRate[]) {
    const wd = Array.isArray(r?.weekdays) ? r.weekdays : null;
    const ds = Array.isArray(r?.dates) ? r.dates : null;
    if (!wd || !ds || wd.length > 0 === ds.length > 0) return "Elige los días o las fechas de cada precio por día.";
    if (wd.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return "Los días de la semana no son válidos.";
    if (ds.length > 60 || ds.some((d) => !isISO(d) || d < from || d > to)) return "Las fechas de un precio por día deben estar dentro de la temporada.";
    for (const d of wd) {
      if (days.has(d)) return `El ${WD_FULL[d].toLowerCase()} está en dos precios por día.`;
      days.add(d);
    }
    for (const d of ds) {
      if (dates.has(d)) return `El ${fmtDate(d, true)} está en dos precios por día.`;
      dates.add(d);
    }
    const money = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 50_000_000;
    const badTiers = invalidPersonRates(r.preciosPersonas);
    if (badTiers) return badTiers;
    if (!money(r.precioPareja) || (r.precioPareja <= 0 && !personSteps(r.preciosPersonas).length) || !money(r.personaAdicional))
      return "Escribe el precio de cada precio por día.";
  }
  return null;
}

// Precios por día de la tarifa base: solo días de la semana (las fechas puntuales son de las temporadas).
export function invalidBaseDayRates(rules: unknown): string | null {
  if (rules === undefined) return null;
  if (!Array.isArray(rules)) return "Los precios por día no son válidos.";
  if (rules.some((r: SeasonDayRate) => Array.isArray(r?.dates) && r.dates.length > 0)) return "La tarifa base solo admite días de la semana.";
  return invalidDayRates(rules, "1900-01-01", "9999-12-31");
}

// Copia limpia de las reglas (solo los campos conocidos, días y fechas ordenados y sin repetir).
export const cleanDayRates = (rules: SeasonDayRate[]): SeasonDayRate[] =>
  rules.map((r) => ({
    weekdays: [...new Set(r.weekdays)].sort((a, b) => a - b),
    dates: [...new Set(r.dates)].sort(),
    precioPareja: r.precioPareja,
    personaAdicional: r.personaAdicional,
    preciosPersonas: cleanPersonRates(r.preciosPersonas),
  }));

// Cotización noche a noche (cada noche puede caer en una temporada distinta).
// depositPct: abono para confirmar (Condiciones de pago); por defecto, el de lib/config.
export function computeQuote(t: Priced, checkIn: string, checkOut: string, guests: number, seasons: RateSeason[] = [], depositPct = config.depositPct): Quote {
  const nights = nightsBetween(checkIn, checkOut);
  const adicionales = Math.max(0, guests - 2);
  let base = 0;
  let extraAmount = 0;
  let seasonNights = 0;
  let extraNights = 0; // noches que cobran «pareja + adicional»: las de tabla por personas ya incluyen a todos en la base
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) {
    const r = nightlyRate(t, seasons, d);
    if (r.tiers) base += tierPrice(r.tiers, guests);
    else {
      base += r.couple;
      extraAmount += adicionales * r.extra;
      extraNights++;
    }
    if (r.season) seasonNights++;
  }
  const extraGuests = extraNights ? adicionales : 0;
  const total = base + extraAmount;
  const deposit = Math.round((total * depositPct) / 100);
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
    extraPerNight: extraNights && extraGuests ? Math.round(extraAmount / (extraNights * extraGuests)) : t.personaAdicional,
  };
}

// Precio especial acordado por el equipo: el total cambia, el abono se recalcula con el mismo porcentaje y la diferencia
// con la tarifa queda en `adjustment` (negativo = descuento).
export function withTotal(q: Quote, total: number, depositPct = config.depositPct): Quote {
  const deposit = Math.round((total * depositPct) / 100);
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
// y el plazo para pagar el abono. No pide casilla de políticas: la reserva la toma el equipo, no la web.
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
  depositPct = config.depositPct,
): Availability {
  const nights = nightsBetween(ci, co);
  return {
    nights,
    options: types.map((t) => {
      let left = Infinity;
      for (let d = ci; d < co; d = addDays(d, 1)) left = Math.min(left, freeUnits(occ, units[t.id] ?? 0, t.id, d).length);
      if (!isFinite(left)) left = 0;
      const fits = guests <= t.maxPersonas;
      const n = units[t.id] ?? 0;
      return {
        cabinTypeId: t.id,
        available: left > 0 && fits,
        unitsLeft: left,
        reason: !fits ? "capacity" : left > 0 ? null : "dates",
        quote: computeQuote(t, ci, co, guests, seasons, depositPct),
        // Para reservar varias cabañas: unidades libres todas las noches y la tarifa según cuántos se alojen en cada una.
        unitsFree: Array.from({ length: n }, (_, i) => i + 1).filter((u) => unitFree(occ, n, t.id, u, ci, co)).length,
        quoteBy: Object.fromEntries(Array.from({ length: t.maxPersonas }, (_, i) => [String(i + 1), computeQuote(t, ci, co, i + 1, seasons, depositPct)])),
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

// Reparte un total acordado entre las cabañas de un grupo en proporción a su tarifa; el redondeo queda en la primera.
export function splitTotal(quotes: Pick<Quote, "total">[], total: number): number[] {
  const sum = quotes.reduce((s, q) => s + q.total, 0);
  const parts = quotes.map((q) => (sum > 0 ? Math.floor((q.total * total) / sum) : Math.floor(total / quotes.length)));
  parts[0] += total - parts.reduce((s, p) => s + p, 0);
  return parts;
}

// Hasta cuántas cabañas puede tener una reserva.
export const MAX_GROUP_CABINS = 12;

// Las demás cabañas de una reserva con varias (`more`): tipo, personas y, en el panel, la unidad. Errores en "more.<i>".
export function validateExtraCabins(more: unknown, types: CabinType[], units?: Partial<Record<string, number>>): FieldErrors {
  const f: FieldErrors = {};
  if (more === undefined || more === null) return f;
  if (!Array.isArray(more) || more.length > MAX_GROUP_CABINS - 1) return { more: `Una reserva admite hasta ${MAX_GROUP_CABINS} cabañas.` };
  more.forEach((m: Partial<ExtraCabin> | null, i) => {
    const t = types.find((x) => x.id === m?.cabinTypeId && x.activa !== false);
    const adults = Number(m?.adults);
    const children = Number(m?.children ?? 0);
    if (!t) f[`more.${i}`] = "Elige el tipo de cabaña.";
    else if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) f[`more.${i}`] = "Número de huéspedes no válido.";
    else if (adults + children > t.maxPersonas) f[`more.${i}`] = `${t.nombre}: máximo ${t.maxPersonas} personas.`;
    else if (m?.unit != null && (!Number.isInteger(m.unit) || m.unit < 1 || m.unit > (units?.[t.id] ?? 0))) f[`more.${i}`] = "Número de cabaña no válido.";
  });
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

/* ───────────── Booking.com (calendarios iCal) ───────────── */

export const CHANNEL_ID = "booking:";

// Las noches ocupadas en Booking entran a la disponibilidad como bloqueos (hasta la última noche, incluida): así cuentan
// en freeUnits, findUnit y el calendario del panel sin reglas aparte. No cuentan las canceladas (removedAt) ni los ecos
// (las noches que Booking cerró porque ya estaban ocupadas en el panel).
export function channelBlocks(stays: ChannelStay[]): Block[] {
  return stays
    .filter((s) => !s.removedAt && !s.echo)
    .map((s) => ({
      id: CHANNEL_ID + s.id,
      cabinTypeId: s.cabinTypeId,
      unit: s.unit,
      from: s.checkIn,
      to: addDays(s.checkOut, -1),
      reason: "Booking.com",
      notes: s.summary,
    }));
}
export const isChannelBlock = (b: Pick<Block, "id">) => b.id.startsWith(CHANNEL_ID);

// Bloqueos del panel más las noches de Booking: lo que ocupa una cabaña al calcular disponibilidad en el panel.
export const busyBlocks = (d: { blocks: Block[]; channelStays?: ChannelStay[] }): Block[] => [...d.blocks, ...channelBlocks(d.channelStays ?? [])];
