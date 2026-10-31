"use client";

// Estado de pago de una reserva para el huésped («Mi reserva» y la página del pago): qué falta, cuánto y hasta cuándo.
// Los plazos vienen del servidor (depositDueAt, balanceDueAt) y la cuenta regresiva usa su hora (serverNow);
// cuando un plazo llega a cero se vuelve a consultar la API, que es la que decide.
import { useEffect, useRef, useState } from "react";
import { api, type ApiError } from "@/lib/api";
import { cop, dateOf, fmtClock, fmtDate, fmtDateTime, todayISO, wa } from "@/lib/format";
import { BALANCE_MINUTES, PAYMENT_STATUS, START_ERRORS, kindLabel, latestConfirming, latestPayment, methodLabel, moneyOf, stageOf, type Stage } from "@/lib/payments";
import type { PaymentKind, PaymentStart, PublicPayment, PublicReservation } from "@/lib/types";
import { CheckIcon, ClockIcon, WhatsAppIcon } from "./icons";
import { useSite } from "./site-provider";
import { CheckOption } from "./ui/choice";

/* ───────────── Hora del servidor ───────────── */

// Hora del servidor: el reloj del dispositivo corregido con la diferencia que trajo la última respuesta (serverNow).
// Avanza cada segundo mientras `ticking`; si no, conserva la última lectura (quien la usa no depende de ella).
export function useServerNow(serverNow: string | undefined, ticking: boolean) {
  const offset = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (serverNow) offset.current = Date.parse(serverNow) - Date.now();
  }, [serverNow]);
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => clearInterval(t);
  }, [ticking]);
  return now;
}

