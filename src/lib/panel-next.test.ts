import { describe, expect, it } from "vitest";
import { panelNext } from "@/lib/panel-next";

describe("panelNext", () => {
  it("vuelve a la ruta del panel de ?next=", () => {
    expect(panelNext("/admin/reservas")).toBe("/admin/reservas");
    expect(panelNext("/admin?tab=hoy")).toBe("/admin?tab=hoy");
    expect(panelNext("/admin")).toBe("/admin");
  });

  it("lleva al inicio del panel con cualquier otra cosa", () => {
    for (const next of [undefined, null, "", ["/admin/x"], "/", "/reservar", "/administrador", "//evil.com/admin", "https://evil.com/admin"])
      expect(panelNext(next)).toBe("/admin");
  });
});
