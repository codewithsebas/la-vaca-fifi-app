import "server-only";
import { cache } from "react";
import { DEFAULT_PHOTOS, defaultContent, mergeSite, mergeTexts, type SiteContent } from "@/lib/site";
import { mergeTheme } from "@/lib/theme";
import { createServiceClient, hasServiceConfig } from "@/lib/supabase/server";
import type { Db } from "@/lib/server/db";
import { env } from "@/lib/server/env";

export const PHOTO_BUCKET = "site-images";

export const photoUrl = (path: string) => `${env.supabaseUrl}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;

// "https://…/site-images/cabins/x/1.webp" → "cabins/x/1.webp" (solo URLs de este bucket).
export const photoPath = (url: string) => {
  const prefix = photoUrl("");
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
};

export async function loadSiteContent(sb: Db): Promise<SiteContent> {
  const [{ data: s }, { data: policies }, { data: photos }, { data: services }] = await Promise.all([
    sb.from("site_settings").select("*").maybeSingle().throwOnError(),
    sb.from("site_policies").select("id, question, answer").order("sort").throwOnError(),
    sb.from("site_photos").select("slot, path").throwOnError(),
    sb.from("site_services").select("id, title, description, icon, note, visible").order("sort").order("created_at").throwOnError(),
  ]);
  return {
    settings: s
      ? {
          checkInStart: s.check_in_start.slice(0, 5),
          checkInEnd: s.check_in_end.slice(0, 5),
          checkOutTime: s.check_out_time.slice(0, 5),
          phones: s.phones,
          whatsapp: s.whatsapp,
          rnt: s.rnt,
        }
      : defaultContent.settings,
    policies: policies.map((p) => ({ id: p.id, q: p.question, a: p.answer })),
    photos: Object.fromEntries(photos.map((p) => [p.slot, photoUrl(p.path)])),
    texts: mergeTexts(s?.content),
    // Todos, también los ocultos (el panel los necesita); las páginas públicas muestran solo los visibles.
    services,
    theme: mergeTheme(s?.theme),
  };
}

// Contenido para las páginas públicas (una consulta por render). Si Supabase no responde, valores del diseño. Los huecos
// sin foto subida muestran la del diseño (public/fotos) hasta que se suba una desde el panel; el panel lee
// loadSiteContent, así que ahí siguen apareciendo vacíos.
export const getSiteContent = cache(async (): Promise<SiteContent> => {
  if (!hasServiceConfig()) return defaultContent;
  try {
    const content = await loadSiteContent(createServiceClient());
    return { ...content, photos: { ...DEFAULT_PHOTOS, ...content.photos } };
  } catch (e) {
    console.error("No se pudo leer el contenido del sitio:", e);
    return defaultContent;
  }
});

export async function getSite() {
  const content = await getSiteContent();
  return { ...content, c: mergeSite(content.settings, content.policies, content.texts) };
}

// URL base del sitio para los enlaces que salen de él (correos).
export const siteUrl = (requestOrigin: string) => (env.siteUrl || requestOrigin).replace(/\/$/, "");
