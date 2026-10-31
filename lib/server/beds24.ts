import "server-only";
import type { Tables } from "@/lib/supabase/database.types";
import type { Beds24Room } from "@/lib/types";
import { type Db, isMissingTable } from "./db";

// Beds24 (channel manager), API v2: https://beds24.com/api/v2 · https://wiki.beds24.com/index.php/Category:API_V2
// Booking.com se conecta a Beds24 y recibe de él la disponibilidad al instante; la app crea en Beds24 lo que vende la web.
// Acceso: el «invite code» (Beds24 → Settings → Marketplace → API) se canjea una vez por un refresh token, que se guarda en
// channel_credentials. Con él se pide un token de acceso (dura horas) que también se guarda: cada token nuevo gasta créditos
// de la API (100 cada 5 minutos por cuenta).

// BEDS24_API_URL solo para pruebas contra un Beds24 simulado.
const BASE = process.env.BEDS24_API_URL?.trim() || "https://beds24.com/api/v2";
const TIMEOUT_MS = 8000;

export class Beds24Error extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

type Credentials = Tables<"channel_credentials">;
type Query = Record<string, string | number | boolean | (string | number)[] | undefined>;

// Una reserva tal como la devuelve Beds24 (solo los campos que usa la app; sin datos del huésped).
export type Beds24Booking = {
  id: number;
  propertyId?: number;
  roomId: number;
  status: string; // confirmed · request · new · cancelled · black · inquiry
  arrival: string;
  departure: string; // día de salida (exclusivo)
  channel?: string;
  apiSource?: string;
  apiReference?: string;
};

// Estados de Beds24 que ocupan la habitación («black» es un cierre hecho en Beds24).
export const OCCUPYING = ["confirmed", "request", "new", "black"];

type PostItem = {
  success?: boolean;
  new?: { id?: number };
  modified?: { id?: number };
  errors?: { message?: string; field?: string }[];
  warnings?: { message?: string }[];
};

async function raw(method: string, path: string, opts: { query?: Query; body?: unknown; headers?: Record<string, string> } = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v === undefined) continue;
    for (const x of Array.isArray(v) ? v : [v]) url.searchParams.append(k, String(x));
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json", ...(opts.body !== undefined && { "Content-Type": "application/json" }), ...opts.headers },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch (e) {
    throw new Beds24Error((e as Error)?.name === "TimeoutError" ? "Beds24 no respondió a tiempo." : "No se pudo conectar con Beds24.");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // respuesta que no es JSON: se informa con el código HTTP
  }
  return { status: res.status, data };
}

const errorOf = (data: unknown, status: number) => {
  const d = data as { error?: unknown; message?: unknown } | null;
  const msg = typeof d?.error === "string" ? d.error : typeof d?.message === "string" ? d.message : "";
  return `Beds24 respondió con un error (${status})${msg ? `: ${msg}` : "."}`;
};

export async function loadCredentials(sb: Db): Promise<Credentials | null> {
  const { data, error } = await sb.from("channel_credentials").select("*").eq("provider", "beds24").maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return data;
}

// Canjea el código de invitación (vence a las 24 h) por el acceso permanente y lo guarda. Conserva la clave del webhook.
export async function connectBeds24(sb: Db, inviteCode: string) {
  const r = await raw("GET", "/authentication/setup", { headers: { code: inviteCode, deviceName: "La Vaca Fifi" } });
  const d = r.data as { token?: string; expiresIn?: number; refreshToken?: string } | null;
  if (r.status !== 200 || !d?.refreshToken)
    throw new Beds24Error(
      r.status === 400 || r.status === 401 ? "Beds24 no aceptó el código: puede que ya se haya usado o que tenga más de 24 horas." : errorOf(r.data, r.status),
      r.status,
    );
  await sb
    .from("channel_credentials")
    .upsert(
      {
        provider: "beds24",
        refresh_token: d.refreshToken,
        access_token: d.token ?? null,
        access_expires_at: d.token ? new Date(Date.now() + (d.expiresIn ?? 3600) * 1000).toISOString() : null,
        last_error: "",
        last_error_at: null,
      },
      { onConflict: "provider" },
    )
    .throwOnError();
}

export type Beds24Client = Awaited<ReturnType<typeof beds24Client>>;

