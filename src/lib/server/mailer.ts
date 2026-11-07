import "server-only";
import {
  arrivalReminderEmail,
  balancePaidEmail,
  reservationConfirmedEmail,
  reservationEndedEmail,
  reservationReceivedEmail,
  reservationRescheduledEmail,
  teamMessageEmail,
  type RenderedEmail,
} from "@/lib/emails";
import { dirHref, ics, wa } from "@/lib/format";
import { mergeSite, type SiteConfig } from "@/lib/site";
import type { Tables } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/server";
import type { EmailRecord, Quote } from "@/lib/types";
import { type Db, toEmail } from "@/lib/server/db";
import { EMAIL_LOGO_CID, EMAIL_LOGO_PNG_BASE64 } from "@/lib/server/email-logo";
import { loadSiteContent } from "@/lib/server/site";
import { env } from "@/lib/server/env";

// Bandeja de salida (tabla email_outbox): quien necesita un correo lo encola (los de la reserva los encola la base de datos:
// al crearse, al aprobarse el abono, al completarse el pago, al reprogramarse, al cancelarse o vencerse y dos días antes de llegar) y este módulo lo envía con Resend. El envío va aparte de la respuesta al huésped: si Resend falla,
// la reserva sigue confirmada, el error queda registrado (y avisa al panel) y el correo se reintenta con espera creciente.

type Row = Tables<"email_outbox">;
// content_id: imagen en línea, la que el HTML usa como src="cid:…" (el logo).
type Attachment = { filename: string; content: string; content_id?: string };
const LOGO: Attachment = { filename: "la-vaca-fifi.png", content: EMAIL_LOGO_PNG_BASE64, content_id: EMAIL_LOGO_CID };

const MAX_ATTEMPTS = 5;
const BACKOFF_MIN = [2, 10, 30, 120, 480]; // espera antes del siguiente intento automático
const LEASE_MIN = 10; // un envío que quedó a medias (proceso caído) se vuelve a intentar después de esto

export const mailConfigured = () => !!env.resendApiKey && !!env.emailFrom;

