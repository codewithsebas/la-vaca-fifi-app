import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN, TAG, addNote, chip, cleanup, db, localDbNames, login, seedBlock, seedReservation, waitForShell } from "./helpers";

// Seguridad y comportamiento entre pestañas: lo que queda en el dispositivo, el cierre de sesión, la caducidad y el tiempo real.
test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
let cabin: string;
let reservation: string;

test.beforeAll(async ({ browser }) => {
  await cleanup();
  const { data } = await db.from("cabin_types").select("id").eq("activa", true).order("sort").limit(1);
  cabin = data![0].id;
  reservation = await seedReservation(cabin, "2097-02-01", "2097-02-03");
  context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "es-CO", timezoneId: "America/Bogota" });
  page = await context.newPage();
  await login(page, ADMIN);
  await waitForShell(page);
});

test.afterAll(async () => {
  await context.close();
  await cleanup();
});

test("el dispositivo no guarda contraseñas, tokens ni respuestas de la API en caché", async () => {
  const found = await page.evaluate(async () => {
    const leaks: string[] = [];
    for (const name of await caches.keys())
      for (const req of await (await caches.open(name)).keys()) if (new URL(req.url).pathname.startsWith("/api/")) leaks.push(req.url);
    const dbName = (await indexedDB.databases()).find((d) => d.name?.startsWith("vf-"))!.name!;
    const database = await new Promise<IDBDatabase>((ok) => {
      const r = indexedDB.open(dbName);
      r.onsuccess = () => ok(r.result);
    });
    const dump: unknown[] = [];
    for (const store of ["meta", "rows", "outbox"]) {
      dump.push(
        await new Promise((ok) => {
          const r = database.transaction(store).objectStore(store).getAll();
          r.onsuccess = () => ok(r.result);
        }),
      );
    }
    database.close();
    return { leaks, text: JSON.stringify(dump), local: JSON.stringify({ ...localStorage }) };
  });
  expect(found.leaks).toEqual([]);
  for (const secret of ["access_token", "refresh_token", "password", ADMIN.password]) {
    expect(found.text.includes(secret), secret).toBe(false);
    expect(found.local.includes(secret), secret).toBe(false);
  }
});

test("un cambio de otra persona llega solo, sin recargar (tiempo real e incremental)", async () => {
  await page.goto("/admin/bloqueos");
  await expect(chip(page)).toHaveAttribute("data-sync-state", "online");
  await page.waitForTimeout(2500); // la suscripción tarda en quedar lista
  const pulls: string[] = [];
  const full: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/admin/sync/pull")) pulls.push(r.url());
    if (r.url().endsWith("/api/admin/data")) full.push(r.url());
  });
  await seedBlock(cabin, 1, "2097-04-01", "2097-04-02", `${TAG}-remoto`);
  await expect(page.getByText(`${TAG}-remoto`).first()).toBeVisible({ timeout: 20_000 });
  expect(pulls.length).toBeGreaterThan(0);
  expect(full).toEqual([]); // nunca toda la base
});

test("dos pestañas: comparten la cola y no envían dos veces", async () => {
  await page.goto(`/admin/reservas/${reservation}`);
  const second = await context.newPage();
  await second.goto("/admin/sincronizacion");
  await expect(chip(second)).toBeVisible();

  await context.setOffline(true);
  await expect(chip(page)).toHaveAttribute("data-sync-state", "offline");
  await addNote(page, `${TAG}-pestanas`);
  await expect(second.getByText(/Nota · /).first()).toBeVisible();

  let sent = 0;
  await context.route("**/api/admin/action", async (route) => {
    sent++;
    await route.continue();
  });
  await context.setOffline(false);
  await expect
    .poll(async () => (await db.from("reservation_notes").select("text").eq("reservation_code", reservation)).data?.length, { timeout: 30_000 })
    .toBe(1);
  await expect(second.getByText("Todo sincronizado")).toBeVisible({ timeout: 20_000 });
  await context.unroute("**/api/admin/action");
  expect(sent).toBe(1);
  await second.close();
});

