import "server-only";
import { reservationConfirmedEmail, teamMessageEmail, type RenderedEmail } from "@/lib/emails";
import { dirHref, ics, wa } from "@/lib/format";
import { mergeSite, type SiteConfig } from "@/lib/site";
import type { Tables } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/server";
import type { EmailRecord, Quote } from "@/lib/types";
import { type Db, toEmail } from "./db";
import { loadSiteContent } from "./site";

// Bandeja de salida (tabla email_outbox): quien necesita un correo lo encola (la confirmación la encola la base de datos
// al aprobarse el abono) y este módulo lo envía con Resend. El envío va aparte de la respuesta al huésped: si Resend falla,
// la reserva sigue confirmada, el error queda registrado (y avisa al panel) y el correo se reintenta con espera creciente.

type Row = Tables<"email_outbox">;
type Attachment = { filename: string; content: string };

const MAX_ATTEMPTS = 5;
const BACKOFF_MIN = [2, 10, 30, 120, 480]; // espera antes del siguiente intento automático
const LEASE_MIN = 10; // un envío que quedó a medias (proceso caído) se vuelve a intentar después de esto

export const mailConfigured = () => !!process.env.RESEND_API_KEY?.trim();

async function sendWithResend(m: { to: string; subject: string; html: string; text: string; attachments?: Attachment[]; idempotencyKey: string }) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("El envío de correos no está configurado: falta RESEND_API_KEY.");
  const from = process.env.EMAIL_FROM?.trim() || "La Vaca Fifí <onboarding@resend.dev>";
  const replyTo = process.env.EMAIL_REPLY_TO?.trim();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    // La clave de idempotencia evita un duplicado si la misma solicitud se repite (p. ej. por un corte de red).
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": m.idempotencyKey },
    body: JSON.stringify({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text, ...(replyTo && { reply_to: replyTo }), ...(m.attachments && { attachments: m.attachments }) }),
    signal: AbortSignal.timeout(15000),
  });
  const body = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
  if (!res.ok || !body?.id) throw new Error(`Resend respondió ${res.status}: ${body?.message ?? body?.name ?? "sin detalle"}`);
  return body.id;
}

type Ctx = { sb: Db; base: string; site?: SiteConfig };

async function siteOf(ctx: Ctx) {
  if (!ctx.site) {
    const content = await loadSiteContent(ctx.sb);
    ctx.site = mergeSite(content.settings, content.policies, content.texts);
  }
  return ctx.site;
}

async function render(ctx: Ctx, row: Row): Promise<{ email: RenderedEmail; attachments?: Attachment[] }> {
  const c = await siteOf(ctx);
  const logoUrl = `${ctx.base}/correo/logo.png`;
  if (row.kind === "reservation_confirmed") {
    if (!row.reservation_code) throw new Error("La reserva del correo ya no existe.");
    const [{ data: r }, { data: deposit }] = await Promise.all([
      ctx.sb.from("reservations").select("*").eq("code", row.reservation_code).single().throwOnError(),
      ctx.sb.from("payments").select("amount").eq("reservation_code", row.reservation_code).in("kind", ["deposit", "full"]).eq("status", "approved").order("approved_at").limit(1).throwOnError(),
    ]);
    const { data: cabin } = await ctx.sb.from("cabin_types").select("nombre").eq("id", r.cabin_type_id).maybeSingle().throwOnError();
    const q = r.quote as Quote;
    const cabana = cabin?.nombre ?? r.cabin_type_id;
    const email = reservationConfirmedEmail(c, {
      nombre: r.guest_full_name,
      codigo: r.code,
      cabana,
      checkIn: r.check_in,
      checkOut: r.check_out,
      adultos: r.adults,
      ninos: r.children,
      mascota: !!(r.pet as { hasPet?: boolean } | null)?.hasPet,
      total: q.total,
      // Lo pagado al confirmar (abono o total), aunque el correo se reenvíe después de pagar el saldo.
      pagado: deposit[0]?.amount ?? q.deposit,
      miReservaUrl: `${ctx.base}/mi-reserva?code=${encodeURIComponent(r.code)}`,
      comoLlegarUrl: dirHref(),
      whatsappUrl: wa(c.whatsapp, `Hola, tengo una pregunta sobre mi reserva ${r.code}.`),
      logoUrl,
    });
    const calendar = ics({ code: r.code, checkIn: r.check_in, checkOut: r.check_out, cabinTypeId: r.cabin_type_id }, c, cabana);
    return { email, attachments: [{ filename: `reserva-${r.code}.ics`, content: Buffer.from(calendar).toString("base64") }] };
  }
  const d = row.payload as { nombre?: string; asunto?: string; mensaje?: string; codigo?: string | null };
  const email = teamMessageEmail(c, {
    nombre: d.nombre ?? "",
    asunto: d.asunto ?? row.subject,
    mensaje: d.mensaje ?? "",
    codigo: d.codigo ?? null,
    whatsappUrl: wa(c.whatsapp),
    logoUrl,
  });
  return { email };
}

