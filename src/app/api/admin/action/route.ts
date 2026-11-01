import { after, type NextRequest } from "next/server";
import { computeQuote, findUnit } from "@/lib/booking";
import { addDays, isISO, nightsBetween, todayISO } from "@/lib/format";
import { isExclusionViolation, loadCabinTypes, loadOccupancy, loadSeasons, toReservation } from "@/lib/server/db";
import { businessError, fail, json, readJson, requireAdmin, route } from "@/lib/server/http";
import { processOutbox } from "@/lib/server/mailer";
import { dispatchPush } from "@/lib/server/push";
import { siteUrl } from "@/lib/server/site";
import { HOLD_OPTIONS, manualDueAt } from "@/lib/payments";
import type { AdminAction, Quote, ReservationStatus } from "@/lib/types";

const TRANSITIONS: Record<string, { from: ReservationStatus[]; to?: ReservationStatus }> = {
  confirm: { from: ["pending_deposit", "expired"] },
  balance: { from: ["confirmed", "rescheduled", "checked_in"] },
  checkin: { from: ["confirmed", "rescheduled"], to: "checked_in" },
  checkout: { from: ["checked_in"], to: "completed" },
  cancel: { from: ["pending_deposit", "confirmed", "rescheduled"], to: "cancelled" },
  reschedule: { from: ["pending_deposit", "confirmed", "rescheduled"] },
  extend_hold: { from: ["pending_deposit", "expired"] },
  note: { from: ["pending_deposit", "confirmed", "cancelled", "expired", "rescheduled", "checked_in", "completed"] },
};

// POST /api/admin/action { code, action, ... } → cambia el estado, registra un pago, reprograma o agrega una nota.
// confirm / balance: pago recibido (efectivo o transferencia) registrado por el equipo. confirm con full: pagó el total.
// extend_hold: plazo nuevo para pagar el abono (amplía la retención o, si venció, la reactiva).
// checkout: solo con el saldo pagado (la base de datos lo exige).
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
      const text = String(b.text ?? "")
        .trim()
        .slice(0, 2000);
      if (!text) return fail(400, "INVALID_BODY");
      await sb.from("reservation_notes").insert({ reservation_code: current.code, text }).throwOnError();
    } else if (b.action === "extend_hold") {
      // El plazo nunca pasa del día de llegada.
      if (!HOLD_OPTIONS.some((o) => o.value === b.holdMinutes)) return fail(400, "INVALID_BODY");
      const due = manualDueAt(current.check_in, b.holdMinutes);
      if (due.tooShort) return fail(422, "HOLD_TOO_SHORT");
      await sb.from("reservations").update({ status: "pending_deposit", deposit_due_at: due.dueAt }).eq("code", current.code).throwOnError();
    } else if (b.action === "confirm" || b.action === "balance") {
      const kind = b.action === "balance" ? "balance" : b.full ? "full" : "deposit";
      await sb.rpc("register_manual_payment", { p_code: current.code, p_kind: kind, p_note: String(b.note ?? "").slice(0, 300) }).throwOnError();
      // Confirmar el abono encola el correo de confirmación: se envía después de responder.
      if (b.action === "confirm") after(() => processOutbox(siteUrl(req.nextUrl.origin)).then(() => dispatchPush()));
    } else if (b.action === "reschedule") {
      const { checkIn: ci, checkOut: co } = b;
      if (!isISO(ci) || !isISO(co) || co <= ci || ci < todayISO() || nightsBetween(ci, co) > 30) return fail(400, "INVALID_DATES");
      const [{ types, units }, seasons] = await Promise.all([loadCabinTypes(sb), loadSeasons(sb, { activeOnly: true })]);
      const type = types.find((t) => t.id === current.cabin_type_id)!;
      const occ = await loadOccupancy(sb, ci, addDays(co, -1), type.id);
      const unit = findUnit(occ, units[type.id] ?? 0, type.id, ci, co, current.code);
      if (!unit) return fail(409, "DATES_UNAVAILABLE");
      const quote = computeQuote(type, ci, co, current.adults + current.children, seasons);
      // Con el abono ya pagado, el abono es lo que se pagó y el saldo es el resto del nuevo total.
      // Si ya estaba todo pagado y el nuevo total es mayor, vuelve a quedar saldo pendiente.
      const reopensBalance = !!current.balance_paid_at && quote.total > current.paid_amount;
      if (current.deposit_paid_at) {
        quote.deposit = (current.quote as Quote).deposit;
        quote.balance = Math.max(0, quote.total - current.paid_amount);
      }
      await sb
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
        .eq("code", current.code)
        .throwOnError();
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
