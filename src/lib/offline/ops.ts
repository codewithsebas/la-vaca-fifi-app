// Registro central de operaciones del panel: cada escritura se describe una sola vez (permiso, validación local, efecto local,
// cómo se envía y cómo se fusiona). El motor (engine.ts) no sabe de módulos y los módulos no saben de la cola. Funciones puras.
import {
  ACTIVE_STATUSES,
  BLOCKING_STATUSES,
  EMAIL_RE,
  cleanDayRates,
  cleanPersonRates,
  cleanUnitLabels,
  computeQuote,
  busyBlocks,
  invalidPersonRates,
  invalidUnitLabels,
  findUnit,
  invalidDayRates,
  newReservationCode,
  normalizePhone,
  slugify,
  validateGuest,
  validateManualReservation,
  withTotal,
  TRANSITIONS,
  type Occupancy,
} from "@/lib/booking";
import { addDays, dateOf, isISO, nightsBetween, todayISO } from "@/lib/format";
import { uuid } from "@/lib/offline/config";
import { sorted, unitsOf } from "@/lib/offline/data";
import { manualPaymentNote, unpaidUntil } from "@/lib/payments";
import { can, type Permission } from "@/lib/permissions";
import type { SiteContent, SiteService } from "@/lib/site";
import type {
  AdminAction,
  AdminData,
  Bathroom,
  BathroomBlockInput,
  BathroomInput,
  BlockInput,
  CabinInput,
  CabinType,
  ClientProfile,
  ClientProfileInput,
  EmailRecord,
  Guest,
  ImportRow,
  ManualReservationInput,
  PaymentKind,
  PaymentRecord,
  PaymentTerms,
  ProofReview,
  Rates,
  Reservation,
  SeasonInput,
  SiteInput,
} from "@/lib/types";
import type { PanelColors } from "@/lib/panel-colors";

export type OpState = "pending" | "confirmed" | "conflict";

export type FieldDiff = { field: string; mine: unknown; theirs: unknown };
export type OpConflict = { code: string; status: number; fields?: FieldDiff[]; gone?: boolean; detail?: unknown };

export type Op = {
  seq: number; // lugar en la cola
  opId: string; // clave de idempotencia
  type: string;
  payload: unknown;
  entities: string[]; // "reservations:VF-X": el primero es el registro de la operación; los demás, de los que depende
  label: string;
  occurredAt: string;
  userId: string;
  schema: number;
  state: OpState;
  attempts: number;
  nextAt: number; // no antes de esta hora (reintentos)
  baseVersion: number | null; // versión de la fila en el servidor al hacer el cambio
  baseFields: Record<string, unknown> | null; // los campos antes del cambio (para fundir con cambios de otros)
  rebase?: boolean; // una operación anterior de este mismo registro se confirmó: cambiar la versión base antes de enviar
  conflict?: OpConflict;
  result?: unknown;
};

export const OP_SCHEMA = 1;

export type OpRequest = {
  method: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  form?: { fields: Record<string, string | Blob>; fileName?: string };
};
export type LocalError = { status: number; data: unknown };
type Ctx = { me: AdminData["me"]; now: number; today: string };

export type OpDef<P> = {
  perm?: Permission;
  label: (p: P, d: AdminData) => string;
  entities: (p: P) => string[];
  // Completa la operación al crearla: identificadores, valores calculados. Puede rechazarla con el mismo error del servidor.
  prepare?: (p: P, d: AdminData, ctx: Ctx) => P | LocalError;
  validate?: (p: P, d: AdminData, ctx: Ctx) => LocalError | null;
  request: (p: P) => OpRequest;
  apply: (d: AdminData, p: P, op: Pick<Op, "opId" | "occurredAt">) => AdminData;
  // La respuesta para el módulo cuando el cambio queda guardado en este dispositivo: la misma forma que la del servidor.
  result: (d: AdminData, p: P, op: Pick<Op, "opId" | "occurredAt">) => unknown;
  okStatus?: number;
  // Control de concurrencia: versión de la fila, y sus campos si se pueden fundir con los cambios de otra persona.
  version?: (d: AdminData, p: P) => number | undefined;
  view?: (d: AdminData, p: P) => Record<string, unknown> | null;
  // La respuesta significa que lo pedido ya está hecho (otra persona hizo lo mismo).
  done?: (status: number, body: unknown, p: P) => boolean;
  // El servidor aceptó la operación, pero parte de ella no se aplicó: hay que mostrarlo (si se envió sin que nadie mirara).
  partial?: (body: unknown) => { code: string; detail: unknown } | null;
  // Compactar con la operación anterior del mismo registro, si aún no se ha enviado.
  family?: { name: string; role: "create" | "update" | "delete"; merge?: (prev: P, next: P) => P };
  // «Usar lo mío» en un conflicto.
  force?: (p: P, conflict: OpConflict) => P;
  // Registro borrado en el servidor con cambios locales: recrearlo con los datos de la operación.
  recreate?: { type: string; payload: (p: P, d: AdminData) => unknown };
};

const err = (status: number, error: string, extra?: object): LocalError => ({ status, data: { error, ...extra } });
const isErr = (v: unknown): v is LocalError => !!v && typeof v === "object" && "status" in v && "data" in v;
export const isLocalError = isErr;
const fieldErr = (fields: Record<string, string>) => err(422, "VALIDATION_ERROR", { fields });
const nowIso = (op: { occurredAt: string }) => op.occurredAt;

const omit = <T extends object>(obj: T, ...keys: string[]) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

const swap = <T>(list: T[], match: (x: T) => boolean, fn: (x: T) => T) => list.map((x) => (match(x) ? fn(x) : x));

/* ───────────── Reservas ───────────── */

const occupancy = (d: AdminData): Occupancy => ({
  reservations: d.reservations.map((r) => ({
    code: r.code,
    cabinTypeId: r.cabinTypeId,
    unit: r.unit,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    status: r.status,
  })),
  blocks: busyBlocks(d).map((b) => ({ cabinTypeId: b.cabinTypeId, unit: b.unit, from: b.from, to: b.to })),
});

const activeSeasons = (d: AdminData) => d.seasons.filter((s) => s.activa);
const depositPct = (d: AdminData) => d.site.settings.depositPct;

export type NewReservation = ManualReservationInput & { code: string; localUnit: number; localQuote: Reservation["quote"]; arrival: string };

const clientKeyOf = (g: Pick<Guest, "docType" | "docNumber">) => `${g.docType}:${g.docNumber.trim().toUpperCase()}`;

const updateReservation = (d: AdminData, code: string, fn: (r: Reservation) => Reservation): AdminData => ({
  ...d,
  reservations: swap(d.reservations, (r) => r.code === code, fn),
});

// Mismas reglas que register_manual_payment.
function paymentOutcome(r: Reservation, kind: PaymentKind, amount: number | null) {
  const total = r.quote.total;
  const owed = total - r.paid;
  if (owed <= 0 || r.balancePaidAt) return err(409, "ALREADY_PAID");
  const pending = r.status === "pending_deposit" || r.status === "expired";
  if (!pending && !["confirmed", "rescheduled", "checked_in"].includes(r.status)) return err(422, "NOT_APPLICABLE");
  const amt = amount ?? (kind === "deposit" ? Math.min(r.quote.deposit, owed) : owed);
  if (amt <= 0 || amt > owed) return err(422, "INVALID_AMOUNT");
  return { amt, pending, covered: amt >= owed, kind: (r.depositPaidAt ? "balance" : amt >= owed ? "full" : "deposit") as PaymentKind };
}

