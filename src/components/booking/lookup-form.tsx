"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { api } from "@/lib/api";
import { cop, fmtDate, hoursUntilCheckIn, nightsBetween, plural, statusOf, wa } from "@/lib/format";
import { forgetReservation, rememberReservation, rememberedReservation } from "@/lib/last-reservation";
import { useReservationSync, type SyncStatus } from "@/lib/live-sync";
import { moneyOf, stageOf } from "@/lib/payments";
import type { PublicReservation } from "@/lib/types";
import { PaymentHistory, PaymentStage } from "@/components/booking/reservation-payments";
import { useSite } from "@/components/site/site-provider";
import { KeyValues, StatusPill } from "@/components/ui/status-pill";

const noop = () => () => {};
// Reserva guardada en este dispositivo para el código del enlace (o la última, sin código), como "CÓDIGO correo".
const savedSnapshot = (code: string) => {
  const s = rememberedReservation(code || null);
  return s ? `${s.code} ${s.email}` : "";
};

const CODE_RE = /^[A-Z0-9]{2,5}-[A-Z0-9]{3,8}$/;

// Qué cambió en una actualización en tiempo real.
function describeChange(a: PublicReservation, b: PublicReservation) {
  const sa = stageOf(a);
  const sb = stageOf(b);
  if (sa !== sb) {
    if (sb === "confirmed") return "¡Pago aprobado! Tu reserva quedó confirmada.";
    if (sb === "balance_due") return "Se registró tu check-in. Ya puedes pagar el saldo.";
    if (sb === "paid_in_full") return "Recibimos el pago del saldo. ¡Todo pagado!";
    if (sb === "balance_overdue") return "Venció el plazo para pagar el saldo en línea.";
    if (sb === "deposit_processing" || sb === "balance_processing") return "Tu pago está en proceso.";
  }
  if (a.status !== b.status) return `Tu reserva se actualizó: ${statusOf(b.status).label.toLowerCase()}.`;
  const lastA = a.payments?.[0];
  const lastB = b.payments?.[0];
  if (lastB && (lastB.reference !== lastA?.reference || lastB.status !== lastA?.status) && (lastB.status === "declined" || lastB.status === "error"))
    return "Tu último pago no fue aprobado.";
  if (a.checkIn !== b.checkIn || a.checkOut !== b.checkOut || a.cabinTypeId !== b.cabinTypeId) return "Se actualizaron las fechas o la cabaña de tu reserva.";
  if (JSON.stringify(a.quote) !== JSON.stringify(b.quote) || a.paid !== b.paid) return "Se actualizaron los valores de tu reserva.";
  return null;
}

