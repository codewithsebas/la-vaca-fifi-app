"use client";

// Condiciones de pago (solo administradores): cuánto paga el huésped para confirmar (el abono, en % del total) y los datos
// para pagar que ve en «Mi reserva». El abono lo usan las cotizaciones del sitio y del panel; las reservas que ya existen
// conservan el de su cotización.
import { useState } from "react";
import { AlertIcon, CheckIcon, InfoIcon, WalletIcon } from "@/components/ui/icons";
import { api } from "@/lib/client/api";
import { cop } from "@/lib/format";
import { TEXT_LIMITS } from "@/lib/site";
import { useAdmin } from "@/components/admin/context";
import { MODULES } from "@/components/admin/routes";
import { adminInput } from "@/components/admin/shared";
import { Callout, Card, CardHeader, Deco, Field, PageHeader, SaveBar, Stepper } from "@/components/admin/ui";

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
              {`Si el texto de las políticas del sitio menciona el ${saved.depositPct} %, recuerda actualizarlo: el sitio mostrará ${f.depositPct} % en la cotización y en «Mi reserva».`}
            </Callout>
          )}

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
