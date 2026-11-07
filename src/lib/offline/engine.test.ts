import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";
import { SyncEngine, type Transport } from "@/lib/offline/engine";
import type { OpRequest } from "@/lib/offline/ops";
import { deleteStore, openStore } from "@/lib/offline/store";
import type { AdminData, ApiResult, Block, PanelUser, Reservation } from "@/lib/types";

const me: PanelUser = { id: "user-a", email: "a@x.co", name: "A", role: "admin", photo: null };
const quote = { base: 1000, extraGuests: 0, extraAmount: 0, total: 1000, deposit: 300, balance: 700, pricePerNight: 500, extraPerNight: 0, nights: 2 };

const reservation = (over: Partial<Reservation> = {}): Reservation =>
  ({
    code: "VF-AAAAA",
    version: 1,
    status: "confirmed",
    cabinTypeId: "c1",
    unit: 1,
    checkIn: "2099-02-01",
    checkOut: "2099-02-03",
    adults: 2,
    children: 0,
    pet: { hasPet: false, smallBreedConfirmed: false },
    decoration: { requested: false, occasion: "", notes: "" },
    estimatedArrival: "15:00",
    guest: { fullName: "Ana Prueba", docType: "CC", docNumber: "12345", email: "ana@x.co", phone: "+573001112222", city: "Ibagué" },
    specialRequests: "",
    consents: { policies: false, dataProcessing: false, marketing: false },
    quote,
    depositDueAt: "2099-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    notes: [],
    depositPaidAt: null,
    balancePaidAt: null,
    paid: 0,
    checkedInAt: null,
    clientKey: "CC:12345",
    ...over,
  }) as Reservation;

const block = (over: Partial<Block> = {}): Block => ({
  id: "b1",
  version: 1,
  cabinTypeId: "c1",
  unit: 1,
  from: "2099-05-01",
  to: "2099-05-02",
  reason: "Mantenimiento",
  notes: "",
  ...over,
});

const initial = (): AdminData =>
  ({
    cursor: "1:0",
    reservations: [reservation()],
    blocks: [block()],
    cabinTypes: [
      {
        id: "c1",
        version: 1,
        nombre: "Cabaña",
        precioPareja: 500,
        personaAdicional: 100,
        maxPersonas: 4,
        units: 2,
        badge: "",
        descripcion: "",
        caracteristicas: [],
        fotos: [],
        activa: true,
        sort: 1,
      },
    ],
    seasons: [],
    unidades: { c1: 2 },
    site: {
      version: 1,
      settings: { checkInStart: "15:00", checkInEnd: "18:00", checkOutTime: "11:00", depositPct: 30, phones: [], whatsapp: "", rnt: "" },
      policies: [],
      photos: {},
      texts: { payment: { instructions: "" } },
      services: [],
      theme: {},
    },
    proofs: [],
    payments: [],
    emails: [],
    clients: {},
    notifications: [],
    me,
    bathrooms: [],
    bathroomBlocks: [],
  }) as unknown as AdminData;

// Servidor de mentiras: cada prueba decide qué responder; registra lo recibido.
type Call = { req: OpRequest; headers: Record<string, string> };
function fakeServer() {
  const calls: Call[] = [];
  const state = {
    offline: false,
    respond: (() => ({ status: 200, data: [] })) as (c: Call, n: number) => ApiResult<unknown>,
    pullRows: { upserts: {}, deletes: {} } as { upserts: Record<string, unknown>; deletes: Record<string, string[]> },
  };
  const transport: Transport = {
    send: async (req, headers) => {
      if (state.offline) throw { type: "network" };
      const c = { req, headers };
      calls.push(c);
      return state.respond(c, calls.length);
    },
    get: async (path) => {
      if (state.offline) throw { type: "network" };
      if (path.endsWith("/ping")) return { status: 200, data: { me } };
      const data = { cursor: "2:0", hasMore: false, ...state.pullRows };
      state.pullRows = { upserts: {}, deletes: {} };
      return { status: 200, data };
    },
  };
  return { calls, state, transport };
}

