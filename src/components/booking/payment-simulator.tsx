"use client";

// Pasarela simulada: hace lo que haría el checkout de Wompi (aprobar, rechazar, dejar pendiente o abandonar) y vuelve
// a la página del pago. El resultado pasa por la misma función de la base de datos que los eventos reales de Wompi.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type ApiError } from "@/lib/api";
import { cop, fmtClock } from "@/lib/format";
import { kindLabel } from "@/lib/payments";
import type { PaymentState } from "@/lib/types";
import { fmtLeft, useServerNow } from "@/components/booking/reservation-payments";

type Outcome = "approve" | "decline" | "pending" | "error";

const ERRORS: Record<string, string> = {
  CHECKOUT_EXPIRED: "La ventana de pago ya venció: la pasarela no acepta pagos nuevos para este intento.",
  NOT_FOUND: "El simulador no está disponible en este entorno.",
  NOT_SIMULATED: "Este pago no es de la pasarela simulada.",
};

export function PaymentSimulator() {
  const ref = (useSearchParams().get("ref") ?? "").toUpperCase();
  const router = useRouter();
  const [state, setState] = useState<PaymentState | null | "missing">(null);
  const [busy, setBusy] = useState<Outcome | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.paymentStatus({ ref }).then(
      (r) => setState(r.status === 200 && r.data ? r.data : "missing"),
      () => setState("missing"),
    );
  }, [ref]);

  const data = state && state !== "missing" ? state : null;
  const now = useServerNow(data?.reservation.serverNow, !!data);

  if (state === null) return <div role="status" aria-label="Cargando" className="skeleton h-[320px] rounded-lg" />;
  if (!data)
    return (
      <div className="rounded-lg bg-card p-8 text-on-light">
        <h1 className="display text-[2.4rem] leading-none">Pago no encontrado</h1>
      </div>
    );

  const p = data.payment;
  const open = p.status === "initiated" || p.status === "pending";
  const left = p.expiresAt ? Date.parse(p.expiresAt) - now : 0;

  async function act(outcome: Outcome) {
    setBusy(outcome);
    setError("");
    try {
      const r = await api.simulatePayment({ ref, outcome });
      if (r.status === 200) return router.push(`/confirmacion?ref=${encodeURIComponent(ref)}`);
      setError(ERRORS[(r.data as ApiError | null)?.error ?? ""] ?? "No se pudo simular el pago.");
    } catch {
      setError("No se pudo conectar con el servidor.");
    }
    setBusy(null);
  }

  const button = (o: Outcome, label: string, cls: string) => (
    <button type="button" onClick={() => act(o)} disabled={!!busy} className={`btn min-h-14 px-6 disabled:opacity-60 ${cls}`}>
      {busy === o ? "Procesando…" : label}
    </button>
  );

  return (
    <section aria-labelledby="sim-title" className="flex flex-col gap-5 rounded-lg bg-card p-[clamp(22px,4vw,40px)] text-on-light">
      <p className="self-start rounded-full bg-highlight px-3.5 py-1 text-[.8rem] font-extrabold tracking-[.06em] uppercase">
        Modo de pruebas · no se cobra dinero
      </p>
      <div>
        <h1 id="sim-title" className="display text-[clamp(2.2rem,5vw,3.2rem)] leading-none">
          Pasarela de pagos simulada
        </h1>
        <p className="mt-1.5 font-semibold">Reemplaza al checkout de Wompi mientras no haya llaves configuradas. Elige qué responde el banco.</p>
      </div>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-3 rounded-md bg-card-muted p-4">
        <div>
          <dt className="text-[.72rem] font-extrabold tracking-[.06em] uppercase">Concepto</dt>
          <dd className="font-bold">
            {kindLabel(p.kind)} · reserva {data.reservation.code}
          </dd>
        </div>
        <div>
          <dt className="text-[.72rem] font-extrabold tracking-[.06em] uppercase">Valor</dt>
          <dd className="display text-[2rem] leading-none">{cop(p.amount)}</dd>
        </div>
        <div>
          <dt className="text-[.72rem] font-extrabold tracking-[.06em] uppercase">Referencia</dt>
          <dd className="font-bold break-all">{p.reference}</dd>
        </div>
        {p.expiresAt && (
          <div>
            <dt className="text-[.72rem] font-extrabold tracking-[.06em] uppercase">La ventana cierra</dt>
            <dd className="font-bold tabular-nums">
              {fmtClock(p.expiresAt)} · {left > 0 ? fmtLeft(left) : "vencida"}
            </dd>
          </div>
        )}
      </dl>

      {open ? (
        <div className="flex flex-col gap-3">
          {p.status === "pending" && <p className="font-bold">Este pago quedó pendiente en el banco. Resuélvelo:</p>}
          <div className="flex flex-wrap gap-2.5">
            {button("approve", "Aprobar pago", "btn-highlight")}
            {button("decline", "Rechazar (fondos insuficientes)", "btn-outline-light")}
            {p.status === "initiated" && button("pending", "Dejar pendiente (PSE)", "btn-outline-light")}
            {button("error", "Error del banco", "btn-outline-light")}
          </div>
          <Link href={`/confirmacion?ref=${encodeURIComponent(ref)}`} className="self-start font-bold underline">
            Volver sin pagar
          </Link>
        </div>
      ) : (
        <p className="font-bold">
          Este pago ya terminó ({p.status}).{" "}
          <Link href={`/confirmacion?ref=${encodeURIComponent(ref)}`} className="underline">
            Ver el resultado
          </Link>
        </p>
      )}
      {error && (
        <p role="alert" className="font-bold text-error">
          {error}
        </p>
      )}
    </section>
  );
}