function applyPayment(d: AdminData, code: string, kind: PaymentKind, amount: number | null, note: string, op: Pick<Op, "opId" | "occurredAt">): AdminData {
  const r = d.reservations.find((x) => x.code === code);
  if (!r) return d;
  const o = paymentOutcome(r, kind, amount);
  if (isErr(o)) return d;
  const at = nowIso(op);
  const record: PaymentRecord = {
    id: op.opId,
    reservationCode: code,
    reference: `${code}-LOCAL`,
    kind: o.kind,
    status: "approved",
    amount: o.amt,
    provider: "manual",
    method: "",
    detail: note || "Registrado por el equipo",
    createdAt: at,
    expiresAt: null,
    approvedAt: at,
  };
  return {
    ...updateReservation(d, code, (x) => ({
      ...x,
      // Sin abono no apartaba: al confirmarse toma su cabaña si sigue libre, o la primera libre (como en el servidor).
      unit: o.pending ? freeUnitFor(d, x) || x.unit : x.unit,
      status: o.pending ? "confirmed" : x.status,
      paid: x.paid + o.amt,
      depositPaidAt: x.depositPaidAt ?? at,
      balancePaidAt: o.covered ? at : x.balancePaidAt,
    })),
    payments: sorted("payments", [record, ...d.payments.filter((p) => p.id !== op.opId)]),
  };
}

// Cabaña libre para una reserva sin abono que se confirma: la suya si sigue libre; si no, la primera de su tipo (0: ninguna).
function freeUnitFor(d: AdminData, r: Reservation) {
  const type = d.cabinTypes.find((t) => t.id === r.cabinTypeId);
  return type ? findUnit(occupancy(d), type.units, type.id, r.checkIn, r.checkOut, r.code, [r.unit]) : 0;
}

const reservationOf = (d: AdminData, code: string) => d.reservations.find((r) => r.code === code) ?? null;

type GuestEdit = Guest & { code: string };

const guestFields = (g: Guest) => ({ fullName: g.fullName, docType: g.docType, docNumber: g.docNumber, email: g.email, phone: g.phone, city: g.city });
const ACTION_LABEL: Record<string, string> = {
  confirm: "Pago registrado",
  balance: "Pago registrado",
  checkin: "Check-in",
  checkout: "Check-out",
  cancel: "Cancelación",
  reschedule: "Reprogramación",
  extend_hold: "Plazo de pago",
  note: "Nota",
};
const ACTION_TARGET: Record<string, string> = { cancel: "cancelled", checkin: "checked_in", checkout: "completed" };