async function start(server: ReturnType<typeof fakeServer>, online = true) {
  const store = await openStore(me.id);
  const engine = await SyncEngine.open({ store, transport: server.transport, me, initial: initial(), online });
  return { engine: engine!, store };
}

const key = (c: Call) => c.headers["Idempotency-Key"];

beforeEach(async () => {
  await deleteStore(me.id);
});

describe("escribir sin conexión", () => {
  it("guarda en la cola, proyecta y responde con la forma del servidor", async () => {
    const srv = fakeServer();
    srv.state.offline = true;
    const { engine, store } = await start(srv, false);
    const r = await engine.mutate<Block[]>("block.create", {
      cabinTypeId: "c1",
      unit: 2,
      from: "2099-06-01",
      to: "2099-06-02",
      reason: "Mantenimiento",
      notes: "",
    });
    expect(r.status).toBe(200);
    expect(r.queued).toBe(true);
    expect(r.data?.length).toBe(2);
    expect(engine.data.blocks).toHaveLength(2);
    expect(engine.status.pending).toBe(1);
    expect(await store.ops()).toHaveLength(1);
    expect(srv.calls).toHaveLength(0);
  });

  it("persiste: otro arranque ve la misma cola y la misma proyección", async () => {
    const srv = fakeServer();
    const first = await start(srv, false);
    await first.engine.mutate("block.delete", { id: "b1" });
    first.store.close();
    const store = await openStore(me.id);
    const second = (await SyncEngine.open({ store, transport: srv.transport, me, online: false }))!;
    expect(second.data.blocks).toHaveLength(0);
    expect(second.status.pending).toBe(1);
  });

  it("valida en local con los mismos errores del servidor", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    const overlap = await engine.mutate("block.create", {
      cabinTypeId: "c1",
      unit: 1,
      from: "2099-05-02",
      to: "2099-05-03",
      reason: "Mantenimiento",
      notes: "",
    });
    expect(overlap.status).toBe(409);
    expect((overlap.data as { error: string }).error).toBe("BLOCK_OVERLAP");
    const withReservation = await engine.mutate("block.create", {
      cabinTypeId: "c1",
      unit: 1,
      from: "2099-02-01",
      to: "2099-02-01",
      reason: "Mantenimiento",
      notes: "",
    });
    expect((withReservation.data as { error: string; conflicts: string[] }).conflicts).toEqual(["VF-AAAAA"]);
    expect(engine.status.pending).toBe(0);
  });

  it("niega lo que el rol no permite, sin encolarlo", async () => {
    const srv = fakeServer();
    const store = await openStore(me.id);
    const engine = (await SyncEngine.open({ store, transport: srv.transport, me: { ...me, role: "recepcion" }, initial: initial(), online: false }))!;
    expect((await engine.mutate("block.delete", { id: "b1" })).status).toBe(403);
    expect((await engine.mutate("reservation.action", { code: "VF-AAAAA", action: "cancel" })).status).toBe(403);
    expect(engine.status.pending).toBe(0);
  });
});

describe("compactar", () => {
  it("crear y borrar sin enviar no deja nada", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    await engine.mutate("block.create", { cabinTypeId: "c1", unit: 2, from: "2099-06-01", to: "2099-06-02", reason: "Mantenimiento", notes: "" });
    const id = engine.data.blocks.find((b) => b.id !== "b1")!.id;
    await engine.mutate("block.delete", { id });
    expect(engine.status.pending).toBe(0);
    expect(engine.data.blocks).toHaveLength(1);
  });

  it("varias ediciones del mismo registro se envían como una", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    const edit = (notes: string) =>
      engine.mutate("block.update", { id: "b1", cabinTypeId: "c1", unit: 1, from: "2099-05-01", to: "2099-05-02", reason: "Mantenimiento", notes });
    await edit("uno");
    await edit("dos");
    await edit("tres");
    expect(engine.status.pending).toBe(1);
    expect(engine.data.blocks[0].notes).toBe("tres");
    await engine.probe();
    expect(srv.calls).toHaveLength(1);
    expect((srv.calls[0].req.body as Block).notes).toBe("tres");
    expect(srv.calls[0].headers["X-Base-Version"]).toBe("1");
  });

  it("los pagos nunca se compactan", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    await engine.mutate("reservation.action", { code: "VF-AAAAA", action: "balance", amount: 100 });
    await engine.mutate("reservation.action", { code: "VF-AAAAA", action: "balance", amount: 200 });
    expect(engine.status.pending).toBe(2);
    expect(engine.data.reservations[0].paid).toBe(300);
    expect(engine.data.payments).toHaveLength(2);
  });
});

