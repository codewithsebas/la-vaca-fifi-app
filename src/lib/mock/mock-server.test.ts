import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityPage, AdminData, Employee, Reservation } from "@/lib/types";

// Almacenamiento del navegador en memoria (el modo simulado guarda todo en localStorage y sessionStorage).
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

vi.mock("@/lib/format", async (orig) => ({ ...(await orig<typeof import("@/lib/format")>()), sleep: () => Promise.resolve() }));

const { mockRequest } = await import("@/lib/mock/mock-server");
const login = (email: string) => mockRequest("POST", "/admin/login", { body: { email, password: "x" } });

describe("modo simulado: superadministrador y registro de actividad", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
  });

  it("un administrador no crea superadministradores ni ve el registro", async () => {
    await login("jefe@lavacafifi.test");
    const created = await mockRequest("POST", "/admin/employees", {
      body: { email: "s@lavacafifi.test", name: "Súper", role: "superadmin", password: "12345678" },
    });
    expect(created.status).toBe(403);
    expect((await mockRequest("GET", "/admin/activity", {})).status).toBe(403);
  });

  it("un superadministrador crea uno y el administrador no puede cambiarlo", async () => {
    await login("super@lavacafifi.test");
    const r = await mockRequest("POST", "/admin/employees", { body: { email: "s2@lavacafifi.test", name: "Otra", role: "superadmin", password: "12345678" } });
    expect(r.status).toBe(201);
    const target = (r.data as Employee[]).find((e) => e.email === "s2@lavacafifi.test")!;

    await mockRequest("POST", "/admin/logout", {});
    await login("jefe@lavacafifi.test");
    // El administrador entra con otra cuenta del mismo navegador: la lista simulada se conserva.
    expect((await mockRequest("PUT", "/admin/employees", { body: { id: target.id, active: false } })).status).toBe(403);
    expect((await mockRequest("PUT", "/admin/employees", { body: { id: target.id, role: "admin" } })).status).toBe(403);
    expect((await mockRequest("DELETE", "/admin/employees", { query: { id: target.id } })).status).toBe(403);
  });

  it("registra inicios de sesión y cambios, y los filtra", async () => {
    await login("super@lavacafifi.test");
    await mockRequest("POST", "/admin/login", { body: { email: "nadie@lavacafifi.test", password: "" } }); // fallido
    await mockRequest("POST", "/admin/employees", { body: { email: "r@lavacafifi.test", name: "Recep", role: "recepcion", password: "12345678" } });

    const sessions = (await mockRequest("GET", "/admin/activity", { query: { view: "sessions" } })).data as ActivityPage;
    expect(sessions.items.map((e) => e.action)).toEqual(["login_failed", "login"]);

    const changes = (await mockRequest("GET", "/admin/activity", { query: { entity: "employees" } })).data as ActivityPage;
    expect(changes.total).toBe(1);
    expect(changes.items[0]).toMatchObject({ action: "insert", entity: "employees", actor: { role: "superadmin" } });
    expect(changes.items[0].changes?.password).toEqual(["…", "nueva"]);
  });
});

describe("modo simulado: cierre automático de estadías", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
  });

  it("cierra las estadías vencidas, da por pagado lo que faltaba y avisa una vez", async () => {
    await login("jefe@lavacafifi.test");
    const data = (await mockRequest("GET", "/admin/data", {})).data as AdminData;
    const out = data.site.settings.checkOutTime.slice(0, 5);
    const past = (r: Reservation) => Date.now() >= Date.parse(`${r.checkOut}T${out}:00-05:00`) + 30 * 60e3;

    // Ninguna estadía vencida queda abierta.
    expect(data.reservations.filter((r) => ["confirmed", "rescheduled", "checked_in"].includes(r.status) && past(r))).toEqual([]);
    const closed = data.reservations.filter((r) => r.autoClosedAt);
    expect(closed.length).toBeGreaterThan(0);
    for (const r of closed) {
      expect(r.status).toBe("completed");
      expect(r.paid).toBe(r.quote.total);
      expect(r.balancePaidAt).toBeTruthy();
      expect(r.checkedInAt).toBeTruthy();
    }
    const auto = data.payments.filter((p) => p.provider === "auto");
    expect(auto.every((p) => closed.some((r) => r.code === p.reservationCode))).toBe(true);
    expect(data.notifications.filter((n) => n.kind === "auto_closed")).toHaveLength(1);

    // Otra pasada no vuelve a cobrar ni a avisar.
    const again = (await mockRequest("GET", "/admin/data", {})).data as AdminData;
    expect(again.payments.filter((p) => p.provider === "auto")).toHaveLength(auto.length);
    expect(again.notifications.filter((n) => n.kind === "auto_closed")).toHaveLength(1);
  });
});
