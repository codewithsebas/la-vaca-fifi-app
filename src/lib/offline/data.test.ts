import { describe, expect, it } from "vitest";
import { dataOf, type Row } from "@/lib/offline/data";
import { DEFAULT_PANEL_COLORS } from "@/lib/panel-colors";
import type { PanelUser } from "@/lib/types";

const me = { id: "u1" } as PanelUser;
const siteRow = (site: object): Row[] => [{ collection: "site", key: "site", row: site }];

describe("copia guardada en el dispositivo", () => {
  it("una copia anterior a los colores del panel abre con los del diseño", () => {
    expect(dataOf(siteRow({ version: 1 }), me)?.site.panelColors).toEqual(DEFAULT_PANEL_COLORS);
  });

  it("conserva los colores guardados", () => {
    const panelColors = { ...DEFAULT_PANEL_COLORS, ink: "#12233f" };
    expect(dataOf(siteRow({ version: 1, panelColors }), me)?.site.panelColors).toEqual(panelColors);
  });
});