const reservationOps = {
  "reservation.create": {
    label: (p) => `Reserva nueva ${p.code} · ${p.guest.fullName}`,
    entities: (p) => [`reservations:${p.code}`, `cabinTypes:${p.cabinTypeId}`],
    prepare: (input, d, { today }) => {
      const types = d.cabinTypes.filter((c) => c.activa);
      const units = unitsOf(types);
      const b: ManualReservationInput = {
        ...input,
        unit: input.unit ?? null,
        total: input.total ?? null,
        guest: { ...input.guest, phone: normalizePhone(input.guest.phone) },
      };
      const fields = validateManualReservation(b, types, units, today);
      if (Object.keys(fields).length) return fieldErr(fields);
      const type = types.find((t) => t.id === b.cabinTypeId)!;
      const occ = occupancy(d);
      // Solo la unidad pedida, si se eligió una: las demás cuentan como ocupadas.
      const others = b.unit ? Array.from({ length: units[type.id] ?? 0 }, (_, i) => i + 1).filter((u) => u !== b.unit) : [];
      const unit = findUnit(
        { ...occ, blocks: [...occ.blocks, ...others.map((u) => ({ cabinTypeId: type.id, unit: u, from: b.checkIn, to: addDays(b.checkOut, -1) }))] },
        units[type.id] ?? 0,
        type.id,
        b.checkIn,
        b.checkOut,
      );
      if (!unit) return err(409, "DATES_UNAVAILABLE");
      const quote = computeQuote(type, b.checkIn, b.checkOut, b.adults + b.children, activeSeasons(d), depositPct(d));
      const finalQuote = b.total ? withTotal(quote, b.total, depositPct(d)) : quote;
      return {
        ...b,
        code: newReservationCode(),
        expectedTotal: finalQuote.total,
        localUnit: unit,
        localQuote: finalQuote,
        arrival: b.estimatedArrival || d.site.settings.checkInStart,
      } as NewReservation;
    },
    request: (p) => ({ method: "POST", path: "/admin/reservations", body: omit(p, "localUnit", "localQuote", "arrival") }),
    apply: (d, p, op) => {
      const g = p.guest;
      const docNumber = g.docNumber.trim().toUpperCase();
      const r: Reservation = {
        code: p.code,
        status: "pending_deposit",
        cabinTypeId: p.cabinTypeId,
        unit: p.localUnit,
        checkIn: p.checkIn,
        checkOut: p.checkOut,
        adults: p.adults,
        children: p.children,
        pet: { hasPet: !!p.pet?.hasPet, smallBreedConfirmed: !!p.pet?.hasPet },
        decoration: { requested: false, occasion: "", notes: "" },
        estimatedArrival: p.arrival,
        guest: { fullName: g.fullName.trim(), docType: g.docType, docNumber, email: g.email.trim(), phone: g.phone, city: (g.city ?? "").trim() },
        specialRequests: (p.specialRequests ?? "").trim(),
        consents: { policies: false, dataProcessing: false, marketing: false },
        quote: p.localQuote,
        depositDueAt: unpaidUntil(p.checkIn),
        createdAt: op.occurredAt,
        notes: [],
        depositPaidAt: null,
        balancePaidAt: null,
        paid: 0,
        checkedInAt: null,
        clientKey: clientKeyOf({ docType: g.docType, docNumber }),
        source: "panel",
      };
      return { ...d, reservations: sorted("reservations", [r, ...d.reservations.filter((x) => x.code !== p.code)]) };
    },
    result: (d, p) => ({ reservation: reservationOf(d, p.code) }),
    okStatus: 201,
    // «Usar lo mío» con otra tarifa: se acepta el valor del servidor.
    force: (p, c) => ({ ...p, expectedTotal: (c.detail as { total?: number } | undefined)?.total ?? p.expectedTotal }),
  } satisfies OpDef<NewReservation>,

  "reservation.guest": {
    label: (p) => `Datos de ${p.fullName} · ${p.code}`,
    entities: (p) => [`reservations:${p.code}`],
    validate: (p) => {
      const fields = validateGuest(p);
      return Object.keys(fields).length ? fieldErr(Object.fromEntries(Object.entries(fields).map(([k, v]) => [`guest.${k}`, v]))) : null;
    },
    request: ({ code, ...guest }) => ({ method: "POST", path: "/admin/action", body: { code, action: "guest", guest: guestFields(guest) } }),
    apply: (d, p) =>
      updateReservation(d, p.code, (r) => ({
        ...r,
        guest: {
          ...guestFields(p),
          fullName: p.fullName.trim(),
          docNumber: p.docType === "SD" ? normalizePhone(p.phone).replace(/\D/g, "").slice(0, 15) : p.docNumber.trim().toUpperCase(),
          phone: normalizePhone(p.phone),
          email: (p.email ?? "").trim(),
          city: (p.city ?? "").trim(),
        },
      })),
    result: (d, p) => reservationOf(d, p.code),
    version: (d, p) => reservationOf(d, p.code)?.version,
    view: (d, p) => {
      const r = reservationOf(d, p.code);
      return r ? guestFields(r.guest) : null;
    },
    family: { name: "guest", role: "update" },
  } satisfies OpDef<GuestEdit>,

  "reservation.action": {
    label: (p, d) => `${ACTION_LABEL[p.action] ?? "Cambio"} · ${p.code}${reservationOf(d, p.code) ? ` · ${reservationOf(d, p.code)!.guest.fullName}` : ""}`,
    entities: (p) => [`reservations:${p.code}`],
    prepare: (p, d, { me, today, now }) => {
      if (p.action === "cancel" && !can(me.role, "cancel")) return err(403, "FORBIDDEN");
      const r = reservationOf(d, p.code);
      if (!r) return err(404, "NOT_FOUND");
      if (!TRANSITIONS[p.action]?.from.includes(r.status)) return err(422, "INVALID_TRANSITION", { status: r.status });
      if (p.action === "checkout" && !r.balancePaidAt && r.paid < r.quote.total) return err(422, "BALANCE_PENDING");
      if (p.action === "note" && !String(p.text ?? "").trim()) return err(400, "INVALID_BODY");
      if (p.action === "extend_hold") {
        if (Date.parse(unpaidUntil(r.checkIn)) <= now) return err(422, "HOLD_TOO_SHORT");
      }
      if (p.action === "confirm" || p.action === "balance") {
        const amount = p.full || p.amount === undefined ? null : Number(p.amount);
        if (amount !== null && (!Number.isInteger(amount) || amount <= 0)) return err(400, "INVALID_AMOUNT");
        const o = paymentOutcome(r, p.full ? "full" : p.action === "balance" ? "balance" : "deposit", amount);
        if (isErr(o)) return o;
        if (o.pending && !freeUnitFor(d, r)) return err(409, "NO_AVAILABILITY");
        // Lo pagado que se veía: si en el servidor es otro, entró otro pago mientras tanto (¿el mismo dinero?).
        return { ...p, basePaid: r.paid };
      }
      if (p.action === "reschedule") {
        const { checkIn: ci, checkOut: co } = p;
        if (!isISO(ci) || !isISO(co) || co <= ci || ci < today || nightsBetween(ci, co) > 30) return err(400, "INVALID_DATES");
        const type = d.cabinTypes.find((t) => t.id === r.cabinTypeId);
        if (!type || !findUnit(occupancy(d), type.units, type.id, ci, co, r.code)) return err(409, "DATES_UNAVAILABLE");
      }
      return p;
    },
    request: (body) => ({ method: "POST", path: "/admin/action", body }),
    apply: (d, p, op) => {
      const r = reservationOf(d, p.code);
      if (!r) return d;
      if (p.action === "confirm" || p.action === "balance") {
        const kind = p.full ? "full" : p.action === "balance" ? "balance" : "deposit";
        return applyPayment(d, p.code, kind, p.full || p.amount === undefined ? null : Number(p.amount), manualPaymentNote(p.method, p.note), op);
      }
      if (p.action === "note")
        return updateReservation(d, p.code, (x) => ({ ...x, notes: [...x.notes, { at: op.occurredAt, text: String(p.text).trim().slice(0, 2000) }] }));
      if (p.action === "extend_hold")
        return updateReservation(d, p.code, (x) => ({
          ...x,
          status: "pending_deposit",
          depositDueAt: unpaidUntil(x.checkIn),
        }));
      if (p.action === "reschedule") {
        const type = d.cabinTypes.find((t) => t.id === r.cabinTypeId);
        if (!type) return d;
        const quote = computeQuote(type, p.checkIn, p.checkOut, r.adults + r.children, activeSeasons(d), depositPct(d));
        if (r.depositPaidAt) {
          quote.deposit = r.quote.deposit;
          quote.balance = Math.max(0, quote.total - r.paid);
        }
        const unit = findUnit(occupancy(d), type.units, type.id, p.checkIn, p.checkOut, r.code) || r.unit;
        return updateReservation(d, p.code, (x) => ({
          ...x,
          checkIn: p.checkIn,
          checkOut: p.checkOut,
          unit,
          quote,
          status: x.status === "pending_deposit" ? "pending_deposit" : "rescheduled",
          balancePaidAt: x.balancePaidAt && quote.total > x.paid ? null : x.balancePaidAt,
        }));
      }
      return updateReservation(d, p.code, (x) => ({
        ...x,
        status: ACTION_TARGET[p.action] as Reservation["status"],
        ...(p.action === "checkin" && { checkedInAt: op.occurredAt }),
      }));
    },
    result: (d, p) => reservationOf(d, p.code),
    done: (status, body, p) =>
      status === 422 &&
      (body as { error?: string; status?: string } | null)?.error === "INVALID_TRANSITION" &&
      !!ACTION_TARGET[p.action] &&
      (body as { status?: string }).status === ACTION_TARGET[p.action],
    force: (p) => (p.action === "confirm" || p.action === "balance" ? { ...p, force: true } : p),
  } satisfies OpDef<Exclude<AdminAction, { action: "guest" }> & { basePaid?: number }>,

  "proof.review": {
    label: (p, d) =>
      `${p.decision === "approve" ? "Comprobante aprobado" : "Comprobante rechazado"} · ${d.proofs.find((x) => x.id === p.id)?.reservationCode ?? ""}`,
    entities: (p) => [`proofs:${p.id}`],
    validate: (p, d) => {
      const note = String(p.note ?? "").trim();
      if (p.decision === "reject" && !note) return fieldErr({ note: "Explica el motivo del rechazo." });
      return d.proofs.some((x) => x.id === p.id) ? null : err(404, "NOT_FOUND");
    },
    request: (body) => ({ method: "POST", path: "/admin/proofs", body }),
    apply: (d, p, op) => {
      const proof = d.proofs.find((x) => x.id === p.id);
      if (!proof) return d;
      const approve = p.decision === "approve";
      const next: AdminData = {
        ...d,
        proofs: swap(
          d.proofs,
          (x) => x.id === p.id,
          (x) => ({ ...x, status: approve ? "approved" : "rejected", reviewNote: String(p.note ?? "").trim(), reviewedAt: op.occurredAt }),
        ),
      };
      const r = reservationOf(d, proof.reservationCode);
      return approve && p.confirmReservation && r && (r.status === "pending_deposit" || r.status === "expired") && !r.depositPaidAt
        ? applyPayment(next, r.code, "deposit", null, "Comprobante de pago aprobado", op)
        : next;
    },
    result: (d, p) => d.proofs.find((x) => x.id === p.id) ?? null,
    version: (d, p) => d.proofs.find((x) => x.id === p.id)?.version,
  } satisfies OpDef<ProofReview>,

  "import.run": {
    perm: "import",
    label: (p) => `Importar ${p.rows.length} reservas`,
    entities: (p) => [`imports:${p.rows[0]?.ref ?? ""}`],
    request: (body) => ({ method: "POST", path: "/admin/import", body }),
    // Sin efecto local: las reservas aparecen al sincronizar, con el informe por fila.
    apply: (d) => d,
    result: (_d, p) => ({ results: p.rows.map((r) => ({ ref: r.ref, ok: true })) }),
    partial: (body) => {
      const failed = ((body as { results?: { ref: string; ok: boolean; error?: string }[] } | null)?.results ?? []).filter((r) => !r.ok);
      return failed.length ? { code: "IMPORT_PARTIAL", detail: { failed } } : null;
    },
  } satisfies OpDef<{ rows: ImportRow[] }>,
};

/* ───────────── Bloqueos ───────────── */

type BlockCreate = BlockInput & { ids: string[]; unitList: number[] };
type BlockUpdate = BlockInput & { id: string; unit: number };

function blockClash(d: AdminData, cabinTypeId: string, units: number[], from: string, to: string, ignoreId?: string) {
  const conflicts = d.reservations
    .filter((r) => r.cabinTypeId === cabinTypeId && units.includes(r.unit) && BLOCKING_STATUSES.includes(r.status) && r.checkIn <= to && r.checkOut > from)
    .map((r) => r.code);
  if (conflicts.length) return err(409, "RESERVATION_CONFLICT", { conflicts });
  if (d.blocks.some((b) => b.id !== ignoreId && b.cabinTypeId === cabinTypeId && units.includes(b.unit) && b.from <= to && b.to >= from))
    return err(409, "BLOCK_OVERLAP");
  return null;
}

const blockBody = (b: BlockInput) => {
  if (!isISO(b.from) || !isISO(b.to) || b.to < b.from || nightsBetween(b.from, b.to) > 366) return err(400, "INVALID_BODY");
  const notes = String(b.notes ?? "").trim();
  if (notes.length > 500 || (b.reason === "Otro" && !notes)) return err(400, "INVALID_NOTES");
  return null;
};

