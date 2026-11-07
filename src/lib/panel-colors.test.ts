import { describe, expect, it } from "vitest";
import { THEME_PRESETS, themeIssues } from "@/lib/theme";
import { DEFAULT_PANEL_COLORS, PANEL_PRESETS, mergePanelColors, panelColorIssues, panelColorsCss } from "@/lib/panel-colors";

describe("colores del panel", () => {
  it("con la paleta original no escribe nada: manda app/globals.css", () => {
    expect(panelColorsCss(DEFAULT_PANEL_COLORS)).toBe("");
  });

  it("solo escribe lo que cambia, en el modo que corresponde", () => {
    const css = panelColorsCss({ ...DEFAULT_PANEL_COLORS, canvas: "#ffffff" });
    expect(css).toContain("--color-canvas:#ffffff");
    expect(css).not.toContain('[data-admin-theme="dark"]{');
    expect(css).not.toContain("--color-ink");
  });

  it("el menú lateral y los acentos también aplican en modo oscuro", () => {
    const css = panelColorsCss({ ...DEFAULT_PANEL_COLORS, sidebar: "#12233f", blue: "#336699" });
    const dark = css.slice(css.indexOf(':root[data-admin-theme="dark"]'));
    expect(dark).toContain("--color-sidebar:#12233f");
    expect(dark).toContain("--color-blue:color-mix");
    expect(dark).toContain("--color-info:color-mix");
  });

  it("ignora valores que no son colores (lo guardado llega a una hoja de estilos)", () => {
    const c = mergePanelColors({ ink: "red;}body{display:none", canvas: "#ABC", otra: "#000000" });
    expect(c.ink).toBe(DEFAULT_PANEL_COLORS.ink);
    expect(c.canvas).toBe("#aabbcc");
    expect(c).not.toHaveProperty("otra");
  });

  it.each(PANEL_PRESETS.map((p) => [p.label, p.colors] as const))("la paleta %s se lee bien", (_, colors) => {
    expect(panelColorIssues(colors)).toEqual([]);
  });

  it.each(THEME_PRESETS.map((p) => [p.label, p.theme] as const))("la paleta del sitio %s se lee bien", (_, theme) => {
    expect(themeIssues(theme)).toEqual([]);
  });

  it("advierte las combinaciones difíciles de leer", () => {
    expect(panelColorIssues({ ...DEFAULT_PANEL_COLORS, sidebar: "#ffffff" }).map((x) => x.label)).toEqual(["Texto del menú lateral"]);
  });
});
