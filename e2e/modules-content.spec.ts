import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN, TAG, chip, cleanup, db, login, waitForShell } from "./helpers";

// El resto de operaciones sin conexión contra las rutas reales. No generan correos ni push, y dejan QA como estaba:
// lo que se crea se borra y el contenido del sitio se guarda con sus mismos valores.
test.describe.configure({ mode: "serial" });

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==";
let context: BrowserContext;
let page: Page;
const cabin = `${TAG}-contenido`;

type Hook = {
  mutate: (t: string, i: unknown) => Promise<{ status: number; data: unknown; queued?: boolean }>;
  list: () => { state: string; type: string; conflict?: { code: string } }[];
  data: Record<string, never>;
};

const run = async (type: string, input: unknown) => {
  const r = await page.evaluate(
    async ({ type, input }) => {
      const res = await (window as unknown as { __vfSync: Hook }).__vfSync.mutate(type, input);
      return { status: res.status, queued: res.queued, data: res.data };
    },
    { type, input },
  );
  expect(r.status, `${type}: ${JSON.stringify(r.data)?.slice(0, 200)}`).toBeLessThan(300);
  expect(r.queued, type).toBe(true);
  return r.data;
};
const withBlob = (type: string, extra: object) =>
  page.evaluate(
    async ({ type, extra, png }) => {
      const blob = await (await fetch(`data:image/png;base64,${png}`)).blob();
      const r = await (window as unknown as { __vfSync: Hook }).__vfSync.mutate(type, { ...extra, file: blob, name: "x.png" });
      if (r.status >= 300) throw new Error(`${type}: ${r.status}`);
    },
    { type, extra, png },
  );
const synced = async () => {
  await context.setOffline(false);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __vfSync: Hook }).__vfSync.list().filter((o) => o.state === "pending").length), { timeout: 60_000 })
    .toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __vfSync: Hook }).__vfSync.list().map((o) => `${o.type}:${o.conflict?.code}`))).toEqual([]);
  await expect(chip(page)).toHaveAttribute("data-sync-state", "online", { timeout: 30_000 });
};
const offline = async () => {
  await context.setOffline(true);
  await expect(chip(page)).toHaveAttribute("data-sync-state", "offline");
};

async function clean() {
  const { data } = await db.from("cabin_types").select("id, fotos").like("nombre", "e2e-%");
  for (const c of data ?? []) {
    if (c.fotos.length) await db.storage.from("site-images").remove(c.fotos);
    await db.from("cabin_types").delete().eq("id", c.id);
  }
  await db.from("site_services").delete().like("title", "e2e-%");
  await cleanup();
}

test.beforeAll(async ({ browser }) => {
  await clean();
  await db
    .from("cabin_types")
    .insert({ id: cabin, nombre: `${TAG}-contenido`, sort: 998, units: 1, max_personas: 2, precio_pareja: 1000, persona_adicional: 100, activa: false });
  context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "es-CO", timezoneId: "America/Bogota" });
  page = await context.newPage();
  await login(page, ADMIN);
  await waitForShell(page);
  await expect
    .poll(
      () =>
        page.evaluate(
          (id) => ((window as unknown as { __vfSync: Hook }).__vfSync.data.cabinTypes as unknown as { id: string }[]).some((c) => c.id === id),
          cabin,
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
});

test.afterAll(async () => {
  await context.close();
  await clean();
});

test("crear y luego editar un bloqueo sin enviar se compacta en una sola creación", async () => {
  await offline();
  await run("block.create", { cabinTypeId: cabin, unit: 1, from: "2097-05-01", to: "2097-05-02", reason: "Mantenimiento", notes: `${TAG}-v1` });
  const id = await page.evaluate(
    () =>
      ((window as unknown as { __vfSync: Hook }).__vfSync.data.blocks as unknown as { id: string; notes: string }[]).find((b) => b.notes.endsWith("-v1"))!.id,
  );
  await run("block.update", { id, cabinTypeId: cabin, unit: 1, from: "2097-05-01", to: "2097-05-03", reason: "Mantenimiento", notes: `${TAG}-v2` });
  expect(await page.evaluate(() => (window as unknown as { __vfSync: Hook }).__vfSync.list().length)).toBe(1);
  await synced();
  const { data } = await db.from("blocks").select("to_date, notes, id").eq("id", id);
  expect(data).toEqual([{ id, to_date: "2097-05-03", notes: `${TAG}-v2` }]);
});

