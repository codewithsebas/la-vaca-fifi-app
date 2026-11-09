import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  ADMIN,
  RECEPCION,
  TAG,
  addNote,
  api,
  chip,
  cleanup,
  createBlockUI,
  db,
  localDbNames,
  login,
  seedBlock,
  seedReservation,
  waitForShell,
} from "./helpers";

// Pruebas obligatorias del panel sin conexión (docs/plan-offline-first.md, sección 7), con el build real y la base de QA.
// Solo datos propios (etiquetados con TAG y borrados al final): reservas importadas sin correo, que no generan correos ni push.
test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
let cabin: string;
let cabinName: string;
let units: number;
let reservation: string;
let otherReservation: string;
let editBlock: string;
let deleteBlock: string;
let offlineEdit: string;
let offlineDelete: string;

const paymentsOf = async (code: string) => (await db.from("payments").select("amount, client_op_id, approved_at").eq("reservation_code", code)).data ?? [];
const notesOf = async (code: string) => (await db.from("reservation_notes").select("text").eq("reservation_code", code)).data ?? [];
const blockRow = async (id: string) => (await db.from("blocks").select("*").eq("id", id).maybeSingle()).data;

test.beforeAll(async ({ browser }) => {
  await cleanup();
  const { data } = await db.from("cabin_types").select("id, nombre, units").eq("activa", true).gte("units", 1).order("sort").limit(1);
  const c = data?.[0];
  if (!c) throw new Error("QA necesita una cabaña activa.");
  cabin = c.id;
  cabinName = c.nombre;
  units = c.units;
  reservation = await seedReservation(cabin, "2097-02-01", "2097-02-03");
  otherReservation = await seedReservation(cabin, "2097-03-01", "2097-03-03");
  editBlock = await seedBlock(cabin, 1, "2097-05-01", "2097-05-02");
  deleteBlock = await seedBlock(cabin, 1, "2097-06-01", "2097-06-02");
  offlineEdit = await seedBlock(cabin, 1, "2097-08-01", "2097-08-02", `${TAG}-a-editar`);
  offlineDelete = await seedBlock(cabin, 1, "2097-08-10", "2097-08-11", `${TAG}-a-borrar`);
  context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "es-CO", timezoneId: "America/Bogota" });
  page = await context.newPage();
});

test.afterAll(async () => {
  // Primero se cierra el navegador: así nada se sincroniza después de limpiar.
  await context.close();
  await cleanup();
});

test("1. Abrir con internet y descargar lo inicial", async () => {
  await login(page, ADMIN);
  await expect(chip(page)).toHaveAttribute("data-sync-state", "online");
  await waitForShell(page);
  const { count } = await db.from("reservations").select("code", { count: "exact", head: true });
  const local = await page.evaluate(async () => {
    const name = (await indexedDB.databases()).find((d) => d.name?.startsWith("vf-"))!.name!;
    const database = await new Promise<IDBDatabase>((ok) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => ok(r.result);
    });
    const rows = await new Promise<{ collection: string }[]>((ok) => {
      const r = database.transaction("rows").objectStore("rows").getAll();
      r.onsuccess = () => ok(r.result);
    });
    database.close();
    return rows.filter((r) => r.collection === "reservations").length;
  });
  expect(local).toBe(count);
});

