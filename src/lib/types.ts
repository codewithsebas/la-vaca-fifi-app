import type { CabinTypeId } from "@/lib/config";
import type { SiteContent, SitePolicy, SiteSettings, SiteTexts } from "@/lib/site";
import type { SiteTheme } from "@/lib/theme";

// Contrato de la API pública y de los endpoints del panel.

export type ReservationStatus = "pending_deposit" | "confirmed" | "cancelled" | "expired" | "rescheduled" | "checked_in" | "completed";

// SD: sin documento (reservas importadas); el número es el teléfono, así el cliente se agrupa por teléfono.
export type DocType = "CC" | "CE" | "Pasaporte" | "PPT" | "SD";

// Precio por noche según cuántas personas se alojan: { "2": 200000, "3": 210000, "4": 280000 }. Vacío o sin definir: se cobra
// «noche para 2 + persona adicional». Con menos personas que la primera fila se cobra esa fila.
export type PersonRates = Record<string, number>;

export type CabinType = {
  version?: number;
  id: CabinTypeId;
  nombre: string;
  precioPareja: number;
  personaAdicional: number;
  preciosPersonas?: PersonRates;
  maxPersonas: number;
  units: number;
  unitLabels?: string[]; // número propio de cada unidad, por posición: ["9", "2"]. En blanco: la posición.
  dayRates?: SeasonDayRate[]; // tarifa base por día de la semana (solo `weekdays`); vacío: la misma todos los días
  badge: string;
  descripcion: string;
  caracteristicas: string[];
  fotos: string[]; // URLs públicas, la primera es la portada
  activa: boolean;
  sort: number;
};

// Precio por noche distinto en un rango de fechas (noches de `from` a `to`, inclusive).
export type RateSeason = {
  version?: number;
  id: string;
  cabinTypeId: CabinTypeId;
  nombre: string;
  from: string;
  to: string;
  precioPareja: number;
  personaAdicional: number;
  preciosPersonas?: PersonRates;
  activa: boolean;
  dayRates: SeasonDayRate[];
};

// Precio distinto para ciertas noches de la temporada: unos días de la semana (0 = domingo … 6 = sábado) o unas fechas
// puntuales. Cada regla usa una de las dos. Una fecha puntual gana sobre un día de la semana; sin regla, el de la temporada.
export type SeasonDayRate = { weekdays: number[]; dates: string[]; precioPareja: number; personaAdicional: number; preciosPersonas?: PersonRates };

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
  unitsFree?: number; // unidades libres todas las noches (para varias cabañas del mismo tipo)
  quoteBy?: Record<string, Quote>; // tarifa por cantidad de personas en una cabaña ("1" … maxPersonas)
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

// Otra cabaña de la misma reserva (mismas fechas y huésped). unit: solo el panel la elige; null = la primera libre.
export type ExtraCabin = { cabinTypeId: CabinTypeId; adults: number; children: number; unit?: number | null };

export type ReservationInput = {
  cabinTypeId: CabinTypeId;
  more?: ExtraCabin[]; // reserva con varias cabañas: las demás, además de la primera
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
export type ReservationSource = "web" | "panel" | "import";

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
  version?: number;
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
  version?: number;
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
  externalRef?: string | null; // reservas importadas: número de la reserva en el archivo
  channel?: string; // canal de venta (Booking.com, recepción…); vacío en las de la web y el panel
  commission?: number; // comisión del canal
  demo?: boolean;
  groupCode?: string | null; // reserva con varias cabañas: código de la principal (la principal tiene el suyo)
};

// Cuerpo de POST /admin/reservations: reserva tomada por el equipo. Queda sin confirmar (y sin apartar fechas) hasta que
// el equipo registre el abono o el pago total.
export type ManualReservationInput = {
  code?: string; // generado en el navegador (reservas creadas sin conexión)
  expectedTotal?: number; // el valor que vio quien la creó sin conexión
  cabinTypeId: CabinTypeId;
  unit: number | null; // null: la primera libre (como en la web)
  more?: ExtraCabin[]; // reserva con varias cabañas (requiere conexión)
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  pet: { hasPet: boolean; smallBreedConfirmed: boolean };
  guest: Guest;
  estimatedArrival: string; // "HH:MM" o "" (inicio del check-in)
  specialRequests: string;
  total: number | null; // precio especial; null = tarifa vigente
};

export type ManualReservationResult = { reservation: Reservation; group?: Reservation[] }; // group: todas las cabañas, la principal primero

// Lo que ve el huésped. `payments`: sus pagos registrados, del más reciente al más antiguo.
// `liveKey`: nombra el canal de avisos en tiempo real de la reserva (solo con código y correo).
// `serverNow`: hora del servidor, para que las cuentas regresivas no dependan del reloj del dispositivo.
export type PublicReservation = Pick<
  Reservation,
  "code" | "status" | "checkIn" | "checkOut" | "cabinTypeId" | "quote" | "depositDueAt" | "depositPaidAt" | "balancePaidAt" | "paid" | "checkedInAt"
