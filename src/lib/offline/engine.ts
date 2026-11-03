// Motor de sincronización del panel: la copia base, la cola y la proyección (base + pendientes). Toda escritura se guarda primero;
// con conexión se envía de inmediato y el módulo recibe la respuesta real; sin conexión recibe la local y se envía después.
// Una operación solo cuenta como hecha con la respuesta del servidor. Lo que el servidor no acepta queda «por revisar», nunca se pierde.
import { todayISO } from "@/lib/format";
import { CURSOR_MAX_DAYS, uuid } from "@/lib/offline/config";
import { applyDelta, dataOf, deltaRows, rowsOf, unitsOf, type Delta } from "@/lib/offline/data";
import { CONFLICT_TEXT, OPS, OP_SCHEMA, isLocalError, type Op, type OpConflict, type OpDef, type OpRequest } from "@/lib/offline/ops";
import type { Store } from "@/lib/offline/store";
import { can } from "@/lib/permissions";
import type { AdminData, ApiResult, PanelUser } from "@/lib/types";

export type Transport = {
  send: (req: OpRequest, headers: Record<string, string>) => Promise<ApiResult<unknown>>;
  get: (path: string, query?: Record<string, string>, timeoutMs?: number) => Promise<ApiResult<unknown>>;
};

export type SyncStatus = {
  network: "online" | "offline";
  syncing: boolean;
  pending: number; // guardado solo en este dispositivo
  conflicts: number; // por revisar
  waiting: number; // con error pasajero, esperando el reintento
  authLost: boolean; // la sesión venció: hay que ingresar para sincronizar
  lastSyncAt: number | null;
  sent: number; // confirmadas en la tanda actual
  total: number; // tamaño de la tanda actual
};

export type MarkState = "pending" | "conflict";

type Delivery =
  | { kind: "done"; status: number; body: unknown }
  | { kind: "rejected"; status: number; body: unknown }
  | { kind: "conflict" }
  | { kind: "retry"; status: number }
  | { kind: "network" }
  | { kind: "auth" };

const MAX_BACKOFF = 5 * 60_000;
const OFFLINE_PROBE_MS = 20_000;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const backoff = (attempts: number) => Math.min(MAX_BACKOFF, 1000 * 2 ** Math.min(attempts, 10)) * (0.75 + Math.random() * 0.5);

export class SyncEngine {
  private base: AdminData;
  private ops: Op[];
  private listeners = new Set<() => void>();
  private chain: Promise<unknown> = Promise.resolve();
  private channel: BroadcastChannel | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private probeTimer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;
  data: AdminData;
  status: SyncStatus;
  me: PanelUser;
  onAuthLost: () => void = () => {};
  // Una escritura acaba de quedar guardada solo en este dispositivo (para que el aviso del módulo lo diga).
  lastQueuedAt = 0;

  private constructor(
    private store: Store,
    private transport: Transport,
    me: PanelUser,
    base: AdminData,
    ops: Op[],
    private cursor: string | null,
    private cursorAt: number | null,
    online: boolean,
  ) {
    this.me = me;
    this.base = { ...base, me };
    this.ops = ops;
    this.data = this.project();
    this.status = {
      network: online ? "online" : "offline",
      syncing: false,
      pending: 0,
      conflicts: 0,
      waiting: 0,
      authLost: false,
      lastSyncAt: null,
      sent: 0,
      total: 0,
    };
    this.refreshCounts();
  }

  // Abre el motor con lo guardado (o con `initial`, los datos recién descargados del servidor). null si no hay nada con qué abrir.
  static async open(opts: { store: Store; transport: Transport; me: PanelUser; initial?: AdminData | null; online: boolean }) {
    const { store, transport, me, initial, online } = opts;
    let cursor = (await store.getMeta<string>("cursor")) ?? null;
    let cursorAt = (await store.getMeta<number>("cursorAt")) ?? null;
    const ops = await store.ops();
    let base: AdminData | null;
    if (initial) {
      cursor = initial.cursor ?? null;
      cursorAt = Date.now();
      await store.commit(
        rowsOf(initial),
        [],
        cursor,
        ops.filter((o) => o.state === "confirmed").map((o) => o.seq),
        true,
      );
      base = initial;
    } else base = dataOf(await store.rows(), me);
    await store.setMeta("me", me);
    if (!base) return null;
    return new SyncEngine(
      store,
      transport,
      me,
      base,
      ops.filter((o) => !(initial && o.state === "confirmed")),
      cursor,
      cursorAt,
      online,
    );
  }