function LiveBadge({ status }: { status: SyncStatus }) {
  if (status === "off") return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[.82rem] font-semibold opacity-80">
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${status === "live" ? "bg-accent motion-safe:animate-pulse" : status === "offline" ? "bg-error" : "bg-highlight"}`}
      />
      {status === "live" ? "Se actualiza en tiempo real" : status === "offline" ? "Reconectando…" : "Conectando…"}
    </span>
  );
}

export function LookupForm() {
  const params = useSearchParams();
  const { c, cabinName } = useSite();
  // El código llega en el enlace (desde la confirmación); el correo se completa si la reserva se hizo o consultó en este dispositivo.
  const urlCode = (params.get("code") ?? "").trim().toUpperCase();
  const [code, setCode] = useState(urlCode);
  const [email, setEmail] = useState("");
  const [errs, setErrs] = useState<{ code?: string; email?: string }>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PublicReservation | null>(null);
  const [notFound, setNotFound] = useState<false | "missing" | "failed">(false);
  const [found, setFound] = useState({ code: "", email: "" }); // con qué datos se encontró (actualizar y subir el comprobante)
  const [editing, setEditing] = useState(true); // formulario completo o resumen de la consulta
  const [liveNote, setLiveNote] = useState<{ id: number; text: string } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0); // solo vale la respuesta más reciente (consulta o actualización en tiempo real)

  // Resultado de una consulta. `auto`: al abrir la página con los datos guardados (no mueve el foco).
  const settle = (s: number, cd: string, m: string, r: Awaited<ReturnType<typeof api.lookup>> | null, auto: boolean) => {
    if (s !== seq.current) return;
    setLoading(false);
    if (r?.status === 200 && r.data) {
      setResult(r.data);
      setFound({ code: cd, email: m });
      setNotFound(false);
      setEditing(false);
      rememberReservation(cd, m);
    } else {
      setResult(null);
      setNotFound(r ? "missing" : "failed");
      setEditing(true);
      if (r?.status === 404) forgetReservation(cd);
    }
    if (!auto) setTimeout(() => document.getElementById("lk-result")?.focus(), 40);
  };
  const settleRef = useRef(settle);
  useEffect(() => {
    settleRef.current = settle;
  });

  // Los datos guardados solo existen en el navegador: se leen al hidratar (null en el servidor) y se aplican una vez.
  // Con código y correo conocidos, la reserva se consulta sola.
  const saved = useSyncExternalStore(
    noop,
    () => savedSnapshot(urlCode),
    () => null,
  );
  const [restored, setRestored] = useState(false);
  const [auto, setAuto] = useState<{ code: string; email: string } | null>(null);
  if (saved !== null && !restored) {
    setRestored(true);
    const [sc = "", sm = ""] = saved.split(" ");
    if (sc && sm) {
      setCode(sc);
      setEmail(sm);
      if (CODE_RE.test(sc)) {
        setLoading(true);
        setAuto({ code: sc, email: sm });
      }
    }
  }
  useEffect(() => {
    if (!auto) return;
    const s = ++seq.current;
    api.lookup(auto).then(
      (r) => settleRef.current(s, auto.code, auto.email, r, true),
      () => settleRef.current(s, auto.code, auto.email, null, true),
    );
  }, [auto]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cd = code.trim().toUpperCase();
    const m = email.trim();
    const next: typeof errs = {};
    if (!CODE_RE.test(cd)) next.code = "Escribe el código completo, por ejemplo VF-AB12C.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m)) next.email = "Escribe un correo válido.";
    if (next.code || next.email) {
      setErrs(next);
      (next.code ? codeRef : emailRef).current?.focus();
      return;
    }
    setErrs({});
    setLoading(true);
    setResult(null);
    setNotFound(false);
    setLiveNote(null);
    const s = ++seq.current;
    try {
      settle(s, cd, m, await api.lookup({ code: cd, email: m }), false);
    } catch {
      settle(s, cd, m, null, false);
    }
  }

  // Tiempo real: la base de datos avisa cuando cambia la reserva o uno de sus pagos (confirmación, check-in, saldo) y se vuelve
  // a consultar. También al vencer un plazo: el servidor registra el vencimiento y la respuesta trae el estado real.
  const resultRef = useRef(result);
  useEffect(() => {
    resultRef.current = result;
  });
  const refresh = useCallback(() => {
    if (!found.code) return;
    const s = ++seq.current;
    api
      .lookup(found)
      .then((r) => {
        if (s !== seq.current) return;
        if (r.status === 200 && r.data) {
          const prev = resultRef.current;
          setResult(r.data);
          const text = prev && describeChange(prev, r.data);
          if (text) {
            const id = s;
            setLiveNote({ id, text });
            setTimeout(() => setLiveNote((n) => (n?.id === id ? null : n)), 10_000);
          }
        } else if (r.status === 404) {
          setResult(null);
          setNotFound("missing");
          setEditing(true);
        }
      })
      .catch(() => {}); // sin conexión: se reintenta al reconectar
  }, [found]);
  const live = useReservationSync(result?.liveKey, refresh);

  const r = result;
  const active = !!r && ["pending_deposit", "confirmed", "rescheduled"].includes(r.status);
  const canChange = !!r && ["confirmed", "rescheduled"].includes(r.status) && hoursUntilCheckIn(r.checkIn, c.checkInStart) >= 120;
  const nights = r ? nightsBetween(r.checkIn, r.checkOut) : 0;
  const m = r ? moneyOf(r) : null;
  const rows =
    r && m
      ? [
          { k: "Llegada", v: `${fmtDate(r.checkIn, true)} · check-in ${c.checkIn}` },
          { k: "Salida", v: `${fmtDate(r.checkOut, true)} · hasta las ${c.checkOut}` },
          { k: "Valor total", v: cop(m.total) },
          { k: "Pagado", v: cop(m.paid) },
          { k: "Saldo pendiente", v: r.depositPaidAt ? cop(m.due) : `${cop(m.total - m.deposit)} después del abono` },
        ]
      : [];

  return (
    <>
      {editing ? (
        <form
          noValidate
          onSubmit={onSubmit}
          aria-describedby="lk-help"
          className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] items-end gap-4 rounded-lg bg-card p-[clamp(18px,3vw,28px)] text-on-light"
        >
          <p id="lk-help" className="col-span-full font-semibold">
            Escribe el código que recibiste (por ejemplo VF-AB12C) y el correo con el que reservaste.
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="lk-code" className="field-label">
              Código de reserva
            </label>
            <input
              ref={codeRef}
              id="lk-code"
              name="code"
              autoComplete="off"
              autoCapitalize="characters"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-invalid={!!errs.code}
              aria-describedby="lk-code-e"
              className="field-input uppercase"
            />
            <p id="lk-code-e" aria-live="polite" className="field-error min-h-[1em]">
              {errs.code}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="lk-email" className="field-label">
              Correo
            </label>
            <input
              ref={emailRef}
              id="lk-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errs.email}
              aria-describedby="lk-email-e"
              className="field-input"
            />
            <p id="lk-email-e" aria-live="polite" className="field-error min-h-[1em]">
              {errs.email}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <button type="submit" disabled={loading} className="btn btn-cta min-h-[52px] px-[26px]">
              {loading ? "Buscando…" : "Consultar"}
            </button>
            <p className="min-h-[1em]" />
          </div>
        </form>
      ) : (
        // Consulta hecha: el formulario se resume en una línea para que la reserva quede arriba.
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg bg-card px-[clamp(18px,3vw,28px)] py-4 text-on-light">
          <p className="min-w-0 text-[.95rem]">
            <span className="field-label block">Reserva consultada</span>
            <strong>{found.code}</strong> · <span className="break-all">{found.email}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              setCode("");
              setEditing(true);
              setTimeout(() => codeRef.current?.focus(), 30);
            }}
            className="btn btn-outline-light min-h-11 px-5 text-[.92rem]"
          >
            Consultar otra reserva
          </button>
        </div>
      )}

      {loading && (
        <div role="status" aria-label="Buscando tu reserva" className="flex flex-col gap-3 rounded-lg bg-card p-7">
          <span className="skeleton h-[26px] w-2/5 rounded-sm" />
          <span className="skeleton h-[60px] w-[70%] rounded-sm" />
          <span className="skeleton h-[90px] rounded-md" />
        </div>
      )}

      {notFound && (
        <p id="lk-result" tabIndex={-1} role="alert" className="rounded-lg bg-surface px-[22px] py-[18px] font-bold">
          {notFound === "failed"
            ? "No pudimos conectar. Inténtalo de nuevo en un momento."
            : "No encontramos una reserva con ese código y correo. Revisa los datos o escríbenos por WhatsApp."}
        </p>
      )}

      {r && (
        // Móvil: estado → pago → detalles. Escritorio: estado y detalles a la izquierda, pago a la derecha (fijo al desplazar).
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:grid-rows-[auto_1fr]">
          <section
            id="lk-result"
            tabIndex={-1}
            aria-labelledby="lk-title"
            className="flex flex-col gap-3.5 rounded-lg bg-card p-[clamp(22px,4vw,36px)] text-on-light lg:col-start-1"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <StatusPill status={r.status} />
              <LiveBadge status={live} />
            </div>
            <div className="flex flex-col gap-1">
              <h2 id="lk-title" className="display text-[clamp(2.4rem,7vw,3.6rem)] leading-none tracking-[.04em]">
                {r.code}
              </h2>
              <p className="font-bold">
                {cabinName(r.cabinTypeId)} · {plural(nights, "noche", "noches")}
              </p>
            </div>
            {liveNote && (
              <p
                key={liveNote.id}
                aria-hidden="true"
                className="flex items-center gap-2 rounded-md border-2 border-accent/60 px-4 py-2.5 text-[.92rem] font-bold motion-safe:animate-fade-in"
              >
                <span className="size-2 flex-none rounded-full bg-accent" />
                {liveNote.text}
              </p>
            )}
            <p role="status" className="sr-only">
              {liveNote?.text}
            </p>
          </section>

          <div className="flex flex-col gap-5 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <PaymentStage r={r} access={found.code ? found : null} onRefresh={refresh} />
            <PaymentHistory payments={r.payments} />
          </div>

          <section aria-labelledby="lk-details" className="flex flex-col gap-4 rounded-lg bg-card p-[clamp(22px,4vw,36px)] text-on-light lg:col-start-1">
            <h2 id="lk-details" className="display text-[2rem] leading-none">
              Detalles
            </h2>
            <KeyValues rows={rows} />
            <div className="flex flex-col items-start gap-2">
              {canChange ? (
                <a
                  href={wa(c.whatsapp, `Hola, quiero solicitar un cambio de fecha para mi reserva ${r.code}.`)}
                  target="_blank"
                  rel="noopener"
                  className="btn btn-cta min-h-[52px] px-6"
                >
                  Solicitar cambio de fecha
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  aria-describedby="chg-why"
                  className="btn min-h-[52px] cursor-not-allowed bg-card-muted px-6 text-on-light opacity-60"
                >
                  Solicitar cambio de fecha
                </button>
              )}
              <p id="chg-why" className="text-[.88rem]">
                {!active
                  ? "Esta reserva no admite cambios de fecha en su estado actual."
                  : r.status === "pending_deposit"
                    ? "Podrás solicitar cambios de fecha cuando tu reserva esté confirmada."
                    : canChange
                      ? "Puedes reprogramar dentro de los 3 meses siguientes, según disponibilidad."
                      : "Faltan menos de 5 días (120 horas) para tu llegada. Según nuestras políticas, ya no se permiten cambios de fecha."}
              </p>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
