// Quién usa el panel en este dispositivo y con qué datos abre. Cada cuenta tiene su propia base local (store.ts): una cuenta
// nunca ve ni envía lo de otra. Solo guarda quién fue el último usuario validado: nunca contraseñas ni tokens.
import { api } from "@/lib/client/api";
import { request, upload, formOf } from "@/lib/client/http";
import { OFFLINE_MAX_DAYS, projectRef } from "@/lib/offline/config";
import { SyncEngine, type Transport } from "@/lib/offline/engine";
import { setRuntime } from "@/lib/offline/runtime";
import { deleteStore, openStore, type Store } from "@/lib/offline/store";
import type { AdminData, PanelUser } from "@/lib/types";

const LAST_KEY = `vf-offline-last-${projectRef}`;
type Last = { userId: string; validatedAt: number };

function readLast(): Last | null {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? "null");
  } catch {
    return null;
  }
}
const writeLast = (last: Last | null) => {
  try {
    if (last) localStorage.setItem(LAST_KEY, JSON.stringify(last));
    else localStorage.removeItem(LAST_KEY);
  } catch {}
};

export const transport: Transport = {
  send: (req, headers) =>
    req.form
      ? upload(req.path, formOf(req.form.fields, req.form.fileName), { headers })
      : request(req.method, req.path, { query: req.query, body: req.body, headers, noRetry: true }),
  get: (path, query, timeoutMs) => request("GET", path, { query, noRetry: true, timeoutMs }),
};

const MAX_PROOFS = 20;

// Comprobantes por revisar: se guardan para poder verlos sin conexión. Los ya revisados se borran para no llenar el dispositivo.
async function keepProofs(engine: SyncEngine, store: Store) {
  const pending = engine.data.proofs.filter((p) => p.status === "pending").slice(0, MAX_PROOFS);
  const wanted = new Set(pending.map((p) => `file:proof:${p.id}`));
  for (const key of await store.metaKeys()) if (String(key).startsWith("file:proof:") && !wanted.has(String(key))) await store.deleteMeta(String(key));
  for (const p of pending) if (!(await store.getMeta(`file:proof:${p.id}`))) await api.admin.proofUrl(p.id).catch(() => {});
}

export type Opened =
  | { status: "app"; engine: SyncEngine; store: Store; offlineStart: boolean }
  | { status: "login"; message?: string }
  | { status: "error"; firstTime?: boolean }
  | { status: "expired" };

let current: { engine: SyncEngine; store: Store } | null = null;

export function closeSession() {
  current?.engine.detach();
  current?.store.close();
  current = null;
  setRuntime(null);
}

function activate(engine: SyncEngine, store: Store) {
  current = { engine, store };
  setRuntime({
    mutate: (type, input) => engine.mutate(type, input),
    cache: { get: (key) => store.getMeta(key), set: (key, value) => store.setMeta(key, value) },
    online: () => engine.status.network === "online" && !engine.status.authLost,
    sync: () => engine.sync(),
  });
  engine.attach();
  // Solo en las pruebas de punta a punta (e2e/modules.spec.ts).
  if (process.env.NEXT_PUBLIC_E2E_HOOKS === "1") (window as unknown as { __vfSync: SyncEngine }).__vfSync = engine;
  void navigator.storage?.persist?.().catch(() => {});
}

// Otra cuenta entró en este dispositivo: lo de la anterior se borra, salvo que tenga cambios sin enviar (quedan para cuando vuelva).
async function clearPrevious(previous: string | undefined, me: string) {
  if (!previous || previous === me) return;
  try {
    const store = await openStore(previous);
    const unsent = (await store.ops()).some((o) => o.state !== "confirmed");
    store.close();
    if (!unsent) await deleteStore(previous);
  } catch {}
}

// Abre el panel: valida la sesión si hay conexión; sin conexión, con los datos del último usuario validado en este dispositivo.
export async function openSession(): Promise<Opened> {
  closeSession();
  const last = readLast();
  let me: PanelUser | null = null;
  let reachable = true;
  try {
    const r = await request<{ me: PanelUser }>("GET", "/admin/sync/ping", { noRetry: true, timeoutMs: 6000 });
    if (r.status === 401 || r.status === 403) return { status: "login" };
    if (r.status === 200 && r.data?.me) me = r.data.me;
    else reachable = false;
  } catch {
    reachable = false;
  }

  if (me) {
    await clearPrevious(last?.userId, me.id);
    const store = await openStore(me.id);
    let engine = await SyncEngine.open({ store, transport, me, online: true });
    if (!engine) {
      // Primera vez de esta cuenta en este dispositivo: descarga completa.
      let initial: AdminData | null = null;
      try {
        const r = await request<AdminData>("GET", "/admin/data", { noRetry: true, timeoutMs: 30000 });
        if (r.status === 401 || r.status === 403) return { status: "login" };
        initial = r.status === 200 ? r.data : null;
      } catch {}
      if (!initial) {
        store.close();
        return { status: "error" };
      }
      engine = await SyncEngine.open({ store, transport, me, initial, online: true });
    }
    if (!engine) return { status: "error" };
    writeLast({ userId: me.id, validatedAt: Date.now() });
    activate(engine, store);
    void engine
      .sync()
      .then(() => keepProofs(engine, store))
      .catch(() => {});
    return { status: "app", engine, store, offlineStart: false };
  }

  if (reachable || !last) return { status: "error", firstTime: !last };
  if (Date.now() - last.validatedAt > OFFLINE_MAX_DAYS * 864e5) return { status: "expired" };
  const store = await openStore(last.userId);
  const saved = await store.getMeta<PanelUser>("me");
  const engine = saved ? await SyncEngine.open({ store, transport, me: saved, online: false }) : null;
  if (!engine) {
    store.close();
    return { status: "error", firstTime: true };
  }
  activate(engine, store);
  return { status: "app", engine, store, offlineStart: true };
}

// Cierra la sesión en este dispositivo y borra sus datos locales. Sin conexión, también quita las cookies de la sesión: el token
// del servidor sigue vigente hasta que venza, pero este dispositivo ya no lo tiene.
export async function endSession(userId: string, logout: () => Promise<unknown>) {
  closeSession();
  writeLast(null);
  await deleteStore(userId).catch(() => {});
  try {
    await logout();
  } catch {
    for (const c of document.cookie.split(";")) {
      const name = c.split("=")[0].trim();
      if (name.startsWith("sb-")) document.cookie = `${name}=; Max-Age=0; path=/`;
    }
  }
}
