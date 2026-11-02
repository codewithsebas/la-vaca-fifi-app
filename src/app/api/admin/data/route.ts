import { after, type NextRequest } from "next/server";
import {
  loadBathrooms,
  loadCabinTypes,
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
import { json, requireStaff, route } from "@/lib/server/http";
import { processOutbox } from "@/lib/server/mailer";
import { dispatchPush } from "@/lib/server/push";
import { loadSiteContent, siteUrl } from "@/lib/server/site";

// GET /api/admin/data → todo lo que necesita el panel y quién lo usa. Consultas con la sesión del equipo (RLS).
export const GET = route(async (req: NextRequest) => {
  const { sb, me, error } = await requireStaff();
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
    baths,
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
    loadBathrooms(sb),
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
    me,
    bathrooms: baths.bathrooms,
    bathroomBlocks: baths.blocks,
  });
});
