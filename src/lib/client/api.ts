// Cliente único de la API (navegador). Habla con las rutas /api de Next.js o, en modo simulado, con lib/mock/mock-server
// (import dinámico: el simulador no entra en el JavaScript de producción).
import { config, isMockApi, type CabinTypeId } from "@/lib/config";
import { sleep } from "@/lib/format";
import type {
  AdminAction,
  AdminData,
  AdminNotification,
  ApiResult,
  Bathroom,
  BathroomBlock,
  BathroomBlockInput,
  BathroomInput,
  Employee,
  EmployeeInput,
  ImportResult,
  ImportRow,
  PanelUser,
  ProfileInput,
  Availability,
  Block,
  BlockInput,
  CabinInput,
  CabinType,
  ClientProfile,
  ClientProfileInput,
  EmailRecord,
  FieldErrors,
  ManualReservationInput,
  ManualReservationResult,
  PaymentProof,
  ProofReview,
  PublicReservation,
  RateSeason,
  Rates,
  Reservation,
  ReservationInput,
  SeasonInput,
  PaymentTerms,
  SiteInput,
} from "@/lib/types";
import type { NotificationGroup } from "@/lib/notification-groups";
import type { SiteContent, SiteService } from "@/lib/site";

type RequestOpts = {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
};

type NetworkError = { type: "network"; message: string };

const mock = async (...args: Parameters<typeof import("@/lib/mock/mock-server").mockRequest>) => (await import("@/lib/mock/mock-server")).mockRequest(...args);

const endpoint = (path: string) => new URL(config.apiBaseUrl.trim().replace(/\/$/, "") + path, window.location.origin);

async function request<T>(method: string, path: string, opts: RequestOpts = {}): Promise<ApiResult<T>> {
  if (isMockApi) return mock(method, path, opts) as Promise<ApiResult<T>>;
  const url = endpoint(path);
  if (opts.query)
    Object.entries(opts.query).forEach(([k, v]) => {
      if (v != null && v !== "") url.searchParams.set(k, String(v));
    });
  let attempt = 0;
  for (;;) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json", ...opts.headers },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
        credentials: "same-origin",
      });
      clearTimeout(timer);
      let data: T | null = null;
      try {
        data = await res.json();
      } catch {}
      return { status: res.status, data };
    } catch (err) {
      clearTimeout(timer);
      // Solo se reintenta un error de red o timeout; nunca un 4xx.
      if (attempt < 1) {
        attempt++;
        await sleep(800);
        continue;
      }
      throw { type: "network", message: String((err as Error)?.message || err) } satisfies NetworkError;
    }
  }
}

// Subida multipart (fotos, comprobantes). Sin reintentos automáticos.
async function upload<T>(path: string, form: FormData): Promise<ApiResult<T>> {
  if (isMockApi) return mock("POST", path, { body: form }) as Promise<ApiResult<T>>;
  const res = await fetch(endpoint(path), { method: "POST", body: form, credentials: "same-origin" });
  let data: T | null = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

const formOf = (fields: Record<string, string | Blob>, fileName?: string) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof Blob) form.set(k, v, fileName);
    else form.set(k, v);
  }
  return form;
};

// Clave de idempotencia por intento de reserva (sobrevive a reintentos y recargas de la pestaña).
function idemKey() {
  let k = sessionStorage.getItem("vf-idem");
  if (!k) {
    k = crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2);
    sessionStorage.setItem("vf-idem", k);
  }
  return k;
}
export const resetIdem = () => sessionStorage.removeItem("vf-idem");

export type ValidationError = { error: "VALIDATION_ERROR"; fields: FieldErrors };
export type ApiError = { error: string; fields?: FieldErrors };
// Un dispositivo registrado para notificaciones push: qué grupos recibe y cómo se reconoce ("Chrome en Android").
export type PushDevice = { groups: NotificationGroup[]; device: string; lastSuccessAt: string | null };