const blockOps = {
  "block.create": {
    label: (p) => `Bloqueo ${p.from} → ${p.to}`,
    entities: (p) => [...p.ids.map((id) => `blocks:${id}`), `cabinTypes:${p.cabinTypeId}`],
    prepare: (b, d) => {
      const bad = blockBody(b);
      if (bad) return bad;
      const max = d.unidades[b.cabinTypeId];
      if (!max) return err(400, "INVALID_CABIN");
      const unitList = b.unit === "all" ? Array.from({ length: max }, (_, i) => i + 1) : [b.unit];
      if (unitList.some((u) => !Number.isInteger(u) || u < 1 || u > max)) return err(400, "INVALID_UNIT");
      const clash = blockClash(d, b.cabinTypeId, unitList, b.from, b.to);
      if (clash) return clash;
      return { ...b, notes: String(b.notes ?? "").trim(), unitList, ids: unitList.map(() => uuid()) };
    },
    request: (p) => ({ method: "POST", path: "/admin/blocks", body: omit(p, "unitList") }),
    apply: (d, p) => ({
      ...d,
      blocks: sorted("blocks", [
        ...p.unitList.map((unit, i) => ({ id: p.ids[i], cabinTypeId: p.cabinTypeId, unit, from: p.from, to: p.to, reason: p.reason, notes: p.notes })),
        ...d.blocks.filter((b) => !p.ids.includes(b.id)),
      ]),
    }),
    result: (d) => d.blocks,
    family: {
      name: "block",
      role: "create",
      merge: (prev, next) =>
        ({
          ...prev,
          ...next,
          ids: prev.ids,
          unitList: "unit" in next && typeof next.unit === "number" ? [next.unit] : prev.unitList,
          id: undefined,
        }) as BlockCreate,
    },
    // Una creación de varias unidades no se compacta (cada bloqueo se edita por su cuenta).
  } satisfies OpDef<BlockCreate>,
  "block.update": {
    label: (p) => `Bloqueo ${p.from} → ${p.to}`,
    entities: (p) => [`blocks:${p.id}`, `cabinTypes:${p.cabinTypeId}`],
    validate: (b, d) => blockBody(b) ?? blockClash(d, b.cabinTypeId, [b.unit], b.from, b.to, b.id),
    request: (body) => ({ method: "PUT", path: "/admin/blocks", body }),
    apply: (d, p) => ({
      ...d,
      blocks: sorted(
        "blocks",
        swap(
          d.blocks,
          (b) => b.id === p.id,
          (b) => ({ ...b, cabinTypeId: p.cabinTypeId, unit: p.unit, from: p.from, to: p.to, reason: p.reason, notes: String(p.notes ?? "").trim() }),
        ),
      ),
    }),
    result: (d) => d.blocks,
    version: (d, p) => d.blocks.find((b) => b.id === p.id)?.version,
    view: (d, p) => {
      const b = d.blocks.find((x) => x.id === p.id);
      return b ? { cabinTypeId: b.cabinTypeId, unit: b.unit, from: b.from, to: b.to, reason: b.reason, notes: b.notes } : null;
    },
    family: { name: "block", role: "update" },
    recreate: { type: "block.create", payload: (p) => ({ ...p, ids: [p.id], unitList: [p.unit], id: undefined }) },
  } satisfies OpDef<BlockUpdate>,
  "block.delete": {
    perm: "delete",
    label: () => "Eliminar bloqueo",
    entities: (p) => [`blocks:${p.id}`],
    request: (p) => ({ method: "DELETE", path: "/admin/blocks", query: { id: p.id } }),
    apply: (d, p) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== p.id) }),
    result: (d) => d.blocks,
    version: (d, p) => d.blocks.find((b) => b.id === p.id)?.version,
    family: { name: "block", role: "delete" },
  } satisfies OpDef<{ id: string }>,
};

/* ───────────── Baños y sus bloqueos ───────────── */

const bathsOf = (d: AdminData) => ({ bathrooms: d.bathrooms, blocks: d.bathroomBlocks });

const bathroomFrom = (p: BathroomInput, id: string, at: string, prev?: Bathroom): Bathroom => ({
  ...prev,
  id,
  name: p.name !== undefined ? String(p.name).trim() : (prev?.name ?? ""),
  status: p.status ?? prev?.status ?? "available",
  cabinTypeId: p.cabinTypeId !== undefined ? p.cabinTypeId || null : (prev?.cabinTypeId ?? null),
  unit: p.cabinTypeId !== undefined || p.unit !== undefined ? (p.cabinTypeId !== null && p.unit ? Number(p.unit) : null) : (prev?.unit ?? null),
  notes: p.notes !== undefined ? String(p.notes).trim() : (prev?.notes ?? ""),
  statusUpdatedAt: p.status && p.status !== prev?.status ? at : (prev?.statusUpdatedAt ?? at),
});

const bathroomOps = {
  "bathroom.create": {
    perm: "bathrooms",
    label: (p) => `Baño ${p.name}`,
    entities: (p) => [`bathrooms:${p.id}`],
    prepare: (p) => {
      const name = String(p.name ?? "").trim();
      if (!name || name.length > 60) return fieldErr({ name: "Escribe un nombre de hasta 60 caracteres." });
      return { ...p, id: uuid() };
    },
    request: (body) => ({ method: "POST", path: "/admin/bathrooms", body }),
    apply: (d, p, op) => ({ ...d, bathrooms: sorted("bathrooms", [bathroomFrom(p, p.id!, op.occurredAt), ...d.bathrooms.filter((b) => b.id !== p.id)]) }),
    result: bathsOf,
    family: { name: "bathroom", role: "create" },
  } satisfies OpDef<BathroomInput>,
  "bathroom.update": {
    label: (p, d) => `Baño ${d.bathrooms.find((b) => b.id === p.id)?.name ?? ""}`,
    entities: (p) => [`bathrooms:${p.id}`],
    prepare: (p, d, { me }) =>
      (p.name !== undefined || p.cabinTypeId !== undefined || p.unit !== undefined) && !can(me.role, "bathrooms") ? err(403, "FORBIDDEN") : p,
    request: (body) => ({ method: "PUT", path: "/admin/bathrooms", body }),
    apply: (d, p, op) => ({
      ...d,
      bathrooms: sorted(
        "bathrooms",
        swap(
          d.bathrooms,
          (b) => b.id === p.id,
          (b) => bathroomFrom(p, b.id, op.occurredAt, b),
        ),
      ),
    }),
    result: bathsOf,
    version: (d, p) => d.bathrooms.find((b) => b.id === p.id)?.version,
    view: (d, p) => {
      const b = d.bathrooms.find((x) => x.id === p.id);
      return b ? { name: b.name, status: b.status, cabinTypeId: b.cabinTypeId, unit: b.unit, notes: b.notes } : null;
    },
    family: { name: "bathroom", role: "update" },
  } satisfies OpDef<BathroomInput>,
  "bathroom.delete": {
    perm: "delete",
    label: (p, d) => `Eliminar baño ${d.bathrooms.find((b) => b.id === p.id)?.name ?? ""}`,
    entities: (p) => [`bathrooms:${p.id}`],
    request: (p) => ({ method: "DELETE", path: "/admin/bathrooms", query: { id: p.id } }),
    apply: (d, p) => ({ ...d, bathrooms: d.bathrooms.filter((b) => b.id !== p.id), bathroomBlocks: d.bathroomBlocks.filter((b) => b.bathroomId !== p.id) }),
    result: bathsOf,
    version: (d, p) => d.bathrooms.find((b) => b.id === p.id)?.version,
    family: { name: "bathroom", role: "delete" },
  } satisfies OpDef<{ id: string }>,
  "bathroomBlock.create": {
    label: (p) => `Bloqueo de baño ${p.from} → ${p.to}`,
    entities: (p) => [`bathroomBlocks:${p.id}`, `bathrooms:${p.bathroomId}`],
    prepare: (p, d) => {
      if (d.bathroomBlocks.some((b) => b.bathroomId === p.bathroomId && b.from <= p.to && b.to >= p.from)) return err(409, "BLOCK_OVERLAP");
      return { ...p, id: uuid() };
    },
    request: (body) => ({ method: "POST", path: "/admin/bathroom-blocks", body }),
    apply: (d, p) => ({
      ...d,
      bathroomBlocks: sorted("bathroomBlocks", [
        { id: p.id!, bathroomId: p.bathroomId, from: p.from, to: p.to, reason: p.reason, notes: String(p.notes ?? "").trim() },
        ...d.bathroomBlocks.filter((b) => b.id !== p.id),
      ]),
    }),
    result: bathsOf,
    family: { name: "bathroomBlock", role: "create" },
  } satisfies OpDef<BathroomBlockInput>,
  "bathroomBlock.update": {
    label: (p) => `Bloqueo de baño ${p.from} → ${p.to}`,
    entities: (p) => [`bathroomBlocks:${p.id}`, `bathrooms:${p.bathroomId}`],
    validate: (p, d) =>
      d.bathroomBlocks.some((b) => b.id !== p.id && b.bathroomId === p.bathroomId && b.from <= p.to && b.to >= p.from) ? err(409, "BLOCK_OVERLAP") : null,
    request: (body) => ({ method: "PUT", path: "/admin/bathroom-blocks", body }),
    apply: (d, p) => ({
      ...d,
      bathroomBlocks: sorted(
        "bathroomBlocks",
        swap(
          d.bathroomBlocks,
          (b) => b.id === p.id,
          (b) => ({ ...b, bathroomId: p.bathroomId, from: p.from, to: p.to, reason: p.reason, notes: String(p.notes ?? "").trim() }),
        ),
      ),
    }),
    result: bathsOf,
    version: (d, p) => d.bathroomBlocks.find((b) => b.id === p.id)?.version,
    view: (d, p) => {
      const b = d.bathroomBlocks.find((x) => x.id === p.id);
      return b ? { bathroomId: b.bathroomId, from: b.from, to: b.to, reason: b.reason, notes: b.notes } : null;
    },
    family: { name: "bathroomBlock", role: "update" },
  } satisfies OpDef<BathroomBlockInput>,
  "bathroomBlock.delete": {
    perm: "delete",
    label: () => "Eliminar bloqueo de baño",
    entities: (p) => [`bathroomBlocks:${p.id}`],
    request: (p) => ({ method: "DELETE", path: "/admin/bathroom-blocks", query: { id: p.id } }),
    apply: (d, p) => ({ ...d, bathroomBlocks: d.bathroomBlocks.filter((b) => b.id !== p.id) }),
    result: bathsOf,
    version: (d, p) => d.bathroomBlocks.find((b) => b.id === p.id)?.version,
    family: { name: "bathroomBlock", role: "delete" },
  } satisfies OpDef<{ id: string }>,
};

