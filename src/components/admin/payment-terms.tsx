"use client";

// Condiciones de pago (solo administradores): cuánto paga el huésped para confirmar (el abono, en % del total), con su
// reparto en pesos en una reserva de ejemplo y en cada cabaña; los datos para pagar que ve en «Mi reserva»; y cómo va el
// cobro de abonos en los últimos 90 días. El abono lo usan las cotizaciones del sitio y del panel; las reservas que ya
// existen conservan el de su cotización.
import Link from "next/link";
import { useState } from "react";
import { AlertIcon, CheckIcon, ClockIcon, HomeIcon, InfoIcon, WalletIcon } from "@/components/ui/icons";
import { api } from "@/lib/client/api";
import { addDays, cop, plural } from "@/lib/format";
import { isFromBooking } from "@/lib/booking";
import { TEXT_LIMITS } from "@/lib/site";
import { useAdmin } from "@/components/admin/context";
import { MODULES, paths } from "@/components/admin/routes";
import { money } from "@/components/admin/board";
import { adminInput } from "@/components/admin/shared";
import { Callout, Card, CardHeader, Deco, Field, PageHeader, RangeSlider, SaveBar, Stepper } from "@/components/admin/ui";

// Valores frecuentes para elegir con un toque.
const QUICK = [20, 30, 50, 100];
// Reserva de ejemplo para mostrar qué significa el porcentaje.
const SAMPLE = 400_000;