// Cliente con la sesión guardada, o null si Beds24 no está conectado.
export async function beds24Client(sb: Db) {
  const cred = await loadCredentials(sb);
  if (!cred) return null;

  async function token(force: boolean) {
    if (!force && cred!.access_token && cred!.access_expires_at && Date.parse(cred!.access_expires_at) > Date.now() + 5 * 60_000) return cred!.access_token;
    const r = await raw("GET", "/authentication/token", { headers: { refreshToken: cred!.refresh_token } });
    const d = r.data as { token?: string; expiresIn?: number } | null;
    if (r.status !== 200 || !d?.token)
      throw new Beds24Error(
        r.status === 400 || r.status === 401
          ? "Beds24 rechazó el acceso de la app: genera un código de invitación nuevo y conéctalo otra vez."
          : errorOf(r.data, r.status),
        r.status,
      );
    const expires = new Date(Date.now() + (d.expiresIn ?? 3600) * 1000).toISOString();
    await sb.from("channel_credentials").update({ access_token: d.token, access_expires_at: expires }).eq("provider", "beds24").throwOnError();
    Object.assign(cred!, { access_token: d.token, access_expires_at: expires });
    return d.token;
  }

  async function call<T>(method: string, path: string, opts: { query?: Query; body?: unknown } = {}): Promise<T> {
    let r = await raw(method, path, { ...opts, headers: { token: await token(false) } });
    if (r.status === 401) r = await raw(method, path, { ...opts, headers: { token: await token(true) } });
    if (r.status === 429) throw new Beds24Error("Se agotaron los créditos de la API de Beds24 por unos minutos.", 429);
    if (r.status >= 300) throw new Beds24Error(errorOf(r.data, r.status), r.status);
    return r.data as T;
  }

  // Varias páginas de un GET (Beds24 pagina los listados).
  async function list<T>(path: string, query: Query): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= 50; page++) {
      const d = await call<{ data?: T[]; pages?: { nextPageExists?: boolean } }>("GET", path, { query: { ...query, ...(page > 1 && { page }) } });
      out.push(...(d?.data ?? []));
      if (!d?.pages?.nextPageExists) break;
    }
    return out;
  }

  const post = async (items: object[]) => (await call<PostItem[]>("POST", "/bookings", { body: items })) ?? [];
  const messageOf = (item: PostItem | undefined) =>
    (item?.errors ?? [])
      .map((e) => e.message)
      .filter(Boolean)
      .join(" ") || "Beds24 no aceptó el cambio.";
  const byApiReference = async (ref: string) => {
    const found = await list<Beds24Booking>("/bookings", { apiReference: ref, status: [...OCCUPYING, "cancelled", "inquiry"] });
    return found.find((b) => b.apiReference === ref && b.status !== "cancelled") ?? null;
  };

  return {
    // Habitaciones de todas las propiedades de la cuenta (para enlazarlas con las unidades).
    async rooms(): Promise<Beds24Room[]> {
      const props = await list<{ id: number; name?: string; roomTypes?: { id: number; name?: string; qty?: number }[] }>("/properties", {
        includeAllRooms: true,
      });
      return props.flatMap((p) =>
        (p.roomTypes ?? []).map((r) => ({ id: r.id, propertyId: p.id, propertyName: p.name ?? "", name: r.name ?? `Habitación ${r.id}`, qty: r.qty ?? 1 })),
      );
    },

    // Reservas que siguen ocupando (por salir o en curso) de esas habitaciones.
    async upcoming(roomIds: number[], departureFrom: string): Promise<Beds24Booking[]> {
      if (!roomIds.length) return [];
      return list<Beds24Booking>("/bookings", { roomId: roomIds, departureFrom, status: OCCUPYING });
    },

    async byIds(ids: number[]): Promise<Beds24Booking[]> {
      if (!ids.length) return [];
      return list<Beds24Booking>("/bookings", { id: ids, status: [...OCCUPYING, "cancelled", "inquiry"] });
    },

    // La reserva que creó la app con esa referencia (para recuperar un intento que se cortó a mitad).
    byApiReference,

    // Crea la reserva solo si la habitación está libre esas noches (checkAvailability): así no se vende dos veces.
    async create(b: {
      roomId: number;
      arrival: string;
      departure: string;
      status: "confirmed" | "black";
      apiReference: string;
      label: string;
      numAdult?: number;
      numChild?: number;
    }) {
      const [item] = await post([
        {
          roomId: b.roomId,
          status: b.status,
          arrival: b.arrival,
          departure: b.departure,
          numAdult: b.numAdult ?? 1,
          numChild: b.numChild ?? 0,
          lastName: b.label,
          apiReference: b.apiReference,
          actions: { checkAvailability: true },
        },
      ]);
      if (item?.success) {
        const id = item.new?.id ?? (await byApiReference(b.apiReference))?.id;
        if (!id) throw new Beds24Error("Beds24 creó la reserva pero no devolvió su número.");
        return { ok: true as const, id };
      }
      const message = messageOf(item);
      // Sin disponibilidad: Booking (u otra reserva en Beds24) ya tiene alguna de esas noches.
      if (/avail|disponib|no room|not free|fully booked|overbook/i.test(message)) return { ok: false as const, message };
      throw new Beds24Error(message);
    },

    async move(id: number, arrival: string, departure: string) {
      const [item] = await post([{ id, arrival, departure }]);
      if (!item?.success) throw new Beds24Error(messageOf(item));
    },

    async cancel(id: number) {
      const [item] = await post([{ id, status: "cancelled" }]);
      // Si ya no existe en Beds24 no hay nada que liberar.
      if (!item?.success && !/not found|no existe|invalid id/i.test(messageOf(item))) throw new Beds24Error(messageOf(item));
    },

    // ¿Queda la habitación libre todas esas noches? Según el inventario de Beds24, que ya descuenta sus reservas.
    async free(roomId: number, nights: string[]) {
      if (!nights.length) return true;
      const sorted = [...nights].sort();
      const d = await call<{ data?: { roomId: number; calendar?: { from: string; to: string; numAvail?: number; override?: string }[] }[] }>(
        "GET",
        "/inventory/rooms/calendar",
        {
          query: { roomId, startDate: sorted[0], endDate: sorted.at(-1), includeNumAvail: true, includeOverride: true },
        },
      );
      const ranges = d?.data?.find((x) => x.roomId === roomId)?.calendar ?? [];
      return sorted.every((n) => {
        const r = ranges.find((x) => x.from <= n && n <= x.to);
        return !!r && (r.numAvail ?? 0) >= 1 && r.override !== "blackout";
      });
    },
  };
}
