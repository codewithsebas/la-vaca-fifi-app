// Transporte de la API (navegador): habla con las rutas /api de Next.js o, en modo simulado, con lib/mock/mock-server
// (import dinámico: el simulador no entra en el JavaScript de producción).
import { config, isMockApi } from "@/lib/config";
import { sleep } from "@/lib/format";
import type { ApiResult } from "@/lib/types";

export type RequestOpts = {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  // Sin el reintento automático: quien llama (el motor de sincronización) decide cuándo repetir.
  noRetry?: boolean;
  timeoutMs?: number;
};

type NetworkError = { type: "network"; message: string };

const mock = async (...args: Parameters<typeof import("@/lib/mock/mock-server").mockRequest>) => (await import("@/lib/mock/mock-server")).mockRequest(...args);

const endpoint = (path: string) => new URL(config.apiBaseUrl.trim().replace(/\/$/, "") + path, window.location.origin);

export async function request<T>(method: string, path: string, opts: RequestOpts = {}): Promise<ApiResult<T>> {
  if (isMockApi) return mock(method, path, opts) as Promise<ApiResult<T>>;
  const url = endpoint(path);
  if (opts.query)
    Object.entries(opts.query).forEach(([k, v]) => {
      if (v != null && v !== "") url.searchParams.set(k, String(v));
    });
  // Solo se repite lo que no puede aplicarse dos veces: una lectura o algo con clave de idempotencia. Si se perdiera la
  // respuesta de un pago, repetirlo sin clave lo registraría otra vez.
  const retriable = !opts.noRetry && (method === "GET" || !!opts.headers?.["Idempotency-Key"]);
  let attempt = 0;
  for (;;) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000);
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
      if (retriable && attempt < 1) {
        attempt++;
        await sleep(800);
        continue;
      }
      throw { type: "network", message: String((err as Error)?.message || err) } satisfies NetworkError;
    }
  }
}

// Subida multipart (fotos, comprobantes). Sin reintentos automáticos.
export async function upload<T>(path: string, form: FormData, opts: { headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<ApiResult<T>> {
  if (isMockApi) return mock("POST", path, { body: form }) as Promise<ApiResult<T>>;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 120000);
  try {
    const res = await fetch(endpoint(path), { method: "POST", body: form, credentials: "same-origin", headers: opts.headers, signal: ctrl.signal });
    let data: T | null = null;
    try {
      data = await res.json();
    } catch {}
    return { status: res.status, data };
  } catch (err) {
    throw { type: "network", message: String((err as Error)?.message || err) } satisfies NetworkError;
  } finally {
    clearTimeout(timer);
  }
}

export const formOf = (fields: Record<string, string | Blob>, fileName?: string) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof Blob) form.set(k, v, fileName);
    else form.set(k, v);
  }
  return form;
};
