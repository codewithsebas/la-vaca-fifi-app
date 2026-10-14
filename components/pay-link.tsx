"use client";

// Enlace de pago (/pagar/<token>) que el equipo envía por WhatsApp al tomar una reserva: el huésped ve su reserva, el
// tiempo que le queda y paga el abono o el total sin escribir código ni correo. El estado sale siempre del servidor y la
// página escucha el canal en tiempo real de la reserva (un pago aprobado, un plazo ampliado por el equipo…).
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cop, fmtFullDate, nightsBetween, plural, wa } from "@/lib/format";
import { useReservationSync } from "@/lib/live-sync";
import type { PublicReservation } from "@/lib/types";
import { WhatsAppIcon } from "./icons";
import { PaymentHistory, PaymentStage } from "./reservation-payments";
import { useSite } from "./site-provider";
import { KeyValues, StatusPill } from "./status-pill";

type State = (PublicReservation & { termsAccepted?: boolean }) | null | "missing" | "error";

export function PayLink({ token }: { token: string }) {
  const { c, cabinName } = useSite();
  const [state, setState] = useState<State>(null);
  const [accepted, setAccepted] = useState(false);

  const load = useCallback(() => {
    api.lookup({ token }).then(
      (r) => setState((prev) => (r.status === 200 && r.data ? r.data : prev && typeof prev === "object" ? prev : r.status === 404 ? "missing" : "error")),
      () => setState((prev) => (prev && typeof prev === "object" ? prev : "error")),
    );
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const r = state && typeof state === "object" ? state : null;
  useReservationSync(r?.liveKey, load);

  if (state === null)
    return (
      <div role="status" aria-label="Cargando tu reserva" className="flex flex-col gap-3 rounded-lg bg-card p-7">
        <span className="skeleton h-[26px] w-2/5 rounded-sm" />
        <span className="skeleton h-[60px] w-[70%] rounded-sm" />
        <span className="skeleton h-[90px] rounded-md" />
      </div>
    );

  if (!r)
    return (
      <section aria-labelledby="pl-title" className="flex flex-col items-start gap-4 rounded-lg bg-surface p-[clamp(22px,4vw,36px)]">
        <h1 id="pl-title" className="display text-[clamp(2.2rem,6vw,3.2rem)] leading-none">
          {state === "missing" ? "Este enlace no es válido" : "No pudimos cargar tu reserva"}
        </h1>
        <p className="max-w-[52ch] text-on-dark-muted">
          {state === "missing" ? "Revisa que el enlace esté completo o pídenos uno nuevo por WhatsApp." : "Revisa tu conexión e inténtalo de nuevo en un momento."}
        </p>
        <div className="flex flex-wrap gap-2.5">
          {state === "error" && (
            <button type="button" onClick={load} className="btn btn-card min-h-12 px-6">
              Intentar de nuevo
            </button>
          )}
          <a href={wa(c.whatsapp, "Hola, necesito un enlace de pago para mi reserva.")} target="_blank" rel="noopener" className="btn btn-outline-dark min-h-12 gap-2 px-6">
            <WhatsAppIcon />
            Escribir por WhatsApp
          </a>
        </div>
      </section>
    );

  const nights = nightsBetween(r.checkIn, r.checkOut);
  const rows = [
    { k: "Cabaña", v: cabinName(r.cabinTypeId), wide: true },
    { k: "Llegada", v: `${fmtFullDate(r.checkIn)} · ${c.checkIn}` },
    { k: "Salida", v: `${fmtFullDate(r.checkOut)} · hasta las ${c.checkOut}` },
    { k: "Estadía", v: plural(nights, "noche", "noches") },
    { k: "Valor total", v: cop(r.quote.total) },
  ];
  const needsTerms = !r.termsAccepted && r.status === "pending_deposit";

  return (
    // Móvil: saludo → pago → detalles. Escritorio: saludo y detalles a la izquierda, pago a la derecha (fijo al desplazar).
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:grid-rows-[auto_1fr]">
      <section aria-labelledby="pl-title" className="flex flex-col gap-3.5 rounded-lg bg-card p-[clamp(22px,4vw,36px)] text-on-light lg:col-start-1">
        <StatusPill status={r.status} />
        <div className="flex flex-col gap-1">
          <p className="font-display text-[1.6rem] leading-none">{r.guestFirstName ? `Hola, ${r.guestFirstName}` : "Hola"}</p>
          <h1 id="pl-title" className="display text-[clamp(2.4rem,7vw,3.6rem)] leading-none tracking-[.04em]">
            Reserva {r.code}
          </h1>
          <p className="font-bold">
            {cabinName(r.cabinTypeId)} · {plural(nights, "noche", "noches")}
          </p>
        </div>
      </section>

      <div className="flex flex-col gap-5 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <PaymentStage r={r} access={{ token, accept: accepted }} onRefresh={load} terms={needsTerms ? { accepted, onChange: setAccepted } : undefined} />
        <PaymentHistory payments={r.payments} />
      </div>

      <section aria-labelledby="pl-details" className="flex flex-col gap-4 rounded-lg bg-card p-[clamp(22px,4vw,36px)] text-on-light lg:col-start-1">
        <h2 id="pl-details" className="display text-[2rem] leading-none">
          Tu estadía
        </h2>
        <KeyValues rows={rows} />
        <a href={wa(c.whatsapp, `Hola, tengo una pregunta sobre mi reserva ${r.code}.`)} target="_blank" rel="noopener" className="btn btn-outline-light min-h-12 gap-2 self-start px-5">
          <WhatsAppIcon />
          ¿Dudas? Escríbenos
        </a>
      </section>
    </div>
  );
}