test("cabaña: editar, ordenar, fotos", async () => {
  await offline();
  await run("cabin.update", {
    id: cabin,
    nombre: `${TAG}-contenido`,
    descripcion: `${TAG}-descripcion`,
    caracteristicas: ["Wifi"],
    badge: "",
    maxPersonas: 3,
    units: 1,
    precioPareja: 1000,
    personaAdicional: 100,
    activa: false,
  });
  await withBlob("cabinPhoto.add", { cabinId: cabin });
  await withBlob("cabinPhoto.add", { cabinId: cabin });
  const order = await page.evaluate(() => ((window as unknown as { __vfSync: Hook }).__vfSync.data.cabinTypes as unknown as { id: string }[]).map((c) => c.id));
  await run("cabin.reorder", { order });
  await synced();
  const row = (await db.from("cabin_types").select("descripcion, max_personas, fotos").eq("id", cabin).single()).data!;
  expect(row.descripcion).toBe(`${TAG}-descripcion`);
  expect(row.max_personas).toBe(3);
  expect(row.fotos).toHaveLength(2);

  // Ya con sus direcciones: ordenar y quitar.
  const urls = await page.evaluate(
    (id) =>
      ((window as unknown as { __vfSync: Hook }).__vfSync.data.cabinTypes as unknown as { id: string; fotos: string[] }[]).find((c) => c.id === id)!.fotos,
    cabin,
  );
  expect(urls.every((u) => u.startsWith("http"))).toBe(true);
  await offline();
  await run("cabinPhoto.reorder", { cabinId: cabin, fotos: [...urls].reverse() });
  await run("cabinPhoto.delete", { cabinId: cabin, url: urls[0] });
  await synced();
  const after = (await db.from("cabin_types").select("fotos").eq("id", cabin).single()).data!;
  expect(after.fotos).toEqual([row.fotos[1]]);
});

test("contenido, condiciones, servicios y foto del sitio", async () => {
  const before = (await db.from("site_settings").select("deposit_pct, content, phones, theme").single()).data!;
  const site = (await page.evaluate(() => (window as unknown as { __vfSync: Hook }).__vfSync.data.site)) as unknown as {
    settings: { depositPct: number };
    policies: unknown[];
    texts: { payment: { instructions: string } };
    theme: unknown;
    photos: Record<string, string>;
  };
  await offline();
  await run("site.save", { settings: site.settings, policies: site.policies, content: site.texts, theme: site.theme });
  await run("terms.save", { depositPct: site.settings.depositPct, instructions: site.texts.payment.instructions });
  await run("service.create", { title: `${TAG}-servicio`, description: "", icon: "wifi", note: "", visible: true });
  await synced();
  const now = (await db.from("site_settings").select("deposit_pct, content, phones, theme").single()).data!;
  expect(now).toEqual(before); // mismos valores: el contenido no cambió

  const service = (await db.from("site_services").select("id, title, description, icon, note, visible").eq("title", `${TAG}-servicio`).single()).data!;
  await expect
    .poll(() =>
      page.evaluate(
        (id) => ((window as unknown as { __vfSync: Hook }).__vfSync.data.site as unknown as { services: { id: string }[] }).services.some((s) => s.id === id),
        service.id,
      ),
    )
    .toBe(true);
  const ids = await page.evaluate(() =>
    ((window as unknown as { __vfSync: Hook }).__vfSync.data.site as unknown as { services: { id: string }[] }).services.map((s) => s.id),
  );
  await offline();
  await run("service.update", { ...service, description: `${TAG}-desc` });
  await run("service.reorder", { order: ids });
  await synced();
  expect((await db.from("site_services").select("description").eq("id", service.id).single()).data?.description).toBe(`${TAG}-desc`);
  await offline();
  await run("service.delete", { id: service.id });
  await synced();
  expect((await db.from("site_services").select("id").eq("id", service.id)).data).toEqual([]);

  // Foto del sitio, en un hueco que QA tenga libre.
  const { data: used } = await db.from("site_photos").select("slot");
  const slot = ["hero-main", "exp-restaurante", "restaurante-2", "exp-desayuno", "exp-parque", "exp-jardines", "exp-finca", "contact"].find(
    (s) => !used?.some((u) => u.slot === s),
  );
  test.skip(!slot, "QA no tiene un hueco de foto libre");
  await offline();
  await withBlob("sitePhoto.set", { slot });
  await synced();
  const photo = (await db.from("site_photos").select("path").eq("slot", slot!).maybeSingle()).data;
  expect(photo?.path).toBeTruthy();
  await offline();
  await run("sitePhoto.delete", { slot });
  await synced();
  expect((await db.from("site_photos").select("slot").eq("slot", slot!)).data).toEqual([]);
});

test("avisos leídos y foto de perfil", async () => {
  const { data: read } = await db.from("admin_notifications").select("id, read_at").not("read_at", "is", null).limit(1);
  await offline();
  if (read?.[0]) await run("notifications.mark", { ids: [read[0].id] });
  await run("profilePhoto.delete", {});
  await synced();
  if (read?.[0]) expect((await db.from("admin_notifications").select("read_at").eq("id", read[0].id).single()).data?.read_at).toBe(read[0].read_at); // ya estaba leído: no cambia
});
