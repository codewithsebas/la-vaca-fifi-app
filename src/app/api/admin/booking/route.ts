import type { NextRequest } from "next/server";
import { invalidImportRow } from "@/lib/booking";
import { config } from "@/lib/config";
import type { Tables } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/server";
import { loadCabinTypes } from "@/lib/server/db";
import { fail, json, readJson, requireStaff, route } from "@/lib/server/http";
import { insertImported } from "@/lib/server/reservations";
import type { BookingInboxAction, BookingInboxItem } from "@/lib/types";

// Reservas de Booking que llegan por correo (booking_inbox, migración 20261104000000). Todo el equipo las ve y las
// asigna: el correo de Ayenda no dice la cabaña, así que alguien la elige y en ese momento se crea la reserva.

const RECENT_DAYS = 30; // además de las pendientes, lo que se resolvió en este tiempo

const toItem = (r: Tables<"booking_inbox">): BookingInboxItem => ({
  ref: r.ref,
  status: r.status as BookingInboxItem["status"],
  guest: r.guest_full_name,
  email: r.guest_email,
  phone: r.guest_phone,
  checkIn: r.check_in,
  checkOut: r.check_out,
  total: r.total,
  reservationCode: r.reservation_code,
  lastEmailAt: r.last_email_at,
});

async function listInbox() {
  const since = new Date(Date.now() - RECENT_DAYS * 864e5).toISOString();
  const { data } = await createServiceClient()
    .from("booking_inbox")
    .select("*")
    .or(`status.eq.pending,updated_at.gte.${since}`)
    .order("check_in")
    .limit(200)
    .throwOnError();
  return data.map(toItem);
}

// GET /api/admin/booking → pendientes por asignar y lo resuelto en los últimos días.
export const GET = route(async () => {
  const { error } = await requireStaff();
  if (error) return error;
  return json(await listInbox());
});

// POST /api/admin/booking { action: "assign", ref, cabinTypeId, unit } → crea la reserva en esa cabaña (confirmada,
// canal Booking, sin pagos: se paga en el hotel). { action: "dismiss", ref } → la descarta (ya estaba en el panel).
export const POST = route(async (req: NextRequest) => {
  const { error } = await requireStaff();
  if (error) return error;
  const b = await readJson<BookingInboxAction>(req);
  if (!b || typeof b.ref !== "string" || !/^\d{1,20}$/.test(b.ref)) return fail(400, "INVALID_BODY");
  const sb = createServiceClient();
  const { data: item } = await sb.from("booking_inbox").select("*").eq("ref", b.ref).maybeSingle().throwOnError();
  if (!item) return fail(404, "NOT_FOUND");
  if (item.status !== "pending") return fail(409, "NOT_PENDING");

  if (b.action === "dismiss") {
    await sb.from("booking_inbox").update({ status: "dismissed" }).eq("ref", b.ref).eq("status", "pending").throwOnError();
    return json(await listInbox());
  }
  if (b.action !== "assign") return fail(400, "INVALID_BODY");

  const [{ units }, { data: settings }] = await Promise.all([loadCabinTypes(sb), sb.from("site_settings").select("check_in_start, deposit_pct").maybeSingle()]);
  const row = {
    ref: `ayenda:${item.ref}`,
    guest: item.guest_full_name,
    email: item.guest_email,
    phone: item.guest_phone,
    checkIn: item.check_in,
    checkOut: item.check_out,
    cabinTypeId: b.cabinTypeId,
    unit: Number(b.unit),
    total: item.total,
    commission: 0,
    channel: "Booking",
    status: "confirmed" as const,
    notes: `Booking vía Ayenda · reserva ${item.ref}`,
  };
  const why = invalidImportRow(row, units);
  if (why) return fail(400, "INVALID_BODY", { message: why });
  const done = await insertImported(sb, row, {
    depositPct: settings?.deposit_pct ?? config.depositPct,
    arrival: (settings?.check_in_start ?? "15:00").slice(0, 5),
  });
  if ("error" in done) return fail(done.error === "FAILED" ? 500 : 409, done.error);
  // La fila queda enlazada por el disparador link_booking_inbox (external_ref 'ayenda:<ref>').
  return json({ code: done.code, items: await listInbox() });
});
