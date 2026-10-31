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

// Pagos en línea (Wompi; "simulado" en desarrollo) o registrados por el equipo ("manual").
// deposit: abono (confirma) · full: pago total (confirma y salda) · balance: saldo (antes de llegar o en la hora siguiente al check-in).
export type PaymentKind = "deposit" | "balance" | "full";
// initiated: se abrió la pasarela · pending: la pasarela lo procesa · approved · declined · error · expired: venció o se reemplazó.
export type PaymentStatus = "initiated" | "pending" | "approved" | "declined" | "error" | "expired";
export type PaymentProvider = "wompi" | "simulado" | "manual";

// Un intento de pago (una referencia en la pasarela).
export type PublicPayment = {
  reference: string;
  kind: PaymentKind;
  status: PaymentStatus;
  amount: number;
  provider: PaymentProvider;
  method: string; // CARD, PSE, NEQUI…
  detail: string; // motivo del rechazo u observación
  createdAt: string;
  expiresAt: string | null;
  approvedAt: string | null;
  needsRefund: boolean; // el dinero llegó pero no se pudo aplicar (pago duplicado o fechas ya ocupadas)
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
  balanceDueAt: string | null; // check-in + 1 hora: límite para pagar el saldo (lo fija la base de datos)
  balanceOverdueAt: string | null; // cuándo se registró que el saldo venció sin pagarse
  clientKey: string; // "CC:12345678": tipo y número de documento
  source?: ReservationSource; // sin valor: "web" (reservas anteriores)
  payToken?: string | null; // enlace de pago /pagar/<token> (reservas del panel o enlaces enviados por el equipo)
  demo?: boolean;
};

// Cuerpo de POST /admin/reservations: reserva tomada por el equipo. Queda retenida hasta que el huésped pague por el
// enlace (holdMinutes, como máximo hasta el día de llegada) o el equipo registre el pago.
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

// Respuesta: la reserva creada y el enlace de pago para enviarle al huésped.
export type ManualReservationResult = { reservation: Reservation; payUrl: string };

// Lo que ve el huésped. `payments`: sus intentos de pago, del más reciente al más antiguo.
// `liveKey`: nombra el canal de avisos en tiempo real de la reserva (solo con código y correo, o con la referencia del pago).
// `serverNow`: hora del servidor, para que las cuentas regresivas no dependan del reloj del dispositivo.
export type PublicReservation = Pick<
  Reservation,
  | "code"
  | "status"
  | "checkIn"
  | "checkOut"
  | "cabinTypeId"
  | "quote"
  | "depositDueAt"
  | "depositPaidAt"
  | "balancePaidAt"
  | "paid"
  | "checkedInAt"
  | "balanceDueAt"
  | "balanceOverdueAt"
> & { guestFirstName?: string; payments?: PublicPayment[]; liveKey?: string; serverNow?: string; termsAccepted?: boolean };

// Respuesta al abrir un pago: a dónde llevar al huésped.
export type PaymentStart = { reference: string; checkoutUrl: string; expiresAt: string | null; provider: PaymentProvider };
// Estado de un pago consultado por su referencia (página de confirmación).
export type PaymentState = { payment: PublicPayment; reservation: PublicReservation };

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

// Calendario de Booking.com enlazado a una unidad: importUrl es el enlace de exportación de Booking (la app lo lee) y
// exportUrl el que Booking importa (reservas de la web y bloqueos del panel). Sincronización por iCal, sin datos del huésped.
export type ChannelCalendar = {
  id: string;
  channel: "booking";
  label: string;
  cabinTypeId: CabinTypeId;
  unit: number;
  // Cabañas de la app que cubre este tipo de Booking (el primero es `unit`). Booking vende uno por noche: se cierra allá
  // cuando todos están ocupados, y cada reserva suya ocupa uno libre.
  units: number[];
  importUrl: string | null;
  exportUrl: string;
  lastSyncedAt: string | null;
  // Última vez que Booking descargó exportUrl: desde ese momento ve cerradas las reservas de la web.
  lastFetchedAt: string | null;
  lastStatus: "ok" | "error" | null;
  lastError: string;
  lastEventCount: number;
  // Habitación de Beds24 enlazada: la unidad se sincroniza en tiempo real por Beds24 y deja de usar el iCal.
  beds24RoomId: number | null;
};

// Conexión con Beds24 (channel manager). webhookUrl: la que se pega en Beds24 → Properties → Access → Booking webhook.
export type Beds24Status = {
  webhookUrl: string;
  lastPullAt: string | null;
  lastPushAt: string | null;
  lastWebhookAt: string | null;
  lastError: string;
  lastErrorAt: string | null;
};
export type Beds24Room = { id: number; propertyId: number; propertyName: string; name: string; qty: number };

// Noches ocupadas en Booking (una reserva o un cierre: el iCal no los distingue). checkOut exclusivo, como en las reservas.
// removedAt: dejó de venir en el calendario de Booking (se canceló).
export type ChannelStay = {
  id: string;
  calendarId: string;
  cabinTypeId: CabinTypeId;
  unit: number;
  checkIn: string;
  checkOut: string;
  summary: string;
  firstSeenAt: string;
  removedAt: string | null;
};

// Cuerpo de PUT /admin/channels: enlaza (o desenlaza, con importUrl vacío) una unidad con un tipo de Booking.
export type ChannelCalendarInput = { cabinTypeId: string; unit: number; units?: number[]; label: string; importUrl: string; beds24RoomId?: number | null };
// Resultado de una sincronización (por calendario).
export type ChannelSyncResult = {
  calendarId: string;
  ok: boolean;
  events: number;
  added: number;
  removed: number;
  moved: string[];
  conflicts: string[];
  error?: string;
};

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
  | "payment_declined"
  | "payment_refund"
  | "balance_paid"
  | "balance_overdue"
  | "email_failed"
  | "channel_conflict"
  | "channel_moved"
  | "channel_sync_failed";

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
  channelCalendars: ChannelCalendar[];
  channelStays: ChannelStay[]; // vigentes y recientes (las canceladas también, para el historial)
  beds24: Beds24Status | null; // null: Beds24 no está conectado
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
  // Pago recibido por fuera de la pasarela (efectivo o transferencia): "confirm" = abono, "balance" = saldo.
  | { code: string; action: "confirm" | "balance"; note?: string; full?: boolean }
  | { code: string; action: "reschedule"; checkIn: string; checkOut: string }
  // Enlace de pago con un plazo nuevo: amplía (o reactiva, si venció) la retención de una reserva sin abono.
  | { code: string; action: "payment_link"; holdMinutes: number }
  | { code: string; action: "note"; text: string };

export type ProofReview = { id: string; decision: "approve" | "reject"; note: string; confirmReservation: boolean };

export type ApiResult<T> = { status: number; data: T | null };

export type FieldErrors = Record<string, string>;