test("2. Sin conexión se navega por todos los módulos, con listados y detalle", async () => {
  await context.setOffline(true);
  await page.reload();
  await expect(chip(page)).toHaveAttribute("data-sync-state", "offline");

  // Por dirección (recarga completa desde el service worker) y con datos.
  for (const [path, heading] of [
    ["/admin", /buen[oa]s|dashboard/i],
    ["/admin/calendario", /calendario/i],
    ["/admin/reservas", /reservas/i],
    ["/admin/pagos", /pagos/i],
    ["/admin/clientes", /clientes/i],
    ["/admin/cabanas", /cabañas/i],
    ["/admin/bloqueos", /bloqueos/i],
    ["/admin/tarifas", /tarifas/i],
    ["/admin/finanzas", /finanzas/i],
    ["/admin/condiciones", /condiciones/i],
    ["/admin/empleados", /empleados/i],
    ["/admin/notificaciones", /notificaciones/i],
    ["/admin/configuracion", /configuración/i],
    ["/admin/perfil", /perfil/i],
    ["/admin/importar", /importar/i],
    ["/admin/sincronizacion", /sincronización/i],
  ] as const) {
    await page.goto(path);
    await expect(chip(page), path).toHaveAttribute("data-sync-state", "offline");
    await expect(page.locator("#ad-title, h1").first(), path).toContainText(heading);
  }

  // Detalle nunca abierto: reserva que este navegador no ha visitado.
  await page.goto(`/admin/reservas/${otherReservation}`);
  await expect(page.getByText(`Huésped ${TAG}`).first()).toBeVisible();

  // Navegación con enlaces del menú (Next intenta pedir la página al servidor y cae a la copia guardada).
  await page.goto("/admin/reservas");
  await page.locator('[data-nav="clientes"]:visible').first().click();
  await expect(page).toHaveURL(/\/admin\/clientes/);
  await expect(page.locator("#ad-title, h1").first()).toContainText(/clientes/i);

  // Búsqueda y filtro sobre lo local.
  await page.goto("/admin/reservas");
  await expect(page.getByText(reservation).first()).toBeVisible();
});

test("3, 4 y 5. Crear, editar y eliminar sin conexión: nada llega aún al servidor", async () => {
  await page.goto("/admin/bloqueos");
  // Crear.
  await createBlockUI(page, cabinName, "2027-12-10", "2027-12-12", `${TAG}-creado`);
  await expect(page.getByText("Guardado en este dispositivo").first()).toBeVisible();

  // Editar un bloqueo que ya existía.
  const toEdit = page.locator("li:visible, tr:visible").filter({ hasText: `${TAG}-a-editar` });
  await toEdit.getByRole("button", { name: "Editar" }).click();
  await page
    .getByRole("dialog")
    .getByLabel(/Descripción/)
    .fill(`${TAG}-editado`);
  await page.getByRole("dialog").getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText(`${TAG}-editado`).first()).toBeVisible();

  // Eliminar otro.
  const toDelete = page.locator("li:visible, tr:visible").filter({ hasText: `${TAG}-a-borrar` });
  await toDelete.getByRole("button", { name: /^Eliminar bloqueo/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar bloqueo" }).click();
  await expect(page.getByText(`${TAG}-a-borrar`)).toHaveCount(0);

  await page.goto(`/admin/reservas/${reservation}`);
  await addNote(page, `${TAG}-nota-1`);
  await expect(page.getByText("Guardado en este dispositivo").first()).toBeVisible();
  await addNote(page, `${TAG}-nota-2`);

  // Nada de esto llegó al servidor.
  expect(await notesOf(reservation)).toEqual([]);
  const { data: created } = await db.from("blocks").select("id").eq("notes", `${TAG}-creado`);
  expect(created).toEqual([]);
  expect((await blockRow(offlineEdit))?.notes).toBe(`${TAG}-a-editar`);
  expect(await blockRow(offlineDelete)).not.toBeNull();
});

test("6. Recargar y reabrir sin conexión conserva todo", async () => {
  await page.reload();
  await expect(chip(page)).toHaveAttribute("data-sync-state", "offline");
  await expect(page.getByText(`${TAG}-nota-1`).first()).toBeVisible();
  await expect(page.getByText(`${TAG}-nota-2`).first()).toBeVisible();
  await expect(chip(page)).toContainText(/5 pendientes/);

  // Cerrar la pestaña y abrir otra: como cerrar el panel.
  await page.close();
  page = await context.newPage();
  await page.goto("/admin/sincronizacion");
  await expect(chip(page)).toContainText(/5 pendientes/);
  await expect(page.locator("[data-pending]")).toHaveCount(5);
  await page.goto("/admin/bloqueos");
  await expect(page.getByText(`${TAG}-creado`).first()).toBeVisible();
  await expect(page.getByText(`${TAG}-editado`).first()).toBeVisible();
  await expect(page.getByText(`${TAG}-a-borrar`)).toHaveCount(0);
});

test("7. Al volver la conexión se sincroniza solo, en orden", async () => {
  await context.setOffline(false);
  await expect(chip(page)).toHaveAttribute("data-sync-state", "online", { timeout: 30_000 });
  await expect.poll(async () => (await notesOf(reservation)).map((n) => n.text).sort()).toEqual([`${TAG}-nota-1`, `${TAG}-nota-2`]);
  const { data: created } = await db.from("blocks").select("id, cabin_type_id, unit").eq("notes", `${TAG}-creado`);
  expect(created).toHaveLength(1);
  await expect.poll(async () => (await blockRow(offlineEdit))?.notes).toBe(`${TAG}-editado`);
  await expect.poll(() => blockRow(offlineDelete)).toBeNull();
  await expect(page.getByText("Guardado en este dispositivo")).toHaveCount(0);
  await page.goto("/admin/sincronizacion");
  await expect(page.getByText("Todo sincronizado")).toBeVisible();
});

test("8. Errores del servidor y respuesta perdida: reintenta sin duplicar", async () => {
  await page.goto(`/admin/reservas/${reservation}`);
  await context.setOffline(true);
  await expect(chip(page)).toHaveAttribute("data-sync-state", "offline");
  await addNote(page, `${TAG}-nota-reintento`);

  // Primero el servidor falla dos veces; luego aplica el cambio y la respuesta se pierde; luego responde.
  let calls = 0;
  const seenKeys = new Set<string>();
  await page.route("**/api/admin/action", async (route) => {
    calls++;
    seenKeys.add(route.request().headers()["idempotency-key"]);
    if (calls <= 2) return route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"SERVER_ERROR"}' });
    if (calls === 3) {
      await route.fetch();
      return route.abort("connectionreset");
    }
    return route.continue();
  });
  await context.setOffline(false);
  await expect.poll(() => calls, { timeout: 60_000 }).toBeGreaterThanOrEqual(4);
  await expect(chip(page)).toHaveAttribute("data-sync-state", "online", { timeout: 60_000 });
  await page.unroute("**/api/admin/action");

  expect(seenKeys.size).toBe(1); // la misma clave en todos los intentos
  const notes = (await notesOf(reservation)).filter((n) => n.text === `${TAG}-nota-reintento`);
  expect(notes).toHaveLength(1); // ni perdida ni duplicada
});