async function sendWithResend(m: { to: string; subject: string; html: string; text: string; attachments?: Attachment[]; idempotencyKey: string }) {
  const key = env.resendApiKey;
  if (!key) throw new Error("El envío de correos no está configurado: falta RESEND_API_KEY.");
  const from = env.emailFrom;
  if (!from) throw new Error("El envío de correos no está configurado: falta EMAIL_FROM.");
  const replyTo = env.emailReplyTo;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    // La clave de idempotencia evita un duplicado si la misma solicitud se repite (p. ej. por un corte de red).
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": m.idempotencyKey },
    body: JSON.stringify({
      from,
      to: [m.to],
      subject: m.subject,
      html: m.html,
      text: m.text,
      ...(replyTo && { reply_to: replyTo }),
      ...(m.attachments && { attachments: m.attachments }),
    }),
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

type Rendered = { email: RenderedEmail; to: string; attachments?: Attachment[] };

type ReservationRow = Tables<"reservations">;

// Suma de un grupo: personas, valores y pagos. Una reserva sola queda igual.
function sumGroup(rows: ReservationRow[]) {
  const quotes = rows.map((m) => m.quote as Quote);
  const add = (f: (q: Quote) => number) => quotes.reduce((s, q) => s + f(q), 0);
  return {
    adults: rows.reduce((s, m) => s + m.adults, 0),
    children: rows.reduce((s, m) => s + m.children, 0),
    paid_amount: rows.reduce((s, m) => s + m.paid_amount, 0),
    quote: { ...quotes[0], total: add((q) => q.total), deposit: add((q) => q.deposit), balance: add((q) => q.balance) } as Quote,
  };
}

// «Cabaña Doble», «2 × Cabaña Doble y Cabaña Dos Camas».
function cabinList(names: string[]) {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  const parts = [...counts].map(([n, k]) => (k > 1 ? `${k} × ${n}` : n));
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}` : (parts[0] ?? "");
}

// Correos de la reserva: se leen la reserva y su cabaña al enviar (siempre con los datos vigentes).
async function renderReservation(ctx: Ctx, row: Row, c: SiteConfig, logoUrl: string): Promise<Rendered> {
  if (!row.reservation_code) throw new Error("La reserva del correo ya no existe.");
  const { data: lead } = await ctx.sb.from("reservations").select("*").eq("code", row.reservation_code).single().throwOnError();
  // Reserva con varias cabañas: el correo de la principal habla por todo el grupo (cabañas, personas, valores y pagos).
  const ended = row.kind === "reservation_cancelled" || row.kind === "reservation_expired";
  const members = lead.group_code
    ? (await ctx.sb.from("reservations").select("*").eq("group_code", lead.group_code).order("code").throwOnError()).data.filter(
        (m) => ended || m.status !== "cancelled",
      )
    : [lead];
  const group = members.length ? members : [lead];
  const { data: cabins } = await ctx.sb
    .from("cabin_types")
    .select("id,nombre")
    .in("id", [...new Set(group.map((m) => m.cabin_type_id))])
    .throwOnError();
  const r = { ...lead, ...sumGroup(group) };
  const q = r.quote as Quote;
  const cabana = cabinList(group.map((m) => cabins.find((c) => c.id === m.cabin_type_id)?.nombre ?? m.cabin_type_id));
  const stay = {
    nombre: r.guest_full_name,
    codigo: r.code,
    cabana,
    checkIn: r.check_in,
    checkOut: r.check_out,
    adultos: r.adults,
    ninos: r.children,
    logoUrl,
  };
  const mascota = !!(r.pet as { hasPet?: boolean } | null)?.hasPet;
  // Con el sitio público sin publicar (solo panel), los enlaces a «Mi reserva» y «Reservar» llevarían al ingreso del
  // panel: el correo los omite y deja WhatsApp.
  const site = !env.soloPanel;
  const miReservaUrl = site ? `${ctx.base}/mi-reserva?code=${encodeURIComponent(r.code)}` : "";
  const whatsappUrl = wa(c.whatsapp, `Hola, tengo una pregunta sobre mi reserva ${r.code}.`);
  const guest = (email: RenderedEmail): Rendered => ({ email, to: row.to_email });

  switch (row.kind) {
    case "reservation_confirmed": {
      const { data: deposits } = await ctx.sb
        .from("payments")
        .select("reservation_code,amount")
        .in(
          "reservation_code",
          group.map((m) => m.code),
        )
        .in("kind", ["deposit", "full"])
        .eq("status", "approved")
        .order("approved_at")
        .throwOnError();
      // El primer pago de cada cabaña (en un grupo, el abono se reparte entre ellas).
      const firstPaid = group.reduce((sum, m) => sum + (deposits.find((d) => d.reservation_code === m.code)?.amount ?? 0), 0);
      const email = reservationConfirmedEmail(c, {
        ...stay,
        mascota,
        total: q.total,
        // Lo pagado al confirmar (abono o total), aunque el correo se reenvíe después de pagar el saldo.
        pagado: firstPaid || q.deposit,
        miReservaUrl,
        comoLlegarUrl: dirHref(),
        whatsappUrl,
      });
      const calendar = ics({ code: r.code, checkIn: r.check_in, checkOut: r.check_out, cabinTypeId: r.cabin_type_id }, c, cabana);
      return { ...guest(email), attachments: [{ filename: `reserva-${r.code}.ics`, content: Buffer.from(calendar).toString("base64") }] };
    }
    case "reservation_received":
      return guest(reservationReceivedEmail(c, { ...stay, mascota, total: q.total, abono: q.deposit, plazo: r.deposit_due_at, miReservaUrl, whatsappUrl }));
    case "reservation_cancelled":
    case "reservation_expired":
      return guest(
        reservationEndedEmail(c, {
          ...stay,
          vencida: row.kind === "reservation_expired",
          pagado: r.paid_amount,
          reservarUrl: site ? `${ctx.base}/reservar` : "",
          whatsappUrl,
        }),
      );
    case "balance_paid":
      return guest(
        balancePaidEmail(c, {
          ...stay,
          total: q.total,
          pagado: r.paid_amount,
          enEstadia: r.status === "checked_in",
          comoLlegarUrl: dirHref(),
          miReservaUrl,
          whatsappUrl,
        }),
      );
    case "reservation_rescheduled":
    case "reservation_moved": {
      // Las fechas de este cambio quedan en la fila: si se reprograma otra vez, cada correo cuenta el suyo.
      // reservation_moved: no tenía abono y otra reserva pagó primero sus fechas; se corrió a las próximas libres.
      const d = row.payload as { checkInAnterior: string; checkOutAnterior: string; checkIn: string; checkOut: string };
      const email = reservationRescheduledEmail(c, {
        ...stay,
        checkIn: d.checkIn,
        checkOut: d.checkOut,
        checkInAnterior: d.checkInAnterior,
        checkOutAnterior: d.checkOutAnterior,
        mascota,
        total: q.total,
        pagado: r.paid_amount,
        abono: q.deposit,
        plazo: r.deposit_due_at,
        miReservaUrl,
        whatsappUrl,
        movida: row.kind === "reservation_moved",
      });
      const calendar = ics({ code: r.code, checkIn: d.checkIn, checkOut: d.checkOut, cabinTypeId: r.cabin_type_id }, c, cabana);
      return { ...guest(email), attachments: [{ filename: `reserva-${r.code}.ics`, content: Buffer.from(calendar).toString("base64") }] };
    }
    case "arrival_reminder":
      return guest(arrivalReminderEmail(c, { ...stay, saldo: Math.max(0, q.total - r.paid_amount), comoLlegarUrl: dirHref(), miReservaUrl, whatsappUrl }));
    default:
      throw new Error(`Tipo de correo desconocido: ${row.kind}`);
  }
}

async function render(ctx: Ctx, row: Row): Promise<Rendered> {
  const c = await siteOf(ctx);
  const logoUrl = `cid:${EMAIL_LOGO_CID}`; // el logo va incrustado (LOGO), no enlazado
  if (row.kind !== "team_message") return renderReservation(ctx, row, c, logoUrl);
  const d = row.payload as { nombre?: string; asunto?: string; mensaje?: string; codigo?: string | null };
  const email = teamMessageEmail(c, {
    nombre: d.nombre ?? "",
    asunto: d.asunto ?? row.subject,
    mensaje: d.mensaje ?? "",
    codigo: d.codigo ?? null,
    whatsappUrl: wa(c.whatsapp),
    logoUrl,
  });
  return { email, to: row.to_email };
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
    const { email, to, attachments } = await render(ctx, taken);
    const id = await sendWithResend({
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: [LOGO, ...(attachments ?? [])],
      idempotencyKey: `${taken.id}:${taken.attempts}`,
    });
    const { data } = await ctx.sb
      .from("email_outbox")
      .update({ status: "sent", provider_id: id, sent_at: new Date().toISOString(), subject: email.subject.slice(0, 200), to_email: to, last_error: "" })
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
    let q = sb
      .from("email_outbox")
      .select("*")
      .neq("status", "sent")
      .order("created_at")
      .limit(opts.limit ?? 10);
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
