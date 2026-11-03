import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN, TAG, api, chip, cleanup, db, login, seedBlock, seedReservation, waitForShell } from "./helpers";

// Cada tipo de operación, hecha sin conexión, contra las rutas reales: se guarda, sobrevive a la recarga, se sincroniza sola y
// llega a la base de QA. Usa el motor directamente (NEXT_PUBLIC_E2E_HOOKS=1); las pantallas se prueban en offline.spec.ts.
test.describe.configure({ mode: "serial" });

const MAIL = "delivered@resend.dev"; // dirección de prueba de Resend: nadie real recibe nada
const NAME = `${TAG} Cabaña`;
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==";

let context: BrowserContext;
let page: Page;
let cabin: string;
let res: string;
let clientKey: string;
const ids: Record<string, string> = {};

declare global {
  interface Window {
    __vfSync: {
      mutate: (type: string, input: unknown) => Promise<{ status: number; data: unknown; queued?: boolean }>;
      data: { reservations: { code: string; guest: { fullName: string } }[]; site: unknown; me: { id: string } };
      list: () => { label: string; state: string; conflict?: { code: string }; type: string }[];
    };
  }
}

async function removeTestData() {
  await db.from("reservations").delete().like("guest_full_name", "%e2e-%");
  await db.from("rate_seasons").delete().like("nombre", "e2e-%");
  await db.from("bathrooms").delete().like("name", "e2e-%");
  await db.from("site_services").delete().like("title", "e2e-%");
  const { data: cabins } = await db.from("cabin_types").select("id, fotos").like("nombre", "e2e-%");
  for (const c of cabins ?? []) {
    if (c.fotos.length) await db.storage.from("site-images").remove(c.fotos);
    await db.from("cabin_types").delete().eq("id", c.id);
  }
  await cleanup();
}

const run = (type: string, input: unknown) =>
  page.evaluate(
    async ({ type, input }) => {
      const r = await window.__vfSync.mutate(type, input);
      return { status: r.status, queued: r.queued, data: r.data };
    },
    { type, input },
  );

const done = async (type: string, input: unknown) => {
  const r = await run(type, input);
  expect(r.status, `${type}: ${JSON.stringify(r.data)?.slice(0, 200)}`).toBeLessThan(300);
  expect(r.queued, type).toBe(true);
  return r.data;
};

test.beforeAll(async ({ browser }) => {
  await removeTestData();
  const { data } = await db.from("cabin_types").select("id").eq("activa", true).order("sort").limit(1);
  cabin = data![0].id;
  res = await seedReservation(cabin, "2097-02-01", "2097-02-03");
  await db.from("reservations").update({ guest_email: MAIL }).eq("code", res);
  clientKey = (await db.from("reservations").select("client_key").eq("code", res).single()).data!.client_key!;
  ids.bathEdit = (
    await db
      .from("bathrooms")
      .insert({ name: `${TAG}-baño-editar`, status: "available" })
      .select("id")
      .single()
  ).data!.id;
  ids.bathDelete = (
    await db
      .from("bathrooms")
      .insert({ name: `${TAG}-baño-borrar`, status: "available" })
      .select("id")
      .single()
  ).data!.id;
  ids.bbEdit = (
    await db
      .from("bathroom_blocks")
      .insert({ bathroom_id: ids.bathEdit, from_date: "2097-01-01", to_date: "2097-01-02", reason: "Otro", notes: "a" })
      .select("id")
      .single()
  ).data!.id;
  ids.bbDelete = (
    await db
      .from("bathroom_blocks")
      .insert({ bathroom_id: ids.bathEdit, from_date: "2097-02-01", to_date: "2097-02-02", reason: "Otro", notes: "b" })
      .select("id")
      .single()
  ).data!.id;
  const season = { cabin_type_id: cabin, precio_pareja: 1000, persona_adicional: 100, activa: false };
  ids.seasonEdit = (
    await db
      .from("rate_seasons")
      .insert({ ...season, nombre: `${TAG}-t-editar`, from_date: "2097-01-01", to_date: "2097-01-05" })
      .select("id")
      .single()
  ).data!.id;
  ids.seasonDelete = (
    await db
      .from("rate_seasons")
      .insert({ ...season, nombre: `${TAG}-t-borrar`, from_date: "2097-02-01", to_date: "2097-02-05" })
      .select("id")
      .single()
  ).data!.id;
  await db.from("client_profiles").upsert({ client_key: clientKey });
  ids.entry = String(
    (
      await db
        .from("client_entries")
        .insert({ client_key: clientKey, kind: "note", text: `${TAG}-registro` })
        .select("id")
        .single()
    ).data!.id,
  );
  ids.cabinDelete = `${TAG}-borrar`;
  await db
    .from("cabin_types")
    .insert({ id: ids.cabinDelete, nombre: `${TAG}-a-borrar`, sort: 999, units: 0, max_personas: 2, precio_pareja: 1, persona_adicional: 1, activa: false });
  ids.block = await seedBlock(cabin, 1, "2097-04-01", "2097-04-02");
  ids.proof = (
    await db
      .from("payment_proofs")
      .insert({ reservation_code: res, path: `${TAG}/x.png`, file_name: "x.png", mime: "image/png", size: 10 })
      .select("id")
      .single()
  ).data!.id;

  context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "es-CO", timezoneId: "America/Bogota" });
  page = await context.newPage();
  await login(page, ADMIN);
  await waitForShell(page);
  await expect.poll(() => page.evaluate((code) => window.__vfSync.data.reservations.some((r) => r.code === code), res)).toBe(true);
});