export function PaymentTermsView() {
  const { data, setData, toast, onAuthError } = useAdmin();
  const saved = { depositPct: data.site.settings.depositPct, instructions: data.site.texts.payment.instructions };
  const [f, setF] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = f.depositPct !== saved.depositPct || f.instructions.trim() !== saved.instructions.trim();
  const deposit = Math.round((SAMPLE * f.depositPct) / 100);

  async function save() {
    if (busy) return;
    setBusy(true);
    setErrors({});
    try {
      const r = await api.admin.savePaymentTerms({ depositPct: f.depositPct, instructions: f.instructions.trim() });
      if (r.status === 401 || r.status === 403) return onAuthError();
      if (r.status !== 200 || !r.data) {
        const fields = (r.data as { fields?: Record<string, string> } | null)?.fields;
        if (fields) setErrors(fields);
        else toast("No se pudieron guardar las condiciones de pago", "error");
        return;
      }
      const site = r.data;
      setData((d) => ({ ...d, site }));
      setF({ depositPct: site.settings.depositPct, instructions: site.texts.payment.instructions });
      toast("Condiciones de pago guardadas");
    } catch {
      toast("Error de conexión. Inténtalo de nuevo.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={MODULES.condiciones.label} description="Cuánto paga el huésped para confirmar su reserva y cómo te paga." />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Abono: el porcentaje en grande, sobre la tarjeta amarilla, con su ejemplo en pesos. */}
          <section aria-labelledby="pt-deposit" className="relative isolate flex flex-col gap-5 overflow-hidden rounded-[22px] bg-yellow p-5 sm:p-6">
            <Deco accent="yellow" className="-top-6 -right-6 size-[130px] rotate-12" />
            <div>
              <h2 id="pt-deposit" className="text-[16px] font-bold tracking-[-0.01em] text-ink">
                Abono para confirmar
              </h2>
              <p className="mt-0.5 max-w-[56ch] text-[13.5px] text-ink/75">
                Porcentaje del total que el huésped paga para que su reserva quede confirmada. El resto es el saldo, que paga antes de llegar o en recepción.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
              <p className="text-[56px] leading-none font-bold tracking-[-0.04em] text-ink tabular-nums" aria-hidden="true">
                {f.depositPct}
                <span className="text-[30px]"> %</span>
              </p>
              <div className="flex flex-col gap-2">
                <Field label="Porcentaje del abono" error={errors.depositPct}>
                  {(p) => (
                    <div className="w-[200px]">
                      <Stepper
                        id={p.id}
                        describedBy={p["aria-describedby"]}
                        value={f.depositPct}
                        onChange={(v) => setF((x) => ({ ...x, depositPct: v }))}
                        min={1}
                        max={100}
                        unit="%"
                      />
                    </div>
                  )}
                </Field>
              </div>
              <div role="group" aria-label="Valores frecuentes" className="flex flex-wrap gap-1.5">
                {QUICK.map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={f.depositPct === v}
                    onClick={() => setF((x) => ({ ...x, depositPct: v }))}
                    className={`h-9 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${f.depositPct === v ? "bg-ink text-paper" : "bg-paper/60 text-ink hover:bg-paper"}`}
                  >
                    {v === 100 ? "Total" : `${v} %`}
                  </button>
                ))}
              </div>
            </div>
            {/* Deslizador: el mismo valor que el número exacto, con su escala y la marca del valor guardado. */}
            <div className="pb-4">
              <RangeSlider
                value={f.depositPct}
                onChange={(v) => setF((x) => ({ ...x, depositPct: v }))}
                min={1}
                max={100}
                label="Porcentaje del abono"
                valueText={`${f.depositPct} %`}
                ticks={[1, 25, 50, 75, 100]}
                tickLabel={(v) => `${v} %`}
                saved={saved.depositPct}
                savedLabel={(v) => `Guardado: ${v} %`}
              />
            </div>
            {/* Reparto de la reserva de ejemplo: barra en dos partes con su porcentaje adentro. */}
            <div
              role="img"
              aria-label={`Abono ${cop(deposit)} (${f.depositPct} %), saldo ${cop(SAMPLE - deposit)} (${100 - f.depositPct} %)`}
              className="flex h-7 gap-[3px]"
            >
              <span
                className="flex h-full items-center rounded-full bg-ink px-3 text-[12px] font-bold text-paper transition-[width] duration-300"
                style={{ width: `${f.depositPct}%` }}
              >
                {f.depositPct >= 14 ? `Abono ${f.depositPct} %` : ""}
              </span>
              {f.depositPct < 100 && (
                <span className="flex h-full flex-1 items-center justify-end rounded-full bg-paper/70 px-3 text-[12px] font-bold text-ink">
                  {100 - f.depositPct >= 14 ? `Saldo ${100 - f.depositPct} %` : ""}
                </span>
              )}
            </div>
            <dl className="grid grid-cols-1 gap-2 rounded-[18px] bg-paper/55 px-4 py-3 text-[13.5px] min-[520px]:grid-cols-3">
              <div>
                <dt className="text-[11px] font-semibold tracking-[.06em] text-ink/60 uppercase">Reserva de ejemplo</dt>
                <dd className="font-bold text-ink tabular-nums">{cop(SAMPLE)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold tracking-[.06em] text-ink/60 uppercase">Abono para confirmar</dt>
                <dd className="font-bold text-ink tabular-nums">{cop(deposit)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold tracking-[.06em] text-ink/60 uppercase">Saldo</dt>
                <dd className="font-bold text-ink tabular-nums">{cop(SAMPLE - deposit)}</dd>
              </div>
            </dl>
            <p className="flex items-start gap-2 text-[12.5px] text-ink/75">
              <InfoIcon size={14} className="mt-0.5 flex-none" />
              Aplica a las reservas nuevas y a las que se reprogramen. Las que ya existen conservan el abono con el que se cotizaron.
            </p>
          </section>

          {f.depositPct !== saved.depositPct && (
            <Callout tone="warning">
              {`Si el texto de las políticas del sitio menciona el ${saved.depositPct} %, recuerda actualizarlo: el sitio mostrará ${f.depositPct} % en la cotización y en «Mi reserva». `}
              <Link href={paths.contenido("politicas")} className="font-semibold underline underline-offset-2">
                Revisar las políticas
              </Link>
            </Callout>
          )}

          <ByCabin pct={f.depositPct} />

          <Card aria-labelledby="pt-instructions" className="flex flex-col gap-4 p-5 sm:p-6">
            <CardHeader
              id="pt-instructions"
              icon={<WalletIcon size={18} />}
              accent="green"
              title="Datos para pagar"
              subtitle="Cuenta o llave donde el huésped paga el abono y el saldo. Los ve en «Mi reserva»."
            />
            <Field
              label="Instrucciones de pago"
              error={errors.instructions}
              hint={`Banco, tipo y número de cuenta, titular, o llave de Bre-B / Nequi. Se muestran tal cual las escribas. ${f.instructions.length}/${TEXT_LIMITS.instructions}`}
            >
              {(p) => (
                <textarea
                  {...p}
                  rows={5}
                  maxLength={TEXT_LIMITS.instructions}
                  value={f.instructions}
                  onChange={(e) => setF((x) => ({ ...x, instructions: e.target.value }))}
                  placeholder="Bancolombia · Ahorros 000-000000-00 · a nombre de …"
                  className={`${adminInput} resize-y leading-relaxed`}
                />
              )}
            </Field>
            {!f.instructions.trim() && (
              <Callout tone="warning">Aún no hay datos para pagar: el huésped solo verá que debe escribir por WhatsApp o pagar en recepción.</Callout>
            )}
          </Card>
        </div>

        {/* Lo que verá el huésped con estos valores. */}
        <aside aria-labelledby="pt-preview" className="flex flex-col gap-4 xl:sticky xl:top-24">
          <Card className="flex flex-col gap-4 p-5 sm:p-6">
            <div>
              <h2 id="pt-preview" className="text-[16px] font-bold tracking-[-0.01em] text-ink">
                Así lo ve el huésped
              </h2>
              <p className="mt-0.5 text-[13px] text-ink-muted">En «Mi reserva», mientras su reserva espera el abono.</p>
            </div>
            <div className="flex flex-col gap-3 rounded-[18px] bg-paper p-4">
              <div className="flex items-center justify-between gap-3 text-[13.5px]">
                <span className="text-ink-muted">Valor total</span>
                <span className="font-semibold text-ink tabular-nums">{cop(SAMPLE)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[13.5px]">
                <span className="font-semibold text-ink">{`Abono para confirmar (${f.depositPct} %)`}</span>
                <span className="rounded-full bg-yellow px-3 py-1 text-[13px] font-bold text-ink tabular-nums">{cop(deposit)}</span>
              </div>
              <div className="h-px bg-line" aria-hidden="true" />
              {f.instructions.trim() ? (
                <p className="text-[13px] whitespace-pre-wrap text-ink">
                  <span className="font-semibold">Paga por transferencia: </span>
                  {f.instructions.trim()}
                </p>
              ) : (
                <p className="flex items-start gap-2 text-[13px] text-ink-muted">
                  <AlertIcon size={14} className="mt-0.5 flex-none" />
                  Sin datos para pagar: se le pide escribir por WhatsApp.
                </p>
              )}
            </div>
          </Card>
          <Collection />
          <Card className="flex items-start gap-3 p-5">
            <span aria-hidden="true" className="grid size-9 flex-none place-items-center rounded-full bg-paper text-ink">
              <CheckIcon size={16} />
            </span>
            <p className="text-[13px] text-ink-muted">
              Cuando recibas un pago, regístralo en la ficha de la reserva: eliges si fue el abono, el total u otro valor, y si fue en efectivo o por
              transferencia.
            </p>
          </Card>
        </aside>
      </div>

      <SaveBar
        dirty={dirty}
        onDiscard={() => {
          setF(saved);
          setErrors({});
        }}
        onSave={save}
        saveLabel={busy ? "Guardando…" : "Guardar cambios"}
      />
    </>
  );
}

/* ───────────── Por cabaña ───────────── */

// Con el porcentaje elegido: abono y saldo de una noche y de una estadía de dos noches, por cabaña (precio base para 2).
function ByCabin({ pct }: { pct: number }) {
  const { data } = useAdmin();
  const cabins = data.cabinTypes.filter((c) => c.activa).sort((a, b) => a.sort - b.sort);
  if (!cabins.length) return null;
  const split = (total: number) => {
    const deposit = Math.round((total * pct) / 100);
    return { deposit, balance: total - deposit };
  };
  return (
    <Card aria-labelledby="pt-cabins" className="flex flex-col gap-4 p-5 sm:p-6">
      <CardHeader
        id="pt-cabins"
        icon={<HomeIcon size={18} />}
        accent="pink"
        title="Con este abono, en cada cabaña"
        subtitle="Precio base por noche para 2 personas, sin temporadas ni personas adicionales."
      />
      <ul className="flex flex-col gap-2">
        {cabins.map((c) => {
          const one = split(c.precioPareja);
          const two = split(c.precioPareja * 2);
          return (
            <li
              key={c.id}
              className="grid grid-cols-2 items-center gap-x-4 gap-y-2 rounded-[18px] bg-paper/60 px-4 py-3 sm:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]"
            >
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <p className="truncate text-[14px] font-semibold text-ink">{c.nombre}</p>
                <p className="text-[12px] text-ink-muted">{`${cop(c.precioPareja)} la noche · ${plural(c.units, "cabaña", "cabañas")}`}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-[.05em] text-ink/60 uppercase">Abono</p>
                <p className="text-[14px] font-bold text-ink tabular-nums">{cop(one.deposit)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-[.05em] text-ink/60 uppercase">Saldo</p>
                <p className="text-[14px] font-bold text-ink tabular-nums">{cop(one.balance)}</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-[11px] font-semibold tracking-[.05em] text-ink/60 uppercase">2 noches</p>
                <p className="text-[14px] text-ink tabular-nums">
                  <strong className="font-bold">{cop(two.deposit)}</strong>
                  <span className="text-ink-muted">{` + ${cop(two.balance)}`}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ───────────── Cobro de abonos ───────────── */

// Cómo va el cobro de abonos en los últimos 90 días: reservas propias (sitio web y panel, sin Booking ni importadas)
// creadas en ese tiempo, cuántas pagaron, cuánto tardaron y lo que espera abono hoy. Sin abono no se apartan fechas: las
// que se cayeron sin pagar se cuentan aparte.
function Collection() {
  const { data, today } = useAdmin();
  const since = addDays(today, -90);
  const own = data.reservations.filter((r) => r.createdAt.slice(0, 10) >= since && r.source !== "import" && !isFromBooking(r));
  const paid = own.filter((r) => r.depositPaidAt);
  const dropped = own.filter((r) => (r.status === "expired" || r.status === "cancelled") && !r.depositPaidAt).length;
  const waiting = data.reservations.filter((r) => r.status === "pending_deposit");
  const rate = own.length ? Math.round((paid.length / own.length) * 100) : 0;
  const hours = paid
    .map((r) => (Date.parse(r.depositPaidAt!) - Date.parse(r.createdAt)) / 36e5)
    .filter((h) => h >= 0)
    .sort((a, b) => a - b);
  const median = hours.length ? hours[Math.floor(hours.length / 2)] : null;
  const avgDeposit = paid.length ? Math.round(paid.reduce((s, r) => s + r.quote.deposit, 0) / paid.length) : 0;
  const waitingValue = waiting.reduce((s, r) => s + r.quote.deposit, 0);
  const C = 2 * Math.PI * 42;
  return (
    <Card aria-labelledby="pt-collect" className="flex flex-col gap-4 p-5 sm:p-6">
      <CardHeader
        id="pt-collect"
        icon={<ClockIcon size={18} />}
        accent="blue"
        title="Cómo va el cobro de abonos"
        subtitle="Reservas propias de los últimos 90 días."
      />
      {own.length ? (
        <div className="flex items-center gap-4">
          <div className="relative size-[96px] flex-none">
            <svg viewBox="0 0 100 100" aria-hidden="true" className="size-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" strokeWidth="10" className="stroke-ink/10" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - rate / 100)}
                className="stroke-ink transition-[stroke-dashoffset] duration-700"
              />
            </svg>
            <span className="absolute inset-0 grid place-items-center text-[19px] font-bold tracking-[-0.03em] text-ink tabular-nums">{`${rate} %`}</span>
          </div>
          <p className="text-[13px] text-ink-muted">
            <strong className="font-bold text-ink">{`${paid.length} de ${own.length}`}</strong> reservas pagaron su abono.
            {dropped > 0 && ` ${dropped} ${dropped === 1 ? "se cayó" : "se cayeron"} sin pagar.`}
          </p>
        </div>
      ) : (
        <p className="text-[13px] text-ink-muted">Aún no hay reservas propias en los últimos 90 días.</p>
      )}
      <dl className="grid grid-cols-2 gap-2">
        {[
          {
            k: "Tiempo para pagar",
            v: median === null ? "—" : median < 1 ? "menos de 1 h" : median < 48 ? `${Math.round(median)} h` : `${Math.round(median / 24)} días`,
            h: "mediana desde que reservan",
          },
          { k: "Abono promedio", v: avgDeposit ? money(avgDeposit) : "—", h: "de las que pagaron" },
          { k: "Esperando abono hoy", v: String(waiting.length), h: plural(waiting.length, "reserva", "reservas") },
          { k: "Abonos por recibir", v: money(waitingValue), h: "si todas pagan" },
        ].map((x) => (
          <div key={x.k} className="min-w-0 rounded-[16px] bg-paper/60 px-3.5 py-2.5">
            <dt className="truncate text-[12px] text-ink-muted">{x.k}</dt>
            <dd className="text-[16px] font-bold tracking-[-0.02em] text-ink tabular-nums">{x.v}</dd>
            <dd className="truncate text-[11.5px] text-ink-subtle">{x.h}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