describe("sincronizar", () => {
  it("con conexión responde lo del servidor y el rechazo llega al formulario sin quedar en la cola", async () => {
    const srv = fakeServer();
    srv.state.respond = () => ({ status: 409, data: { error: "RESERVATION_CONFLICT", conflicts: ["VF-Z"] } });
    const { engine } = await start(srv);
    const r = await engine.mutate("block.update", {
      id: "b1",
      cabinTypeId: "c1",
      unit: 2,
      from: "2099-05-01",
      to: "2099-05-02",
      reason: "Mantenimiento",
      notes: "",
    });
    expect(r.status).toBe(409);
    expect(r.queued).toBeUndefined();
    expect(engine.list()).toHaveLength(0);
    expect(engine.data.blocks[0].unit).toBe(1);
  });

  it("envía en orden, con la misma clave en cada intento", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    await engine.mutate("reservation.action", { code: "VF-AAAAA", action: "note", text: "primera" });
    await engine.mutate("reservation.action", { code: "VF-AAAAA", action: "note", text: "segunda" });
    srv.state.respond = (_c, n) => (n === 1 ? { status: 500, data: null } : { status: 200, data: {} });
    await engine.probe();
    expect(srv.calls).toHaveLength(1);
    expect(engine.status.pending).toBe(2);
    expect(engine.status.waiting).toBe(1);
    const firstKey = key(srv.calls[0]);
    // Se adelanta la espera del reintento.
    await new Promise((r) => setTimeout(r, 2600));
    await engine.sync();
    expect(key(srv.calls[1])).toBe(firstKey);
    expect((srv.calls[2].req.body as { text: string }).text).toBe("segunda");
    expect(engine.status.pending).toBe(0);
  });

  it("una falla de red a mitad de la cola no pierde nada y continúa después", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    await engine.mutate("reservation.action", { code: "VF-AAAAA", action: "note", text: "a" });
    await engine.mutate("block.delete", { id: "b1" });
    let n = 0;
    srv.state.respond = () => {
      if (++n === 2) {
        srv.state.offline = true;
        throw { type: "network" };
      }
      return { status: 200, data: {} };
    };
    await engine.probe();
    expect(engine.status.network).toBe("offline");
    expect(engine.status.pending).toBe(1);
    srv.state.offline = false;
    srv.state.respond = () => ({ status: 200, data: {} });
    await engine.probe();
    expect(engine.status.pending).toBe(0);
    expect(engine.status.network).toBe("online");
  });

  it("lo confirmado se queda en la vista hasta que llegan los datos del servidor y sin duplicar", async () => {
    const srv = fakeServer();
    const { engine, store } = await start(srv, false);
    await engine.mutate("block.create", { cabinTypeId: "c1", unit: 2, from: "2099-06-01", to: "2099-06-02", reason: "Mantenimiento", notes: "" });
    const id = engine.data.blocks.find((b) => b.id !== "b1")!.id;
    srv.state.pullRows = { upserts: { blocks: [{ key: id, row: block({ id, unit: 2, from: "2099-06-01", to: "2099-06-02" }) }] }, deletes: {} };
    await engine.probe();
    expect(engine.list()).toHaveLength(0);
    expect(engine.data.blocks.filter((b) => b.id === id)).toHaveLength(1);
    expect(await store.ops()).toHaveLength(0);
  });

  it("aplica tombstones del servidor sin tocar lo pendiente", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    await engine.mutate("reservation.action", { code: "VF-AAAAA", action: "note", text: "mía" });
    srv.state.pullRows = { upserts: {}, deletes: { blocks: ["b1"] } };
    await engine.probe();
    expect(engine.data.blocks).toHaveLength(0);
  });

  it("sesión vencida: pausa, avisa y no descarta", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    let lost = false;
    engine.onAuthLost = () => (lost = true);
    await engine.mutate("reservation.action", { code: "VF-AAAAA", action: "note", text: "a" });
    srv.state.respond = () => ({ status: 401, data: null });
    await engine.probe();
    expect(lost).toBe(true);
    expect(engine.status.pending).toBe(1);
    expect(engine.status.authLost).toBe(true);
  });
});