test("Pago con respuesta perdida: se registra una sola vez, con la fecha real", async () => {
  const at = new Date(Date.now() - 2 * 3600e3).toISOString();
  let calls = 0;
  await page.route("**/api/admin/action", async (route) => {
    calls++;
    if (calls === 1) {
      await route.fetch();
      return route.abort("connectionreset");
    }
    return route.continue();
  });
  // Dos envíos con la misma clave, como hace el motor al reintentar.
  const key = crypto.randomUUID();
  const body = { code: reservation, action: "balance", amount: 100, basePaid: 0 };
  const headers = { "Idempotency-Key": key, "X-Occurred-At": at };
  const first = await api(page, "POST", "/admin/action", body, headers).catch(() => null);
  expect(first).toBeNull();
  await page.unroute("**/api/admin/action");
  const second = await api(page, "POST", "/admin/action", body, headers);
  expect(second.status).toBe(200);
  const payments = await paymentsOf(reservation);
  expect(payments).toHaveLength(1);
  expect(Math.abs(Date.parse(payments[0].approved_at!) - Date.parse(at))).toBeLessThan(2000);
});

test("9. Dos usuarios: campos distintos se funden, mismo campo queda por revisar", async () => {
  const other = await context.browser()!.newContext({ baseURL: test.info().project.use.baseURL, locale: "es-CO" });
  const otherPage = await other.newPage();
  await login(otherPage, RECEPCION);

  const put = async (from: Page, patch: object, version: number) => {
    const row = (await blockRow(editBlock))!;
    return api(
      from,
      "PUT",
      "/admin/blocks",
      { id: editBlock, cabinTypeId: row.cabin_type_id, unit: row.unit, from: row.from_date, to: row.to_date, reason: row.reason, notes: row.notes, ...patch },
      { "X-Base-Version": String(version) },
    );
  };

  // El servidor rechaza una versión vieja: nadie sobrescribe en silencio.
  const v1 = (await blockRow(editBlock))!.version;
  expect((await put(otherPage, { notes: `${TAG}-recepcion` }, v1)).status).toBe(200);
  expect((await put(otherPage, { notes: `${TAG}-vieja` }, v1)).status).toBe(409);
  expect((await blockRow(editBlock))!.notes).toBe(`${TAG}-recepcion`);

  // Sin conexión, el administrador edita el bloqueo; la recepción cambia otro campo: se funden.
  await page.goto("/admin/bloqueos");
  await expect(chip(page)).toHaveAttribute("data-sync-state", "online");
  await expect(page.getByText(`${TAG}-recepcion`).first()).toBeVisible({ timeout: 20_000 });
  await context.setOffline(true);
  await expect(chip(page)).toHaveAttribute("data-sync-state", "offline");
  const row = page
    .locator("li:visible, tr:visible")
    .filter({ hasText: `${TAG}-recepcion` })
    .filter({ has: page.getByRole("button", { name: "Editar" }) });
  await row.getByRole("button", { name: "Editar" }).first().click();
  await page
    .getByRole("dialog")
    .getByLabel(/Descripción/)
    .fill(`${TAG}-del-admin`);
  await page.getByRole("dialog").getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText(`${TAG}-del-admin`).first()).toBeVisible();

  const v2 = (await blockRow(editBlock))!.version;
  expect((await put(otherPage, { reason: "Uso propio" }, v2)).status).toBe(200);
  await context.setOffline(false);
  await expect.poll(async () => (await blockRow(editBlock))!.notes, { timeout: 30_000 }).toBe(`${TAG}-del-admin`);
  expect((await blockRow(editBlock))!.reason).toBe("Uso propio"); // los dos cambios sobreviven
  await expect(chip(page)).toHaveAttribute("data-sync-state", "online");

  // Mismo campo: por revisar, con los dos valores.
  await page.goto("/admin/bloqueos");
  await expect(page.getByText(`${TAG}-del-admin`).first()).toBeVisible();
  await context.setOffline(true);
  await expect(chip(page)).toHaveAttribute("data-sync-state", "offline");
  const row2 = page
    .locator("li:visible, tr:visible")
    .filter({ hasText: `${TAG}-del-admin` })
    .filter({ has: page.getByRole("button", { name: "Editar" }) });
  await row2.getByRole("button", { name: "Editar" }).first().click();
  await page
    .getByRole("dialog")
    .getByLabel(/Descripción/)
    .fill(`${TAG}-mio`);
  await page.getByRole("dialog").getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText(`${TAG}-mio`).first()).toBeVisible();

  const v3 = (await blockRow(editBlock))!.version;
  expect((await put(otherPage, { notes: `${TAG}-suyo` }, v3)).status).toBe(200);
  await context.setOffline(false);
  await expect(chip(page)).toHaveAttribute("data-sync-state", "conflict", { timeout: 30_000 });
  expect((await blockRow(editBlock))!.notes).toBe(`${TAG}-suyo`); // no se sobrescribió
  await page.goto("/admin/sincronizacion");
  await expect(page.getByText(`${TAG}-mio`)).toBeVisible();
  await expect(page.getByText(`${TAG}-suyo`)).toBeVisible();

  // Decidir: usar lo mío.
  await page.getByRole("button", { name: "Usar lo mío" }).click();
  await expect.poll(async () => (await blockRow(editBlock))!.notes, { timeout: 30_000 }).toBe(`${TAG}-mio`);
  await expect(page.getByText("Todo sincronizado")).toBeVisible();

  // Registro borrado por otro usuario con cambios locales: no se pierde.
  const gone = deleteBlock;
  await page.goto("/admin/bloqueos");
  await context.setOffline(true);
  await expect(chip(page)).toHaveAttribute("data-sync-state", "offline");
  const row3 = page
    .locator("li:visible, tr:visible")
    .filter({ hasText: /jun/ })
    .filter({ hasText: TAG })
    .filter({ has: page.getByRole("button", { name: "Editar" }) });
  await row3.getByRole("button", { name: "Editar" }).first().click();
  await page
    .getByRole("dialog")
    .getByLabel(/Descripción/)
    .fill(`${TAG}-rescatado`);
  await page.getByRole("dialog").getByRole("button", { name: "Guardar cambios" }).click();
  await db.from("blocks").delete().eq("id", gone);
  await context.setOffline(false);
  await expect(chip(page)).toHaveAttribute("data-sync-state", "conflict", { timeout: 30_000 });
  await page.goto("/admin/sincronizacion");
  await page.getByRole("button", { name: "Crear de nuevo" }).click();
  await expect.poll(async () => (await db.from("blocks").select("id").eq("notes", `${TAG}-rescatado`)).data?.length, { timeout: 30_000 }).toBe(1);

  await other.close();
});

