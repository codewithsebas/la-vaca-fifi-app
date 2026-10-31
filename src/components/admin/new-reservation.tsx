"use client";

// Nueva reserva tomada por el equipo (WhatsApp, teléfono, en persona). Retiene la cabaña con las mismas reglas que la web
// y devuelve un enlace de pago con plazo para enviarle al huésped. Si no paga a tiempo, las fechas se liberan solas.
import { useMemo, useState } from "react";
import { CalendarIcon, CheckIcon, HomeIcon, UsersIcon, WalletIcon, WarningIcon } from "@/components/ui/icons";
import { api, type ApiError, type ValidationError } from "@/lib/client/api";
import { channelBlocks, computeQuote, findUnit, normalizePhone, unitFree, withTotal } from "@/lib/booking";
import { addDays, cop, fmtDate, nightsBetween, plural } from "@/lib/format";
import { DEFAULT_HOLD, HOLD_OPTIONS, manualDueAt } from "@/lib/payments";
import type { DocType, ManualReservationInput, ManualReservationResult, Reservation } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { typeMarks, unitMarks } from "@/lib/admin-metrics";
import { useAdmin } from "@/components/admin/context";
import { DateRangePicker } from "@/components/admin/date-picker";
import { PayLinkShare, fmtDeadline } from "@/components/admin/pay-link-share";
import { paths } from "@/components/admin/routes";
import { adminInput } from "@/components/admin/shared";
import { Button, Callout, Field, FieldError, Modal, MoneyInput, Segmented, Stepper, Switch } from "@/components/admin/ui";

// Lo que llega ya elegido (desde el calendario: una cabaña y unas fechas).
export type NewReservationDraft = { cabinTypeId?: string; unit?: number | null; checkIn?: string | null; checkOut?: string | null };

type Form = {
  type: string;
  unit: string; // "" = la primera libre
  checkIn: string | null;
  checkOut: string | null;
  adults: number;
  children: number;
  pet: boolean;
  fullName: string;
  phone: string;
  email: string;
  docType: DocType;
  docNumber: string;
  city: string;
  notes: string;
  special: boolean;
  total: number;
  hold: number;
};

const DOCS: { value: DocType; label: string }[] = [
  { value: "CC", label: "CC" },
  { value: "CE", label: "CE" },
  { value: "Pasaporte", label: "Pasaporte" },
  { value: "PPT", label: "PPT" },
];

const ERRORS: Record<string, string> = {
  DATES_UNAVAILABLE: "Esas fechas ya no están libres en esa cabaña. Elige otras o deja que el sistema asigne una unidad.",
  CHANNEL_UNAVAILABLE: "No se pudo retener la cabaña en Booking.com (Beds24 no respondió). Inténtalo en un momento.",
};

