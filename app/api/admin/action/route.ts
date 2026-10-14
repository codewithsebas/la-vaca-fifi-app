import { after, type NextRequest } from "next/server";
import { computeQuote } from "@/lib/booking";
import { addDays, isISO, nightsBetween, todayISO } from "@/lib/format";
import { claimUnit, type Hold, holdRoom } from "@/lib/server/beds24-sync";
import { isExclusionViolation, loadCabinTypes, loadOccupancy, loadSeasons, toReservation } from "@/lib/server/db";
import { fail, json, readJson, requireAdmin, route } from "@/lib/server/http";
import { processOutbox } from "@/lib/server/mailer";
import { dispatchPush } from "@/lib/server/push";
import { businessError, siteUrl } from "@/lib/server/payments";
import { newPayToken } from "@/lib/server/reservations";
import { HOLD_OPTIONS, manualDueAt } from "@/lib/payments";
import type { Tables } from "@/lib/supabase/database.types";
import type { AdminAction, Quote, ReservationStatus } from "@/lib/types";

// Lo que Beds24 necesita de una reserva para retener su cabaña (si se vende en Booking).
const holdOf = (r: Tables<"reservations">) => ({ source: "reservation" as const, sourceId: r.code, cabinTypeId: r.cabin_type_id, label: `Web ${r.code}`, adults: r.adults, children: r.children });

// Reactivar una retención vencida (pagarla o darle un plazo nuevo) vuelve a ocupar sus noches: si la cabaña se vende en
// Booking por Beds24, se retiene allá antes. Las demás no necesitan retener nada.
async function reclaim(r: Tables<"reservations">): Promise<{ hold: Hold } | { error: Response }> {
  if (r.status !== "expired") return { hold: { commit: async () => {}, release: async () => {} } };
  try {
    const h = await holdRoom({ ...holdOf(r), checkIn: r.check_in, checkOut: r.check_out, unit: r.unit });
    return h ? { hold: h } : { error: fail(409, "CHANNEL_CONFLICT") };
  } catch (e) {
    console.error(e);
    return { error: fail(503, "CHANNEL_UNAVAILABLE") };
  }
}

const TRANSITIONS: Record<string, { from: ReservationStatus[]; to?: ReservationStatus }> = {
  confirm: { from: ["pending_deposit", "expired"] },
  balance: { from: ["confirmed", "rescheduled", "checked_in"] },
  checkin: { from: ["confirmed", "rescheduled"], to: "checked_in" },
  checkout: { from: ["checked_in"], to: "completed" },
  cancel: { from: ["pending_deposit", "confirmed", "rescheduled"], to: "cancelled" },
  reschedule: { from: ["pending_deposit", "confirmed", "rescheduled"] },
  payment_link: { from: ["pending_deposit", "expired"] },
  note: { from: ["pending_deposit", "confirmed", "cancelled", "expired", "rescheduled", "checked_in", "completed"] },
};

