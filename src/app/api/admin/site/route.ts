import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { baseVersionOf, fail, json, readJson, requireAdmin, syncRoute } from "@/lib/server/http";
import { loadSiteContent } from "@/lib/server/site";
import { TEXT_LIMITS, lines, listIssue, mergeTexts } from "@/lib/site";
import { THEME_KEYS, mergeTheme, normalizeHex } from "@/lib/theme";
import type { SiteInput } from "@/lib/types";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const URL_OK = /^https:\/\/[^\s]+$/;

// PUT /api/admin/site { settings, policies, content, theme } → horarios, contacto, RNT, políticas, textos y colores. Regenera todo el sitio.
// El abono y las instrucciones de pago no se tocan aquí: tienen su página (Condiciones de pago, /api/admin/payment-terms).
export const PUT = syncRoute(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin("content");
  if (error) return error;
  const b = await readJson<SiteInput>(req);
  const s = b?.settings;
  if (!b || !s || !Array.isArray(b.policies)) return fail(400, "INVALID_BODY");

  const phones = (Array.isArray(s.phones) ? s.phones : []).map((p) => String(p).trim()).filter(Boolean);
  const whatsapp = String(s.whatsapp ?? "").replace(/\D/g, "");
  const errors: Record<string, string> = {};
  if (!TIME.test(s.checkInStart) || !TIME.test(s.checkInEnd) || s.checkInEnd <= s.checkInStart)
    errors.checkIn = "La hora final del check-in debe ser posterior a la inicial.";
  if (!TIME.test(s.checkOutTime)) errors.checkOut = "Hora de check-out no válida.";
  if (!phones.length || phones.length > 5 || phones.some((p) => !/^[\d\s()+-]{7,20}$/.test(p)))
    errors.phones = "Escribe entre 1 y 5 teléfonos (solo números y espacios).";
  if (!/^\d{10,15}$/.test(whatsapp)) errors.whatsapp = "El WhatsApp debe incluir el indicativo del país, por ejemplo 573144001279.";
  if (String(s.rnt ?? "").length > 30) errors.rnt = "El RNT es demasiado largo.";

  const policies = b.policies.map((p, i) => ({ id: String(p.id ?? ""), question: String(p.q ?? "").trim(), answer: String(p.a ?? "").trim(), sort: i + 1 }));
  if (!policies.length || policies.length > 20) errors.policies = "Debe haber entre 1 y 20 políticas.";
  else if (policies.some((p) => !UUID.test(p.id) || !p.question || p.question.length > 120 || !p.answer || p.answer.length > 2000))
    errors.policies = "Cada política necesita un título (máx. 120 caracteres) y un texto (máx. 2000).";
  // Textos: solo las claves conocidas; cada una con su límite. Las redes sociales deben ser enlaces https.
  const t = mergeTexts(b.content);
  const trim = (v: string) => v.trim();
  // Listas: un elemento por línea, sin líneas vacías.
  const list = (v: string) => lines(v).join("\n");
  const texts = {
    hero: {
      title: trim(t.hero.title),
      highlight: trim(t.hero.highlight),
      words: list(t.hero.words),
      badge: trim(t.hero.badge),
      description: trim(t.hero.description),
    },
    rating: { score: trim(t.rating.score), reviews: trim(t.rating.reviews), source: trim(t.rating.source) },
    mosaic: { labels: list(t.mosaic.labels) },
    stay: { highlights: list(t.stay.highlights) },
    restaurant: {
      title: trim(t.restaurant.title),
      highlight: trim(t.restaurant.highlight),
      description: trim(t.restaurant.description),
      items: list(t.restaurant.items),
    },
    location: { note: trim(t.location.note) },
    payment: { instructions: trim(t.payment.instructions) },
    social: { instagram: trim(t.social.instagram), facebook: trim(t.social.facebook), tiktok: trim(t.social.tiktok) },
  };
  if (!texts.hero.title || texts.hero.title.length > TEXT_LIMITS.title || texts.hero.highlight.length > TEXT_LIMITS.highlight)
    errors.hero = "El título de la portada es obligatorio (máximo 40 caracteres por línea).";
  const words = listIssue(texts.hero.words, "words");
  if (words) errors.heroWords = `Frases del título: ${words.toLowerCase()}`;
  if (
    !texts.rating.score ||
    texts.rating.score.length > TEXT_LIMITS.ratingScore ||
    !/^\d{1,6}$/.test(texts.rating.reviews) ||
    !texts.rating.source ||
    texts.rating.source.length > TEXT_LIMITS.ratingSource
  )
    errors.rating = "La calificación necesita la nota, el número de reseñas (solo números) y dónde se calificó.";
  const labels = listIssue(texts.mosaic.labels, "labels");
  if (labels) errors.mosaic = `Etiquetas del mosaico: ${labels.toLowerCase()}`;
  const stay = listIssue(texts.stay.highlights, "highlights");
  if (stay || !texts.stay.highlights) errors.stay = `Lo que incluye la estadía: ${(stay ?? "escribe al menos una línea.").toLowerCase()}`;
  const items = listIssue(texts.restaurant.items, "items");
  if (
    !texts.restaurant.title ||
    texts.restaurant.title.length > TEXT_LIMITS.restaurantTitle ||
    texts.restaurant.highlight.length > TEXT_LIMITS.restaurantHighlight ||
    texts.restaurant.description.length > TEXT_LIMITS.restaurantDescription ||
    items
  )
    errors.restaurant = "Revisa los textos del restaurante: el título es obligatorio y cada texto tiene un largo máximo.";
  if (texts.hero.badge.length > TEXT_LIMITS.badge || texts.hero.description.length > TEXT_LIMITS.description)
    errors.heroText = "La etiqueta o la descripción de la portada es demasiado larga.";
  if (texts.location.note.length > TEXT_LIMITS.note) errors.location = "La nota de ubicación es demasiado larga.";
  if (Object.values(texts.social).some((u) => u && (!URL_OK.test(u) || u.length > TEXT_LIMITS.url)))
    errors.social = "Las redes sociales deben ser enlaces completos que empiecen por https://";
  // Colores: cada clave conocida debe ser un color #rrggbb (el contraste se advierte en el panel, no se bloquea).
  // Sin `theme` (un panel abierto antes de existir los colores) se conservan los guardados.
  const rawTheme = (b.theme && typeof b.theme === "object" ? b.theme : {}) as Record<string, unknown>;
  if (THEME_KEYS.some((k) => k in rawTheme && !normalizeHex(rawTheme[k]))) errors.theme = "Los colores deben tener el formato #RRGGBB.";
  const theme = mergeTheme(rawTheme);
  if (Object.keys(errors).length) return fail(422, "VALIDATION_ERROR", { fields: errors });

  // Las instrucciones de pago guardadas se conservan (las edita Condiciones de pago).
  const { data: current } = await sb.from("site_settings").select("content, version").maybeSingle().throwOnError();
  const base = baseVersionOf(req);
  if (base !== null && current && current.version !== base) return fail(409, "VERSION_CONFLICT");
  texts.payment = mergeTexts(current?.content).payment;

  await sb
    .from("site_settings")
    .upsert({
      id: true,
      check_in_start: s.checkInStart,
      check_in_end: s.checkInEnd,
      check_out_time: s.checkOutTime,
      phones,
      whatsapp,
      rnt: String(s.rnt ?? "").trim(),
      content: texts,
      ...(b.theme !== undefined && { theme }),
    })
    .throwOnError();
  // Primero se guardan las políticas y luego se borran las que ya no están: nunca queda la lista vacía.
  await sb.from("site_policies").upsert(policies).throwOnError();
  await sb
    .from("site_policies")
    .delete()
    .not("id", "in", `(${policies.map((p) => p.id).join(",")})`)
    .throwOnError();

  revalidatePath("/", "layout");
  return json(await loadSiteContent(sb));
});