> & {
  guestFirstName?: string;
  payments?: PublicPayment[];
  liveKey?: string;
  serverNow?: string;
  // Reserva con varias cabañas: el huésped ve el grupo con el código principal; quote, paid y personas son del grupo.
  cabins?: { cabinTypeId: CabinTypeId; adults: number; children: number; total: number }[];
};

export type Block = {
  version?: number;
  id: string;
  cabinTypeId: CabinTypeId;
  unit: number;
  from: string;
  to: string;
  reason: string;
  notes: string;
};

// `ids`: identificadores generados en el navegador, uno por unidad afectada (operaciones sin conexión).
export type BlockInput = Omit<Block, "id" | "unit" | "version"> & { unit: number | "all"; ids?: string[] };

export type Rates = Partial<
  Record<CabinTypeId, { precioPareja: number; personaAdicional: number; maxPersonas: number; preciosPersonas?: PersonRates; dayRates?: SeasonDayRate[] }>
>;

// Valoración interna de un cliente: solo la ve el equipo, nunca se expone en rutas públicas.
export type Trust = "sin_evaluar" | "alta" | "media" | "baja" | "no_recomendado";
export type Severity = "leve" | "moderada" | "grave";

export type ClientEntry = { id: number; kind: "note" | "incident"; severity: Severity | null; text: string; reservationCode: string | null; createdAt: string };

export type ClientProfile = {
  version?: number;
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
  | "checkout_pending"
  | "email_failed"
  | "booking_pending"
  | "booking_modified"
  | "booking_cancelled"
  | "booking_failed"
  | "channel_conflict"
  | "channel_moved" // cambió en el panel una reserva enlazada: falta hacer lo mismo en el extranet
  | "channel_cancelled" // Booking ya no tiene una noche enlazada a una reserva
  | "channel_sync_failed"
  | "reservation_moved"; // sin abono: otra reserva pagó sus fechas y se corrió a las próximas libres

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
  cursor?: string; // desde dónde pedir cambios (lib/offline)
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
  me: PanelUser; // quién usa el panel
  bathrooms: Bathroom[];
  bathroomBlocks: BathroomBlock[];
  channelStays: ChannelStay[]; // noches ocupadas en Booking.com (lib/server/channels)
};

/* ───────────── Equipo ───────────── */

// admin: todo. recepcion: el día a día (sin finanzas, tarifas, cabañas, contenido del sitio, cancelar ni eliminar).
export type PanelRole = "admin" | "recepcion";
// photo: URL pública de la foto de perfil (null sin foto).
export type PanelUser = { id: string; email: string; name: string; role: PanelRole; photo: string | null };
export type Employee = PanelUser & { createdAt: string; lastSignInAt: string | null; active: boolean };
// Crear: email, name, role y password. Editar: id y lo que cambia (password solo para asignar una nueva).
export type EmployeeInput = { id?: string; email?: string; name?: string; role?: PanelRole; password?: string; active?: boolean };
// Perfil propio: nombre y, si se quiere, contraseña nueva.
export type ProfileInput = { name?: string; password?: string };

/* ───────────── Baños ───────────── */

export type BathroomStatus = "available" | "unavailable" | "maintenance";
// cabinTypeId y unit: la cabaña a la que pertenece (opcional; sin ella es un baño compartido).
export type Bathroom = {
  version?: number;
  id: string;
  name: string;
  status: BathroomStatus;
  cabinTypeId: CabinTypeId | null;
  unit: number | null;
  notes: string;
  statusUpdatedAt: string;
};
export type BathroomInput = { id?: string; name?: string; status?: BathroomStatus; cabinTypeId?: CabinTypeId | null; unit?: number | null; notes?: string };
export type BathroomBlock = { version?: number; id: string; bathroomId: string; from: string; to: string; reason: string; notes: string };
export type BathroomBlockInput = Omit<BathroomBlock, "id" | "version"> & { id?: string };

/* ───────────── Booking.com (calendarios iCal) ───────────── */

// Noches ocupadas en Booking de una cabaña (checkOut exclusivo, como las reservas). echo: Booking las cerró porque ya
// estaban ocupadas en el panel (no ocupan). removedAt: dejaron de venir en el calendario (se cancelaron).
export type ChannelStay = {
  id: string;
  calendarId: string;
  cabinTypeId: CabinTypeId;
  unit: number;
  checkIn: string;
  checkOut: string;
  summary: string;
  echo: boolean;
  firstSeenAt: string;
  removedAt: string | null;
  reservationCode: string | null; // ya tiene los datos del huésped: es esa reserva la que ocupa la cabaña
};

// Datos del huésped copiados del extranet para convertir una noche de Booking en una reserva del panel.
export type ChannelStayCompletion = {
  stayId: string;
  guest: Guest;
  adults: number;
  children: number;
  total: number;
  ref?: string; // número de reserva en Booking
  notes?: string;
};

