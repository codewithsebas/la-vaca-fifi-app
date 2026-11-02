"use client";

// Estado de pago de una reserva para el huésped («Mi reserva» y la confirmación): qué falta, cuánto y hasta cuándo.
// Los pagos se hacen por transferencia y el equipo los registra. El plazo del abono viene del servidor (depositDueAt) y la
// cuenta regresiva usa su hora (serverNow); cuando llega a cero se vuelve a consultar la API, que es la que decide.
import { useEffect, useRef, useState } from "react";
import { cop, dateOf, fmtClock, fmtDate, fmtDateTime, todayISO, wa } from "@/lib/format";
import { PAYMENT_STATUS, depositPctOf, kindLabel, moneyOf, stageOf, type Stage } from "@/lib/payments";
import type { PublicPayment, PublicReservation } from "@/lib/types";
import { CheckIcon, ClockIcon, WhatsAppIcon } from "@/components/ui/icons";
import { useSite } from "@/components/site/site-provider";

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

/* ───────────── Tarjeta por etapa ───────────── */

// Lo que el huésped debe saber y hacer ahora. `onRefresh`: volver a consultar la API al vencer el plazo del abono.
export function PaymentStage({ r, onRefresh }: { r: PublicReservation; onRefresh: () => void }) {
  const { c } = useSite();
  const stage0 = stageOf(r);
  const live = stage0 === "awaiting_deposit";
  const now = useServerNow(r.serverNow, live);
  const stage: Stage = live ? stageOf(r, now) : stage0;
  const m = moneyOf(r);
  // Datos para la transferencia (Condiciones de pago, en el panel); mientras no se configuren, solo se ofrece WhatsApp.
  const transfer = c.datosPagoAbono && !c.datosPagoAbono.includes("{") ? c.datosPagoAbono : "";

  // Al llegar el plazo a cero, el servidor decide (registra el vencimiento) y la página se actualiza con su respuesta.
  const deadline = stage0 === "awaiting_deposit" ? r.depositDueAt : null;
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!deadline || Date.parse(deadline) > now || asked.current === deadline) return;
    asked.current = deadline;
    onRefresh();
  }, [deadline, now, onRefresh]);

  const whatsapp = (text: string) => (
    <a href={wa(c.whatsapp, text)} target="_blank" rel="noopener" className="btn btn-outline-light min-h-12 gap-2 self-start px-5">
      <WhatsAppIcon />
      Escribir por WhatsApp
    </a>
  );

  switch (stage) {
    case "awaiting_deposit":
      return (
        <Panel t="wait" eyebrow="Pago pendiente · reserva sin confirmar" title="Paga el abono para confirmar tu reserva">
          <p className="font-semibold">
            Tus fechas quedan apartadas hasta {dateOf(r.depositDueAt) === todayISO() ? "las " : `el ${fmtDate(dateOf(r.depositDueAt))} a las `}
            <strong>{fmtClock(r.depositDueAt)}</strong>{" "}
            <span
              className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-0.5 text-[.88rem] font-extrabold tabular-nums"
              role="timer"
              aria-live="off"
            >
              <ClockIcon size={14} />
              {fmtLeft(Date.parse(r.depositDueAt) - now)}
            </span>
            . Tu reserva se confirma cuando recibamos el abono.
          </p>
          <Amounts
            rows={[
              { k: "Valor total", v: m.total },
              { k: `Abono para confirmar (${depositPctOf(r.quote)} %)`, v: m.deposit, strong: true },
            ]}
          />
          <p className="text-[.92rem] font-semibold">
            {transfer ? `Paga por transferencia: ${transfer}. ` : ""}Después envíanos el comprobante y confirmamos tu reserva. Lo pagado para confirmar no es
            reembolsable.
          </p>
          {whatsapp(`Hola, quiero pagar el abono de mi reserva ${r.code}.`)}
        </Panel>
      );
    case "hold_expired":
      return (
        <Panel t="bad" eyebrow="Reserva no confirmada" title="El tiempo para pagar terminó">
          <p className="font-semibold">No recibimos el abono a tiempo y las fechas se liberaron. Puedes hacer una nueva reserva si siguen disponibles.</p>
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
            <Amounts
              rows={[
                { k: "Valor total", v: m.total },
                { k: "Pagado", v: m.paid, ok: true },
                { k: "Saldo", v: 0, strong: true },
              ]}
            />
            <p className="text-[.9rem] font-semibold">
              No tienes nada pendiente por pagar. Check-in de {c.checkIn.replace(/\.$/, "")}. Presenta tu documento de identidad físico al llegar.
            </p>
          </Panel>
        );
      return (
        <Panel t="ok" eyebrow="Abono recibido" title="Tu reserva está confirmada">
          <Amounts
            rows={[
              { k: "Valor total", v: m.total },
              { k: "Pagado", v: m.paid, ok: true },
              { k: "Saldo pendiente", v: m.due, strong: true, note: "Puedes pagarlo por transferencia antes de llegar o en recepción." },
            ]}
          />
          <p className="text-[.9rem] font-semibold">Check-in de {c.checkIn.replace(/\.$/, "")}. Presenta tu documento de identidad físico al llegar.</p>
        </Panel>
      );
    case "balance_due":
      return (
        <Panel t="wait" eyebrow="Check-in realizado" title="Tu reserva está activa">
          <p className="text-[1.05rem] font-bold">
            Para completar el servicio paga el saldo de {cop(m.due)} en recepción{transfer ? ` o por transferencia: ${transfer}` : ""}.
          </p>
          <Amounts
            rows={[
              { k: "Valor total", v: m.total },
              { k: "Ya pagado", v: m.paid, ok: true },
              { k: "Saldo restante", v: m.due, strong: true },
            ]}
          />
        </Panel>
      );
    case "paid_in_full":
      return (
        <Panel t="ok" eyebrow="Pago completo" title="¡Todo listo! Tu estadía está pagada">
          <Amounts
            rows={[
              { k: "Valor total", v: m.total },
              { k: "Pagado", v: m.paid, ok: true },
              { k: "Saldo", v: 0, strong: true },
            ]}
          />
          <p className="font-semibold">Disfruta tu estadía. El check-out es hasta las {c.checkOut}.</p>
        </Panel>
      );
    case "completed":
      return (
        <Panel t="ok" eyebrow="Estadía finalizada" title="¡Gracias por visitarnos!">
          <Amounts
            rows={[
              { k: "Valor total", v: m.total },
              { k: "Pagado", v: m.paid, ok: true },
            ]}
          />
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

const dot: Record<string, string> = {
  success: "bg-accent",
  danger: "bg-error",
  warning: "bg-highlight",
  info: "bg-[var(--color-status-rescheduled)]",
  neutral: "bg-card-muted",
};

// Pagos registrados de la reserva.
export function PaymentHistory({ payments }: { payments?: PublicPayment[] }) {
  const list = (payments ?? []).filter((p) => p.status === "approved");
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
            <li
              key={p.reference}
              className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 ${i ? "border-t-2 border-dotted border-card-muted" : ""}`}
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-bold">
                  <span aria-hidden="true" className={`size-2.5 flex-none rounded-full ${dot[st.tone]}`} />
                  {kindLabel(p.kind)} · {st.label}
                </span>
                <span className="block text-[.82rem]">{fmtDateTime(p.approvedAt ?? p.createdAt)}</span>
              </span>
              <strong className="tabular-nums">{cop(p.amount)}</strong>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