// "29:41" o "1 h 05 min".
export function fmtLeft(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h} h ${String(m).padStart(2, "0")} min`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/* ───────────── Abrir un pago ───────────── */

type PayAccess = { code: string; email: string } | { ref: string } | { token: string; accept?: boolean };

// Abre la pasarela. Si la API responde con un error de negocio (plazo vencido, pago en proceso…), se muestra y se refresca.
function usePay(access: PayAccess | null, onStale: () => void) {
  const [busy, setBusy] = useState<PaymentKind | null>(null);
  const [error, setError] = useState("");
  const pay = async (kind: PaymentKind) => {
    if (!access || busy) return;
    setBusy(kind);
    setError("");
    try {
      const r = await api.startPayment({ ...access, kind });
      const data = r.data as PaymentStart | ApiError | null;
      if (r.status === 201 && data && "checkoutUrl" in data) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      const code = (data as ApiError | null)?.error ?? "";
      setError(START_ERRORS[code] ?? "No pudimos abrir el pago. Inténtalo de nuevo en un momento.");
      if (r.status === 409 || r.status === 422) onStale();
    } catch {
      setError("No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.");
    }
    setBusy(null);
  };
  return { pay, busy, error };
}

/* ───────────── Piezas ───────────── */

function Amounts({ rows }: { rows: { k: string; v: number; note?: string; strong?: boolean; ok?: boolean }[] }) {
  return (
    <dl className="flex flex-col rounded-md bg-card-muted px-4 py-1.5">
      {rows.map((x, i) => (
        <div key={x.k} className={`flex items-baseline justify-between gap-4 py-2.5 ${i ? "border-t-2 border-dotted border-on-light/15" : ""}`}>
          <dt className={`min-w-0 ${x.strong ? "font-extrabold" : "font-semibold"}`}>
            {x.k}
            {x.note && <span className="block text-[.82rem] font-medium opacity-80">{x.note}</span>}
          </dt>
          <dd className={`flex flex-none items-center gap-1.5 tabular-nums ${x.strong ? "display text-[1.9rem] leading-none" : "font-bold"}`}>
            {x.ok && <CheckIcon size={15} className="text-[color-mix(in_srgb,var(--color-accent)_70%,var(--color-on-light))]" />}
            {cop(x.v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Spinner() {
  return <span aria-hidden="true" className="size-5 flex-none animate-spin-fast rounded-full border-3 border-current border-r-transparent" />;
}

const tone = {
  wait: "bg-[color-mix(in_srgb,var(--color-highlight)_26%,var(--color-card))]",
  ok: "bg-[color-mix(in_srgb,var(--color-accent)_30%,var(--color-card))]",
  bad: "bg-[color-mix(in_srgb,var(--color-status-cancelled)_34%,var(--color-card))]",
  plain: "bg-card",
};

function Panel({ t = "plain", eyebrow, title, children }: { t?: keyof typeof tone; eyebrow?: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby="pay-title" className={`flex flex-col gap-3.5 rounded-lg p-[clamp(20px,3.5vw,32px)] text-on-light ${tone[t]}`}>
      {eyebrow && <span className="text-[.74rem] font-extrabold tracking-[.08em] uppercase">{eyebrow}</span>}
      <h2 id="pay-title" className="display text-[clamp(1.9rem,4.5vw,2.5rem)] leading-[.95]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Declined({ p }: { p: PublicPayment | null }) {
  if (!p || (p.status !== "declined" && p.status !== "error")) return null;
  return (
    <p role="alert" className="rounded-md bg-[color-mix(in_srgb,var(--color-status-cancelled)_30%,var(--color-card))] px-4 py-3 text-[.92rem] font-semibold">
      Tu último intento de pago no fue aprobado{p.detail ? `: ${p.detail.replace(/\.?$/, ".")}` : "."} Puedes intentarlo de nuevo con otro medio de pago.
    </p>
  );
}

export const payLabel = (kind: PaymentKind, amount: number) => (kind === "deposit" ? `Pagar abono de ${cop(amount)}` : kind === "full" ? `Pagar el total: ${cop(amount)}` : `Pagar saldo de ${cop(amount)}`);

function PayButton({ kind, amount, busy, onPay, blocked }: { kind: PaymentKind; amount: number; busy: PaymentKind | null; onPay: (k: PaymentKind) => void; blocked?: boolean }) {
  return (
    <button type="button" onClick={() => onPay(kind)} disabled={!!busy || blocked} aria-busy={busy === kind} className="btn btn-highlight min-h-14 self-start px-7 text-[1.02rem] disabled:opacity-60">
      {busy === kind && <Spinner />}
      {busy === kind ? "Abriendo el pago…" : payLabel(kind, amount)}
    </button>
  );
}

export type Plan = Extract<PaymentKind, "deposit" | "full">;

// ¿Cuánto pagar para confirmar? El abono (y el saldo después) o el total de una vez.
// `wide`: las dos opciones lado a lado (pantallas anchas); si no, una debajo de la otra.
export function PlanChoice({ value, onChange, deposit, total, pct, disabled, wide }: { value: Plan; onChange: (p: Plan) => void; deposit: number; total: number; pct: number; disabled?: boolean; wide?: boolean }) {
  const options: { id: Plan; title: string; amount: number; note: string }[] = [
    { id: "deposit", title: `Abono del ${pct} %`, amount: deposit, note: `Confirma tu reserva. El saldo de ${cop(total - deposit)} lo pagas en línea antes de llegar o en la hora siguiente al check-in.` },
    { id: "full", title: "Pago total", amount: total, note: "Confirma tu reserva y deja la estadía pagada: no pagas nada al llegar." },
  ];
  return (
    <div role="radiogroup" aria-label="¿Cuánto quieres pagar ahora?" className={`grid grid-cols-1 gap-2.5 ${wide ? "sm:grid-cols-2" : ""}`}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.id)}
            className={`flex min-w-0 flex-col gap-1 rounded-md border-2 bg-card px-4 py-3.5 text-left text-on-light transition-[border-color,box-shadow] disabled:opacity-60 ${on ? "border-on-light shadow-[0_0_0_3px_var(--color-highlight)]" : "border-card-muted enabled:hover:border-on-light/45"}`}
          >
            <span className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-extrabold">
                <span aria-hidden="true" className={`grid size-5 flex-none place-items-center rounded-full border-2 border-on-light`}>
                  {on && <span className="size-2.5 rounded-full bg-on-light" />}
                </span>
                {o.title}
              </span>
              <span className="display text-[1.7rem] leading-none tabular-nums">{cop(o.amount)}</span>
            </span>
            <span className="text-[.84rem] leading-snug">{o.note}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ───────────── Tarjeta por etapa ───────────── */

/**
 * Lo que el huésped debe saber y hacer ahora. `access`: con qué se identifica para pagar (null: solo lectura).
 * `onRefresh`: volver a consultar la API (al vencer un plazo o cuando la API rechaza un pago por estado).
 */
// `terms`: casilla de políticas antes de pagar (enlace de pago de una reserva tomada por el equipo, que el huésped aún no aceptó).
export function PaymentStage({ r, access, onRefresh, terms }: { r: PublicReservation; access: PayAccess | null; onRefresh: () => void; terms?: { accepted: boolean; onChange: (v: boolean) => void } }) {
  const { c } = useSite();
  const stage0 = stageOf(r);
  const live = stage0 === "awaiting_deposit" || stage0 === "balance_due";
  const now = useServerNow(r.serverNow, live);
  const stage: Stage = live ? stageOf(r, now) : stage0;
  const m = moneyOf(r);
  const { pay, busy, error } = usePay(access, onRefresh);
  const [plan, setPlan] = useState<Plan>("deposit");
  const confirming = latestConfirming(r);
  const balance = latestPayment(r, "balance");

  // Al llegar un plazo a cero, el servidor decide (registra el vencimiento) y la página se actualiza con su respuesta.
  const deadline = stage0 === "awaiting_deposit" ? r.depositDueAt : stage0 === "balance_due" ? r.balanceDueAt : null;
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!deadline || Date.parse(deadline) > now || asked.current === deadline) return;
    asked.current = deadline;
    onRefresh();
  }, [deadline, now, onRefresh]);

  const errorBox = error && (
    <p role="alert" className="font-bold text-error">
      {error}
    </p>
  );
  const whatsapp = (text: string) => (
    <a href={wa(c.whatsapp, text)} target="_blank" rel="noopener" className="btn btn-outline-light min-h-12 gap-2 self-start px-5">
      <WhatsAppIcon />
      Escribir por WhatsApp
    </a>
  );

  switch (stage) {
    case "awaiting_deposit":
      return (
        <Panel t="wait" eyebrow="Pago pendiente · reserva sin confirmar" title="Paga para confirmar tu reserva">
          <p className="font-semibold">
            {/* Las retenciones de la web duran minutos; las del enlace que envía el equipo, hasta 48 horas: si no es hoy, también el día. */}
            Tus fechas quedan apartadas hasta {dateOf(r.depositDueAt) === todayISO() ? "las " : `el ${fmtDate(dateOf(r.depositDueAt))} a las `}
            <strong>{fmtClock(r.depositDueAt)}</strong>{" "}
            <span className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-0.5 text-[.88rem] font-extrabold tabular-nums" role="timer" aria-live="off">
              <ClockIcon size={14} />
              {fmtLeft(Date.parse(r.depositDueAt) - now)}
            </span>
            . Tu reserva se confirma cuando el pago sea aprobado.
          </p>
          {access ? (
            <>
              <PlanChoice value={plan} onChange={setPlan} deposit={m.deposit} total={m.total} pct={c.depositPct} disabled={!!busy} />
              <Declined p={confirming} />
              {terms && (
                <CheckOption card checked={terms.accepted} onChange={terms.onChange} note="Obligatorio para pagar">
                  Acepto las{" "}
                  <a href="/politicas" target="_blank" rel="noopener" className="underline underline-offset-2">
                    políticas de reserva
                  </a>{" "}
                  y autorizo el{" "}
                  <a href="/privacidad" target="_blank" rel="noopener" className="underline underline-offset-2">
                    tratamiento de mis datos
                  </a>
                  .
                </CheckOption>
              )}
              <PayButton kind={plan} amount={plan === "full" ? m.total : m.deposit} busy={busy} onPay={pay} blocked={!!terms && !terms.accepted} />
            </>
          ) : (
            <Amounts rows={[{ k: "Valor total", v: m.total }, { k: `Abono para confirmar (${c.depositPct} %)`, v: m.deposit, strong: true }]} />
          )}
          {errorBox}
          <p className="text-[.85rem]">Pagas en la pasarela segura de Wompi: tarjeta, PSE, Nequi o Bancolombia. Lo pagado para confirmar no es reembolsable.</p>
        </Panel>
      );
    case "deposit_processing":
      return (
        <Panel t="wait" eyebrow="Pago en proceso" title="Estamos confirmando tu pago">
          <p className="flex items-center gap-2.5 font-semibold" role="status">
            <Spinner />
            El banco está procesando {confirming?.kind === "full" ? "el pago total" : "el abono"} de {cop(confirming?.amount ?? m.deposit)}. Esta página se actualiza sola; no pagues de nuevo.
          </p>
          <p className="text-[.88rem]">Tus fechas siguen apartadas mientras llega la respuesta.</p>
        </Panel>
      );
    case "hold_expired":
      return (
        <Panel t="bad" eyebrow="Reserva no confirmada" title="El tiempo para pagar terminó">
          <p className="font-semibold">No recibimos un pago aprobado a tiempo y las fechas se liberaron. Puedes hacer una nueva reserva si siguen disponibles.</p>
          {confirming?.status === "approved" && confirming.needsRefund && <p className="font-bold">Tu pago llegó cuando las fechas ya no estaban disponibles. Nuestro equipo te contactará para devolverte el dinero.</p>}
          <div className="flex flex-wrap gap-2.5">
            <a href="/reservar" className="btn btn-cta min-h-12 self-start px-6">
              Reservar de nuevo
            </a>
            {whatsapp(`Hola, mi reserva ${r.code} venció sin confirmar. ¿Me ayudan?`)}
          </div>
        </Panel>
      );
    case "confirmed":
      if (!m.due)
        return (
          <Panel t="ok" eyebrow="Pago completo" title="Tu reserva está confirmada y pagada">
            <Amounts rows={[{ k: "Valor total", v: m.total }, { k: "Pagado", v: m.paid, ok: true }, { k: "Saldo", v: 0, strong: true }]} />
            <p className="text-[.9rem] font-semibold">
              No tienes nada pendiente por pagar. Check-in de {c.checkIn.replace(/\.$/, "")}. Presenta tu documento de identidad físico al llegar.
            </p>
          </Panel>
        );
      return (
        <Panel t="ok" eyebrow="Abono aprobado" title="Tu reserva está confirmada">
          <Amounts
            rows={[
              { k: "Valor total", v: m.total },
              { k: "Pagado", v: m.paid, ok: true },
              { k: "Saldo pendiente", v: m.due, strong: true, note: `Puedes pagarlo ahora o en línea después del check-in (tendrás ${BALANCE_MINUTES / 60} hora).` },
            ]}
          />
          <Declined p={balance} />
          {access && <PayButton kind="balance" amount={m.due} busy={busy} onPay={pay} />}
          {errorBox}
          <p className="text-[.9rem] font-semibold">
            Check-in de {c.checkIn.replace(/\.$/, "")}. Presenta tu documento de identidad físico al llegar.
          </p>
        </Panel>
      );
    case "balance_due":
      return (
        <Panel t="wait" eyebrow="Check-in realizado" title="Tu reserva está activa">
          <p className="text-[1.05rem] font-bold">Para completar el servicio debes realizar el pago pendiente de {cop(m.due)}.</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-card px-4 py-3" role="timer" aria-live="off">
            <ClockIcon size={22} />
            <span className="display text-[2.4rem] leading-none tabular-nums">{fmtLeft(Date.parse(r.balanceDueAt!) - now)}</span>
            <span className="text-[.9rem] font-semibold">para pagar · hasta las {fmtClock(r.balanceDueAt!)}</span>
          </div>
          <Amounts rows={[{ k: "Valor total", v: m.total }, { k: "Ya pagado", v: m.paid, ok: true }, { k: "Saldo restante", v: m.due, strong: true }]} />
          <Declined p={balance} />
          {access && <PayButton kind="balance" amount={m.due} busy={busy} onPay={pay} />}
          {errorBox}
        </Panel>
      );
    case "balance_processing":
      return (
        <Panel t="wait" eyebrow={r.status === "checked_in" ? "Check-in realizado" : "Pago del saldo"} title="Estamos confirmando el pago del saldo">
          <p className="flex items-center gap-2.5 font-semibold" role="status">
            <Spinner />
            El banco está procesando el pago de {cop(balance?.amount ?? m.due)}. Esta página se actualiza sola; no pagues de nuevo.
          </p>
          <Amounts rows={[{ k: "Valor total", v: m.total }, { k: "Ya pagado", v: m.paid, ok: true }, { k: "Saldo en proceso", v: m.due, strong: true }]} />
        </Panel>
      );
    case "balance_overdue":
      return (
        <Panel t="bad" eyebrow="Saldo pendiente" title="Venció el plazo para pagar el saldo en línea">
          <p className="font-semibold">
            La hora para pagar en línea terminó{r.balanceDueAt ? ` a las ${fmtClock(r.balanceDueAt).replace(/\.$/, "")}` : ""}. Para completar el servicio, paga {cop(m.due)} en recepción
            {c.datosPagoAbono && !c.datosPagoAbono.includes("{") ? ` o por transferencia: ${c.datosPagoAbono}` : ""}.
          </p>
          <Amounts rows={[{ k: "Valor total", v: m.total }, { k: "Ya pagado", v: m.paid, ok: true }, { k: "Saldo pendiente", v: m.due, strong: true }]} />
          {whatsapp(`Hola, necesito pagar el saldo de mi reserva ${r.code}.`)}
        </Panel>
      );
    case "paid_in_full":
      return (
        <Panel t="ok" eyebrow="Pago completo" title="¡Todo listo! Tu estadía está pagada">
          <Amounts rows={[{ k: "Valor total", v: m.total }, { k: "Pagado", v: m.paid, ok: true }, { k: "Saldo", v: 0, strong: true }]} />
          <p className="font-semibold">Disfruta tu estadía. El check-out es hasta las {c.checkOut}.</p>
        </Panel>
      );
    case "completed":
      return (
        <Panel t="ok" eyebrow="Estadía finalizada" title="¡Gracias por visitarnos!">
          <Amounts rows={[{ k: "Valor total", v: m.total }, { k: "Pagado", v: m.paid, ok: true }]} />
        </Panel>
      );
    default:
      return (
        <Panel t="bad" eyebrow="Reserva cancelada" title="Esta reserva fue cancelada">
          <p className="font-semibold">Según nuestras políticas, el abono no es reembolsable. Si tienes dudas, escríbenos.</p>
          {whatsapp(`Hola, tengo una pregunta sobre mi reserva cancelada ${r.code}.`)}
        </Panel>
      );
  }
}

/* ───────────── Historial ───────────── */

const dot: Record<string, string> = { success: "bg-accent", danger: "bg-error", warning: "bg-highlight", info: "bg-[var(--color-status-rescheduled)]", neutral: "bg-card-muted" };

// Intentos de pago (el huésped ve si un pago quedó rechazado, en proceso o aprobado, y por qué medio).
export function PaymentHistory({ payments }: { payments?: PublicPayment[] }) {
  const list = (payments ?? []).filter((p) => p.status !== "expired" || p.detail !== "Reemplazado por un nuevo intento de pago");
  if (!list.length) return null;
  return (
    <section aria-labelledby="pay-hist" className="flex flex-col gap-3 rounded-lg bg-card p-[clamp(20px,3.5vw,32px)] text-on-light">
      <h2 id="pay-hist" className="display text-[1.7rem] leading-none">
        Tus pagos
      </h2>
      <ul className="flex flex-col">
        {list.map((p, i) => {
          const st = PAYMENT_STATUS[p.status];
          return (
            <li key={p.reference} className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 ${i ? "border-t-2 border-dotted border-card-muted" : ""}`}>
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-bold">
                  <span aria-hidden="true" className={`size-2.5 flex-none rounded-full ${dot[st.tone]}`} />
                  {kindLabel(p.kind)} · {st.label}
                </span>
                <span className="block text-[.82rem]">
                  {fmtDateTime(p.approvedAt ?? p.createdAt)}
                  {p.method ? ` · ${methodLabel(p.method)}` : ""}
                  {(p.status === "declined" || p.status === "error") && p.detail ? ` · ${p.detail}` : ""}
                </span>
              </span>
              <strong className="tabular-nums">{cop(p.amount)}</strong>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
