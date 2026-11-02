import type { NextRequest } from "next/server";
import { type Db, loadClients } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, requireStaff, route } from "@/lib/server/http";
import type { ClientProfileInput } from "@/lib/types";

// Valoración interna: exclusivamente administrativa. Ninguna ruta pública lee estas tablas.
const KEY = /^(CC|CE|Pasaporte|PPT):[A-Z0-9]{5,15}$/;
const TRUST = ["sin_evaluar", "alta", "media", "baja", "no_recomendado"];
const SEVERITY = ["leve", "moderada", "grave"];

// Solo se valoran clientes que existen (tienen al menos una reserva).
async function knownClient(sb: Db, key: unknown) {
  if (typeof key !== "string" || !KEY.test(key)) return null;
  const { count } = await sb.from("reservations").select("code", { count: "exact", head: true }).eq("client_key", key).throwOnError();
  return count ? key : null;
}

const profile = async (sb: Db, key: string) => json((await loadClients(sb, key))[key] ?? null);

// PUT /api/admin/clients { clientKey, rating, trust, tags, preferences, summary } → guarda la valoración.
export const PUT = route(async (req: NextRequest) => {
  const { sb, error } = await requireStaff();
  if (error) return error;
  const b = await readJson<ClientProfileInput & { clientKey: string }>(req);
  const key = await knownClient(sb, b?.clientKey);
  if (!b || !key) return fail(404, "CLIENT_NOT_FOUND");
  const tags = [...new Set((Array.isArray(b.tags) ? b.tags : []).map((t) => String(t).trim()).filter(Boolean))];
  const errors: Record<string, string> = {};
  if (b.rating !== null && (!Number.isInteger(b.rating) || b.rating < 1 || b.rating > 5)) errors.rating = "La valoración va de 1 a 5.";
  if (!TRUST.includes(b.trust)) errors.trust = "Elige un nivel de confianza.";
  if (tags.length > 20 || tags.some((t) => t.length > 30)) errors.tags = "Hasta 20 etiquetas de máximo 30 caracteres.";
  if (String(b.preferences ?? "").length > 2000 || String(b.summary ?? "").length > 2000) errors.text = "Los textos admiten hasta 2000 caracteres.";
  if (Object.keys(errors).length) return fail(422, "VALIDATION_ERROR", { fields: errors });
  await sb
    .from("client_profiles")
    .upsert({
      client_key: key,
      rating: b.rating,
      trust: b.trust,
      tags,
      preferences: String(b.preferences ?? "").trim(),
      summary: String(b.summary ?? "").trim(),
    })
    .throwOnError();
  return profile(sb, key);
});

// POST /api/admin/clients { clientKey, kind: "note" | "incident", severity, text, reservationCode } → agrega un registro.
export const POST = route(async (req: NextRequest) => {
  const { sb, error } = await requireStaff();
  if (error) return error;
  const b = await readJson<{ clientKey: string; kind: string; severity: string | null; text: string; reservationCode: string | null }>(req);
  const key = await knownClient(sb, b?.clientKey);
  if (!b || !key) return fail(404, "CLIENT_NOT_FOUND");
  const text = String(b.text ?? "").trim();
  const incident = b.kind === "incident";
  if (!["note", "incident"].includes(b.kind) || !text || text.length > 2000 || (incident && !SEVERITY.includes(String(b.severity))))
    return fail(400, "INVALID_BODY");
  let code: string | null = null;
  if (b.reservationCode) {
    const { data } = await sb.from("reservations").select("code").eq("code", b.reservationCode).eq("client_key", key).maybeSingle().throwOnError();
    code = data?.code ?? null;
  }
  await sb.from("client_profiles").upsert({ client_key: key }, { onConflict: "client_key", ignoreDuplicates: true }).throwOnError();
  await sb
    .from("client_entries")
    .insert({ client_key: key, kind: b.kind, severity: incident ? b.severity : null, text, reservation_code: code })
    .throwOnError();
  return profile(sb, key);
});

// DELETE /api/admin/clients?entry=<id> → borra un registro.
export const DELETE = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin("delete");
  if (error) return error;
  const id = Number(req.nextUrl.searchParams.get("entry"));
  if (!Number.isInteger(id) || id < 1) return fail(400, "INVALID_ID");
  const { data } = await sb.from("client_entries").delete().eq("id", id).select("client_key").throwOnError();
  if (!data.length) return fail(404, "NOT_FOUND");
  return profile(sb, data[0].client_key);
});