test.afterAll(async () => {
  await context.close();
  await removeTestData();
});

test("todas las operaciones sin conexión llegan al servidor", async () => {
  await context.setOffline(true);
  await expect(chip(page)).toHaveAttribute("data-sync-state", "offline");

  // Baños y sus bloqueos: crear (y editar lo creado, se compacta), editar, borrar.
  await done("bathroom.create", { name: `${TAG}-baño-nuevo`, status: "available", cabinTypeId: null, unit: null, notes: "" });
  await done("bathroom.update", { id: ids.bathEdit, status: "maintenance", notes: "offline" });
  await done("bathroom.delete", { id: ids.bathDelete });
  await done("bathroomBlock.create", { bathroomId: ids.bathEdit, from: "2097-03-01", to: "2097-03-02", reason: "Otro", notes: `${TAG}-bb` });
  await done("bathroomBlock.update", { id: ids.bbEdit, bathroomId: ids.bathEdit, from: "2097-01-01", to: "2097-01-03", reason: "Otro", notes: "a2" });
  await done("bathroomBlock.delete", { id: ids.bbDelete });

  // Temporadas.
  const season = { cabinTypeId: cabin, precioPareja: 2000, personaAdicional: 200, activa: false };
  await done("season.create", { ...season, nombre: `${TAG}-t-nueva`, from: "2097-03-01", to: "2097-03-05" });
  await done("season.update", { ...season, id: ids.seasonEdit, nombre: `${TAG}-t-editada`, from: "2097-01-01", to: "2097-01-05" });
  await done("season.delete", { id: ids.seasonDelete });

  // Cabaña nueva con foto y tarifa: dependen de que la cabaña exista antes en el servidor.
  const cabinInput = {
    nombre: NAME,
    descripcion: "",
    caracteristicas: [],
    badge: "",
    maxPersonas: 2,
    units: 1,
    precioPareja: 1000,
    personaAdicional: 100,
    activa: false,
  };
  await done("cabin.create", cabinInput);
  ids.cabinNew = await page.evaluate(
    (name) => (window.__vfSync.data as unknown as { cabinTypes: { id: string; nombre: string }[] }).cabinTypes.find((c) => c.nombre === name)!.id,
    NAME,
  );
  await page.evaluate(
    async ({ id, png }) => {
      const blob = await (await fetch(`data:image/png;base64,${png}`)).blob();
      await window.__vfSync.mutate("cabinPhoto.add", { cabinId: id, file: blob, name: "x.png" });
    },
    { id: ids.cabinNew, png },
  );
  await done("rates.save", { rates: { [ids.cabinNew]: { precioPareja: 1500, personaAdicional: 150, maxPersonas: 3 } } });
  await done("cabin.delete", { id: ids.cabinDelete });

  // Clientes.
  await done("client.save", { clientKey, rating: 4, trust: "alta", tags: ["e2e"], preferences: "", summary: `${TAG}-resumen` });
  await done("client.entry.add", { clientKey, kind: "incident", severity: "leve", text: `${TAG}-incidente`, reservationCode: res });
  await done("client.entry.delete", { id: Number(ids.entry) });

  // Comprobante, correo del equipo e importación.
  await done("proof.review", { id: ids.proof, decision: "reject", note: `${TAG}-rechazo`, confirmReservation: false });
  ids.request = crypto.randomUUID();
  await done("email.send", { clientKey, subject: `${TAG} asunto`, message: "mensaje de prueba", reservationCode: res, requestId: ids.request });
  ids.importRef = `${TAG}-imp`;
  await done("import.run", {
    rows: [
      {
        ref: ids.importRef,
        guest: `Importado ${TAG}`,
        email: "",
        phone: "",
        status: "confirmed",
        cabinTypeId: cabin,
        unit: 1,
        checkIn: "2097-10-01",
        checkOut: "2097-10-02",
        total: 1000,
        commission: 0,
        channel: "e2e",
        notes: "",
      },
    ],
  });

  // Reserva creada sin conexión, con todo lo que le sigue, en orden.
  const created = (await done("reservation.create", {
    cabinTypeId: cabin,
    unit: null,
    checkIn: "2097-11-01",
    checkOut: "2097-11-03",
    adults: 2,
    children: 0,
    pet: { hasPet: false, smallBreedConfirmed: false },
    guest: { fullName: `Nueva ${TAG}`, docType: "CC", docNumber: "E2E12345", email: MAIL, phone: "3001112222", city: "" },
    estimatedArrival: "",
    specialRequests: "",
    total: null,
    holdMinutes: 1440,
  })) as {
    reservation: {
      code: string;
      guest: { email: string; phone: string; city: string; docType: string; docNumber: string; fullName: string };
      quote: { total: number };
    };
  };
  ids.created = created.reservation.code;
  const guest = created.reservation.guest;
  await done("reservation.action", { code: ids.created, action: "note", text: `${TAG}-primera-nota` });
  await done("reservation.action", { code: ids.created, action: "extend_hold", holdMinutes: 2880 });
  await done("reservation.guest", { code: ids.created, ...guest, city: "Murillo" });
  await done("reservation.action", { code: ids.created, action: "reschedule", checkIn: "2097-11-05", checkOut: "2097-11-07" });
  await done("reservation.action", { code: ids.created, action: "confirm", amount: 1000, method: "cash", note: "offline" });
  await done("reservation.action", { code: ids.created, action: "checkin" });

  // Bloqueo con un cambio y su borrado seguidos: se compactan en un solo borrado.
  const row = (await db.from("blocks").select("*").eq("id", ids.block).single()).data!;
  await done("block.update", {
    id: ids.block,
    cabinTypeId: row.cabin_type_id,
    unit: row.unit,
    from: row.from_date,
    to: row.to_date,
    reason: row.reason,
    notes: `${TAG}-x`,
  });
  await done("block.delete", { id: ids.block });

  // Mi nombre y foto.
  await done("profile.save", { name: "Prueba Administrador 2" });
  await page.evaluate(async (png) => {
    const blob = await (await fetch(`data:image/png;base64,${png}`)).blob();
    await window.__vfSync.mutate("profilePhoto.set", { file: blob, name: "a.png" });
  }, png);

  // Sobrevive a recargar sin conexión; nada ha llegado al servidor.
  const before = await page.evaluate(() => window.__vfSync.list().length);
  expect(before).toBeGreaterThan(20);
  await page.reload();
  await expect(chip(page)).toHaveAttribute("data-sync-state", "offline");
  expect(await page.evaluate(() => window.__vfSync.list().length)).toBe(before);
  expect((await db.from("reservations").select("code").eq("code", ids.created)).data).toEqual([]);

  // Vuelve la conexión.
  await context.setOffline(false);
  await expect.poll(() => page.evaluate(() => window.__vfSync.list().filter((o) => o.state === "pending").length), { timeout: 60_000 }).toBe(0);
  const left = await page.evaluate(() => window.__vfSync.list().map((o) => `${o.type}:${o.conflict?.code}:${o.label}`));
  expect(left).toEqual([]);

  // Todo en la base.
  const one = async (table: string, column: string, value: string) =>
    (await db.from(table).select("*").eq(column, value).maybeSingle()).data as Record<string, never> | null;
  expect((await db.from("bathrooms").select("id").eq("name", `${TAG}-baño-nuevo`)).data).toHaveLength(1);
  expect((await one("bathrooms", "id", ids.bathEdit))?.status).toBe("maintenance");
  expect(await one("bathrooms", "id", ids.bathDelete)).toBeNull();
  expect((await db.from("bathroom_blocks").select("id").eq("notes", `${TAG}-bb`)).data).toHaveLength(1);
  expect((await one("bathroom_blocks", "id", ids.bbEdit))?.to_date).toBe("2097-01-03");
  expect(await one("bathroom_blocks", "id", ids.bbDelete)).toBeNull();
  expect((await db.from("rate_seasons").select("id").eq("nombre", `${TAG}-t-nueva`)).data).toHaveLength(1);
  expect((await one("rate_seasons", "id", ids.seasonEdit))?.nombre).toBe(`${TAG}-t-editada`);
  expect(await one("rate_seasons", "id", ids.seasonDelete)).toBeNull();
  const newCabin = await one("cabin_types", "id", ids.cabinNew);
  expect(newCabin?.precio_pareja).toBe(1500);
  expect((newCabin?.fotos as unknown as string[]).length).toBe(1);
  expect(await one("cabin_types", "id", ids.cabinDelete)).toBeNull();
  const profile = await one("client_profiles", "client_key", clientKey);
  expect(profile?.rating).toBe(4);
  expect(profile?.summary).toBe(`${TAG}-resumen`);
  expect((await db.from("client_entries").select("id").eq("text", `${TAG}-incidente`)).data).toHaveLength(1);
  expect(await one("client_entries", "id", ids.entry)).toBeNull();
  expect((await one("payment_proofs", "id", ids.proof))?.status).toBe("rejected");
  expect((await db.from("email_outbox").select("id").eq("dedupe_key", `mensaje:${ids.request.toLowerCase()}`)).data).toHaveLength(1);
  expect((await db.from("reservations").select("source").eq("external_ref", ids.importRef)).data).toEqual([{ source: "import" }]);

  const made = await one("reservations", "code", ids.created);
  expect(made?.status).toBe("checked_in");
  expect(made?.check_in).toBe("2097-11-05");
  expect(made?.guest_city).toBe("Murillo");
  expect(made?.paid_amount).toBe(1000);
  expect((await db.from("reservation_notes").select("text").eq("reservation_code", ids.created)).data).toEqual([{ text: `${TAG}-primera-nota` }]);
  const payments = (await db.from("payments").select("amount, client_op_id").eq("reservation_code", ids.created)).data!;
  expect(payments).toHaveLength(1);
  expect(payments[0].client_op_id).toBeTruthy();

  expect(await one("blocks", "id", ids.block)).toBeNull();

  // Lo local queda igual al servidor.
  const server = await api(page, "GET", "/admin/data");
  const local = await page.evaluate((code) => window.__vfSync.data.reservations.find((r) => r.code === code), ids.created);
  expect(local).toEqual(server.data.reservations.find((r: { code: string }) => r.code === ids.created));
});

