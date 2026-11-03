import { expect, test } from "@playwright/test";

// Fase 0: la aplicación del panel abre sin red, también en una ruta con parámetro que nunca se visitó en este navegador.
const PAGES = ["/admin", "/admin/reservas", "/admin/reservas/VF-00000", "/admin/clientes/cc-00000", "/admin/cabanas/plantilla", "/admin/calendario"];

test("abre sin conexión una reserva nunca visitada e hidrata", async ({ page, context }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && /hydrat|minified react error/i.test(m.text())) problems.push(m.text());
  });

  await page.goto("/admin");
  await page.evaluate(async (pages) => {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    await navigator.serviceWorker.ready;
    await new Promise<void>((resolve) => {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = () => resolve();
      (reg.active ?? reg.waiting ?? reg.installing)!.postMessage({ type: "vf-precache", pages }, [port2]);
    });
  }, PAGES);
  // El service worker debe controlar la página antes de cortar la red.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.goto("/admin/reservas/VF-ABCDE");
  expect(new URL(page.url()).pathname).toBe("/admin/reservas/VF-ABCDE");
  // Sin datos locales el panel muestra su pantalla propia, no la página de error del navegador.
  const retry = page.getByRole("button", { name: /reintentar/i });
  await expect(retry).toBeVisible();
  // El botón responde: React hidrató sobre la copia guardada.
  await retry.click();
  expect(new URL(page.url()).pathname).toBe("/admin/reservas/VF-ABCDE");
  expect(problems).toEqual([]);

  await context.setOffline(false);
});
