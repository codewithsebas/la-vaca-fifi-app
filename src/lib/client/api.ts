// Cliente único de la API (navegador). Las escrituras del panel pasan por mutate: con el panel sin conexión activo (lib/offline)
// quedan guardadas en este dispositivo antes de enviarse; si no, van directas.
import { formOf, request, upload } from "@/lib/client/http";
import type { CabinTypeId } from "@/lib/config";
import { cachedFile, cachedGet, mutate, onlineOnly } from "@/lib/offline/runtime";
import type {
  AdminAction,
  AdminData,
  AdminNotification,
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
  BookingInboxAction,
  BookingInboxItem,
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
import type { PanelColors } from "@/lib/panel-colors";
import type { NotificationGroup } from "@/lib/notification-groups";
import type { SiteContent, SiteService } from "@/lib/site";

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
    ping: () => request<object>("GET", "/admin/sync/ping", { noRetry: true }),
    data: () => request<AdminData>("GET", "/admin/data"),
    action: (b: AdminAction) => {
      const direct = () => request<Reservation>("POST", "/admin/action", { body: b });
      // Pagos, plazo y cancelación de un grupo: con conexión (el reparto lo hace el servidor).
      if ("group" in b && b.group) return onlineOnly(direct);
      if (b.action !== "guest") return mutate("reservation.action", b, direct);
      return mutate("reservation.guest", { code: b.code, ...b.guest }, direct);
    },
    createReservation: (b: ManualReservationInput) => {
      const direct = () => request<ManualReservationResult | ValidationError | ApiError>("POST", "/admin/reservations", { body: b });
      // Varias cabañas: con conexión.
      return b.more?.length ? onlineOnly(direct) : mutate("reservation.create", b, direct);
    },
    addBlock: (b: BlockInput) => mutate("block.create", b, () => request<Block[]>("POST", "/admin/blocks", { body: b })),
    updateBlock: (b: BlockInput & { id: string }) => mutate("block.update", b, () => request<Block[]>("PUT", "/admin/blocks", { body: b })),
    deleteBlock: (id: string) => mutate("block.delete", { id }, () => request<Block[]>("DELETE", "/admin/blocks", { query: { id } })),
    saveRates: (b: Rates) => mutate("rates.save", { rates: b }, () => request<CabinType[]>("PUT", "/admin/cabin-types", { body: b })),
    createCabin: (b: CabinInput) => mutate("cabin.create", b, () => request<CabinType[] | ValidationError>("POST", "/admin/cabins", { body: b })),
    updateCabin: (b: CabinInput & { id: string }) =>
      mutate("cabin.update", b, () => request<CabinType[] | ValidationError>("PUT", "/admin/cabins", { body: b })),
    reorderCabins: (order: string[]) => mutate("cabin.reorder", { order }, () => request<CabinType[]>("PATCH", "/admin/cabins", { body: { order } })),
    deleteCabin: (id: string) => mutate("cabin.delete", { id }, () => request<CabinType[]>("DELETE", "/admin/cabins", { query: { id } })),
    uploadCabinPhoto: (cabinId: string, file: Blob, name: string) =>
      mutate("cabinPhoto.add", { cabinId, file, name }, () => upload<CabinType[]>("/admin/cabins/photos", formOf({ cabinId, file }, name))),
    reorderCabinPhotos: (cabinId: string, fotos: string[]) =>
      mutate("cabinPhoto.reorder", { cabinId, fotos }, () => request<CabinType[]>("PUT", "/admin/cabins/photos", { body: { cabinId, fotos } })),
    deleteCabinPhoto: (cabinId: string, url: string) =>
      mutate("cabinPhoto.delete", { cabinId, url }, () => request<CabinType[]>("DELETE", "/admin/cabins/photos", { query: { cabinId, url } })),
    createSeason: (b: SeasonInput) => mutate("season.create", b, () => request<RateSeason[] | ValidationError>("POST", "/admin/seasons", { body: b })),
    updateSeason: (b: SeasonInput) => mutate("season.update", b, () => request<RateSeason[] | ValidationError>("PUT", "/admin/seasons", { body: b })),
    deleteSeason: (id: string) => mutate("season.delete", { id }, () => request<RateSeason[]>("DELETE", "/admin/seasons", { query: { id } })),
    saveClient: (b: ClientProfileInput & { clientKey: string }) =>
      mutate("client.save", b, () => request<ClientProfile | ValidationError>("PUT", "/admin/clients", { body: b })),
    addClientEntry: (b: { clientKey: string; kind: "note" | "incident"; severity: string | null; text: string; reservationCode: string | null }) =>
      mutate("client.entry.add", b, () => request<ClientProfile>("POST", "/admin/clients", { body: b })),
    deleteClientEntry: (id: number) =>
      mutate("client.entry.delete", { id }, () => request<ClientProfile>("DELETE", "/admin/clients", { query: { entry: id } })),
    proofUrl: (id: string) =>
      cachedFile(`proof:${id}`, () => request<{ url: string; mime: string; fileName: string }>("GET", "/admin/proofs", { query: { id } })),
    reviewProof: (b: ProofReview) => mutate("proof.review", b, () => request<PaymentProof>("POST", "/admin/proofs", { body: b })),
    markNotifications: (b: { ids?: number[]; all?: boolean }) =>
      mutate("notifications.mark", b, () => request<AdminNotification[]>("POST", "/admin/notifications", { body: b })),
    emailStatus: () => cachedGet("emailStatus", () => request<{ configured: boolean }>("GET", "/admin/emails")),
    sendEmail: (b: { clientKey: string; subject: string; message: string; reservationCode: string | null; requestId: string }) =>
      mutate("email.send", b, () => request<EmailRecord | ApiError>("POST", "/admin/emails", { body: { action: "send", ...b } })),
    retryEmail: (id: string) =>
      mutate("email.retry", { id }, () => request<EmailRecord | ApiError>("POST", "/admin/emails", { body: { action: "retry", id } })),
    reset: () => request<object>("POST", "/admin/reset"),
    saveSite: (b: SiteInput) => mutate("site.save", b, () => request<SiteContent>("PUT", "/admin/site", { body: b })),
    savePanelColors: (b: PanelColors) => mutate("panelColors.save", b, () => request<SiteContent>("PUT", "/admin/panel-colors", { body: b })),
    savePaymentTerms: (b: PaymentTerms) => mutate("terms.save", b, () => request<SiteContent>("PUT", "/admin/payment-terms", { body: b })),
    uploadPhoto: (slot: string, file: Blob, name: string) =>
      mutate("sitePhoto.set", { slot, file, name }, () => upload<Record<string, string>>("/admin/photos", formOf({ slot, file }, name))),
    deletePhoto: (slot: string) => mutate("sitePhoto.delete", { slot }, () => request<Record<string, string>>("DELETE", "/admin/photos", { query: { slot } })),
    // Servicios del sitio: cada operación responde con la lista completa en orden.
    services: {
      create: (b: Omit<SiteService, "id">) =>
        mutate("service.create", b, () => request<SiteService[] | ValidationError>("POST", "/admin/services", { body: b })),
      update: (b: SiteService) => mutate("service.update", b, () => request<SiteService[] | ValidationError>("PUT", "/admin/services", { body: b })),
      reorder: (order: string[]) => mutate("service.reorder", { order }, () => request<SiteService[]>("PATCH", "/admin/services", { body: { order } })),
      remove: (id: string) => mutate("service.delete", { id }, () => request<SiteService[]>("DELETE", "/admin/services", { query: { id } })),
    },
    // Notificaciones push de este dispositivo (la suscripción la crea el navegador; aquí se registra en el servidor).
    push: {
      status: (endpoint?: string) =>
        cachedGet("pushStatus", () => request<{ configured: boolean; subscription: PushDevice | null }>("GET", "/admin/push", { query: { endpoint } })),
      subscribe: (b: { subscription: PushSubscriptionJSON; groups?: NotificationGroup[] }) =>
        request<PushDevice | ApiError>("POST", "/admin/push", { body: { action: "subscribe", ...b } }),
      setGroups: (endpoint: string, groups: NotificationGroup[]) =>
        request<PushDevice | ApiError>("POST", "/admin/push", { body: { action: "groups", endpoint, groups } }),
      test: (endpoint: string) => request<{ ok: true } | ApiError>("POST", "/admin/push", { body: { action: "test", endpoint } }),
      unsubscribe: (endpoint: string) => request<{ ok: true } | ApiError>("DELETE", "/admin/push", { query: { endpoint } }),
    },
    // Baños y sus bloqueos: cada operación responde con las dos listas completas.
    bathrooms: {
      create: (b: BathroomInput) => mutate("bathroom.create", b, () => request<Bathrooms | ValidationError>("POST", "/admin/bathrooms", { body: b })),
      update: (b: BathroomInput) => mutate("bathroom.update", b, () => request<Bathrooms | ValidationError>("PUT", "/admin/bathrooms", { body: b })),
      remove: (id: string) => mutate("bathroom.delete", { id }, () => request<Bathrooms>("DELETE", "/admin/bathrooms", { query: { id } })),
    },
    bathroomBlocks: {
      create: (b: BathroomBlockInput) => mutate("bathroomBlock.create", b, () => request<Bathrooms | ApiError>("POST", "/admin/bathroom-blocks", { body: b })),
      update: (b: BathroomBlockInput) => mutate("bathroomBlock.update", b, () => request<Bathrooms | ApiError>("PUT", "/admin/bathroom-blocks", { body: b })),
      remove: (id: string) => mutate("bathroomBlock.delete", { id }, () => request<Bathrooms>("DELETE", "/admin/bathroom-blocks", { query: { id } })),
    },
    // Empleados (solo administradores): cada operación responde con la lista completa.
    employees: {
      list: () => cachedGet("employees", () => request<Employee[]>("GET", "/admin/employees")),
      create: (b: EmployeeInput) => request<Employee[] | ValidationError | ApiError>("POST", "/admin/employees", { body: b }),
      update: (b: EmployeeInput) => request<Employee[] | ValidationError | ApiError>("PUT", "/admin/employees", { body: b }),
      remove: (id: string) => request<Employee[] | ApiError>("DELETE", "/admin/employees", { query: { id } }),
    },
    // Reservas de Booking que llegan por correo, por asignar a una cabaña. Solo con conexión.
    booking: {
      list: () => request<BookingInboxItem[]>("GET", "/admin/booking"),
      assign: (ref: string, cabinTypeId: CabinTypeId, unit: number) =>
        request<{ code: string; items: BookingInboxItem[] } | ApiError>("POST", "/admin/booking", {
          body: { action: "assign", ref, cabinTypeId, unit } satisfies BookingInboxAction,
        }),
      dismiss: (ref: string) =>
        request<BookingInboxItem[] | ApiError>("POST", "/admin/booking", { body: { action: "dismiss", ref } satisfies BookingInboxAction }),
    },
    // La contraseña nunca entra en la cola: cambiarla exige conexión.
    profile: (b: ProfileInput) => {
      const direct = () => request<{ me: PanelUser } | ValidationError>("PUT", "/admin/profile", { body: b });
      return b.password === undefined && b.name !== undefined ? mutate("profile.save", { name: b.name }, direct) : direct();
    },
    uploadProfilePhoto: (file: Blob, name: string) =>
      mutate("profilePhoto.set", { file, name }, () => upload<{ me: PanelUser }>("/admin/profile/photo", formOf({ file }, name))),
    deleteProfilePhoto: () => mutate("profilePhoto.delete", {}, () => request<{ me: PanelUser }>("DELETE", "/admin/profile/photo")),
    importReservations: (rows: ImportRow[]) =>
      mutate("import.run", { rows }, () => request<{ results: ImportResult[] } | ApiError>("POST", "/admin/import", { body: { rows } })),
  },
};

export type Bathrooms = { bathrooms: Bathroom[]; blocks: BathroomBlock[] };
