// Almacén local del panel (IndexedDB): una base por entorno y usuario, con la copia base, la cola de operaciones y datos
// sueltos. Nunca guarda contraseñas ni tokens: la sesión sigue en las cookies de Supabase.
import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import { projectRef } from "@/lib/offline/config";
import type { Row } from "@/lib/offline/data";
import type { Op } from "@/lib/offline/ops";

interface Schema extends DBSchema {
  meta: { key: string; value: unknown };
  rows: { key: [string, string]; value: Row; indexes: { collection: string } };
  outbox: { key: number; value: Op; indexes: { opId: string } };
}

export const localDbName = (userId: string) => `vf-${projectRef}-${userId}`;

export async function openStore(userId: string) {
  const db = await openDB<Schema>(localDbName(userId), 1, {
    upgrade(d) {
      d.createObjectStore("meta");
      d.createObjectStore("rows", { keyPath: ["collection", "key"] }).createIndex("collection", "collection");
      d.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true }).createIndex("opId", "opId", { unique: true });
    },
    // Otra pestaña va a borrar la base (cierre de sesión): se suelta para no bloquearla.
    blocking() {
      db.close();
    },
  });
  return new Store(db);
}

export const deleteStore = (userId: string) => deleteDB(localDbName(userId));

export class Store {
  constructor(private db: IDBPDatabase<Schema>) {}

  close() {
    this.db.close();
  }

  getMeta<T>(key: string) {
    return this.db.get("meta", key) as Promise<T | undefined>;
  }

  setMeta(key: string, value: unknown) {
    return this.db.put("meta", value, key);
  }

  metaKeys() {
    return this.db.getAllKeys("meta");
  }

  deleteMeta(key: string) {
    return this.db.delete("meta", key);
  }

  rows() {
    return this.db.getAll("rows");
  }

  ops() {
    return this.db.getAll("outbox");
  }

  // Guarda la operación y devuelve su lugar en la cola. Si no hay espacio, falla: nunca se responde «guardado» sin haberlo guardado.
  async addOp(op: Omit<Op, "seq">) {
    const seq = await this.db.add("outbox", op as Op);
    return { ...op, seq } as Op;
  }

  putOp(op: Op) {
    return this.db.put("outbox", op);
  }

  deleteOp(seq: number) {
    return this.db.delete("outbox", seq);
  }

  // Todo en una transacción: nunca queda una entrega a medias, ni una operación borrada sin sus datos.
  async commit(puts: Row[], dels: [string, string][], cursor: string | null, removeSeqs: number[], replaceAll = false) {
    const tx = this.db.transaction(["rows", "meta", "outbox"], "readwrite");
    const rows = tx.objectStore("rows");
    if (replaceAll) await rows.clear();
    await Promise.all([...puts.map((r) => rows.put(r)), ...dels.map((k) => rows.delete(k))]);
    if (cursor) {
      await tx.objectStore("meta").put(cursor, "cursor");
      await tx.objectStore("meta").put(Date.now(), "cursorAt");
    }
    await Promise.all(removeSeqs.map((s) => tx.objectStore("outbox").delete(s)));
    await tx.done;
  }
}
