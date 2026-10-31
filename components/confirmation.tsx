"use client";

// Página a la que vuelve el huésped después de la pasarela (/confirmacion?ref=…&id=…).
// El estado sale siempre del servidor (sobrevive a recargas): la reserva solo aparece confirmada cuando el pago fue aprobado.
// Mientras el pago siga en proceso, la página escucha el canal en tiempo real de la reserva y, sin conexión en vivo, consulta cada pocos segundos.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cop, dirHref, download, fmtDate, ics, nightsBetween, plural, wa } from "@/lib/format";
import { rememberReservation, rememberedReservation } from "@/lib/last-reservation";
import { useReservationSync } from "@/lib/live-sync";
import { moneyOf } from "@/lib/payments";
import { fmtTime } from "@/lib/site";
import type { PaymentState } from "@/lib/types";
import { CalendarIcon, PinIcon, WhatsAppIcon } from "./icons";
import { PaymentHistory, PaymentStage } from "./reservation-payments";
import { useSite } from "./site-provider";
import { KeyValues, StatusPill } from "./status-pill";

const REF = /^[A-Z0-9-]{8,60}$/;

export function Confirmation() {
  const params = useSearchParams();
  const router = useRouter();
  const { c, cabinName } = useSite();
  const ref = (params.get("ref") ?? "").trim().toUpperCase();
  const txId = params.get("id") ?? undefined; // la transacción que agrega Wompi al volver
  const legacyCode = params.get("code");
  const [state, setState] = useState<PaymentState | null | "missing" | "error">(null);
  const [copied, setCopied] = useState(false);
  const seq = useRef(0);

  const load = useCallback(
    (withTx = false) => {
      const s = ++seq.current;
      api.paymentStatus({ ref, id: withTx ? txId : undefined }).then(
        (r) => {
          if (s !== seq.current) return;
          if (r.status === 200 && r.data) {
            setState(r.data);
            const saved = rememberedReservation(r.data.reservation.code);
            if (saved) rememberReservation(saved.code, saved.email);
          } else setState((prev) => (prev && typeof prev === "object" ? prev : r.status === 404 ? "missing" : "error"));
        },
        () => s === seq.current && setState((prev) => (prev && typeof prev === "object" ? prev : "error")),
      );
    },
    [ref, txId],
  );

  // Enlaces antiguos (/confirmacion?code=…) → «Mi reserva».
  useEffect(() => {
    if (!ref && legacyCode) router.replace(`/mi-reserva?code=${encodeURIComponent(legacyCode)}`);
  }, [ref, legacyCode, router]);

  useEffect(() => {
    if (REF.test(ref)) load(true);
  }, [ref, load]);

  const data = state && typeof state === "object" ? state : null;
  const live = useReservationSync(data?.reservation.liveKey, () => load());

  // Respaldo sin tiempo real: mientras el pago esté abierto o en proceso, se consulta cada 6 s.
  const waiting = !!data && (data.payment.status === "pending" || data.payment.status === "initiated");
  useEffect(() => {
    if (!waiting || live === "live") return;
    const t = setInterval(() => load(), 6000);
    return () => clearInterval(t);
  }, [waiting, live, load]);

  useEffect(() => {
    if (data) document.getElementById("c-title")?.focus({ preventScroll: true });
  }, [data?.payment.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!REF.test(ref)) {
    if (legacyCode) return null;
    return <Missing />;
  }
  if (state === null)
    return (
      <div role="status" aria-label="Consultando tu pago" className="flex flex-col gap-3 rounded-lg bg-card p-8">
        <span className="skeleton h-[26px] w-2/5 rounded-sm" />
        <span className="skeleton h-[60px] w-[70%] rounded-sm" />
        <span className="skeleton h-[90px] rounded-md" />
      </div>
    );
  if (state === "missing") return <Missing />;
  if (state === "error")
    return (
      <div role="alert" className="flex flex-col items-start gap-3.5 rounded-lg bg-card p-8 text-on-light">
        <h1 className="display text-[2.4rem] leading-none">No pudimos consultar tu pago</h1>
        <p>Revisa tu conexión. Si ya pagaste, tu pago no se pierde: consulta tu reserva en un momento.</p>
        <button type="button" onClick={() => load(true)} className="btn btn-cta min-h-[52px] px-6">
          Reintentar
        </button>
      </div>
    );

  const { payment: p, reservation: r } = state;
  const m = moneyOf(r);
  const n = nightsBetween(r.checkIn, r.checkOut);
  const deposit = p.kind === "deposit" || p.kind === "full";
  const confirmed = deposit && !!r.depositPaidAt && p.status === "approved" && !p.needsRefund;
  const balancePaid = !deposit && p.status === "approved" && !p.needsRefund;
  const hero =
    p.status === "approved"
      ? p.needsRefund
        ? {
            tone: "bad",
            title: "Recibimos tu pago, pero no pudimos aplicarlo",
            text: "Las fechas ya no estaban disponibles o el pago estaba duplicado. Nuestro equipo te contactará para devolverte el dinero.",
          }
        : confirmed
          ? {
              tone: "ok",
              title: p.kind === "full" ? "¡Reserva confirmada y pagada!" : "¡Reserva confirmada!",
              text: `Tu pago fue aprobado${p.kind === "full" ? " y no tienes saldo pendiente" : ""}. Te enviamos la confirmación por correo${r.guestFirstName ? `, ${r.guestFirstName}` : ""}.`,
            }
          : balancePaid
            ? {
                tone: "ok",
                title: "¡Pago del saldo recibido!",
                text:
                  r.status === "checked_in"
                    ? "Tu estadía quedó completamente pagada."
                    : "Tu estadía quedó completamente pagada: no tienes que pagar nada al llegar.",
              }
            : { tone: "ok", title: "Pago aprobado", text: "Tu pago fue aprobado." }
      : p.status === "pending" || p.status === "initiated"
        ? {
            tone: "wait",
            title: "Estamos confirmando tu pago",
            text:
              p.status === "pending"
                ? "El banco está procesando la transacción. Esta página se actualiza sola apenas llegue la respuesta."
                : "Esperando la respuesta de la pasarela de pagos. Si no completaste el pago, puedes hacerlo abajo.",
          }
        : p.status === "expired"
          ? { tone: "wait", title: "Este pago no se completó", text: "La ventana de pago se cerró sin una transacción aprobada." }
          : {
              tone: "bad",
              title: "Tu pago no fue aprobado",
              text: `${p.detail ? p.detail.replace(/\.?$/, ". ") : ""}${deposit ? "Tu reserva todavía no está confirmada." : "Tu saldo sigue pendiente."}`,
            };
  const heroBg =
    hero.tone === "ok"
      ? "bg-card"
      : hero.tone === "bad"
        ? "bg-[color-mix(in_srgb,var(--color-status-cancelled)_30%,var(--color-card))]"
        : "bg-[color-mix(in_srgb,var(--color-highlight)_24%,var(--color-card))]";
  const saved = rememberedReservation(r.code);

  return (
    <>
      <section aria-labelledby="c-title" className={`flex flex-col gap-[18px] rounded-lg p-[clamp(22px,4vw,40px)] text-on-light ${heroBg}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusPill status={r.status} />
          {waiting && live !== "off" && (
            <span className="inline-flex items-center gap-1.5 text-[.82rem] font-semibold opacity-80">
              <span aria-hidden="true" className={`size-2 rounded-full ${live === "live" ? "bg-accent motion-safe:animate-pulse" : "bg-highlight"}`} />
              {live === "live" ? "Se actualiza en tiempo real" : "Conectando…"}
            </span>
          )}
        </div>
        <h1 id="c-title" tabIndex={-1} className="display text-[clamp(2.4rem,5vw,3.8rem)] leading-[.95]">
          {hero.title}
        </h1>
        <p aria-live="polite" className="text-[1.02rem] font-semibold">
          {hero.text}
        </p>
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
          <div>
            <span className="eyebrow block tracking-[.08em]">Código de reserva</span>
            <strong className="display text-[clamp(3rem,9vw,5rem)] leading-none tracking-[.04em]">{r.code}</strong>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(r.code).catch(() => {});
              setCopied(true);
            }}
            className="btn btn-outline-light min-h-11 px-[18px] font-bold"
          >
            {copied ? "Copiado ✓" : "Copiar código"}
          </button>
        </div>
        <KeyValues
          rows={[
            { k: "Cabaña", v: cabinName(r.cabinTypeId) },
            { k: "Llegada", v: `${fmtDate(r.checkIn, true)} · desde las ${fmtTime(c.checkInStart)}` },
            { k: "Salida", v: `${fmtDate(r.checkOut, true)} · hasta las ${c.checkOut}` },
            { k: "Valor total", v: `${cop(m.total)} · ${plural(n, "noche", "noches")}` },
          ]}
        />
        <p className="text-[.82rem]">Referencia del pago: {p.reference}</p>
      </section>

      <PaymentStage r={r} access={saved ? { code: saved.code, email: saved.email } : { ref: p.reference }} onRefresh={() => load()} />

      {(confirmed || r.status === "confirmed" || r.status === "rescheduled") && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,230px),1fr))] gap-2.5">
          <button
            type="button"
            onClick={() => download(`reserva-${r.code}.ics`, ics(r, c, cabinName(r.cabinTypeId)), "text/calendar")}
            className="btn btn-card min-h-14"
          >
            <CalendarIcon variant="plus" />
            Agregar al calendario
          </button>
          <a href={dirHref()} target="_blank" rel="noopener" className="btn btn-outline-dark min-h-14">
            <PinIcon />
            Cómo llegar
          </a>
          <a
            href={wa(c.whatsapp, `Hola, tengo una pregunta sobre mi reserva ${r.code}.`)}
            target="_blank"
            rel="noopener"
            className="btn btn-outline-dark min-h-14"
          >
            <WhatsAppIcon />
            Escribir por WhatsApp
          </a>
        </div>
      )}

      <PaymentHistory payments={r.payments} />

      <p>
        <Link href={`/mi-reserva?code=${encodeURIComponent(r.code)}`} className="font-bold underline">
          Consultar el estado de mi reserva
        </Link>
      </p>
    </>
  );
}

function Missing() {
  return (
    <div className="flex flex-col items-start gap-3.5 rounded-lg bg-card p-8 text-on-light">
      <h1 className="display text-[2.6rem] leading-none">No encontramos este pago</h1>
      <p>Si ya hiciste una reserva, consúltala con tu código y tu correo.</p>
      <div className="flex flex-wrap gap-2.5">
        <Link href="/mi-reserva" className="btn btn-cta min-h-[52px] px-6">
          Consultar mi reserva
        </Link>
        <Link href="/reservar" className="btn btn-outline-light min-h-[52px] px-6">
          Hacer una reserva
        </Link>
      </div>
    </div>
  );
}