test("una reserva imposible se detiene por revisar, sin perderse", async () => {
  // El segundo intento toma fechas que ya tiene otra reserva en el servidor.
  const taken = await seedReservation(cabin, "2097-12-01", "2097-12-03");
  await context.setOffline(true);
  await expect(chip(page)).toHaveAttribute("data-sync-state", "offline");
  // Sin ver la reserva nueva (el dispositivo no la ha recibido) las fechas parecen libres si aún no llegó; se fuerza con otra sembrada después.
  await db.from("reservations").delete().eq("code", taken);
  await page.evaluate(() => new Promise((ok) => setTimeout(ok, 200)));
  const input = {
    cabinTypeId: cabin,
    unit: 1,
    checkIn: "2098-01-01",
    checkOut: "2098-01-03",
    adults: 2,
    children: 0,
    pet: { hasPet: false, smallBreedConfirmed: false },
    guest: { fullName: `Choque ${TAG}`, docType: "CC", docNumber: "E2E99999", email: MAIL, phone: "3001112222", city: "" },
    estimatedArrival: "",
    specialRequests: "",
    total: null,
    holdMinutes: 1440,
  };
  const { reservation } = (await done("reservation.create", input)) as { reservation: { code: string } };
  const rival = await seedReservation(cabin, "2098-01-01", "2098-01-03");
  await context.setOffline(false);
  await expect(chip(page)).toHaveAttribute("data-sync-state", "conflict", { timeout: 30_000 });
  const op = await page.evaluate(() => window.__vfSync.list()[0]);
  expect(op.conflict?.code).toBe("DATES_UNAVAILABLE");
  expect((await db.from("reservations").select("code").eq("code", reservation.code)).data).toEqual([]);
  // Sigue visible para decidir.
  await page.goto("/admin/sincronizacion");
  await expect(page.getByText(/ya no están libres/).first()).toBeVisible();
  await page.getByRole("button", { name: "Descartar" }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByText("Todo sincronizado")).toBeVisible();
  await db.from("reservations").delete().eq("code", rival);
});