/* ───────────── Clientes ───────────── */

const emptyProfile = (clientKey: string, at: string): ClientProfile => ({
  clientKey,
  rating: null,
  trust: "sin_evaluar",
  tags: [],
  preferences: "",
  summary: "",
  updatedAt: at,
  entries: [],
});
const KNOWN_CLIENT = (d: AdminData, key: string) => d.reservations.some((r) => r.clientKey === key);

type EntryInput = { clientKey: string; kind: "note" | "incident"; severity: string | null; text: string; reservationCode: string | null; localId?: number };

const clientOps = {
  "client.save": {
    label: (p) => `Valoración de ${p.clientKey}`,
    entities: (p) => [`clients:${p.clientKey}`],
    validate: (p, d) => (KNOWN_CLIENT(d, p.clientKey) ? null : err(404, "CLIENT_NOT_FOUND")),
    request: (body) => ({ method: "PUT", path: "/admin/clients", body }),
    apply: (d, p, op) => {
      const prev = d.clients[p.clientKey] ?? emptyProfile(p.clientKey, op.occurredAt);
      return {
        ...d,
        clients: {
          ...d.clients,
          [p.clientKey]: {
            ...prev,
            rating: p.rating,
            trust: p.trust,
            tags: p.tags,
            preferences: String(p.preferences ?? "").trim(),
            summary: String(p.summary ?? "").trim(),
            updatedAt: op.occurredAt,
          },
        },
      };
    },
    result: (d, p) => d.clients[p.clientKey] ?? null,
    version: (d, p) => d.clients[p.clientKey]?.version,
    view: (d, p) => {
      const c = d.clients[p.clientKey];
      return c ? { rating: c.rating, trust: c.trust, tags: c.tags, preferences: c.preferences, summary: c.summary } : null;
    },
    family: { name: "client", role: "update" },
  } satisfies OpDef<ClientProfileInput & { clientKey: string }>,
  "client.entry.add": {
    label: (p) => `${p.kind === "incident" ? "Incidente" : "Nota"} de ${p.clientKey}`,
    entities: (p) => [`clientEntries:${p.localId}`, `clients:${p.clientKey}`, ...(p.reservationCode ? [`reservations:${p.reservationCode}`] : [])],
    prepare: (p, d, { now }) => {
      if (!KNOWN_CLIENT(d, p.clientKey)) return err(404, "CLIENT_NOT_FOUND");
      const text = String(p.text ?? "").trim();
      if (!text || text.length > 2000) return err(400, "INVALID_BODY");
      return { ...p, text, localId: -now };
    },
    request: (p) => ({ method: "POST", path: "/admin/clients", body: omit(p, "localId") }),
    apply: (d, p, op) => {
      const prev = d.clients[p.clientKey] ?? emptyProfile(p.clientKey, op.occurredAt);
      const entry = {
        id: p.localId!,
        kind: p.kind,
        severity: (p.kind === "incident" ? p.severity : null) as ClientProfile["entries"][number]["severity"],
        text: p.text,
        reservationCode: p.reservationCode,
        createdAt: op.occurredAt,
      };
      return { ...d, clients: { ...d.clients, [p.clientKey]: { ...prev, entries: [entry, ...prev.entries.filter((e) => e.id !== entry.id)] } } };
    },
    result: (d, p) => d.clients[p.clientKey] ?? null,
    family: { name: "clientEntry", role: "create" },
  } satisfies OpDef<EntryInput>,
  "client.entry.delete": {
    perm: "delete",
    label: () => "Eliminar registro de cliente",
    entities: (p) => [`clientEntries:${p.id}`],
    request: (p) => ({ method: "DELETE", path: "/admin/clients", query: { entry: p.id } }),
    apply: (d, p) => {
      const c = Object.values(d.clients).find((x) => x.entries.some((e) => e.id === p.id));
      return c ? { ...d, clients: { ...d.clients, [c.clientKey]: { ...c, entries: c.entries.filter((e) => e.id !== p.id) } } } : d;
    },
    result: (d, p) => Object.values(d.clients).find((x) => x.entries.some((e) => e.id === p.id)) ?? null,
    family: { name: "clientEntry", role: "delete" },
  } satisfies OpDef<{ id: number }>,
};

/* ───────────── Tarifas y cabañas ───────────── */

const seasonFrom = (p: SeasonInput) => ({
  id: p.id!,
  cabinTypeId: p.cabinTypeId,
  nombre: String(p.nombre ?? "").trim(),
  from: p.from,
  to: p.to,
  precioPareja: p.precioPareja,
  personaAdicional: p.personaAdicional,
  preciosPersonas: cleanPersonRates(p.preciosPersonas),
  activa: !!p.activa,
  dayRates: cleanDayRates(p.dayRates ?? []),
});

function seasonErrors(p: SeasonInput, d: AdminData) {
  const fields: Record<string, string> = {};
  const nombre = String(p.nombre ?? "").trim();
  if (!nombre || nombre.length > 80) fields.nombre = "Escribe un nombre (máximo 80 caracteres).";
  const badTiers = invalidPersonRates(p.preciosPersonas);
  if (badTiers) fields.preciosPersonas = badTiers;
  if (!isISO(p.from) || !isISO(p.to) || p.to < p.from) fields.dates = "Elige un rango de fechas válido.";
  else {
    const bad = invalidDayRates(p.dayRates ?? [], p.from, p.to);
    if (bad) fields.dayRates = bad;
  }
  if (!fields.dates && p.activa) {
    const hit = d.seasons.find((s) => s.id !== p.id && s.activa && s.cabinTypeId === p.cabinTypeId && s.from <= p.to && s.to >= p.from);
    if (hit) fields.dates = `Se cruza con la temporada activa "${hit.nombre}" de la misma cabaña.`;
  }
  return Object.keys(fields).length ? fieldErr(fields) : null;
}