// Toma el correo (concurrencia optimista sobre `attempts`): si otro proceso ya lo tomó, no se envía dos veces.
async function claim(sb: Db, row: Row) {
  const lease = new Date(Date.now() + LEASE_MIN * 6e4).toISOString();
  const { data } = await sb
    .from("email_outbox")
    .update({ status: "sending", attempts: row.attempts + 1, next_attempt_at: lease })
    .eq("id", row.id)
    .eq("attempts", row.attempts)
    .neq("status", "sent")
    .select("*")
    .maybeSingle()
    .throwOnError();
  return data;
}

async function deliver(ctx: Ctx, row: Row): Promise<Row> {
  const taken = await claim(ctx.sb, row);
  if (!taken) return row;
  try {
    const { email, attachments } = await render(ctx, taken);
    const id = await sendWithResend({ to: taken.to_email, subject: email.subject, html: email.html, text: email.text, attachments, idempotencyKey: `${taken.id}:${taken.attempts}` });
    const { data } = await ctx.sb
      .from("email_outbox")
      .update({ status: "sent", provider_id: id, sent_at: new Date().toISOString(), subject: email.subject.slice(0, 200), last_error: "" })
      .eq("id", taken.id)
      .select("*")
      .single()
      .throwOnError();
    return data;
  } catch (e) {
    const message = String((e as Error)?.message ?? e).slice(0, 500);
    console.error(`Correo ${taken.id} (${taken.kind}) no enviado:`, message);
    const wait = BACKOFF_MIN[Math.min(taken.attempts, BACKOFF_MIN.length) - 1] ?? 480;
    const { data } = await ctx.sb
      .from("email_outbox")
      .update({ status: "failed", last_error: message, next_attempt_at: new Date(Date.now() + wait * 6e4).toISOString() })
      .eq("id", taken.id)
      .select("*")
      .single()
      .throwOnError();
    return data;
  }
}

/**
 * Envía los correos pendientes cuyo turno llegó (o los indicados en `ids`, aunque estén en espera: reintento manual).
 * `base`: URL del sitio para los enlaces del correo. Nunca lanza: un fallo queda registrado en la fila.
 */
export async function processOutbox(base: string, opts: { ids?: string[]; limit?: number } = {}): Promise<EmailRecord[]> {
  try {
    const sb = createServiceClient();
    const now = new Date().toISOString();
    let q = sb.from("email_outbox").select("*").neq("status", "sent").order("created_at").limit(opts.limit ?? 10);
    q = opts.ids?.length ? q.in("id", opts.ids) : q.lte("next_attempt_at", now).lt("attempts", MAX_ATTEMPTS);
    const { data: rows } = await q.throwOnError();
    const ctx: Ctx = { sb, base };
    const out: EmailRecord[] = [];
    // Uno a uno: son pocos y así se respeta el límite de envíos por segundo del proveedor.
    for (const row of rows) {
      // Un reintento manual no interrumpe un envío en curso (su turno aún no llega).
      if (row.status === "sending" && row.next_attempt_at > now) continue;
      out.push(toEmail(await deliver(ctx, row)));
    }
    return out;
  } catch (e) {
    console.error("No se pudo procesar la bandeja de correos:", e);
    return [];
  }
}