export function NewReservationDialog({ draft, onClose }: { draft: NewReservationDraft; onClose: () => void }) {
  const { data, setData, today, cabinLabel, onAuthError, toast, go } = useAdmin();
  const cabins = data.cabinTypes.filter((c) => c.activa && c.units > 0);
  const first = cabins.find((c) => c.id === draft.cabinTypeId) ?? cabins[0];
  const [f, setF] = useState<Form>({
    type: first?.id ?? "",
    unit: draft.unit ? String(draft.unit) : "",
    checkIn: draft.checkIn ?? null,
    checkOut: draft.checkOut ?? null,
    adults: 2,
    children: 0,
    pet: false,
    fullName: "",
    phone: "",
    email: "",
    docType: "CC",
    docNumber: "",
    city: "",
    notes: "",
    special: false,
    total: 0,
    hold: DEFAULT_HOLD,
  });
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [server, setServer] = useState<Record<string, string>>({});
  const [done, setDone] = useState<ManualReservationResult | null>(null);

  const type = cabins.find((c) => c.id === f.type);
  const units = type?.units ?? 0;
  const unit = f.unit ? Number(f.unit) : null;
  const blocks = useMemo(() => [...data.blocks, ...channelBlocks(data.channelStays)], [data.blocks, data.channelStays]);
  const occ = { reservations: data.reservations, blocks };
  const range = f.checkIn && f.checkOut && f.checkOut > f.checkIn ? { ci: f.checkIn, co: f.checkOut } : null;
  const marks = useMemo(
    () =>
      type
        ? unit
          ? unitMarks(data.reservations, blocks, type.id, unit, today, addDays(today, 400))
          : typeMarks(data.reservations, blocks, type.id, units, today, addDays(today, 400))
        : {},
    [type, unit, units, data.reservations, blocks, today],
  );
  const free = !type || !range ? true : unit ? unitFree(occ, units, type.id, unit, range.ci, range.co) : findUnit(occ, units, type.id, range.ci, range.co) > 0;
  const guests = f.adults + f.children;
  const rate = type && range ? computeQuote(type, range.ci, range.co, guests, data.seasons) : null;
  const quote = rate && f.special && f.total ? withTotal(rate, f.total) : rate;
  const due = range ? manualDueAt(range.ci, f.hold) : null;

  const errs: Record<string, string> = {};
  if (!type) errs.cabinTypeId = "Elige la cabaña.";
  if (!range) errs.checkIn = "Elige la llegada y la salida.";
  else if (!free) errs.checkIn = unit ? `${cabinLabel(type!.id, unit)} no está libre en esas fechas.` : "No hay unidades libres de esta cabaña en esas fechas.";
  else if (nightsBetween(range.ci, range.co) > 30) errs.checkIn = "La estadía máxima es de 30 noches.";
  if (type && guests > type.maxPersonas) errs.adults = `Máximo ${type.maxPersonas} personas en esta cabaña.`;
  if (f.fullName.trim().length < 3) errs["guest.fullName"] = "Escribe el nombre completo.";
  if (!/^\+\d{8,15}$/.test(normalizePhone(f.phone))) errs["guest.phone"] = "Escribe el celular con WhatsApp.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) errs["guest.email"] = "Escribe un correo válido: ahí le llega la confirmación.";
  if (!/^[A-Za-z0-9]{5,15}$/.test(f.docNumber.trim())) errs["guest.docNumber"] = "Escribe el número de documento (sin puntos).";
  if (f.special && (!f.total || f.total < 10_000)) errs.total = "Escribe el precio acordado.";
  if (due?.tooShort) errs.holdMinutes = "Ya no queda tiempo para pagar antes de la llegada: crea la reserva y registra el pago manualmente.";
  const err = (k: string) => (tried ? (errs[k] ?? server[k]) : server[k]);
  const blocked = Object.keys(errs).length > 0;

  async function save() {
    setTried(true);
    setError("");
    if (blocked || busy || !type || !range) return;
    setBusy(true);
    const body: ManualReservationInput = {
      cabinTypeId: type.id,
      unit,
      checkIn: range.ci,
      checkOut: range.co,
      adults: f.adults,
      children: f.children,
      pet: { hasPet: f.pet, smallBreedConfirmed: f.pet },
      guest: { fullName: f.fullName.trim(), docType: f.docType, docNumber: f.docNumber.trim(), email: f.email.trim(), phone: f.phone, city: f.city.trim() },
      estimatedArrival: "",
      specialRequests: f.notes.trim(),
      total: f.special && f.total ? f.total : null,
      holdMinutes: f.hold,
    };
    try {
      const r = await api.admin.createReservation(body);
      if (r.status === 401 || r.status === 403) return onAuthError();
      if (r.status === 201 && r.data && "reservation" in r.data) {
        const result = r.data;
        setData((d) => ({ ...d, reservations: [result.reservation, ...d.reservations] }));
        setDone(result);
        toast(`Reserva ${result.reservation.code} creada`);
        return;
      }
      if (r.status === 422 && r.data && "fields" in r.data) {
        setServer((r.data as ValidationError).fields);
        setError("Revisa los campos marcados.");
        return;
      }
      setError(ERRORS[(r.data as ApiError | null)?.error ?? ""] ?? "No se pudo crear la reserva. Inténtalo de nuevo.");
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <Created
        result={done}
        onClose={onClose}
        onOpen={() => {
          onClose();
          go(paths.reserva(done.reservation.code));
        }}
      />
    );

  const unitOptions = [
    { value: "", label: "La primera libre", description: "Como en la web: deja libres las que también se venden en Booking" },
    ...Array.from({ length: units }, (_, i) => {
      const u = i + 1;
      const ok = !type || !range || unitFree(occ, units, type.id, u, range.ci, range.co);
      return {
        value: String(u),
        label: cabinLabel(type?.id ?? "", u),
        description: range ? (ok ? "Libre en esas fechas" : "Ocupada en esas fechas") : undefined,
      };
    }),
  ];

  return (
    <Modal
      onClose={onClose}
      labelledBy="nr-title"
      initialFocus={range ? "[data-autofocus]" : "[data-dates] button"}
      className="m-auto w-[calc(100%-32px)] max-w-[760px] rounded-2xl p-0 motion-safe:open:animate-pop-in"
    >
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-full bg-success-soft text-success">
            <CalendarIcon size={18} variant="plus" />
          </span>
          <div className="pt-1">
            <h2 id="nr-title" className="text-[17px] font-bold text-ink">
              Nueva reserva
            </h2>
            <p className="text-[13.5px] text-ink-muted">
              Las fechas quedan apartadas y le envías al huésped un enlace para pagar. Si no paga a tiempo, se liberan solas.
            </p>
          </div>
        </div>

        {/* Estadía */}
        <section aria-labelledby="nr-stay" className="flex flex-col gap-3">
          <h3 id="nr-stay" className="flex items-center gap-2 text-[12px] font-bold tracking-[.06em] text-ink-muted uppercase">
            <HomeIcon size={14} />
            Estadía
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Cabaña" error={err("cabinTypeId")}>
              {(p) => (
                <Combobox
                  id={p.id}
                  value={f.type}
                  onChange={(v) => set({ type: v, unit: "" })}
                  options={cabins.map((c) => ({
                    value: c.id,
                    label: c.nombre,
                    description: `${plural(c.units, "unidad", "unidades")} · hasta ${c.maxPersonas} personas`,
                  }))}
                />
              )}
            </Field>
            <Field label="Unidad">{(p) => <Combobox id={p.id} value={f.unit} onChange={(v) => set({ unit: v })} options={unitOptions} />}</Field>
            <Field label="Llegada y salida" className="sm:col-span-2" error={err("checkIn")} hint="Los días marcados ya están ocupados (punto) o casi llenos.">
              {(p) => (
                <div data-dates className="contents">
                  <DateRangePicker
                    id={p.id}
                    describedBy={p["aria-describedby"]}
                    invalid={!!p["aria-invalid"]}
                    mode="nights"
                    from={f.checkIn}
                    to={f.checkOut}
                    min={today}
                    marks={marks}
                    legend
                    onChange={(checkIn, checkOut) => set({ checkIn, checkOut })}
                    placeholder="Elegir fechas"
                  />
                </div>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3 sm:col-span-2">
              <Field label="Adultos" error={err("adults")}>
                {(p) => <Stepper id={p.id} value={f.adults} onChange={(v) => set({ adults: v })} min={1} max={type?.maxPersonas ?? 20} />}
              </Field>
              <Field label="Niños">
                {(p) => (
                  <Stepper id={p.id} value={f.children} onChange={(v) => set({ children: v })} min={0} max={Math.max(0, (type?.maxPersonas ?? 20) - 1)} />
                )}
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Switch checked={f.pet} onChange={(v) => set({ pet: v })} label="Viene con mascota" description="Sin costo adicional, según las políticas." />
            </div>
          </div>
        </section>

        {/* Huésped */}
        <section aria-labelledby="nr-guest" className="flex flex-col gap-3 border-t border-line pt-4">
          <h3 id="nr-guest" className="flex items-center gap-2 text-[12px] font-bold tracking-[.06em] text-ink-muted uppercase">
            <UsersIcon size={14} />
            Huésped
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre completo" error={err("guest.fullName")}>
              {(p) => (
                <input
                  {...p}
                  data-autofocus
                  type="text"
                  autoComplete="off"
                  maxLength={120}
                  value={f.fullName}
                  onChange={(e) => set({ fullName: e.target.value })}
                  className={adminInput}
                />
              )}
            </Field>
            <Field label="Celular (WhatsApp)" error={err("guest.phone")} hint="Si no es de Colombia, con indicativo: +1 555…">
              {(p) => (
                <input
                  {...p}
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  maxLength={24}
                  value={f.phone}
                  onChange={(e) => set({ phone: e.target.value })}
                  placeholder="300 123 4567"
                  className={adminInput}
                />
              )}
            </Field>
            <Field label="Correo" error={err("guest.email")} hint="Ahí le llega la confirmación cuando pague.">
              {(p) => (
                <input
                  {...p}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  maxLength={160}
                  value={f.email}
                  onChange={(e) => set({ email: e.target.value })}
                  className={adminInput}
                />
              )}
            </Field>
            <Field label="Ciudad (opcional)" error={err("guest.city")}>
              {(p) => (
                <input
                  {...p}
                  type="text"
                  autoComplete="off"
                  maxLength={80}
                  value={f.city}
                  onChange={(e) => set({ city: e.target.value })}
                  className={adminInput}
                />
              )}
            </Field>
            <fieldset className="flex min-w-0 flex-col gap-1.5">
              <legend className="mb-1.5 text-[13px] font-semibold text-ink">Tipo de documento</legend>
              <Segmented label="Tipo de documento" size="sm" value={f.docType} onChange={(v) => set({ docType: v })} options={DOCS} />
            </fieldset>
            <Field label="Número de documento" error={err("guest.docNumber")}>
              {(p) => (
                <input
                  {...p}
                  type="text"
                  autoComplete="off"
                  maxLength={15}
                  value={f.docNumber}
                  onChange={(e) => set({ docNumber: e.target.value.replace(/[^A-Za-z0-9]/g, "") })}
                  className={adminInput}
                />
              )}
            </Field>
            <Field
              label="Notas (opcional)"
              className="sm:col-span-2"
              error={err("specialRequests")}
              hint="Peticiones del huésped o acuerdos. Las ve el equipo en la ficha."
            >
              {(p) => (
                <textarea
                  {...p}
                  rows={2}
                  maxLength={1000}
                  value={f.notes}
                  onChange={(e) => set({ notes: e.target.value })}
                  className={`${adminInput} resize-y`}
                />
              )}
            </Field>
          </div>
        </section>

        {/* Pago */}
        <section aria-labelledby="nr-pay" className="flex flex-col gap-3 border-t border-line pt-4">
          <h3 id="nr-pay" className="flex items-center gap-2 text-[12px] font-bold tracking-[.06em] text-ink-muted uppercase">
            <WalletIcon size={14} />
            Pago
          </h3>
          <Switch
            checked={f.special}
            onChange={(v) => set({ special: v, total: v && !f.total && rate ? rate.total : f.total })}
            label="Precio especial"
            description={
              rate ? `Tarifa vigente: ${cop(rate.total)}. Úsalo si acordaste otro valor con el huésped.` : "Úsalo si acordaste otro valor con el huésped."
            }
          />
          {f.special && (
            <Field label="Total acordado" error={err("total")} className="max-w-[260px]">
              {(p) => (
                <MoneyInput id={p.id} value={f.total} onChange={(v) => set({ total: v })} invalid={!!p["aria-invalid"]} describedBy={p["aria-describedby"]} />
              )}
            </Field>
          )}
          <fieldset className="flex min-w-0 flex-col gap-1.5">
            <legend className="mb-1.5 text-[13px] font-semibold text-ink">Plazo para pagar por el enlace</legend>
            <Segmented
              label="Plazo para pagar"
              size="sm"
              value={String(f.hold)}
              onChange={(v) => set({ hold: Number(v) })}
              options={HOLD_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
              className="flex-wrap"
            />
            {due && !due.tooShort && (
              <p className="text-[12.5px] text-ink-muted">
                {`El enlace vence el ${fmtDeadline(due.dueAt)}`}
                {due.capped ? " (no puede pasar del día de llegada)" : ""}
              </p>
            )}
            {err("holdMinutes") && <FieldError>{err("holdMinutes")}</FieldError>}
          </fieldset>
        </section>

        {quote && range && free && (
          <Callout tone="success">
            <span className="font-semibold">{cabinLabel(type!.id, unit ?? undefined)}</span>
            {unit ? "" : " (la unidad se asigna al crear)"} · {fmtDate(range.ci)} → {fmtDate(range.co)} ·{" "}
            {plural(nightsBetween(range.ci, range.co), "noche", "noches")} · {plural(guests, "persona", "personas")}
            <span className="mt-1 block">
              Total <strong>{cop(quote.total)}</strong>
              {quote.adjustment ? ` (${quote.adjustment < 0 ? "descuento" : "recargo"} de ${cop(Math.abs(quote.adjustment))})` : ""} · abono para confirmar{" "}
              <strong>{cop(quote.deposit)}</strong>
            </span>
          </Callout>
        )}
        {error && <FieldError>{error}</FieldError>}
      </div>
      <div className="flex flex-col-reverse gap-2 rounded-b-2xl border-t border-line bg-canvas/60 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-end sm:px-6">
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="primary"
          loading={busy}
          disabled={tried && blocked}
          icon={blocked && tried ? <WarningIcon size={14} /> : <CheckIcon size={14} />}
          onClick={save}
        >
          Crear y obtener enlace de pago
        </Button>
      </div>
    </Modal>
  );
}

// Reserva creada: el enlace listo para enviar.
function Created({ result, onClose, onOpen }: { result: ManualReservationResult; onClose: () => void; onOpen: () => void }) {
  const { data, cabinLabel } = useAdmin();
  // La reserva puede actualizarse en vivo (p. ej. el huésped ya pagó): se muestra la versión más reciente.
  const r: Reservation = data.reservations.find((x) => x.code === result.reservation.code) ?? result.reservation;
  const paid = r.status !== "pending_deposit";
  return (
    <Modal onClose={onClose} labelledBy="nr-done" className="m-auto w-[calc(100%-32px)] max-w-[600px] rounded-2xl p-0 motion-safe:open:animate-pop-in">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-full bg-success-soft text-success">
            <CheckIcon size={18} />
          </span>
          <div className="min-w-0 pt-1">
            <h2 id="nr-done" className="text-[17px] font-bold text-ink">
              {`Reserva ${r.code} creada`}
            </h2>
            <p className="text-[13.5px] text-ink-muted">
              {r.guest.fullName} · {cabinLabel(r.cabinTypeId, r.unit)} · {fmtDate(r.checkIn)} → {fmtDate(r.checkOut)}
            </p>
          </div>
        </div>
        {paid ? (
          <Callout tone="success">
            {r.status === "confirmed" ? "El huésped ya pagó: la reserva está confirmada." : "La reserva ya no está pendiente de pago."}
          </Callout>
        ) : (
          <>
            <p className="text-[14px] text-ink">
              Envíale este enlace al huésped. Ahí ve su reserva y paga el abono de <strong>{cop(r.quote.deposit)}</strong> o el total de{" "}
              <strong>{cop(r.quote.total)}</strong> con Wompi. Al pagar, la reserva se confirma sola y le llega el correo.
            </p>
            <PayLinkShare r={r} url={result.payUrl} />
          </>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 rounded-b-2xl border-t border-line bg-canvas/60 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-end sm:px-6">
        <Button onClick={onClose}>Cerrar</Button>
        <Button variant="secondary" onClick={onOpen}>
          Ver la reserva
        </Button>
      </div>
    </Modal>
  );
}
