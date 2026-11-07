import { after, type NextRequest } from "next/server";
import {
  type Db,
  loadClients,
  runDeadlines,
  toBathroom,
  toBathroomBlock,
  toBlock,
  toCabinType,
  channelStayOf,
  toEmail,
  toNotification,
  toPayment,
  toProof,
  toReservation,
  toSeason,
} from "@/lib/server/db";
import { fail, json, requireStaff, route } from "@/lib/server/http";
import { dispatchPush } from "@/lib/server/push";
import { loadSiteContent } from "@/lib/server/site";

const CURSOR = /^\d+:\d+$/;

type Change = { collection: string; key: string; op: "U" | "D" };
type Pulled = { changes: Change[]; cursor: string; hasMore: boolean };

// Filas actuales de una colección, con la misma forma que /admin/data.
const LOAD: Record<string, (sb: Db, keys: string[]) => Promise<{ key: string; row: unknown }[]>> = {
  reservations: async (sb, keys) =>
    (await sb.from("reservations").select("*, reservation_notes(text, created_at)").in("code", keys).throwOnError()).data.map((r) => ({
      key: r.code,
      row: toReservation(r),
    })),
  blocks: async (sb, keys) => (await sb.from("blocks").select("*").in("id", keys).throwOnError()).data.map((r) => ({ key: r.id, row: toBlock(r) })),
  cabinTypes: async (sb, keys) =>
    (await sb.from("cabin_types").select("*").in("id", keys).throwOnError()).data.map((r) => ({ key: r.id, row: toCabinType(r) })),
  seasons: async (sb, keys) => (await sb.from("rate_seasons").select("*").in("id", keys).throwOnError()).data.map((r) => ({ key: r.id, row: toSeason(r) })),
  clients: async (sb, keys) => Object.entries(await loadClients(sb, keys)).map(([key, row]) => ({ key, row })),
  proofs: async (sb, keys) => (await sb.from("payment_proofs").select("*").in("id", keys).throwOnError()).data.map((r) => ({ key: r.id, row: toProof(r) })),
  payments: async (sb, keys) => (await sb.from("payments").select("*").in("id", keys).throwOnError()).data.map((r) => ({ key: r.id, row: toPayment(r) })),
  emails: async (sb, keys) => (await sb.from("email_outbox").select("*").in("id", keys).throwOnError()).data.map((r) => ({ key: r.id, row: toEmail(r) })),
  notifications: async (sb, keys) =>
    (await sb.from("admin_notifications").select("*").in("id", keys.map(Number)).throwOnError()).data.map((r) => ({
      key: String(r.id),
      row: toNotification(r),
    })),
  bathrooms: async (sb, keys) => (await sb.from("bathrooms").select("*").in("id", keys).throwOnError()).data.map((r) => ({ key: r.id, row: toBathroom(r) })),
  bathroomBlocks: async (sb, keys) =>
    (await sb.from("bathroom_blocks").select("*").in("id", keys).throwOnError()).data.map((r) => ({ key: r.id, row: toBathroomBlock(r) })),
  channelStays: async (sb, keys) =>
    (await sb.from("channel_stays").select("*").in("id", keys).throwOnError()).data.map((r) => ({ key: r.id, row: channelStayOf(r) })),
};

// GET /api/admin/sync/pull?cursor= → lo que cambió desde el cursor: filas actuales (upserts), filas que ya no existen (deletes)
// y el cursor siguiente. Lo manda la fila actual, no el tipo de cambio: si un cambio ya no tiene fila, es un borrado.
export const GET = route(async (req: NextRequest) => {
  const { sb, error } = await requireStaff();
  if (error) return error;
  const cursor = req.nextUrl.searchParams.get("cursor") ?? "";
  if (!CURSOR.test(cursor)) return fail(400, "INVALID_CURSOR");
  await runDeadlines();

  const { data } = await sb.rpc("sync_pull", { p_cursor: cursor }).throwOnError();
  const pulled = data as unknown as Pulled;

  const keysBy = new Map<string, Set<string>>();
  for (const c of pulled.changes) keysBy.set(c.collection, (keysBy.get(c.collection) ?? new Set()).add(c.key));

  const upserts: Record<string, { key: string; row: unknown }[]> = {};
  const deletes: Record<string, string[]> = {};
  await Promise.all(
    [...keysBy].map(async ([collection, keys]) => {
      const load = LOAD[collection];
      if (!load) return;
      const rows = await load(sb, [...keys]);
      const present = new Set(rows.map((r) => r.key));
      upserts[collection] = rows;
      deletes[collection] = [...keys].filter((k) => !present.has(k));
    }),
  );
  const site = keysBy.has("site") ? await loadSiteContent(sb) : undefined;

  // Avisos que aún no salieron como notificación push (igual que /admin/data).
  after(dispatchPush);
  return json({ cursor: pulled.cursor, hasMore: pulled.hasMore, upserts, deletes, site });
});
