import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { baseVersionOf, fail, json, readJson, requireAdmin, syncRoute } from "@/lib/server/http";
import { loadSiteContent } from "@/lib/server/site";
import { PANEL_COLOR_KEYS, mergePanelColors, type PanelColors } from "@/lib/panel-colors";
import { normalizeHex } from "@/lib/theme";

// PUT /api/admin/panel-colors { ink, sidebar, … } → colores del panel, para todo el equipo. Se guardan junto a los del
// sitio (site_settings.theme.panel), que no cambian. El contraste se advierte en el panel, no se bloquea.
export const PUT = syncRoute(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin("content");
  if (error) return error;
  const b = await readJson<PanelColors>(req);
  if (!b || typeof b !== "object") return fail(400, "INVALID_BODY");
  if (PANEL_COLOR_KEYS.some((k) => k in b && !normalizeHex(b[k])))
    return fail(422, "VALIDATION_ERROR", { fields: { colors: "Los colores deben tener el formato #RRGGBB." } });

  const { data: current } = await sb.from("site_settings").select("theme, version").maybeSingle().throwOnError();
  if (!current) return fail(409, "SITE_NOT_CONFIGURED");
  const base = baseVersionOf(req);
  if (base !== null && current.version !== base) return fail(409, "VERSION_CONFLICT");
  const theme = (current.theme && typeof current.theme === "object" ? current.theme : {}) as Record<string, never>;
  await sb
    .from("site_settings")
    .update({ theme: { ...theme, panel: mergePanelColors(b) } })
    .eq("id", true)
    .throwOnError();

  revalidatePath("/", "layout");
  return json(await loadSiteContent(sb));
});