describe("conflictos", () => {
  const edit = (notes: string, reason = "Mantenimiento") => ({ id: "b1", cabinTypeId: "c1", unit: 1, from: "2099-05-01", to: "2099-05-02", reason, notes });
  const conflictOnce = (srv: ReturnType<typeof fakeServer>) => {
    srv.state.respond = (_c, n) => (n === 1 ? { status: 409, data: { error: "VERSION_CONFLICT" } } : { status: 200, data: [] });
  };

  it("campos distintos: funde los dos cambios", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    await engine.mutate("block.update", edit("mía"));
    conflictOnce(srv);
    srv.state.pullRows = { upserts: { blocks: [{ key: "b1", row: block({ version: 2, reason: "Uso propio" }) }] }, deletes: {} };
    await engine.probe();
    expect(srv.calls).toHaveLength(2);
    const sent = srv.calls[1];
    expect(sent.headers["X-Base-Version"]).toBe("2");
    expect((sent.req.body as Block).notes).toBe("mía");
    expect((sent.req.body as Block).reason).toBe("Uso propio");
    expect(engine.status.conflicts).toBe(0);
  });

  it("mismo campo: queda por revisar con los dos valores, sin sobrescribir", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    await engine.mutate("block.update", edit("mía"));
    conflictOnce(srv);
    srv.state.pullRows = { upserts: { blocks: [{ key: "b1", row: block({ version: 2, notes: "del otro" }) }] }, deletes: {} };
    await engine.probe();
    expect(srv.calls).toHaveLength(1);
    expect(engine.status.conflicts).toBe(1);
    const op = engine.list()[0];
    expect(op.conflict?.fields).toEqual([{ field: "notes", mine: "mía", theirs: "del otro" }]);
    // «Usar lo mío»: con la versión actual, explícitamente.
    srv.state.respond = () => ({ status: 200, data: [] });
    await engine.resolve(op.opId, "mine");
    await engine.sync();
    expect(srv.calls.at(-1)?.headers["X-Base-Version"]).toBe("2");
    expect((srv.calls.at(-1)?.req.body as Block).notes).toBe("mía");
    expect(engine.status.conflicts).toBe(0);
  });

  it("registro borrado en el servidor: no se pierde lo local y se puede recrear", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    await engine.mutate("block.update", edit("mía"));
    srv.state.respond = () => ({ status: 404, data: { error: "NOT_FOUND" } });
    srv.state.pullRows = { upserts: {}, deletes: { blocks: ["b1"] } };
    await engine.probe();
    const op = engine.list()[0];
    expect(op.state).toBe("conflict");
    expect(op.conflict?.gone).toBe(true);
    srv.state.respond = () => ({ status: 200, data: [] });
    await engine.resolve(op.opId, "recreate");
    await engine.sync();
    const last = srv.calls.at(-1)!;
    expect(last.req.method).toBe("POST");
    expect((last.req.body as { ids: string[]; notes: string }).ids).toEqual(["b1"]);
    expect((last.req.body as { notes: string }).notes).toBe("mía");
  });

  it("borrar lo que ya no existe cuenta como hecho", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    await engine.mutate("block.delete", { id: "b1" });
    srv.state.respond = () => ({ status: 404, data: { error: "NOT_FOUND" } });
    await engine.probe();
    expect(engine.list()).toHaveLength(0);
  });

  it("dos personas hacen la misma transición: cuenta como hecha", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    await engine.mutate("reservation.action", { code: "VF-AAAAA", action: "checkin" });
    srv.state.respond = () => ({ status: 422, data: { error: "INVALID_TRANSITION", status: "checked_in" } });
    await engine.probe();
    expect(engine.list()).toHaveLength(0);
  });

  it("pago con otro pago de por medio: nunca se descarta solo y no se envía dos veces", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    await engine.mutate("reservation.action", { code: "VF-AAAAA", action: "balance", amount: 300 });
    await engine.mutate("reservation.action", { code: "VF-AAAAA", action: "note", text: "depende" });
    expect((engine.list()[0].payload as { basePaid: number }).basePaid).toBe(0);
    srv.state.respond = () => ({ status: 409, data: { error: "PAID_CHANGED", paid: 300 } });
    await engine.probe();
    expect(srv.calls).toHaveLength(1);
    const op = engine.list()[0];
    expect(op.state).toBe("conflict");
    expect(op.conflict?.code).toBe("PAID_CHANGED");
    // Lo que depende de la reserva espera.
    expect(engine.list()[1].state).toBe("pending");
    srv.state.respond = () => ({ status: 200, data: {} });
    await engine.resolve(op.opId, "mine");
    await engine.sync();
    expect((srv.calls[1].req.body as { force: boolean }).force).toBe(true);
    expect((srv.calls[2].req.body as { action: string }).action).toBe("note");
    expect(engine.list()).toHaveLength(0);
  });

  it("descartar quita el cambio de la vista", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    await engine.mutate("block.update", edit("mía"));
    srv.state.respond = () => ({ status: 409, data: { error: "RESERVATION_CONFLICT" } });
    await engine.probe();
    await engine.resolve(engine.list()[0].opId, "discard");
    expect(engine.list()).toHaveLength(0);
    expect(engine.data.blocks[0].notes).toBe("");
  });
});

