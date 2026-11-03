import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const QA = "tknhymkjuxmohywwaxnv";
const parse = (file: string) =>
  Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_0-9]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );

const env = parse(".env.local");
const test = parse(".env.test.local");
if (!env.NEXT_PUBLIC_SUPABASE_URL?.includes(QA)) throw new Error("Las pruebas solo corren contra QA.");

export const ADMIN = { email: test.E2E_ADMIN_EMAIL, password: test.E2E_ADMIN_PASSWORD };
export const RECEPCION = { email: test.E2E_RECEPCION_EMAIL, password: test.E2E_RECEPCION_PASSWORD };

// La base de QA vista por fuera del panel: para comprobar qué llegó de verdad al servidor.
export const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

export const TAG = `e2e-${Date.now().toString(36)}`;

export async function login(page: Page, who: { email: string; password: string }) {
  await page.goto("/admin");
  await page.getByLabel("Correo").fill(who.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: /^(ingresar|entrar)/i }).click();
  await expect(page.locator("[data-sync-state]:visible").first()).toBeVisible();
}

export const chip = (page: Page) => page.locator("[data-sync-state]:visible").first();

// Espera a que el service worker controle la página y termine de guardar la aplicación.
export async function waitForShell(page: Page) {
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.ready.then(() => true))).toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const shell = await caches.open("vacafifi-panel-shell-v1");
          const statics = await caches.open("vacafifi-panel-static-v1");
          const files = (await (await fetch("/sw-assets.json")).json()).files as string[];
          return (await shell.keys()).length >= 15 && (await statics.keys()).length >= files.length - 2;
        }),
      { timeout: 60_000, intervals: [1000] },
    )
    .toBe(true);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(chip(page)).toBeVisible();
}

export const localDbNames = (page: Page) =>
  page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name ?? "").filter((n) => n.startsWith("vf-")));

const quote = { base: 1000, extraGuests: 0, extraAmount: 0, total: 1000, deposit: 300, balance: 700, pricePerNight: 500, extraPerNight: 0, nights: 2 };

// Reserva importada y confirmada: no genera correos ni push.
export async function seedReservation(cabin: string, checkIn: string, checkOut: string) {
  const suffix = Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()
    .replace(/[01IO]/g, "Z")
    .padEnd(5, "Z");
  const code = `VF-${suffix}`;
  const { error } = await db.from("reservations").insert({
    code,
    source: "import",
    external_ref: `${TAG}-${code}`,
    status: "confirmed",
    cabin_type_id: cabin,
    unit: 1,
    check_in: checkIn,
    check_out: checkOut,
    adults: 2,
    children: 0,
    pet: { hasPet: false, smallBreedConfirmed: false },
    decoration: { requested: false, occasion: "", notes: "" },
    estimated_arrival: "15:00",
    guest_full_name: `Huésped ${TAG}`,
    guest_doc_type: "CC",
    guest_doc_number: `9${Math.floor(Math.random() * 1e8)}`,
    guest_email: "",
    guest_phone: "+573000000000",
    guest_city: "",
    special_requests: "",
    consents: { policies: false, dataProcessing: false, marketing: false },
    quote,
    deposit_due_at: new Date().toISOString(),
  });
  if (error) throw error;
  return code;
}

export async function seedBlock(cabin: string, unit: number, from: string, to: string, notes = TAG) {
  const { data, error } = await db
    .from("blocks")
    .insert({ cabin_type_id: cabin, unit, from_date: from, to_date: to, reason: "Mantenimiento", notes })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function cleanup() {
  // Todo lo etiquetado por estas pruebas, también lo que dejó una corrida interrumpida.
  await db.from("blocks").delete().like("notes", "e2e-%");
  await db.from("admin_notifications").delete().ilike("body", "%e2e-%");
  await db.from("admin_notifications").delete().ilike("title", "%e2e-%");
  await db.from("email_outbox").delete().eq("to_email", "delivered@resend.dev");
  await db.from("reservations").delete().like("external_ref", "e2e-%");
  await db.from("reservations").delete().like("guest_full_name", "%e2e-%");
  await db.from("client_entries").delete().like("text", "e2e-%");
  await db.from("client_profiles").delete().like("summary", "e2e-%");
}

// Una petición con la sesión de la página: la API real, como otro usuario conectado.
export const api = (page: Page, method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
  page.evaluate(
    async ({ method, path, body, headers }) => {
      const res = await fetch(`/api${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, data: await res.json().catch(() => null) };
    },
    { method, path, body, headers },
  );

// Agrega una nota desde la ficha de la reserva.
export async function addNote(page: Page, text: string) {
  await page.getByLabel("Nueva nota").fill(text);
  await page.getByRole("button", { name: "Agregar nota" }).click();
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(page.getByText(text).first()).toBeVisible();
  await expect(page.getByLabel("Nueva nota")).toHaveValue("");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
}

// Crea un bloqueo desde su formulario, en fechas lejanas (hay que avanzar el calendario).
export async function createBlockUI(page: Page, cabinName: string, from: string, to: string, notes: string) {
  await page.getByRole("button", { name: "Nuevo bloqueo" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#bk-dates").click();
  for (let i = 0; i < 48 && !(await page.locator(`[data-iso="${from}"]`).count()); i++)
    await page.getByRole("button", { name: /Mes(es)? siguientes?/ }).click();
  await page.locator(`[data-iso="${from}"]`).click();
  await page.locator(`[data-iso="${to}"]`).click();
  await dialog.getByLabel(/Descripción/).fill(notes);
  await dialog.getByRole("button", { name: "Bloquear fechas" }).click();
  await expect(page.getByText(notes).first()).toBeVisible();
}
