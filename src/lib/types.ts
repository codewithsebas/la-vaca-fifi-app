import type { CabinTypeId } from "@/lib/config";
import type { SiteContent, SitePolicy, SiteSettings, SiteTexts } from "@/lib/site";
import type { SiteTheme } from "@/lib/theme";

// Contrato de la API pública y de los endpoints del panel.

export type ReservationStatus = "pending_deposit" | "confirmed" | "cancelled" | "expired" | "rescheduled" | "checked_in" | "completed";

export type DocType = "CC" | "CE" | "Pasaporte" | "PPT";

export type CabinType = {
  id: CabinTypeId;
  nombre: string;
  precioPareja: number;
  personaAdicional: number;
  maxPersonas: number;
  units: number;
  badge: string;
  descripcion: string;
  caracteristicas: string[];
  fotos: string[]; // URLs públicas, la primera es la portada
  activa: boolean;
  sort: number;
};

// Precio por noche distinto en un rango de fechas (noches de `from` a `to`, inclusive).
export type RateSeason = {
  id: string;
  cabinTypeId: CabinTypeId;
  nombre: string;
  from: string;
  to: string;
  precioPareja: number;
  personaAdicional: number;
  activa: boolean;
};

export type Quote = {
  base: number;
  extraGuests: number;
  extraAmount: number;
  total: number;
  deposit: number;
  balance: number;
  pricePerNight: number; // promedio por noche (las temporadas pueden variar el precio de cada noche)
  extraPerNight: number;
  nights: number;
  seasonNights?: number; // noches con tarifa de temporada
  // Precio especial acordado por el equipo (reservas del panel): total = base + extraAmount + adjustment (negativo = descuento).
  adjustment?: number;
};

export type AvailabilityOption = {
  cabinTypeId: CabinTypeId;
  available: boolean;
  unitsLeft: number;
  reason: "capacity" | "dates" | null;
  quote: Quote;
};

export type Availability = { nights: number; options: AvailabilityOption[] };

export type Guest = {
  fullName: string;
  docType: DocType;
  docNumber: string;
  email: string;
  phone: string;
  city: string;
};

export type ReservationInput = {
  cabinTypeId: CabinTypeId;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  pet: { hasPet: boolean; smallBreedConfirmed: boolean };
  decoration: { requested: boolean; occasion: string; notes: string };
  estimatedArrival: string;
  guest: Guest;
  specialRequests: string;
  consents: { policies: boolean; dataProcessing: boolean; marketing: boolean };
  captchaToken?: string;
  website?: string;
};

export type Note = { at: string; text: string };

// De dónde vino la reserva: el sitio (el huésped) o el panel (el equipo, por WhatsApp, teléfono o en persona).
export type ReservationSource = "web" | "panel";

// Pagos registrados por el equipo (efectivo o transferencia).
// deposit: abono (confirma) · full: pago total (confirma y salda) · balance: saldo.
export type PaymentKind = "deposit" | "balance" | "full";
// Estados de la tabla de pagos. Los registros del equipo nacen aprobados; los demás quedan de los pagos en línea anteriores.
export type PaymentStatus = "initiated" | "pending" | "approved" | "declined" | "error" | "expired";
export type PaymentProvider = string;

export type PublicPayment = {
  reference: string;
  kind: PaymentKind;
  status: PaymentStatus;
  amount: number;
  provider: PaymentProvider;
  method: string;
  detail: string; // observación del equipo
  createdAt: string;
  expiresAt: string | null;
  approvedAt: string | null;
};

export type PaymentRecord = PublicPayment & { id: string; reservationCode: string };