const cabinErrors = (b: CabinInput) => {
  const fields: Record<string, string> = {};
  const nombre = String(b.nombre ?? "").trim();
  if (nombre.length < 3 || nombre.length > 60) fields.nombre = "El nombre debe tener entre 3 y 60 caracteres.";
  if (!Number.isInteger(b.maxPersonas) || b.maxPersonas < 1 || b.maxPersonas > 12) fields.maxPersonas = "La capacidad debe estar entre 1 y 12 personas.";
  if (!Number.isInteger(b.units) || b.units < 0 || b.units > 20) fields.units = "El número de cabañas debe estar entre 0 y 20.";
  const badLabels = Number.isInteger(b.units) ? invalidUnitLabels(b.unitLabels, b.units) : null;
  if (badLabels) fields.unitLabels = badLabels;
  return Object.keys(fields).length ? fieldErr(fields) : null;
};

const cabinFields = (b: CabinInput) => ({
  nombre: String(b.nombre).trim(),
  descripcion: String(b.descripcion ?? "").trim(),
  badge: String(b.badge ?? "").trim(),
  caracteristicas: b.caracteristicas ?? [],
  maxPersonas: b.maxPersonas,
  units: b.units,
  ...(b.unitLabels !== undefined && { unitLabels: cleanUnitLabels(b.unitLabels, b.units) }),
  precioPareja: b.precioPareja,
  personaAdicional: b.personaAdicional,
  activa: !!b.activa,
});

const cabinOf = (d: AdminData, id: string) => d.cabinTypes.find((c) => c.id === id);
const withCabins = (d: AdminData, cabinTypes: CabinType[]): AdminData => {
  const list = sorted("cabinTypes", cabinTypes);
  return { ...d, cabinTypes: list, unidades: unitsOf(list) };
};

// Vistas previas de las fotos en cola (Blob en la operación): una URL por operación mientras la página esté abierta.
const previews = new Map<string, string>();
const previewOf = (opId: string, file: Blob) => {
  if (typeof URL === "undefined" || !URL.createObjectURL) return `local:${opId}`;
  let url = previews.get(opId);
  if (!url) previews.set(opId, (url = URL.createObjectURL(file)));
  return url;
};
const isLocalPhoto = (u: string) => u.startsWith("blob:") || u.startsWith("local:");

const cabinOps = {
  "rates.save": {
    perm: "rates",
    label: (p) => `Tarifas de ${Object.keys(p.rates).join(", ")}`,
    entities: (p) => Object.keys(p.rates).map((id) => `cabinTypes:${id}`),
    prepare: (p, d) => ({
      ...p,
      versions: Object.fromEntries(Object.keys(p.rates).flatMap((id) => (cabinOf(d, id)?.version !== undefined ? [[id, cabinOf(d, id)!.version!]] : []))),
    }),
    request: (p) => ({ method: "PUT", path: "/admin/cabin-types", body: { ...p.rates, _versions: p.versions } }),
    apply: (d, p) =>
      withCabins(
        d,
        d.cabinTypes.map((c) => (p.rates[c.id] ? { ...c, ...p.rates[c.id]! } : c)),
      ),
    result: (d) => d.cabinTypes,
    force: (p) => ({ ...p, versions: undefined }),
  } satisfies OpDef<{ rates: Rates; versions?: Record<string, number> }>,
  "season.create": {
    perm: "rates",
    label: (p) => `Temporada ${p.nombre}`,
    entities: (p) => [`seasons:${p.id}`, `cabinTypes:${p.cabinTypeId}`],
    prepare: (p, d) => seasonErrors(p, d) ?? { ...p, id: uuid() },
    request: (body) => ({ method: "POST", path: "/admin/seasons", body }),
    apply: (d, p) => ({ ...d, seasons: sorted("seasons", [seasonFrom(p), ...d.seasons.filter((s) => s.id !== p.id)]) }),
    result: (d) => d.seasons,
    family: { name: "season", role: "create" },
  } satisfies OpDef<SeasonInput>,
  "season.update": {
    perm: "rates",
    label: (p) => `Temporada ${p.nombre}`,
    entities: (p) => [`seasons:${p.id}`, `cabinTypes:${p.cabinTypeId}`],
    validate: seasonErrors,
    request: (body) => ({ method: "PUT", path: "/admin/seasons", body }),
    apply: (d, p) => ({
      ...d,
      seasons: sorted(
        "seasons",
        swap(
          d.seasons,
          (s) => s.id === p.id,
          (s) => ({ ...s, ...seasonFrom(p) }),
        ),
      ),
    }),
    result: (d) => d.seasons,
    version: (d, p) => d.seasons.find((s) => s.id === p.id)?.version,
    view: (d, p) => {
      const s = d.seasons.find((x) => x.id === p.id);
      return s
        ? {
            cabinTypeId: s.cabinTypeId,
            nombre: s.nombre,
            from: s.from,
            to: s.to,
            precioPareja: s.precioPareja,
            personaAdicional: s.personaAdicional,
            preciosPersonas: s.preciosPersonas ?? {},
            activa: s.activa,
          }
        : null;
    },
    family: { name: "season", role: "update" },
  } satisfies OpDef<SeasonInput>,
  "season.delete": {
    perm: "rates",
    label: () => "Eliminar temporada",
    entities: (p) => [`seasons:${p.id}`],
    request: (p) => ({ method: "DELETE", path: "/admin/seasons", query: { id: p.id } }),
    apply: (d, p) => ({ ...d, seasons: d.seasons.filter((s) => s.id !== p.id) }),
    result: (d) => d.seasons,
    version: (d, p) => d.seasons.find((s) => s.id === p.id)?.version,
    family: { name: "season", role: "delete" },
  } satisfies OpDef<{ id: string }>,

  "cabin.create": {
    perm: "cabins",
    label: (p) => `Cabaña ${p.nombre}`,
    entities: (p) => [`cabinTypes:${p.id}`],
    prepare: (b, d) => {
      const bad = cabinErrors(b);
      if (bad) return bad;
      const base = slugify(b.id || b.nombre) || "cabana";
      let id = base;
      for (let i = 2; d.cabinTypes.some((c) => c.id === id) || id === "nueva"; i++) id = `${base}-${i}`.slice(0, 40);
      return { ...b, id };
    },
    request: (body) => ({ method: "POST", path: "/admin/cabins", body }),
    apply: (d, p) =>
      withCabins(d, [
        ...d.cabinTypes.filter((c) => c.id !== p.id),
        { ...cabinFields(p), id: p.id!, fotos: [], sort: d.cabinTypes.reduce((m, c) => Math.max(m, c.sort), 0) + 1 },
      ]),
    result: (d) => d.cabinTypes,
    family: { name: "cabin", role: "create" },
  } satisfies OpDef<CabinInput>,
  "cabin.update": {
    perm: "cabins",
    label: (p) => `Cabaña ${p.nombre}`,
    entities: (p) => [`cabinTypes:${p.id}`],
    validate: (b, d) => {
      const bad = cabinErrors(b);
      if (bad) return bad;
      const c = cabinOf(d, b.id!);
      if (!c) return err(404, "NOT_FOUND");
      const today = todayISO();
      if (
        b.units < c.units &&
        (d.reservations.some((r) => r.cabinTypeId === c.id && r.unit > b.units && ACTIVE_STATUSES.includes(r.status) && r.checkOut >= today) ||
          d.blocks.some((x) => x.cabinTypeId === c.id && x.unit > b.units && x.to >= today))
      )
        return fieldErr({ units: "Hay reservas o bloqueos vigentes en las unidades que quitarías. Reprográmalos primero." });
      return null;
    },
    request: (body) => ({ method: "PUT", path: "/admin/cabins", body }),
    apply: (d, p) =>
      withCabins(
        d,
        swap(
          d.cabinTypes,
          (c) => c.id === p.id,
          (c) => ({ ...c, ...cabinFields(p) }),
        ),
      ),
    result: (d) => d.cabinTypes,
    version: (d, p) => cabinOf(d, p.id!)?.version,
    view: (d, p) => {
      const c = cabinOf(d, p.id!);
      return c ? cabinFields(c) : null;
    },
    family: { name: "cabin", role: "update" },
  } satisfies OpDef<CabinInput>,
  "cabin.reorder": {
    perm: "cabins",
    label: () => "Orden de las cabañas",
    entities: () => ["cabinOrder"],
    request: (body) => ({ method: "PATCH", path: "/admin/cabins", body }),
    apply: (d, p) =>
      withCabins(
        d,
        d.cabinTypes.map((c) => (p.order.includes(c.id) ? { ...c, sort: p.order.indexOf(c.id) + 1 } : c)),
      ),
    result: (d) => d.cabinTypes,
    family: { name: "cabinOrder", role: "update" },
  } satisfies OpDef<{ order: string[] }>,
  "cabin.delete": {
    perm: "cabins",
    label: (p, d) => `Eliminar cabaña ${cabinOf(d, p.id)?.nombre ?? p.id}`,
    entities: (p) => [`cabinTypes:${p.id}`],
    validate: (p, d) => {
      const count = d.reservations.filter((r) => r.cabinTypeId === p.id).length;
      return count ? err(409, "HAS_RESERVATIONS", { count }) : null;
    },
    request: (p) => ({ method: "DELETE", path: "/admin/cabins", query: { id: p.id } }),
    apply: (d, p) =>
      withCabins(
        d,
        d.cabinTypes.filter((c) => c.id !== p.id),
      ),
    result: (d) => d.cabinTypes,
    family: { name: "cabin", role: "delete" },
  } satisfies OpDef<{ id: string }>,
  "cabinPhoto.add": {
    perm: "cabins",
    label: (p) => `Foto de ${p.cabinId}`,
    entities: (p) => [`cabinTypes:${p.cabinId}`],
    request: (p) => ({ method: "POST", path: "/admin/cabins/photos", form: { fields: { cabinId: p.cabinId, file: p.file }, fileName: p.name } }),
    apply: (d, p, op) =>
      withCabins(
        d,
        swap(
          d.cabinTypes,
          (c) => c.id === p.cabinId,
          (c) => ({ ...c, fotos: [...c.fotos.filter((u) => u !== previewOf(op.opId, p.file)), previewOf(op.opId, p.file)] }),
        ),
      ),
    result: (d) => d.cabinTypes,
  } satisfies OpDef<{ cabinId: string; file: Blob; name: string }>,
  "cabinPhoto.reorder": {
    perm: "cabins",
    label: (p) => `Orden de fotos de ${p.cabinId}`,
    entities: (p) => [`cabinTypes:${p.cabinId}`],
    // Una foto en cola aún no tiene dirección en el servidor: se ordena al sincronizar.
    validate: (p) => (p.fotos.some(isLocalPhoto) ? err(409, "PHOTO_NOT_SYNCED") : null),
    request: (body) => ({ method: "PUT", path: "/admin/cabins/photos", body }),
    apply: (d, p) =>
      withCabins(
        d,
        swap(
          d.cabinTypes,
          (c) => c.id === p.cabinId,
          (c) => ({ ...c, fotos: p.fotos }),
        ),
      ),
    result: (d) => d.cabinTypes,
  } satisfies OpDef<{ cabinId: string; fotos: string[] }>,
  "cabinPhoto.delete": {
    perm: "cabins",
    label: (p) => `Quitar foto de ${p.cabinId}`,
    entities: (p) => [`cabinTypes:${p.cabinId}`],
    validate: (p) => (isLocalPhoto(p.url) ? err(409, "PHOTO_NOT_SYNCED") : null),
    request: (p) => ({ method: "DELETE", path: "/admin/cabins/photos", query: { cabinId: p.cabinId, url: p.url } }),
    apply: (d, p) =>
      withCabins(
        d,
        swap(
          d.cabinTypes,
          (c) => c.id === p.cabinId,
          (c) => ({ ...c, fotos: c.fotos.filter((u) => u !== p.url) }),
        ),
      ),
    result: (d) => d.cabinTypes,
  } satisfies OpDef<{ cabinId: string; url: string }>,
};

