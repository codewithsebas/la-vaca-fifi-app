// La copia base del panel: AdminData (lo último confirmado por el servidor) como filas por colección. Funciones puras.
import type { AdminData, PanelUser } from "@/lib/types";
import { mergePanelColors } from "@/lib/panel-colors";
import type { SiteContent } from "@/lib/site";

export type ListCollection =
  "reservations" | "blocks" | "cabinTypes" | "seasons" | "proofs" | "payments" | "emails" | "notifications" | "bathrooms" | "bathroomBlocks" | "channelStays";
export type Collection = ListCollection | "clients" | "site";
export type Row = { collection: Collection; key: string; row: unknown };

type Spec<T> = { key: (r: T) => string; order: (a: T, b: T) => number; limit?: number };
const text = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const newest = (a: { createdAt: string }, b: { createdAt: string }) => text(b.createdAt, a.createdAt);

// Mismos órdenes y límites que GET /api/admin/data.
export const LISTS: { [K in ListCollection]: Spec<AdminData[K][number]> } = {
  reservations: { key: (r) => r.code, order: (a, b) => text(b.checkIn, a.checkIn) },
  blocks: { key: (r) => r.id, order: (a, b) => text(a.from, b.from) },
  cabinTypes: { key: (r) => r.id, order: (a, b) => a.sort - b.sort },
  seasons: { key: (r) => r.id, order: (a, b) => text(a.from, b.from) },
  proofs: { key: (r) => r.id, order: newest },
  payments: { key: (r) => r.id, order: newest, limit: 1000 },
  emails: { key: (r) => r.id, order: newest, limit: 300 },
  notifications: { key: (r) => String(r.id), order: newest, limit: 150 },
  bathrooms: { key: (r) => r.id, order: (a, b) => text(a.name, b.name) },
  bathroomBlocks: { key: (r) => r.id, order: (a, b) => text(a.from, b.from) },
  channelStays: { key: (r) => r.id, order: (a, b) => text(a.checkIn, b.checkIn) },
};
const LIST_NAMES = Object.keys(LISTS) as ListCollection[];

export const unitsOf = (cabinTypes: AdminData["cabinTypes"]) => Object.fromEntries(cabinTypes.map((c) => [c.id, c.units]));

// Cualquier lista con su orden y su límite, tras cambiar filas.
export function sorted<K extends ListCollection>(name: K, list: AdminData[K]): AdminData[K] {
  const spec = LISTS[name] as unknown as Spec<AdminData[K][number]>;
  const out = [...list].sort(spec.order);
  return (spec.limit ? out.slice(0, spec.limit) : out) as AdminData[K];
}

export function rowsOf(d: AdminData): Row[] {
  const rows: Row[] = [];
  for (const name of LIST_NAMES) {
    const key = LISTS[name].key as (r: unknown) => string;
    // Una colección que el servidor aún no manda (p. ej. channelStays antes de su migración) queda vacía.
    for (const row of d[name] ?? []) rows.push({ collection: name, key: key(row), row });
  }
  for (const [key, row] of Object.entries(d.clients)) rows.push({ collection: "clients", key, row });
  rows.push({ collection: "site", key: "site", row: d.site });
  return rows;
}

export function dataOf(rows: Row[], me: PanelUser): AdminData | null {
  const by = new Map<Collection, unknown[]>();
  for (const r of rows) by.set(r.collection, [...(by.get(r.collection) ?? []), r.row]);
  const site = by.get("site")?.[0] as SiteContent | undefined;
  if (!site) return null;
  const list = <K extends ListCollection>(name: K) => sorted(name, (by.get(name) ?? []) as AdminData[K]);
  const cabinTypes = list("cabinTypes");
  return {
    reservations: list("reservations"),
    blocks: list("blocks"),
    cabinTypes,
    seasons: list("seasons"),
    unidades: unitsOf(cabinTypes),
    // La copia pudo guardarse antes de existir los colores del panel, y el servidor no la reenvía hasta que el sitio cambie.
    site: { ...site, panelColors: mergePanelColors(site.panelColors) },
    proofs: list("proofs"),
    payments: list("payments"),
    emails: list("emails"),
    clients: Object.fromEntries(rows.filter((r) => r.collection === "clients").map((r) => [r.key, r.row as AdminData["clients"][string]])),
    notifications: list("notifications"),
    me,
    bathrooms: list("bathrooms"),
    bathroomBlocks: list("bathroomBlocks"),
    channelStays: list("channelStays"),
  };
}

export type Delta = {
  upserts: Partial<Record<string, { key: string; row: unknown }[]>>;
  deletes: Partial<Record<string, string[]>>;
  site?: SiteContent;
};

// Aplica una entrega del servidor a la copia base. Una colección desconocida (de una versión más nueva) se ignora.
export function applyDelta(d: AdminData, delta: Delta): AdminData {
  const next: AdminData = { ...d };
  for (const name of LIST_NAMES) {
    const ups = delta.upserts[name] ?? [];
    const dels = new Set(delta.deletes[name] ?? []);
    if (!ups.length && !dels.size) continue;
    const key = LISTS[name].key as (r: unknown) => string;
    const by = new Map(((d[name] ?? []) as unknown[]).map((r) => [key(r), r]));
    for (const k of dels) by.delete(k);
    for (const u of ups) by.set(u.key, u.row);
    (next as Record<ListCollection, unknown>)[name] = sorted(name, [...by.values()] as never);
  }
  const clientUps = delta.upserts.clients ?? [];
  const clientDels = delta.deletes.clients ?? [];
  if (clientUps.length || clientDels.length) {
    const clients = { ...d.clients };
    for (const k of clientDels) delete clients[k];
    for (const u of clientUps) clients[u.key] = u.row as AdminData["clients"][string];
    next.clients = clients;
  }
  if (delta.site) next.site = delta.site;
  next.unidades = unitsOf(next.cabinTypes);
  return next;
}

// Las filas a guardar por una entrega del servidor.
export function deltaRows(delta: Delta) {
  const puts: Row[] = [];
  const dels: [string, string][] = [];
  for (const [collection, ups] of Object.entries(delta.upserts))
    for (const u of ups ?? []) puts.push({ collection: collection as Collection, key: u.key, row: u.row });
  for (const [collection, keys] of Object.entries(delta.deletes)) for (const k of keys ?? []) dels.push([collection, k]);
  if (delta.site) puts.push({ collection: "site", key: "site", row: delta.site });
  return { puts, dels };
}
