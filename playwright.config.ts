import { defineConfig } from "@playwright/test";

const port = process.env.E2E_PORT ?? "3020";

// Pruebas reales del panel sin conexión: Chromium, build standalone y la base de QA. Uso local (necesitan .env.local y
// .env.test.local); una después de otra porque comparten datos de QA y el ciclo de sincronización.
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${port}`, serviceWorkers: "allow", locale: "es-CO", timezoneId: "America/Bogota", trace: "retain-on-failure" },
  webServer: { command: "node scripts/e2e-server.mjs", url: `http://127.0.0.1:${port}/admin`, reuseExistingServer: true, timeout: 60_000 },
});