/* ───────────── Contenido, condiciones y perfil ───────────── */

const withSite = (d: AdminData, site: Partial<SiteContent>): AdminData => ({ ...d, site: { ...d.site, ...site } });

const contentOps = {
  "site.save": {
    perm: "content",
    label: () => "Contenido del sitio",
    entities: () => ["site:site"],
    request: (body) => ({ method: "PUT", path: "/admin/site", body }),
    apply: (d, p) =>
      withSite(d, {
        settings: { ...p.settings, depositPct: d.site.settings.depositPct },
        policies: p.policies,
        texts: { ...p.content, payment: d.site.texts.payment },
        theme: p.theme,
      }),
    result: (d) => d.site,
    version: (d) => d.site.version,
  } satisfies OpDef<SiteInput>,
  "panelColors.save": {
    perm: "content",
    label: () => "Colores del panel",
    entities: () => ["site:site"],
    request: (body) => ({ method: "PUT", path: "/admin/panel-colors", body }),
    apply: (d, p) => withSite(d, { panelColors: p }),
    result: (d) => d.site,
    version: (d) => d.site.version,
    view: (d) => d.site.panelColors,
  } satisfies OpDef<PanelColors>,
  "terms.save": {
    perm: "rates",
    label: () => "Condiciones de pago",
    entities: () => ["site:site"],
    validate: (p) =>
      !Number.isInteger(p.depositPct) || p.depositPct < 1 || p.depositPct > 100
        ? fieldErr({ depositPct: "El abono debe ser un porcentaje entero entre 1 y 100." })
        : null,
    request: (body) => ({ method: "PUT", path: "/admin/payment-terms", body }),
    apply: (d, p) =>
      withSite(d, { settings: { ...d.site.settings, depositPct: p.depositPct }, texts: { ...d.site.texts, payment: { instructions: p.instructions } } }),
    result: (d) => d.site,
    version: (d) => d.site.version,
    view: (d) => ({ depositPct: d.site.settings.depositPct, instructions: d.site.texts.payment.instructions }),
  } satisfies OpDef<PaymentTerms>,
  "sitePhoto.set": {
    perm: "content",
    label: (p) => `Foto ${p.slot}`,
    entities: (p) => ["site:site", `sitePhotos:${p.slot}`],
    request: (p) => ({ method: "POST", path: "/admin/photos", form: { fields: { slot: p.slot, file: p.file }, fileName: p.name } }),
    apply: (d, p, op) => withSite(d, { photos: { ...d.site.photos, [p.slot]: previewOf(op.opId, p.file) } }),
    result: (d) => d.site.photos,
  } satisfies OpDef<{ slot: string; file: Blob; name: string }>,
  "sitePhoto.delete": {
    perm: "content",
    label: (p) => `Quitar foto ${p.slot}`,
    entities: (p) => ["site:site", `sitePhotos:${p.slot}`],
    request: (p) => ({ method: "DELETE", path: "/admin/photos", query: { slot: p.slot } }),
    apply: (d, p) => {
      return withSite(d, { photos: omit(d.site.photos, p.slot) });
    },
    result: (d) => d.site.photos,
  } satisfies OpDef<{ slot: string }>,
  "service.create": {
    perm: "content",
    label: (p) => `Servicio ${p.title}`,
    entities: (p) => [`services:${p.id}`],
    prepare: (p) => ({ ...p, id: uuid() }),
    request: (body) => ({ method: "POST", path: "/admin/services", body }),
    apply: (d, p) => withSite(d, { services: [...d.site.services.filter((s) => s.id !== p.id), p] }),
    result: (d) => d.site.services,
    family: { name: "service", role: "create" },
  } satisfies OpDef<SiteService>,
  "service.update": {
    perm: "content",
    label: (p) => `Servicio ${p.title}`,
    entities: (p) => [`services:${p.id}`],
    request: (body) => ({ method: "PUT", path: "/admin/services", body }),
    apply: (d, p) =>
      withSite(d, {
        services: swap(
          d.site.services,
          (s) => s.id === p.id,
          () => p,
        ),
      }),
    result: (d) => d.site.services,
    family: { name: "service", role: "update" },
  } satisfies OpDef<SiteService>,
  "service.reorder": {
    perm: "content",
    label: () => "Orden de los servicios",
    entities: () => ["serviceOrder"],
    request: (body) => ({ method: "PATCH", path: "/admin/services", body }),
    apply: (d, p) => withSite(d, { services: [...d.site.services].sort((a, b) => p.order.indexOf(a.id) - p.order.indexOf(b.id)) }),
    result: (d) => d.site.services,
    family: { name: "serviceOrder", role: "update" },
  } satisfies OpDef<{ order: string[] }>,
  "service.delete": {
    perm: "content",
    label: () => "Eliminar servicio",
    entities: (p) => [`services:${p.id}`],
    request: (p) => ({ method: "DELETE", path: "/admin/services", query: { id: p.id } }),
    apply: (d, p) => withSite(d, { services: d.site.services.filter((s) => s.id !== p.id) }),
    result: (d) => d.site.services,
    family: { name: "service", role: "delete" },
  } satisfies OpDef<{ id: string }>,
  // Nunca lleva contraseña: cambiarla exige conexión (api.ts).
  "profile.save": {
    label: () => "Mi nombre",
    entities: () => ["profile"],
    validate: (p) => (p.name.trim().length < 2 || p.name.trim().length > 80 ? fieldErr({ name: "Escribe tu nombre (2 a 80 caracteres)." }) : null),
    request: (body) => ({ method: "PUT", path: "/admin/profile", body }),
    apply: (d, p) => ({ ...d, me: { ...d.me, name: p.name.trim() } }),
    result: (d) => ({ me: d.me }),
    family: { name: "profile", role: "update" },
  } satisfies OpDef<{ name: string }>,
  "profilePhoto.set": {
    label: () => "Mi foto",
    entities: () => ["profile"],
    request: (p) => ({ method: "POST", path: "/admin/profile/photo", form: { fields: { file: p.file }, fileName: p.name } }),
    apply: (d, p, op) => ({ ...d, me: { ...d.me, photo: previewOf(op.opId, p.file) } }),
    result: (d) => ({ me: d.me }),
  } satisfies OpDef<{ file: Blob; name: string }>,
  "profilePhoto.delete": {
    label: () => "Quitar mi foto",
    entities: () => ["profile"],
    request: () => ({ method: "DELETE", path: "/admin/profile/photo" }),
    apply: (d) => ({ ...d, me: { ...d.me, photo: null } }),
    result: (d) => ({ me: d.me }),
  } satisfies OpDef<Record<string, never>>,

  "notifications.mark": {
    label: () => "Marcar avisos como leídos",
    entities: () => ["notificationsRead"],
    request: (body) => ({ method: "POST", path: "/admin/notifications", body }),
    apply: (d, p, op) => ({
      ...d,
      notifications: d.notifications.map((n) => (p.all || p.ids?.includes(n.id) ? { ...n, readAt: n.readAt ?? op.occurredAt } : n)),
    }),
    result: (d) => d.notifications,
  } satisfies OpDef<{ ids?: number[]; all?: boolean }>,

  "email.send": {
    label: (p) => `Correo «${p.subject}»`,
    entities: (p) => [`emails:${p.requestId}`, ...(p.reservationCode ? [`reservations:${p.reservationCode}`] : [])],
    validate: (p, d) => {
      const fields: Record<string, string> = {};
      if (p.subject.trim().length < 3 || p.subject.trim().length > 150) fields.subject = "Escribe un asunto de 3 a 150 caracteres.";
      if (p.message.trim().length < 5 || p.message.trim().length > 5000) fields.message = "Escribe un mensaje de 5 a 5000 caracteres.";
      if (Object.keys(fields).length) return fieldErr(fields);
      const latest = d.reservations.filter((r) => r.clientKey === p.clientKey).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
      if (!latest) return err(404, "CLIENT_NOT_FOUND");
      return EMAIL_RE.test(latest.guest.email ?? "") ? null : err(422, "NO_EMAIL");
    },
    request: (p) => ({ method: "POST", path: "/admin/emails", body: { action: "send", ...p } }),
    apply: (d, p, op) => {
      const latest = d.reservations.filter((r) => r.clientKey === p.clientKey).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
      const email: EmailRecord = {
        id: p.requestId,
        kind: "team_message",
        reservationCode: p.reservationCode,
        to: latest?.guest.email ?? "",
        subject: p.subject.trim(),
        status: "pending",
        attempts: 0,
        lastError: "",
        sentAt: null,
        createdAt: op.occurredAt,
        updatedAt: op.occurredAt,
      };
      return { ...d, emails: sorted("emails", [email, ...d.emails.filter((e) => e.id !== p.requestId)]) };
    },
    result: (d, p) => d.emails.find((e) => e.id === p.requestId) ?? null,
    okStatus: 201,
  } satisfies OpDef<{ clientKey: string; subject: string; message: string; reservationCode: string | null; requestId: string }>,
  "email.retry": {
    label: () => "Reintentar correo",
    entities: (p) => [`emails:${p.id}`],
    request: (p) => ({ method: "POST", path: "/admin/emails", body: { action: "retry", id: p.id } }),
    apply: (d, p) => ({
      ...d,
      emails: swap(
        d.emails,
        (e) => e.id === p.id,
        (e) => ({ ...e, status: "pending", lastError: "" }),
      ),
    }),
    result: (d, p) => d.emails.find((e) => e.id === p.id) ?? null,
  } satisfies OpDef<{ id: string }>,
};