describe("reservas sin conexión", () => {
  const input = {
    cabinTypeId: "c1",
    unit: null,
    checkIn: "2099-03-01",
    checkOut: "2099-03-03",
    adults: 2,
    children: 0,
    pet: { hasPet: false, smallBreedConfirmed: false },
    guest: { fullName: "Bea Prueba", docType: "CC", docNumber: "99887", email: "bea@x.co", phone: "3001112222", city: "" },
    estimatedArrival: "",
    specialRequests: "",
    total: null,
  };

  it("crea con código local, asigna unidad y la deja consultable", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    const r = await engine.mutate<{ reservation: Reservation }>("reservation.create", input);
    expect(r.status).toBe(201);
    const made = r.data!.reservation;
    expect(made.code).toMatch(/^VF-[A-Z0-9]{5}$/);
    expect(made.unit).toBe(1);
    expect(made.quote.total).toBeGreaterThan(0);
    expect(engine.markOf(`reservations:${made.code}`)).toBe("pending");
    expect((await engine.mutate("reservation.action", { code: made.code, action: "confirm", amount: 1 })).queued).toBe(true);
  });

  it("sin abono no aparta: acepta más reservas que unidades, pero no confirma una sin cabaña libre; el servidor manda", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    const made: Reservation[] = [];
    for (let i = 0; i < 3; i++) made.push((await engine.mutate<{ reservation: Reservation }>("reservation.create", input)).data!.reservation);
    expect(made.every((r) => r.status === "pending_deposit")).toBe(true);
    // Las dos unidades se confirman con un pago; la tercera ya no tiene cabaña libre.
    expect((await engine.mutate("reservation.action", { code: made[0].code, action: "confirm", full: true })).queued).toBe(true);
    expect((await engine.mutate("reservation.action", { code: made[1].code, action: "confirm", full: true })).queued).toBe(true);
    const third = await engine.mutate("reservation.action", { code: made[2].code, action: "confirm", full: true });
    expect(third.status).toBe(409);
    srv.state.respond = () => ({ status: 409, data: { error: "DATES_UNAVAILABLE" } });
    await engine.probe();
    expect(engine.status.conflicts).toBe(3);
    expect(engine.list()[0].conflict?.code).toBe("DATES_UNAVAILABLE");
  });

  it("la edición del huésped funde con cambios de otro en otro campo", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    const g = reservation().guest;
    await engine.mutate("reservation.guest", { code: "VF-AAAAA", ...g, city: "Murillo" });
    srv.state.respond = (_c, n) => (n === 1 ? { status: 409, data: { error: "VERSION_CONFLICT" } } : { status: 200, data: {} });
    srv.state.pullRows = {
      upserts: { reservations: [{ key: "VF-AAAAA", row: reservation({ version: 2, guest: { ...g, email: "nuevo@x.co" } }) }] },
      deletes: {},
    };
    await engine.probe();
    const sent = srv.calls[1].req.body as { guest: typeof g };
    expect(sent.guest.city).toBe("Murillo");
    expect(sent.guest.email).toBe("nuevo@x.co");
  });
});

