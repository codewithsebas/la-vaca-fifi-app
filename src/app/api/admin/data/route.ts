import { after, type NextRequest } from "next/server";
import {
  loadCabinTypes,
  loadChannels,
  loadClients,
  loadSeasons,
  runDeadlines,
  toBlock,
  toEmail,
  toNotification,
  toPayment,
  toProof,
  toReservation,
} from "@/lib/server/db";
import { json, requireAdmin, route } from "@/lib/server/http";
import { processOutbox } from "@/lib/server/mailer";
import { siteUrl } from "@/lib/server/payments";
import { dispatchPush } from "@/lib/server/push";
import { loadSiteContent } from "@/lib/server/site";

// GET /api/admin/data → todo lo que necesita el panel. Consultas con la sesión del admin (RLS).
export const GET = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  await runDeadlines();
  const [
    { data: reservations },
    { data: blocks },
    { types, units },
    seasons,
    site,
    { data: proofs },
    { data: payments },
    { data: emails },
    clients,
    { data: notifications },
    channels,
  ] = await Promise.all([
    sb.from("reservations").select("*, reservation_notes(text, created_at)").order("check_in", { ascending: false }).throwOnError(),
    sb.from("blocks").select("*").order("from_date").throwOnError(),
    loadCabinTypes(sb),
    loadSeasons(sb),
    loadSiteContent(sb),
    sb.from("payment_proofs").select("*").order("created_at", { ascending: false }).throwOnError(),
    sb.from("payments").select("*").order("created_at", { ascending: false }).limit(1000).throwOnError(),
    sb.from("email_outbox").select("*").order("created_at", { ascending: false }).limit(300).throwOnError(),
    loadClients(sb),
    sb.from("admin_notifications").select("*").order("created_at", { ascending: false }).limit(150).throwOnError(),
    loadChannels(sb, siteUrl(req.nextUrl.origin)),
  ]);
  // Correos que fallaron y ya les toca reintentar: se envían después de responder.
  if (emails.some((e) => e.status === "failed" || e.status === "pending")) after(() => processOutbox(siteUrl(req.nextUrl.origin)));
  // Avisos que aún no salieron como notificación push (p. ej. los del cron, si la base de datos no pudo avisar a la app).
  after(dispatchPush);
  return json({
    reservations: reservations.map(toReservation),
    blocks: blocks.map(toBlock),
    cabinTypes: types,
    seasons,
    unidades: units,
    site,
    proofs: proofs.map(toProof),
    payments: payments.map(toPayment),
    emails: emails.map(toEmail),
    clients,
    notifications: notifications.map(toNotification),
    channelCalendars: channels.calendars,
    channelStays: channels.stays,
    beds24: channels.beds24,
  });
});