  /* ───────────── Ciclo de vida ───────────── */

  setOnAuthLost(fn: () => void) {
    this.onAuthLost = fn;
  }

  // Empieza a escuchar la conexión y otras pestañas.
  attach() {
    if (typeof window === "undefined") return;
    addEventListener("online", this.onOnline);
    addEventListener("offline", this.onOffline);
    document.addEventListener("visibilitychange", this.onVisible);
    this.probeTimer = setInterval(() => {
      if (this.status.network === "offline" && !this.stopped) void this.probe();
    }, OFFLINE_PROBE_MS);
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(`vf-sync-${this.me.id}`);
      this.channel.onmessage = () => void this.reloadFromDisk();
    }
  }

  detach() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.probeTimer);
    if (typeof window !== "undefined") {
      removeEventListener("online", this.onOnline);
      removeEventListener("offline", this.onOffline);
      document.removeEventListener("visibilitychange", this.onVisible);
    }
    this.channel?.close();
    this.listeners.clear();
  }

  private onOnline = () => void this.probe();
  private onOffline = () => this.setNetwork("offline");
  private onVisible = () => {
    if (!document.hidden) void this.probe();
  };

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  private setNetwork(network: "online" | "offline") {
    if (this.status.network === network) return;
    this.status = { ...this.status, network };
    this.notify();
  }

  // ¿Hay conexión de verdad con el servidor? navigator.onLine da falsos positivos (wifi sin internet).
  async probe() {
    if (this.stopped) return;
    try {
      const r = await this.transport.get("/admin/sync/ping", undefined, 6000);
      if (r.status === 401 || r.status === 403) return this.loseAuth();
      if (r.status !== 200) return this.setNetwork("offline");
      this.setNetwork("online");
      const me = (r.data as { me?: PanelUser } | null)?.me;
      if (me && me.id === this.me.id && !same(me, this.base.me)) {
        this.me = me;
        this.base = { ...this.base, me };
        await this.store.setMeta("me", me);
        this.recompute();
      }
      await this.sync();
    } catch {
      this.setNetwork("offline");
    }
  }

  private loseAuth() {
    if (this.status.authLost) return;
    this.status = { ...this.status, authLost: true, syncing: false };
    this.notify();
    this.onAuthLost();
  }

  /* ───────────── Serie: una sola tarea de sincronización a la vez, también entre pestañas ───────────── */

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    const run = () => (locks ? (locks.request(`vf-sync-${this.me.id}`, task) as Promise<T>) : task());
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }

  private broadcast() {
    this.channel?.postMessage("changed");
  }

  // Otra pestaña cambió la cola o la copia base.
  private async reloadFromDisk() {
    if (this.stopped) return;
    const [rows, ops] = await Promise.all([this.store.rows(), this.store.ops()]);
    const base = dataOf(rows, this.me);
    if (base) this.base = base;
    this.ops = ops;
    this.cursor = (await this.store.getMeta<string>("cursor")) ?? this.cursor;
    this.recompute();
  }

  /* ───────────── Proyección ───────────── */

  private project(): AdminData {
    let d = this.base;
    for (const op of this.ops) {
      const def = OPS[op.type];
      if (!def) continue;
      try {
        d = def.apply(d, op.payload, op);
      } catch (e) {
        // Una operación que no se puede mostrar no tumba el panel: sigue en la cola y se envía igual.
        console.error("[offline] no se pudo aplicar", op.type, e);
      }
    }
    return { ...d, unidades: unitsOf(d.cabinTypes) };
  }

  private refreshCounts() {
    const unsent = this.ops.filter((o) => o.state === "pending");
    this.status = {
      ...this.status,
      pending: unsent.length,
      conflicts: this.ops.filter((o) => o.state === "conflict").length,
      waiting: unsent.filter((o) => o.attempts > 0).length,
    };
  }

  private recompute() {
    this.data = this.project();
    this.refreshCounts();
    this.notify();
  }

  // Estado de un registro: guardado solo aquí o por revisar. Sin marca: sincronizado.
  markOf(entity: string): MarkState | null {
    let mark: MarkState | null = null;
    for (const op of this.ops) {
      if (op.entities[0] !== entity && !(op.type === "block.create" && op.entities.includes(entity))) continue;
      if (op.state === "conflict") return "conflict";
      if (op.state === "pending") mark = "pending";
    }
    return mark;
  }

  list() {
    return this.ops.filter((o) => o.state !== "confirmed");
  }

  hasUnsent() {
    return this.ops.some((o) => o.state !== "confirmed");
  }

  /* ───────────── Escribir ───────────── */

  async mutate<T>(type: string, input: unknown): Promise<ApiResult<T>> {
    const def = OPS[type] as OpDef<unknown> | undefined;
    if (!def) throw new Error(`Operación desconocida: ${type}`);
    const ctx = { me: this.data.me, now: Date.now(), today: todayISO() };
    if (def.perm && !can(ctx.me.role, def.perm)) return { status: 403, data: { error: "FORBIDDEN" } as T };
    const prepared = def.prepare ? def.prepare(input, this.data, ctx) : input;
    if (isLocalError(prepared)) return prepared as ApiResult<T>;
    const invalid = def.validate?.(prepared, this.data, ctx);
    if (invalid) return invalid as ApiResult<T>;

    const op = await this.enqueue(type, def, prepared);
    this.recompute();
    this.broadcast();
    if (!op) return this.synthetic<T>(def, prepared, { opId: "", occurredAt: new Date(ctx.now).toISOString() }); // se compactó con otra

    // Con conexión y nada por delante, el módulo recibe la respuesta real (y sus errores en sus campos).
    const clear = this.status.network === "online" && !this.status.authLost && !this.ops.some((o) => o.seq !== op.seq && o.state !== "confirmed");
    if (clear) return this.serial(() => this.sendNow<T>(op, def));
    void this.sync();
    return this.synthetic<T>(def, prepared, op);
  }

  private synthetic<T>(def: OpDef<unknown>, payload: unknown, op: Pick<Op, "opId" | "occurredAt">): ApiResult<T> {
    this.lastQueuedAt = Date.now();
    return { status: def.okStatus ?? 200, data: def.result(this.data, payload, op) as T, queued: true };
  }

  // Guarda la operación, o la funde con la anterior del mismo registro si aún no se ha enviado.
  private async enqueue(type: string, def: OpDef<unknown>, payload: unknown): Promise<Op | null> {
    const entities = def.entities(payload);
    const fam = def.family;
    if (fam) {
      const prev = [...this.ops].reverse().find((o) => o.entities[0] === entities[0] && o.state !== "confirmed");
      const prevDef = prev && OPS[prev.type];
      const compatible =
        prev &&
        prev.state === "pending" &&
        prev.attempts === 0 &&
        prevDef?.family?.name === fam.name &&
        prev.entities.filter((e) => e.startsWith(entities[0].split(":")[0] + ":")).length === 1;
      if (prev && compatible && prevDef?.family) {
        if (prevDef.family.role === "create" && fam.role === "delete") {
          await this.store.deleteOp(prev.seq);
          this.ops = this.ops.filter((o) => o.seq !== prev.seq);
          return null;
        }
        if (fam.role !== "delete" && prevDef.family.role !== "delete") {
          const merged = prevDef.family.merge ? prevDef.family.merge(prev.payload, payload as never) : { ...(prev.payload as object), ...(payload as object) };
          const next: Op = {
            ...prev,
            payload: merged as never,
            entities: (OPS[prev.type] as OpDef<unknown>).entities(merged),
            label: (OPS[prev.type] as OpDef<unknown>).label(merged, this.data),
          };
          await this.store.putOp(next);
          this.ops = this.ops.map((o) => (o.seq === next.seq ? next : o));
          return null;
        }
        if (prevDef.family.role === "update" && fam.role === "delete") {
          const next: Op = { ...prev, type, payload: payload as never, entities, label: def.label(payload, this.data), baseFields: null };
          await this.store.putOp(next);
          this.ops = this.ops.map((o) => (o.seq === next.seq ? next : o));
          return null;
        }
      }
    }
    const draft: Omit<Op, "seq"> = {
      opId: uuid(),
      type,
      payload: payload as never,
      entities,
      label: def.label(payload, this.data),
      occurredAt: new Date().toISOString(),
      userId: this.me.id,
      schema: OP_SCHEMA,
      state: "pending",
      attempts: 0,
      nextAt: 0,
      // La versión la dice el servidor (copia base); los campos, lo que el usuario veía (con sus cambios anteriores).
      baseVersion: def.version?.(this.base, payload) ?? null,
      baseFields: def.view?.(this.data, payload) ?? null,
      ...(def.version && this.ops.some((o) => o.entities[0] === entities[0] && o.state !== "conflict") && { rebase: true }),
    };
    const op = await this.store.addOp(draft);
    this.ops = [...this.ops, op];
    return op;
  }

  private async sendNow<T>(op: Op, def: OpDef<unknown>): Promise<ApiResult<T>> {
    const current = this.ops.find((o) => o.seq === op.seq);
    if (!current) return this.synthetic<T>(def, op.payload, op);
    this.setSyncing(true);
    const r = await this.deliver(current, { interactive: true });
    this.setSyncing(false);
    if (r.kind === "done") {
      this.afterConfirm();
      return { status: r.status, data: r.body as T };
    }
    if (r.kind === "rejected") {
      // El usuario sigue en el formulario: lo ve en sus campos, como siempre. No queda nada en la cola.
      await this.store.deleteOp(current.seq);
      this.ops = this.ops.filter((o) => o.seq !== current.seq);
      this.recompute();
      this.broadcast();
      return { status: r.status, data: r.body as T };
    }
    return this.synthetic<T>(def, current.payload, current);
  }

  private afterConfirm() {
    setTimeout(() => void this.sync(), 0);
  }

  private setSyncing(syncing: boolean) {
    if (this.status.syncing === syncing) return;
    this.status = { ...this.status, syncing };
    this.notify();
  }

  /* ───────────── Enviar ───────────── */

  private async putOp(op: Op) {
    await this.store.putOp(op);
    this.ops = this.ops.map((o) => (o.seq === op.seq ? op : o));
    this.refreshCounts();
    this.broadcast();
  }

  private async post(op: Op) {
    const def = OPS[op.type] as OpDef<unknown>;
    const headers: Record<string, string> = { "Idempotency-Key": op.opId, "X-Occurred-At": op.occurredAt };
    if (op.baseVersion !== null) headers["X-Base-Version"] = String(op.baseVersion);
    return this.transport.send(def.request(op.payload), headers);
  }

  // Envía una operación y deja su estado guardado. `interactive`: un rechazo lo decide el formulario, no pasa a «por revisar».
  private async deliver(op: Op, { interactive = false } = {}): Promise<Delivery> {
    const def = OPS[op.type] as OpDef<unknown> | undefined;
    if (!def) {
      await this.toConflict(op, { code: "UNKNOWN_OP", status: 0 });
      return { kind: "conflict" };
    }
    let current = op;
    for (let attempt = 0; attempt < 3; attempt++) {
      let res: ApiResult<unknown>;
      try {
        res = await this.post(current);
      } catch {
        this.setNetwork("offline");
        return { kind: "network" };
      }
      this.setNetwork("online");
      const { status, data: body } = res;
      const code = (body as { error?: string } | null)?.error ?? "";

      if ((status >= 200 && status < 300) || def.done?.(status, body, current.payload) || (status === 404 && def.family?.role === "delete")) {
        const partial = interactive ? null : def.partial?.(body);
        if (partial) {
          await this.toConflict(current, { code: partial.code, status, detail: partial.detail });
          return { kind: "conflict" };
        }
        await this.confirm(current, body);
        return { kind: "done", status, body };
      }
      if (status === 401) {
        this.loseAuth();
        return { kind: "auth" };
      }
      if (status >= 500 || status === 408 || status === 425 || status === 429) {
        const attempts = current.attempts + 1;
        await this.putOp({ ...current, attempts, nextAt: Date.now() + backoff(attempts) });
        return { kind: "retry", status };
      }
      if (status === 409 && code === "VERSION_CONFLICT") {
        // Alguien más cambió la fila: se trae su versión y se intenta fundir, campo por campo.
        await this.pull();
        const merged = await this.merge(current, def);
        if (merged) {
          current = merged;
          continue;
        }
        const fresh = this.ops.find((o) => o.seq === current.seq) ?? current;
        if (interactive) return { kind: "rejected", status, body };
        if (fresh.state !== "conflict") await this.toConflict(fresh, { code, status, ...this.diff(fresh, def) });
        return { kind: "conflict" };
      }
      if (interactive) return { kind: "rejected", status, body };
      await this.toConflict(current, { code: code || "REJECTED", status, detail: body, gone: status === 404 });
      return { kind: "conflict" };
    }
    await this.toConflict(current, { code: "VERSION_CONFLICT", status: 409 });
    return { kind: "conflict" };
  }

  private diff(op: Op, def: OpDef<unknown>) {
    const theirs = def.view?.(this.base, op.payload);
    if (!theirs) return { gone: !!def.view };
    const mine = op.payload as Record<string, unknown>;
    return { fields: this.changedKeys(op, theirs).map((field) => ({ field, mine: mine[field], theirs: theirs[field] })) };
  }

  private changedKeys(op: Op, view: Record<string, unknown>) {
    const mine = op.payload as Record<string, unknown>;
    const before = op.baseFields ?? {};
    return Object.keys(view).filter((k) => k in mine && !same(mine[k], before[k]));
  }

  // Funde a tres bandas: si otra persona cambió campos distintos, se conservan los dos cambios. Mismo campo con otro valor: conflicto.
  private async merge(op: Op, def: OpDef<unknown>): Promise<Op | null> {
    const theirs = def.view?.(this.base, op.payload);
    if (!theirs || !op.baseFields) return null;
    const mine = op.payload as Record<string, unknown>;
    const changed = this.changedKeys(op, theirs);
    if (changed.some((k) => !same(theirs[k], op.baseFields![k]) && !same(theirs[k], mine[k]))) return null;
    const payload = { ...mine };
    for (const k of Object.keys(theirs)) if (!changed.includes(k) && k in mine) payload[k] = theirs[k];
    const next: Op = { ...op, payload: payload as never, baseFields: theirs, baseVersion: def.version?.(this.base, op.payload) ?? null, rebase: false };
    await this.putOp(next);
    this.recompute();
    return next;
  }

  private async confirm(op: Op, body: unknown) {
    await this.putOp({ ...op, state: "confirmed", conflict: undefined, result: op.type === "import.run" ? body : undefined });
    // Las siguientes del mismo registro parten de la versión que dejó esta.
    for (const later of this.ops.filter((o) => o.seq > op.seq && o.entities[0] === op.entities[0] && o.state === "pending" && OPS[o.type]?.version))
      await this.putOp({ ...later, rebase: true });
    this.status = { ...this.status, sent: this.status.sent + 1 };
    this.refreshCounts();
    this.notify();
  }

  private async toConflict(op: Op, conflict: OpConflict) {
    await this.putOp({ ...op, state: "conflict", conflict });
    this.recompute();
  }

  private rebaseOp(op: Op, def: OpDef<unknown>) {
    return { ...op, rebase: false, baseVersion: def.version?.(this.base, op.payload) ?? null, baseFields: def.view?.(this.base, op.payload) ?? op.baseFields };
  }

  /* ───────────── Sincronizar ───────────── */

  // Envía lo pendiente, en orden, y trae los cambios del servidor. Nunca bloquea: los módulos siguen trabajando con lo local.
  sync(): Promise<void> {
    if (this.stopped || this.status.network === "offline" || this.status.authLost) return Promise.resolve();
    return this.serial(async () => {
      if (this.stopped) return;
      const queue = this.ops.filter((o) => o.state === "pending");
      this.status = { ...this.status, syncing: true, sent: 0, total: queue.length };
      this.notify();
      try {
        await this.push();
        if (!this.status.authLost && this.status.network === "online") await this.pull();
        this.status = { ...this.status, lastSyncAt: Date.now() };
      } catch (e) {
        console.error("[offline] sincronización", e);
      } finally {
        this.status = { ...this.status, syncing: false };
        this.recompute();
        this.scheduleRetry();
      }
    });
  }

  private async push() {
    // Lo que falla detiene solo a lo que depende de ello; lo demás sigue.
    const blocked = new Set<string>();
    // Se detiene lo que toca el mismo registro, no todo lo que comparte una dependencia (dos reservas de la misma cabaña son independientes).
    const blockAll = (o: Op) => o.entities.filter((e) => e.split(":")[0] === o.entities[0].split(":")[0]).forEach((e) => blocked.add(e));
    for (const seq of this.ops.map((o) => o.seq)) {
      let op = this.ops.find((o) => o.seq === seq);
      if (!op || op.state === "confirmed") continue;
      if (op.state === "conflict") {
        blockAll(op);
        continue;
      }
      if (op.entities.some((e) => blocked.has(e)) || op.nextAt > Date.now()) {
        blockAll(op);
        continue;
      }
      const def = OPS[op.type] as OpDef<unknown> | undefined;
      if (op.rebase && def) {
        await this.pull();
        op = this.rebaseOp(this.ops.find((o) => o.seq === seq) ?? op, def);
        await this.putOp(op);
      }
      const r = await this.deliver(op);
      if (r.kind === "network" || r.kind === "auth") return;
      if (r.kind !== "done") blockAll(op);
    }
  }

  private scheduleRetry() {
    clearTimeout(this.retryTimer);
    if (this.stopped) return;
    const next = Math.min(...this.ops.filter((o) => o.state === "pending" && o.nextAt > 0).map((o) => o.nextAt));
    if (Number.isFinite(next)) this.retryTimer = setTimeout(() => void this.sync(), Math.max(200, next - Date.now()));
  }

  // Trae solo lo que cambió. Las operaciones ya confirmadas se quitan en la misma transacción que sus datos.
  private async pull() {
    const stale = !this.cursor || !this.cursorAt || Date.now() - this.cursorAt > CURSOR_MAX_DAYS * 864e5;
    if (stale) return this.bootstrap();
    const confirmed = this.ops.filter((o) => o.state === "confirmed").map((o) => o.seq);
    let cursor = this.cursor!;
    let base = this.base;
    for (let page = 0; page < 50; page++) {
      let res: ApiResult<unknown>;
      try {
        res = await this.transport.get("/admin/sync/pull", { cursor });
      } catch {
        this.setNetwork("offline");
        return;
      }
      if (res.status === 401) return this.loseAuth();
      if (res.status === 400) return this.bootstrap();
      if (res.status !== 200 || !res.data) return;
      const delta = res.data as Delta & { cursor: string; hasMore: boolean };
      const { puts, dels } = deltaRows(delta);
      await this.store.commit(puts, dels, delta.cursor, page === 0 ? confirmed : []);
      base = applyDelta(base, delta);
      cursor = delta.cursor;
      if (page === 0) this.ops = this.ops.filter((o) => !confirmed.includes(o.seq));
      if (!delta.hasMore) break;
    }
    this.cursor = cursor;
    this.cursorAt = Date.now();
    this.base = base;
    this.recompute();
    this.broadcast();
  }

  // Descarga completa: la primera vez o con un cursor muy viejo.
  private async bootstrap() {
    let res: ApiResult<unknown>;
    try {
      res = await this.transport.get("/admin/data");
    } catch {
      this.setNetwork("offline");
      return;
    }
    if (res.status === 401) return this.loseAuth();
    if (res.status !== 200 || !res.data) return;
    const fresh = res.data as AdminData;
    const confirmed = this.ops.filter((o) => o.state === "confirmed").map((o) => o.seq);
    await this.store.commit(rowsOf(fresh), [], fresh.cursor ?? null, confirmed, true);
    this.ops = this.ops.filter((o) => !confirmed.includes(o.seq));
    this.cursor = fresh.cursor ?? null;
    this.cursorAt = Date.now();
    this.base = { ...fresh, me: this.me };
    this.recompute();
    this.broadcast();
  }

  /* ───────────── Resolver lo que quedó por revisar ───────────── */

  async resolve(opId: string, action: "discard" | "retry" | "mine" | "recreate", patch?: object) {
    await this.serial(async () => {
      const op = this.ops.find((o) => o.opId === opId);
      if (!op) return;
      const def = OPS[op.type] as OpDef<unknown>;
      if (action === "discard") {
        await this.store.deleteOp(op.seq);
        this.ops = this.ops.filter((o) => o.seq !== op.seq);
        this.broadcast();
      } else if (action === "retry") {
        await this.putOp({ ...op, state: "pending", conflict: undefined, attempts: 0, nextAt: 0, payload: { ...(op.payload as object), ...patch } as never });
      } else if (action === "mine") {
        await this.pull();
        const payload = (op.conflict && def.force?.(op.payload, op.conflict)) ?? op.payload;
        const next: Op = {
          ...op,
          state: "pending",
          conflict: undefined,
          attempts: 0,
          nextAt: 0,
          payload: payload as never,
          baseVersion: def.version?.(this.base, payload) ?? null,
          baseFields: def.view?.(this.base, payload) ?? null,
        };
        await this.putOp(next);
      } else if (action === "recreate" && def.recreate) {
        const payload = def.recreate.payload(op.payload, this.data);
        const target = OPS[def.recreate.type] as OpDef<unknown>;
        await this.putOp({
          ...op,
          type: def.recreate.type,
          payload: payload as never,
          entities: target.entities(payload),
          state: "pending",
          conflict: undefined,
          attempts: 0,
          nextAt: 0,
          baseVersion: null,
          baseFields: null,
        });
      }
      this.recompute();
    });
    void this.sync();
  }

  conflictText(op: Op) {
    return (op.conflict && CONFLICT_TEXT[op.conflict.code]) ?? "El servidor no aceptó este cambio.";
  }
}