describe("importar", () => {
  it("las filas que el servidor rechaza quedan a la vista, no se pierden", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    await engine.mutate("import.run", { rows: [{ ref: "A" }, { ref: "B" }] });
    srv.state.respond = () => ({
      status: 200,
      data: {
        results: [
          { ref: "A", ok: true, code: "VF-1" },
          { ref: "B", ok: false, error: "Las fechas ya están ocupadas en esa cabaña." },
        ],
      },
    });
    await engine.probe();
    const op = engine.list()[0];
    expect(op.state).toBe("conflict");
    expect(op.conflict?.code).toBe("IMPORT_PARTIAL");
    expect((op.conflict?.detail as { failed: { ref: string }[] }).failed.map((f) => f.ref)).toEqual(["B"]);
  });
});

describe("aislamiento", () => {
  it("cada cuenta tiene su propia base y cola", async () => {
    const srv = fakeServer();
    const { engine, store } = await start(srv, false);
    await engine.mutate("block.delete", { id: "b1" });
    store.close();
    await deleteStore("user-b");
    const other = await openStore("user-b");
    expect(await other.ops()).toHaveLength(0);
    expect(await other.rows()).toHaveLength(0);
    other.close();
  });
});

describe("nueva reserva con pago", () => {
  const input = {
    cabinTypeId: "c1",
    unit: null,
    checkIn: "2099-07-01",
    checkOut: "2099-07-03",
    adults: 2,
    children: 0,
    pet: { hasPet: false, smallBreedConfirmed: false },
    guest: { fullName: "Ana Pruebas", docType: "CC", docNumber: "12345678", email: "ana@ejemplo.test", phone: "3001234567", city: "" },
    estimatedArrival: "",
    specialRequests: "",
    total: null,
  };

  it("sin conexión: la reserva queda confirmada en la vista y salen en orden, crear y luego el pago", async () => {
    const srv = fakeServer();
    const { engine } = await start(srv, false);
    const created = await engine.mutate<{ reservation: { code: string; quote: { total: number } } }>("reservation.create", input);
    expect(created.status).toBe(201);
    const { code, quote } = created.data!.reservation;
    const paid = await engine.mutate("reservation.action", { code, action: "confirm", method: "cash", note: "", amount: 300 });
    expect(paid.status).toBe(200);

    const r = engine.data.reservations.find((x) => x.code === code)!;
    expect([r.status, r.paid]).toEqual(["confirmed", 300]);
    expect(quote.total - r.paid).toBeGreaterThan(0);
    expect(engine.data.payments.filter((p) => p.reservationCode === code).map((p) => p.amount)).toEqual([300]);
    expect(engine.status.pending).toBe(2);

    srv.state.respond = (c) => (c.req.path === "/admin/reservations" ? { status: 201, data: { reservation: r } } : { status: 200, data: r });
    await engine.probe();
    expect(engine.status.pending).toBe(0);
    expect(srv.calls.map((c) => c.req.path)).toEqual(["/admin/reservations", "/admin/action"]);
    expect((srv.calls[1].req.body as { code: string }).code).toBe(code);
  });
});