// Correos transaccionales (bandeja de salida).
export type EmailKind = "reservation_confirmed" | "team_message";
export type EmailStatus = "pending" | "sending" | "sent" | "failed";
export type EmailRecord = {
  id: string;
  kind: EmailKind;
  reservationCode: string | null;
  to: string;
  subject: string;
  status: EmailStatus;
  attempts: number;
  lastError: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProofStatus = "pending" | "approved" | "rejected";

export type PaymentProof = {
  id: string;
  reservationCode: string;
  fileName: string;
  mime: string;
  size: number;
  note: string;
  status: ProofStatus;
  reviewNote: string;
  reviewedAt: string | null;
  createdAt: string;
};

export type Reservation = ReservationInput & {
  code: string;
  unit: number;
  status: ReservationStatus;
  quote: Quote;
  depositDueAt: string;
  createdAt: string;
  notes: Note[];
  depositPaidAt: string | null;
  balancePaidAt: string | null;
  paid: number; // suma de los pagos aprobados
  checkedInAt: string | null;
  clientKey: string; // "CC:12345678": tipo y número de documento
  source?: ReservationSource; // sin valor: "web" (reservas anteriores)
  demo?: boolean;
};

// Cuerpo de POST /admin/reservations: reserva tomada por el equipo. Queda retenida hasta que el equipo registre el abono
// (holdMinutes, como máximo hasta el día de llegada).
export type ManualReservationInput = {
  cabinTypeId: CabinTypeId;
  unit: number | null; // null: la primera libre (como en la web)
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  pet: { hasPet: boolean; smallBreedConfirmed: boolean };
  guest: Guest;
  estimatedArrival: string; // "HH:MM" o "" (inicio del check-in)
  specialRequests: string;
  total: number | null; // precio especial; null = tarifa vigente
  holdMinutes: number;
};

export type ManualReservationResult = { reservation: Reservation };

// Lo que ve el huésped. `payments`: sus pagos registrados, del más reciente al más antiguo.
// `liveKey`: nombra el canal de avisos en tiempo real de la reserva (solo con código y correo).
// `serverNow`: hora del servidor, para que las cuentas regresivas no dependan del reloj del dispositivo.
export type PublicReservation = Pick<
  Reservation,
  "code" | "status" | "checkIn" | "checkOut" | "cabinTypeId" | "quote" | "depositDueAt" | "depositPaidAt" | "balancePaidAt" | "paid" | "checkedInAt"
> & { guestFirstName?: string; payments?: PublicPayment[]; liveKey?: string; serverNow?: string };

export type Block = {
  id: string;
  cabinTypeId: CabinTypeId;
  unit: number;
  from: string;
  to: string;
  reason: string;
  notes: string;
};

export type BlockInput = Omit<Block, "id" | "unit"> & { unit: number | "all" };

export type Rates = Partial<Record<CabinTypeId, { precioPareja: number; personaAdicional: number; maxPersonas: number }>>;

// Valoración interna de un cliente: solo la ve el equipo, nunca se expone en rutas públicas.
export type Trust = "sin_evaluar" | "alta" | "media" | "baja" | "no_recomendado";
export type Severity = "leve" | "moderada" | "grave";

export type ClientEntry = { id: number; kind: "note" | "incident"; severity: Severity | null; text: string; reservationCode: string | null; createdAt: string };

export type ClientProfile = {
  clientKey: string;
  rating: number | null;
  trust: Trust;
  tags: string[];
  preferences: string;
  summary: string;
  updatedAt: string;
  entries: ClientEntry[];
};

export type ClientProfileInput = Pick<ClientProfile, "rating" | "trust" | "tags" | "preferences" | "summary">;

export type NotificationKind =
  | "reservation_created"
  | "reservation_confirmed"
  | "reservation_cancelled"
  | "reservation_expired"
  | "proof_uploaded"
  | "proof_approved"
  | "proof_rejected"
  | "balance_paid"
  | "email_failed";

export type AdminNotification = {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  reservationCode: string | null;
  readAt: string | null;
  createdAt: string;
};

export type AdminData = {
  reservations: Reservation[];
  blocks: Block[];
  cabinTypes: CabinType[]; // todas, activas e inactivas
  seasons: RateSeason[];
  unidades: Record<CabinTypeId, number>;
  site: SiteContent;
  proofs: PaymentProof[];
  payments: PaymentRecord[];
  emails: EmailRecord[];
  clients: Record<string, ClientProfile>;
  notifications: AdminNotification[];
};

// Cuerpo de PUT /admin/site.
export type SiteInput = { settings: SiteSettings; policies: SitePolicy[]; content: SiteTexts; theme: SiteTheme };

export type CabinInput = {
  id?: string; // solo al crear; si falta se genera a partir del nombre
  nombre: string;
  descripcion: string;
  caracteristicas: string[];
  badge: string;
  maxPersonas: number;
  units: number;
  precioPareja: number;
  personaAdicional: number;
  activa: boolean;
};

export type SeasonInput = Omit<RateSeason, "id"> & { id?: string };

export type AdminAction =
  | { code: string; action: "cancel" | "checkin" | "checkout" }
  // Pago recibido (efectivo o transferencia): "confirm" = abono, "balance" = saldo.
  | { code: string; action: "confirm" | "balance"; note?: string; full?: boolean }
  | { code: string; action: "reschedule"; checkIn: string; checkOut: string }
  // Enlace de pago con un plazo nuevo: amplía (o reactiva, si venció) la retención de una reserva sin abono.
  | { code: string; action: "extend_hold"; holdMinutes: number }
  | { code: string; action: "note"; text: string };

export type ProofReview = { id: string; decision: "approve" | "reject"; note: string; confirmReservation: boolean };

export type ApiResult<T> = { status: number; data: T | null };

export type FieldErrors = Record<string, string>;