export const api = {
  cabinTypes: () => request<CabinType[]>("GET", "/cabin-types"),
  availability: (q: { checkIn: string; checkOut: string; adults: number; children: number }) => request<Availability>("GET", "/availability", { query: q }),
  calendar: (q: { cabinTypeId: CabinTypeId; from: string; to: string }) =>
    request<{ unavailableDates: string[] }>("GET", "/availability/calendar", { query: q }),
  createReservation: (body: ReservationInput) =>
    request<PublicReservation | ValidationError>("POST", "/reservations", { body, headers: { "Idempotency-Key": idemKey() } }),
  lookup: (q: { code: string; email: string }) => request<PublicReservation>("GET", "/reservations/lookup", { query: q }),
  admin: {
    login: (b: { email: string; password: string }) => request<object>("POST", "/admin/login", { body: b }),
    logout: () => request<object>("POST", "/admin/logout"),
    data: () => request<AdminData>("GET", "/admin/data"),
    action: (b: AdminAction) => request<Reservation>("POST", "/admin/action", { body: b }),
    createReservation: (b: ManualReservationInput) => request<ManualReservationResult | ValidationError | ApiError>("POST", "/admin/reservations", { body: b }),
    addBlock: (b: BlockInput) => request<Block[]>("POST", "/admin/blocks", { body: b }),
    updateBlock: (b: BlockInput & { id: string }) => request<Block[]>("PUT", "/admin/blocks", { body: b }),
    deleteBlock: (id: string) => request<Block[]>("DELETE", "/admin/blocks", { query: { id } }),
    saveRates: (b: Rates) => request<CabinType[]>("PUT", "/admin/cabin-types", { body: b }),
    createCabin: (b: CabinInput) => request<CabinType[] | ValidationError>("POST", "/admin/cabins", { body: b }),
    updateCabin: (b: CabinInput & { id: string }) => request<CabinType[] | ValidationError>("PUT", "/admin/cabins", { body: b }),
    reorderCabins: (order: string[]) => request<CabinType[]>("PATCH", "/admin/cabins", { body: { order } }),
    deleteCabin: (id: string) => request<CabinType[]>("DELETE", "/admin/cabins", { query: { id } }),
    uploadCabinPhoto: (cabinId: string, file: Blob, name: string) => upload<CabinType[]>("/admin/cabins/photos", formOf({ cabinId, file }, name)),
    reorderCabinPhotos: (cabinId: string, fotos: string[]) => request<CabinType[]>("PUT", "/admin/cabins/photos", { body: { cabinId, fotos } }),
    deleteCabinPhoto: (cabinId: string, url: string) => request<CabinType[]>("DELETE", "/admin/cabins/photos", { query: { cabinId, url } }),
    createSeason: (b: SeasonInput) => request<RateSeason[] | ValidationError>("POST", "/admin/seasons", { body: b }),
    updateSeason: (b: SeasonInput) => request<RateSeason[] | ValidationError>("PUT", "/admin/seasons", { body: b }),
    deleteSeason: (id: string) => request<RateSeason[]>("DELETE", "/admin/seasons", { query: { id } }),
    saveClient: (b: ClientProfileInput & { clientKey: string }) => request<ClientProfile | ValidationError>("PUT", "/admin/clients", { body: b }),
    addClientEntry: (b: { clientKey: string; kind: "note" | "incident"; severity: string | null; text: string; reservationCode: string | null }) =>
      request<ClientProfile>("POST", "/admin/clients", { body: b }),
    deleteClientEntry: (id: number) => request<ClientProfile>("DELETE", "/admin/clients", { query: { entry: id } }),
    proofUrl: (id: string) => request<{ url: string; mime: string; fileName: string }>("GET", "/admin/proofs", { query: { id } }),
    reviewProof: (b: ProofReview) => request<PaymentProof>("POST", "/admin/proofs", { body: b }),
    markNotifications: (b: { ids?: number[]; all?: boolean }) => request<AdminNotification[]>("POST", "/admin/notifications", { body: b }),
    emailStatus: () => request<{ configured: boolean }>("GET", "/admin/emails"),
    sendEmail: (b: { clientKey: string; subject: string; message: string; reservationCode: string | null; requestId: string }) =>
      request<EmailRecord | ApiError>("POST", "/admin/emails", { body: { action: "send", ...b } }),
    retryEmail: (id: string) => request<EmailRecord | ApiError>("POST", "/admin/emails", { body: { action: "retry", id } }),
    reset: () => request<object>("POST", "/admin/reset"),
    saveSite: (b: SiteInput) => request<SiteContent>("PUT", "/admin/site", { body: b }),
    savePaymentTerms: (b: PaymentTerms) => request<SiteContent>("PUT", "/admin/payment-terms", { body: b }),
    uploadPhoto: (slot: string, file: Blob, name: string) => upload<Record<string, string>>("/admin/photos", formOf({ slot, file }, name)),
    deletePhoto: (slot: string) => request<Record<string, string>>("DELETE", "/admin/photos", { query: { slot } }),
    // Servicios del sitio: cada operación responde con la lista completa en orden.
    services: {
      create: (b: Omit<SiteService, "id">) => request<SiteService[] | ValidationError>("POST", "/admin/services", { body: b }),
      update: (b: SiteService) => request<SiteService[] | ValidationError>("PUT", "/admin/services", { body: b }),
      reorder: (order: string[]) => request<SiteService[]>("PATCH", "/admin/services", { body: { order } }),
      remove: (id: string) => request<SiteService[]>("DELETE", "/admin/services", { query: { id } }),
    },
    // Notificaciones push de este dispositivo (la suscripción la crea el navegador; aquí se registra en el servidor).
    push: {
      status: (endpoint?: string) => request<{ configured: boolean; subscription: PushDevice | null }>("GET", "/admin/push", { query: { endpoint } }),
      subscribe: (b: { subscription: PushSubscriptionJSON; groups?: NotificationGroup[] }) =>
        request<PushDevice | ApiError>("POST", "/admin/push", { body: { action: "subscribe", ...b } }),
      setGroups: (endpoint: string, groups: NotificationGroup[]) =>
        request<PushDevice | ApiError>("POST", "/admin/push", { body: { action: "groups", endpoint, groups } }),
      test: (endpoint: string) => request<{ ok: true } | ApiError>("POST", "/admin/push", { body: { action: "test", endpoint } }),
      unsubscribe: (endpoint: string) => request<{ ok: true } | ApiError>("DELETE", "/admin/push", { query: { endpoint } }),
    },
    // Baños y sus bloqueos: cada operación responde con las dos listas completas.
    bathrooms: {
      create: (b: BathroomInput) => request<Bathrooms | ValidationError>("POST", "/admin/bathrooms", { body: b }),
      update: (b: BathroomInput) => request<Bathrooms | ValidationError>("PUT", "/admin/bathrooms", { body: b }),
      remove: (id: string) => request<Bathrooms>("DELETE", "/admin/bathrooms", { query: { id } }),
    },
    bathroomBlocks: {
      create: (b: BathroomBlockInput) => request<Bathrooms | ApiError>("POST", "/admin/bathroom-blocks", { body: b }),
      update: (b: BathroomBlockInput) => request<Bathrooms | ApiError>("PUT", "/admin/bathroom-blocks", { body: b }),
      remove: (id: string) => request<Bathrooms>("DELETE", "/admin/bathroom-blocks", { query: { id } }),
    },
    // Empleados (solo administradores): cada operación responde con la lista completa.
    employees: {
      list: () => request<Employee[]>("GET", "/admin/employees"),
      create: (b: EmployeeInput) => request<Employee[] | ValidationError | ApiError>("POST", "/admin/employees", { body: b }),
      update: (b: EmployeeInput) => request<Employee[] | ValidationError | ApiError>("PUT", "/admin/employees", { body: b }),
      remove: (id: string) => request<Employee[] | ApiError>("DELETE", "/admin/employees", { query: { id } }),
    },
    profile: (b: ProfileInput) => request<{ me: PanelUser } | ValidationError>("PUT", "/admin/profile", { body: b }),
    importReservations: (rows: ImportRow[]) => request<{ results: ImportResult[] } | ApiError>("POST", "/admin/import", { body: { rows } }),
  },
};

export type Bathrooms = { bathrooms: Bathroom[]; blocks: BathroomBlock[] };
