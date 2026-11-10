import { describe, expect, it } from "vitest";
import { OPS } from "@/lib/offline/ops";
import { DEFAULT_THEME, themeCss, type SiteTheme } from "@/lib/theme";
import type { AdminData, SiteInput } from "@/lib/types";

const theme = { ...DEFAULT_THEME, bg: "#123456" };
const data = {
  site: {
    version: 1,
    settings: { depositPct: 30 },
    policies: [],
    photos: {},
    texts: { payment: { instructions: "Nequi" } },
    services: [],
    theme,
  },
} as unknown as AdminData;
const body = { settings: { depositPct: 50 }, policies: [], content: { hero: {} } } as unknown as SiteInput;
const op = { opId: "op-1", occurredAt: "2026-11-09T00:00:00.000Z" } as Parameters<(typeof OPS)[string]["apply"]>[2];

describe("site.save", () => {
  it("conserva los colores guardados cuando el panel no los envía", () => {
    const next = OPS["site.save"].apply(data, body, op);
    expect(next.site.theme).toEqual(theme);
  });

  it("no pisa el abono ni las instrucciones de pago", () => {
    const next = OPS["site.save"].apply(data, body, op);
    expect(next.site.settings.depositPct).toBe(30);
    expect(next.site.texts.payment.instructions).toBe("Nequi");
  });
});

describe("themeCss", () => {
  it("usa los colores por defecto si un navegador trae el sitio sin colores", () => {
    expect(themeCss(undefined as unknown as SiteTheme)).toContain(`--color-bg:${DEFAULT_THEME.bg}`);
  });
});