test("9b. Pago mientras otro registró otro: por revisar, sin cobrar dos veces en silencio", async () => {
  await page.goto(`/admin/reservas/${otherReservation}`);
  await expect(page.getByText(`Huésped ${TAG}`).first()).toBeVisible();
  await context.setOffline(true);
  await expect(chip(page)).toHaveAttribute("data-sync-state", "offline");

  // Registra el pago por la interfaz: todo lo que falta.
  await page
    .getByRole("button", { name: /registrar|pago/i })
    .first()
    .click();
  await page.getByRole("dialog").getByText("Efectivo").click();
  await page.getByRole("dialog").locator("button[type=submit]").click();
  await expect(page.getByText("Guardado en este dispositivo").first()).toBeVisible();
  expect(await paymentsOf(otherReservation)).toEqual([]);

  // Mientras tanto, otro usuario registra un pago en el servidor.
  const { error } = await db
    .rpc("register_manual_payment" as never, { p_code: otherReservation, p_kind: "balance", p_note: "otro", p_amount: 50 } as never)
    .then(
      (r) => r,
      (e) => ({ error: e }),
    );
  const direct = error ? await db.from("reservations").update({ paid_amount: 50 }).eq("code", otherReservation) : null;
  expect(direct?.error ?? null).toBeNull();

  await context.setOffline(false);
  await expect(chip(page)).toHaveAttribute("data-sync-state", "conflict", { timeout: 30_000 });
  await page.goto("/admin/sincronizacion");
  await expect(page.getByText(/otro pago/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Reintentar" }).first().isVisible();
  // Se descarta explícitamente: era el mismo dinero.
  await page.getByRole("button", { name: "Descartar" }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByText("Todo sincronizado")).toBeVisible();
  const { data } = await db.from("reservations").select("paid_amount").eq("code", otherReservation).single();
  expect(data?.paid_amount).toBe(50);
});

test("11. Aislamiento: otra cuenta no ve ni envía lo de esta, y el servidor rechaza operaciones ajenas", async ({ browser }) => {
  const iso = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "es-CO" });
  const p = await iso.newPage();
  await login(p, ADMIN);
  await waitForShell(p);

  // El administrador deja un cambio sin enviar y pierde la sesión estando sin conexión.
  await p.goto(`/admin/reservas/${reservation}`);
  await iso.setOffline(true);
  await expect(chip(p)).toHaveAttribute("data-sync-state", "offline");
  await addNote(p, `${TAG}-nota-aislada`);
  await iso.clearCookies();
  await iso.setOffline(false);

  // Entra la recepción en el mismo navegador.
  await expect(p.getByLabel("Correo")).toBeVisible({ timeout: 30_000 });
  await p.getByLabel("Correo").fill(RECEPCION.email);
  await p.getByLabel("Contraseña", { exact: true }).fill(RECEPCION.password);
  await p.getByRole("button", { name: /^(ingresar|entrar)/i }).click();
  await expect(chip(p)).toHaveAttribute("data-sync-state", "online");

  expect((await localDbNames(p)).length).toBe(2); // una base por cuenta
  await p.goto("/admin/sincronizacion");
  await expect(p.getByText("Todo sincronizado")).toBeVisible();
  await expect(p.getByText(`${TAG}-nota-aislada`)).toHaveCount(0);
  expect((await notesOf(reservation)).some((n) => n.text === `${TAG}-nota-aislada`)).toBe(false); // nunca se envió con otra sesión

  // Sin datos de empleados ni módulos de administrador.
  await p.goto("/admin/empleados");
  await expect(p.getByText(/rol no incluye esta sección/i).first()).toBeVisible();

  // El servidor: una operación ya usada por otra cuenta se rechaza; los permisos se revalidan.
  const { data: ops } = await db.from("sync_ops").select("op_id, user_id").limit(1);
  const { data: me } = await db.auth.admin.listUsers();
  const recepcionId = me.users.find((u) => u.email === RECEPCION.email)!.id;
  const foreign = (await db.from("sync_ops").select("op_id").neq("user_id", recepcionId).limit(1)).data?.[0]?.op_id ?? ops?.[0]?.op_id;
  expect(foreign).toBeTruthy();
  const stolen = await api(p, "POST", "/admin/action", { code: reservation, action: "note", text: `${TAG}-robada` }, { "Idempotency-Key": foreign! });
  expect(stolen.status).toBe(403);
  expect(stolen.data.error).toBe("OP_FOREIGN");
  const bid = await seedBlock(cabin, Math.min(2, units), "2097-09-01", "2097-09-02");
  expect((await api(p, "DELETE", `/admin/blocks?id=${bid}`)).status).toBe(403);
  expect(await blockRow(bid)).not.toBeNull();
  expect((await api(p, "GET", "/admin/employees")).status).toBe(403);

  // Al volver el administrador, su cambio sale con su propia sesión.
  await p.evaluate(() => fetch("/api/admin/logout", { method: "POST" }));
  await iso.clearCookies();
  await p.goto("/admin");
  await p.getByLabel("Correo").fill(ADMIN.email);
  await p.getByLabel("Contraseña", { exact: true }).fill(ADMIN.password);
  await p.getByRole("button", { name: /^(ingresar|entrar)/i }).click();
  await expect.poll(async () => (await notesOf(reservation)).some((n) => n.text === `${TAG}-nota-aislada`), { timeout: 30_000 }).toBe(true);
  await iso.close();
});