// Un calendario por cabaña: importUrl es el enlace de exportación de Booking; exportUrl, el que Booking importa del panel.
export type ChannelCalendar = {
  id: string;
  label: string;
  cabinTypeId: CabinTypeId;
  unit: number;
  importUrl: string | null;
  exportUrl: string;
  lastSyncedAt: string | null;
  lastFetchedAt: string | null;
  lastStatus: "ok" | "error" | null;
  lastError: string;
  lastEventCount: number;
};

export type ChannelSyncResult = { calendarId: string; ok: boolean; error?: string; events: number; added: number; removed: number; conflicts: string[] };

/* ───────────── Importación ───────────── */

// Una reserva a crear desde el archivo (ya mapeada a una cabaña del panel). ref: referencia única de la fila.
export type ImportRow = {
  ref: string;
  guest: string;
  email: string;
  phone: string;
  checkIn: string;
  checkOut: string;
  cabinTypeId: CabinTypeId;
  unit: number;
  total: number;
  commission: number;
  channel: string;
  status: "confirmed" | "completed" | "cancelled";
  notes: string;
};
export type ImportResult = { ref: string; ok: boolean; code?: string; error?: string };

// Reserva de Booking que llegó por correo de Ayenda (booking_inbox). El correo no dice la cabaña: entra «pending» y el
// equipo la asigna. ref: número único de Ayenda.
export type BookingInboxStatus = "pending" | "assigned" | "cancelled" | "dismissed";
export type BookingInboxItem = {
  ref: string;
  status: BookingInboxStatus;
  guest: string;
  email: string;
  phone: string;
  checkIn: string;
  checkOut: string;
  total: number;
  reservationCode: string | null;
  lastEmailAt: string;
};
export type BookingInboxAction = { action: "assign"; ref: string; cabinTypeId: CabinTypeId; unit: number } | { action: "dismiss"; ref: string };

// Cuerpo de PUT /admin/site.
export type SiteInput = { settings: SiteSettings; policies: SitePolicy[]; content: SiteTexts; theme?: SiteTheme }; // sin theme: se conservan los colores guardados

// Condiciones de pago (solo administradores): el abono para confirmar (% del total) y los datos para pagar que ve el huésped.
export type PaymentTerms = { depositPct: number; instructions: string };

export type CabinInput = {
  id?: string; // solo al crear; si falta se genera a partir del nombre
  nombre: string;
  descripcion: string;
  caracteristicas: string[];
  badge: string;
  maxPersonas: number;
  units: number;
  unitLabels?: string[];
  precioPareja: number;
  personaAdicional: number;
  activa: boolean;
};

export type SeasonInput = Omit<RateSeason, "id" | "version"> & { id?: string };

// Cómo pagó el huésped un pago que registra el equipo.
export type PayMethod = "cash" | "transfer";

export type AdminAction =
  | { code: string; action: "checkin" | "checkout" }
  // En una reserva con varias cabañas: `group` cancela todas; sin él, solo esta (sale del grupo; la principal no puede).
  | { code: string; action: "cancel"; group?: boolean }
  // Pago recibido en persona: "confirm" = de una reserva pendiente (la confirma), "balance" = de una ya confirmada.
  // Valor: `full` = todo lo que falta, `amount` = un valor a elección; sin ninguno, el abono (o el saldo). `method` y
  // `note` quedan como detalle del pago.
  // `basePaid`: lo pagado que veía quien registró el pago sin conexión; si cambió, el servidor lo advierte (a menos que venga `force`).
  // `group` (en confirm, balance y extend_hold): la reserva es de varias cabañas; el panel la envía con conexión.
  | {
      code: string;
      action: "confirm" | "balance";
      note?: string;
      full?: boolean;
      amount?: number;
      method?: PayMethod;
      basePaid?: number;
      force?: boolean;
      group?: boolean;
    }
  | { code: string; action: "reschedule"; checkIn: string; checkOut: string }
  // Otra cabaña física, mismas fechas y mismo valor.
  | { code: string; action: "move"; cabinTypeId: string; unit: number }
  // Plazo nuevo para pagar el abono: amplía (o reactiva, si venció) la retención de una reserva sin abono.
  | { code: string; action: "extend_hold"; group?: boolean } // reactiva una vencida, sin plazo
  | { code: string; action: "note"; text: string }
  // Corregir o completar los datos del huésped (p. ej. el documento de una reserva importada).
  | { code: string; action: "guest"; guest: Guest };

export type ProofReview = { id: string; decision: "approve" | "reject"; note: string; confirmReservation: boolean };

// `queued`: la respuesta la construyó el navegador; el cambio está guardado en este dispositivo, aún sin confirmar (lib/offline).
export type ApiResult<T> = { status: number; data: T | null; queued?: boolean };

export type FieldErrors = Record<string, string>;