export const OPS = { ...reservationOps, ...blockOps, ...bathroomOps, ...clientOps, ...cabinOps, ...contentOps } as unknown as Record<string, OpDef<unknown>>;

export const dateOfOp = (op: Pick<Op, "occurredAt">) => dateOf(op.occurredAt);

// Qué pasó, en palabras del equipo.
export const CONFLICT_TEXT: Record<string, string> = {
  VERSION_CONFLICT: "Otra persona cambió este registro mientras tanto.",
  IMPORT_PARTIAL: "Estas filas no se importaron. Las demás ya quedaron creadas.",
  PAID_CHANGED: "Se registró otro pago de esta reserva mientras tanto. Comprueba que no sea el mismo dinero antes de registrarlo otra vez.",
  QUOTE_CHANGED: "Las tarifas cambiaron y el valor de esta reserva ya no es el que viste.",
  DATES_UNAVAILABLE: "Esas fechas ya no están libres.",
  RESERVATION_CONFLICT: "Hay reservas activas en esas fechas.",
  BLOCK_OVERLAP: "Ya existe un bloqueo que se cruza con estas fechas.",
  NOT_FOUND: "Este registro ya no existe: otra persona lo borró.",
  CLIENT_NOT_FOUND: "Este cliente ya no tiene reservas.",
  INVALID_TRANSITION: "La reserva cambió de estado y esta acción ya no aplica.",
  ALREADY_PAID: "Esta reserva ya está pagada por completo.",
  INVALID_AMOUNT: "El valor es mayor a lo que falta por pagar.",
  NOT_APPLICABLE: "En su estado actual, esta reserva no admite pagos.",
  BALANCE_PENDING: "Falta pagar el saldo: no se puede hacer el check-out.",
  HAS_RESERVATIONS: "Esta cabaña ya tiene reservas: no se puede eliminar.",
  ID_TAKEN: "Ya existe un registro con este identificador.",
  HOLD_TOO_SHORT: "Ya no queda tiempo para pagar antes de la llegada.",
  INVALID_DATES: "Las fechas ya no son válidas.",
  VALIDATION_ERROR: "El servidor rechazó los datos.",
  FORBIDDEN: "Tu cuenta no tiene permiso para esto.",
  OP_FOREIGN: "Esta operación es de otra cuenta.",
};