test("el cierre de sesión con pendientes avisa; al confirmar borra los datos del dispositivo", async () => {
  await page.goto(`/admin/reservas/${reservation}`);
  await context.setOffline(true);
  await expect(chip(page)).toHaveAttribute("data-sync-state", "offline");
  await addNote(page, `${TAG}-descartada`);

  await page.goto("/admin/configuracion");
  await page
    .getByRole("button", { name: /cerrar sesión/i })
    .last()
    .click();
  const dialog = page.getByRole("alertdialog");
  // Puede haber una confirmación propia del módulo antes del aviso de pendientes.
  if (await dialog.getByRole("button", { name: /^cerrar sesión/i }).count()) await dialog.getByRole("button", { name: /^cerrar sesión/i }).click();
  await expect(page.getByRole("alertdialog").getByText(/sin sincronizar/)).toBeVisible();
  await expect(page.getByRole("alertdialog").getByText(/Nota/)).toBeVisible();

  // Volver atrás no pierde nada.
  await page.getByRole("alertdialog").getByRole("button", { name: "Volver" }).click();
  await expect(chip(page)).toContainText(/1 pendiente/);

  await page
    .getByRole("button", { name: /cerrar sesión/i })
    .last()
    .click();
  const again = page.getByRole("alertdialog");
  if (await again.getByRole("button", { name: /^cerrar sesión/i }).count()) await again.getByRole("button", { name: /^cerrar sesión/i }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Descartar y cerrar sesión" }).click();
  await expect(page.getByLabel("Correo")).toBeVisible();
  await expect.poll(() => localDbNames(page)).toEqual([]);
  expect(await page.evaluate(() => document.cookie.includes("sb-"))).toBe(false);

  // Sin datos ni sesión, sin conexión, no se abre nada.
  await page.reload();
  await expect(page.getByText("No pudimos abrir el panel")).toBeVisible();
  await expect(page.getByText(`Huésped ${TAG}`)).toHaveCount(0);
  await context.setOffline(false);
  expect((await db.from("reservation_notes").select("text").eq("text", `${TAG}-descartada`)).data).toEqual([]);
});

test("tras 30 días sin validar con el servidor, deja de abrir sin conexión", async () => {
  await login(page, ADMIN);
  await waitForShell(page);
  await context.setOffline(true);
  await page.reload();
  await expect(chip(page)).toHaveAttribute("data-sync-state", "offline"); // reciente: abre
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("vf-offline-last-"))!;
    const last = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...last, validatedAt: Date.now() - 31 * 864e5 }));
  });
  await page.reload();
  await expect(page.getByText("Conéctate para seguir")).toBeVisible();
  await expect(page.getByText(`Huésped ${TAG}`)).toHaveCount(0);
  await context.setOffline(false);
  await page.reload();
  await expect(chip(page)).toHaveAttribute("data-sync-state", "online"); // con internet vuelve a validar
});

test("si el navegador no permite IndexedDB, el panel sigue funcionando en línea", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "es-CO", timezoneId: "America/Bogota" });
  await ctx.addInitScript(() => {
    IDBFactory.prototype.open = function () {
      throw new DOMException("bloqueado", "SecurityError");
    };
  });
  const p = await ctx.newPage();
  await p.goto("/admin");
  await p.getByLabel("Correo").fill(ADMIN.email);
  await p.getByLabel("Contraseña", { exact: true }).fill(ADMIN.password);
  await p.getByRole("button", { name: /^(ingresar|entrar)/i }).click();
  await expect(p.locator("#ad-title").first()).toBeVisible();
  await expect(p.locator("[data-sync-state]")).toHaveCount(0); // sin motor
  await p.goto(`/admin/reservas/${reservation}`);
  await expect(p.getByText(`Huésped ${TAG}`).first()).toBeVisible();
  await ctx.close();
});