test("10 y 12. Tras sincronizar, lo local coincide con el servidor y el panel sigue normal", async () => {
  await page.goto("/admin/reservas");
  await expect(chip(page)).toHaveAttribute("data-sync-state", "online");
  const server = await api(page, "GET", "/admin/data");
  expect(server.status).toBe(200);
  const local = await page.evaluate(async () => {
    const name = (await indexedDB.databases()).find((d) => d.name?.startsWith("vf-"))!.name!;
    const database = await new Promise<IDBDatabase>((ok) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => ok(r.result);
    });
    const rows = await new Promise<{ collection: string; key: string; row: { version?: number } }[]>((ok) => {
      const r = database.transaction("rows").objectStore("rows").getAll();
      r.onsuccess = () => ok(r.result);
    });
    database.close();
    return rows
      .filter((r) => r.collection === "reservations" || r.collection === "blocks")
      .map((r) => `${r.collection}:${r.key}:${r.row.version}`)
      .sort();
  });
  await page.evaluate(() => new Promise((ok) => setTimeout(ok, 500)));
  const expected = [
    ...server.data.reservations.map((r: { code: string; version: number }) => `reservations:${r.code}:${r.version}`),
    ...server.data.blocks.map((b: { id: string; version: number }) => `blocks:${b.id}:${b.version}`),
  ].sort();
  expect(local).toEqual(expected);

  // El panel en línea sigue normal: una escritura responde lo del servidor, sin marcas.
  await page.goto(`/admin/reservas/${reservation}`);
  await addNote(page, `${TAG}-en-linea`);
  await expect(page.getByText("Guardado en este dispositivo")).toHaveCount(0);
  await expect.poll(async () => (await notesOf(reservation)).some((n) => n.text === `${TAG}-en-linea`)).toBe(true);
  const notes = await notesOf(reservation);
  expect(new Set(notes.map((n) => n.text)).size).toBe(notes.length); // sin duplicados
});
