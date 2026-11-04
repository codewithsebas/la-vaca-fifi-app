import "server-only";
import { ImapFlow } from "imapflow";
import { AYENDA_SENDER, normalizeMessageId, readAyendaEmail } from "@/lib/ayenda-mail";
import { createServiceClient } from "@/lib/supabase/server";
import { env } from "@/lib/server/env";

// Reservas de Booking por correo: lee los correos de Ayenda del buzón (IMAP, solo lectura: no marca nada como leído ni
// mueve nada) y aplica cada uno con apply_booking_email() (migración 20261104000000). Lo disparan el propio servidor y el
// cron de la base de datos, cada 2 minutos (POST /api/booking/mail). QA y producción pueden leer el mismo buzón: cada base
// lleva su registro.

const FIRST_LOOKBACK_DAYS = 365; // la primera vez: reservas hechas hasta con un año de anticipación
const OVERLAP_DAYS = 3; // después: desde el último correo leído, con margen por si alguno llegó tarde
const MIN_INTERVAL_MS = 60_000; // aunque la llamen seguido, no entra al buzón más de una vez por minuto
const CHUNK = 100;

const sentAt = (d: Date | string | undefined) => (d ? new Date(d).getTime() : 0);

export const bookingMailConfigured = () => !!(env.bookingImapUser && env.bookingImapPassword);

const POLL_MS = 2 * 60_000;

/**
 * Lectura periódica desde el propio servidor (instrumentation.ts), además del cron de la base de datos: así funciona
 * también donde la base no puede llamar a la app (el servidor local de QA) o si el cron falla. Una sola por proceso.
 */
export function startBookingMailPoller() {
  if (!bookingMailConfigured()) return;
  const g = globalThis as { __bookingMailPoller?: ReturnType<typeof setInterval> };
  if (g.__bookingMailPoller) return;
  g.__bookingMailPoller = setInterval(() => void syncBookingMail(), POLL_MS);
  g.__bookingMailPoller.unref?.();
  void syncBookingMail();
}

let running: Promise<number> | null = null;
let lastRun = 0;

/** Lee los correos nuevos de Ayenda. Nunca lanza: devuelve cuántos se aplicaron. */
export function syncBookingMail(): Promise<number> {
  if (!bookingMailConfigured()) return Promise.resolve(0);
  if (running) return running;
  if (Date.now() - lastRun < MIN_INTERVAL_MS) return Promise.resolve(0);
  lastRun = Date.now();
  running = run()
    .catch((e) => {
      console.error("No se pudo leer el buzón de Booking:", e instanceof Error ? e.message : e);
      return 0;
    })
    .finally(() => (running = null));
  return running;
}

async function run() {
  const sb = createServiceClient();
  const { data: last } = await sb.from("booking_emails").select("received_at").order("received_at", { ascending: false }).limit(1).maybeSingle().throwOnError();
  const since = last ? new Date(Date.parse(last.received_at) - OVERLAP_DAYS * 864e5) : new Date(Date.now() - FIRST_LOOKBACK_DAYS * 864e5);

  const client = new ImapFlow({
    host: env.bookingImapHost,
    port: 993,
    secure: true,
    auth: { user: env.bookingImapUser!, pass: env.bookingImapPassword! },
    logger: false,
  });
  await client.connect();
  try {
    // En Gmail los correos archivados no están en INBOX: se busca en «Todos» si el servidor lo ofrece.
    const all = (await client.list()).find((m) => m.specialUse === "\\All");
    const lock = await client.getMailboxLock(all?.path ?? "INBOX", { readOnly: true });
    try {
      const uids = (await client.search({ from: AYENDA_SENDER, since }, { uid: true })) || [];
      if (!uids.length) return 0;
      const heads = await client.fetchAll(uids, { envelope: true }, { uid: true });

      // Solo los que esta base todavía no tiene, del más viejo al más nuevo (una modificación después de su reserva).
      const ids = heads.map((m) => (m.envelope?.messageId ? normalizeMessageId(m.envelope.messageId) : "")).filter(Boolean);
      const known = new Set<string>();
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data } = await sb
          .from("booking_emails")
          .select("message_id")
          .in("message_id", ids.slice(i, i + CHUNK))
          .throwOnError();
        data.forEach((r) => known.add(r.message_id));
      }
      const pending = heads
        .filter((m) => m.envelope?.messageId && !known.has(normalizeMessageId(m.envelope.messageId)))
        .sort((a, b) => sentAt(a.envelope?.date) - sentAt(b.envelope?.date));

      let applied = 0;
      for (const head of pending) {
        const msg = await client.fetchOne(String(head.uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const mail = await readAyendaEmail(msg.source);
        if (!mail) continue; // sin firma de Ayenda: se ignora
        const { data: outcome } = await sb
          .rpc("apply_booking_email", {
            p_message_id: mail.messageId,
            p_received_at: mail.receivedAt,
            // Sin push: en QA (las reservas de Booking son las reales) y en la primera lectura, que trae todo el año de golpe.
            p_quiet: env.appEnv !== "pdn" || !last,
            ...(mail.ok
              ? {
                  p_kind: mail.booking.kind,
                  p_ref: mail.booking.ref,
                  p_guest: mail.booking.guest,
                  p_email: mail.booking.email,
                  p_phone: mail.booking.phone,
                  p_check_in: mail.booking.checkIn,
                  p_check_out: mail.booking.checkOut,
                  p_total: mail.booking.total,
                }
              : { p_error: mail.error }),
          })
          .throwOnError();
        if (outcome === "applied") applied++;
      }
      return applied;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}