// POST /api/admin/action { code, action, ... } → cambia el estado, registra un pago, reprograma o agrega una nota.
// confirm / balance: pago recibido por fuera de la pasarela (efectivo o transferencia), con las mismas reglas que un pago en línea.
// confirm con full: el huésped pagó el total (confirma y salda).
// payment_link: plazo nuevo (y enlace) para pagar el abono o el total por el enlace de pago.
// checkin: la base de datos abre la hora para pagar el saldo. checkout: solo con el saldo pagado (la base de datos lo exige).
export const POST = route(async (req: NextRequest) => {
  const { sb, error } = await requireAdmin();
  if (error) return error;
  const b = await readJson<AdminAction>(req);
  const rule = b && TRANSITIONS[b.action];
  if (!b || !rule || typeof b.code !== "string") return fail(400, "INVALID_BODY");

  const { data: current } = await sb.from("reservations").select("*").eq("code", b.code).maybeSingle().throwOnError();
  if (!current) return fail(404, "NOT_FOUND");
  if (!rule.from.includes(current.status)) return fail(422, "INVALID_TRANSITION");

  try {
    if (b.action === "note") {
      const text = String(b.text ?? "").trim().slice(0, 2000);
      if (!text) return fail(400, "INVALID_BODY");
      await sb.from("reservation_notes").insert({ reservation_code: current.code, text }).throwOnError();
    } else if (b.action === "payment_link") {
      // Plazo nuevo para pagar por el enlace (y el enlace, si la reserva aún no tenía): amplía la retención o, si venció,
      // la reactiva. El plazo nunca pasa del día de llegada.
      if (!HOLD_OPTIONS.some((o) => o.value === b.holdMinutes)) return fail(400, "INVALID_BODY");
      const due = manualDueAt(current.check_in, b.holdMinutes);
      if (due.tooShort) return fail(422, "HOLD_TOO_SHORT");
      const held = await reclaim(current);
      if ("error" in held) return held.error;
      const { error: upErr } = await sb
        .from("reservations")
        .update({ status: "pending_deposit", deposit_due_at: due.dueAt, pay_token: current.pay_token ?? newPayToken() })
        .eq("code", current.code);
      if (upErr) {
        await held.hold.release();
        throw upErr;
      }
      await held.hold.commit();
    } else if (b.action === "confirm" || b.action === "balance") {
      const kind = b.action === "balance" ? "balance" : b.full ? "full" : "deposit";
      const held = await reclaim(current);
      if ("error" in held) return held.error;
      const { hold } = held;
      const { error: payErr } = await sb.rpc("register_manual_payment", { p_code: current.code, p_kind: kind, p_note: String(b.note ?? "").slice(0, 300) });
      if (payErr) {
        await hold.release();
        throw payErr;
      }
      await hold.commit();
      // Confirmar el abono encola el correo de confirmación: se envía después de responder.
      if (b.action === "confirm") after(() => processOutbox(siteUrl(req.nextUrl.origin)).then(() => dispatchPush()));
    } else if (b.action === "reschedule") {
      const { checkIn: ci, checkOut: co } = b;
      if (!isISO(ci) || !isISO(co) || co <= ci || ci < todayISO() || nightsBetween(ci, co) > 30) return fail(400, "INVALID_DATES");
      const [{ types, units }, seasons] = await Promise.all([loadCabinTypes(sb), loadSeasons(sb, { activeOnly: true })]);
      const type = types.find((t) => t.id === current.cabin_type_id)!;
      const occ = await loadOccupancy(sb, ci, addDays(co, -1), type.id);
      // Si la cabaña se vende en Booking por Beds24, las noches nuevas se retienen allá antes de guardar.
      const claim = await claimUnit(occ, { ...holdOf(current), units: units[type.id] ?? 0, checkIn: ci, checkOut: co, ignoreCode: current.code });
      if (!claim.hold) return claim.channelDown ? fail(503, "CHANNEL_UNAVAILABLE") : fail(409, "DATES_UNAVAILABLE");
      const { unit, hold } = claim;
      const quote = computeQuote(type, ci, co, current.adults + current.children, seasons);
      // Con el abono ya pagado, el abono es lo que se pagó y el saldo es el resto del nuevo total.
      // Si ya estaba todo pagado y el nuevo total es mayor, vuelve a quedar saldo pendiente.
      const reopensBalance = !!current.balance_paid_at && quote.total > current.paid_amount;
      if (current.deposit_paid_at) {
        quote.deposit = (current.quote as Quote).deposit;
        quote.balance = Math.max(0, quote.total - current.paid_amount);
      }
      const { error: upErr } = await sb
        .from("reservations")
        .update({
          check_in: ci,
          check_out: co,
          unit,
          // Una retención sin abono sigue pendiente (y con su fecha límite) aunque cambie de fechas.
          status: current.status === "pending_deposit" ? "pending_deposit" : "rescheduled",
          quote,
          ...(reopensBalance && { balance_paid_at: null }),
        })
        .eq("code", current.code);
      if (upErr) {
        await hold.release();
        throw upErr;
      }
      await hold.commit();
    } else {
      await sb.from("reservations").update({ status: rule.to! }).eq("code", current.code).throwOnError();
    }
  } catch (e) {
    // Confirmar una retención vencida o reprogramar puede chocar con otra reserva activa.
    if (isExclusionViolation(e)) return fail(409, "DATES_UNAVAILABLE");
    const known = businessError(e);
    if (known) return fail(known.status, known.error);
    throw e;
  }

  const { data: updated } = await sb.from("reservations").select("*, reservation_notes(text, created_at)").eq("code", current.code).single().throwOnError();
  return json(toReservation(updated));
});
