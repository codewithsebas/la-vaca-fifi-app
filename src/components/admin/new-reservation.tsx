"use client";

// Nueva reserva tomada por el equipo (WhatsApp, teléfono, en persona). Retiene la cabaña con las mismas reglas que la web
// hasta el plazo elegido para recibir el abono; si no se registra a tiempo, las fechas se liberan solas. Si el huésped ya
// pagó, se registra de una vez: son las mismas dos operaciones de siempre, crear y registrar el pago, una tras otra.
// Varias cabañas («Agregar otra cabaña»): mismas fechas y huésped, un solo pago y un solo correo (lib/groups).
import { useState } from "react";
import { CalendarIcon, CheckIcon, CloseIcon, HomeIcon, PlusIcon, UsersIcon, WalletIcon, WarningIcon } from "@/components/ui/icons";
import { api, type ApiError, type ValidationError } from "@/lib/client/api";
import {
  MAX_GROUP_CABINS,
  busyBlocks,
  computeQuote,
  findUnit,
  normalizePhone,
  personSteps,
  rateFrom,
  splitTotal,
  unitFree,
  unitLabel,
  withTotal,
  type Occupancy,
} from "@/lib/booking";
import { addDays, cop, fmtDate, nightsBetween, plural } from "@/lib/format";
import { DEFAULT_HOLD, HOLD_OPTIONS, depositPctOf, manualDueAt } from "@/lib/payments";
import { groupMoney } from "@/lib/groups";
import type { DocType, ManualReservationInput, ManualReservationResult, PayMethod, Quote, Reservation } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { typeMarks, unitMarks } from "@/lib/admin-metrics";
import { useAdmin } from "@/components/admin/context";
import { DateRangePicker } from "@/components/admin/date-picker";
import { PaymentFields, type PayChoice, type PayOption } from "@/components/admin/payment-fields";
import { paths } from "@/components/admin/routes";
import { adminInput, fmtDeadline } from "@/components/admin/shared";
import { Button, Callout, Field, FieldError, IconButton, Modal, MoneyInput, Segmented, Stepper, Switch } from "@/components/admin/ui";

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
  payNow: boolean;
  payChoice: PayChoice;
  payCustom: number;
  payMethod: PayMethod | null;
  payNote: string;
};

// Otra cabaña de la misma reserva.
type Extra = { type: string; unit: string; adults: number; children: number };

const DOCS: { value: DocType; label: string }[] = [
  { value: "CC", label: "CC" },
  { value: "CE", label: "CE" },
  { value: "Pasaporte", label: "Pasaporte" },
  { value: "PPT", label: "PPT" },
];

// Valor del selector de cabaña: «tipo:unidad»; sin unidad, cualquiera libre de ese tipo.
const pickValue = (typeId: string, unit: string) => `${typeId}:${unit}`;

// "2 personas" · "2 a 4 personas" · "hasta 4 personas": para cuántos es una cabaña según su tabla de precios.
function peopleText(c: { maxPersonas: number; preciosPersonas?: Record<string, number> }) {
  const from = personSteps(c.preciosPersonas)[0];
  if (!from) return c.maxPersonas <= 2 ? plural(c.maxPersonas, "persona", "personas") : `hasta ${c.maxPersonas} personas`;
  return from >= c.maxPersonas ? plural(c.maxPersonas, "persona", "personas") : `${from} a ${c.maxPersonas} personas`;
}

const ERRORS: Record<string, string> = {
  DATES_UNAVAILABLE: "Esas fechas ya no están libres en esa cabaña. Elige otras o deja que el sistema asigne una unidad.",
  NEEDS_CONNECTION: "Una reserva con varias cabañas se crea con conexión. Vuelve a intentarlo cuando haya internet.",
};

export function NewReservationDialog({ draft, onClose }: { draft: NewReservationDraft; onClose: () => void }) {
  const { data, setData, reload, today, cabinLabel, onAuthError, toast, go } = useAdmin();
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
    payNow: false,
    payChoice: "deposit",
    payCustom: 0,
    payMethod: null,
    payNote: "",
  });
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  const [extra, setExtra] = useState<Extra[]>([]);
  const setX = (i: number, p: Partial<Extra>) => setExtra((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [server, setServer] = useState<Record<string, string>>({});
  const [done, setDone] = useState<ManualReservationResult | null>(null);
  const [payFailed, setPayFailed] = useState(false);

  const type = cabins.find((c) => c.id === f.type);
  const units = type?.units ?? 0;
  const unit = f.unit ? Number(f.unit) : null;
  const blocks = busyBlocks(data);
  const occ = { reservations: data.reservations, blocks };
  const range = f.checkIn && f.checkOut && f.checkOut > f.checkIn ? { ci: f.checkIn, co: f.checkOut } : null;
  // Sin useMemo a mano: el compilador de React lo memoriza (allocate recibe las mismas listas).
  const marks = type
    ? unit
      ? unitMarks(data.reservations, blocks, type.id, unit, today, addDays(today, 400))
      : typeMarks(data.reservations, blocks, type.id, units, today, addDays(today, 400))
    : {};
  // Todas las cabañas: la primera y las agregadas. Cada una toma su unidad (la elegida o la primera libre) y la siguiente
  // del mismo tipo ya no la ve, como lo hace el servidor.
  const all: Extra[] = [{ type: f.type, unit: f.unit, adults: f.adults, children: f.children }, ...extra];
  const typeOf = (id: string) => cabins.find((c) => c.id === id);
  const alloc = allocate(all, cabins, { reservations: data.reservations, blocks }, range);
  const free = !type || !range ? true : alloc[0] > 0;
  const guests = f.adults + f.children;
  const pct = data.site.settings.depositPct;
  const rates = all.map((c) => {
    const t = typeOf(c.type);
    return t && range ? computeQuote(t, range.ci, range.co, c.adults + c.children, data.seasons, pct) : null;
  });
  const ready = rates.every((q): q is Quote => !!q);
  const rate: Quote | null = ready ? sumQuotes(rates as Quote[]) : null;
  // Precio especial: es del grupo; se reparte entre las cabañas en proporción a su tarifa.
  const quotes: Quote[] | null = ready
    ? f.special && f.total
      ? splitTotal(rates as Quote[], f.total).map((t, i) => withTotal((rates as Quote[])[i], t, pct))
      : (rates as Quote[])
    : null;
  const quote = quotes ? sumQuotes(quotes) : null;
  const due = range ? manualDueAt(range.ci, f.hold) : null;

  // Pago recibido al crear: el abono solo se ofrece si es menos que el total (con un abono del 100 %, es lo mismo).
  const offerDeposit = !!quote && quote.deposit > 0 && quote.deposit < quote.total;
  const payChoice: PayChoice = f.payChoice === "deposit" && !offerDeposit ? "full" : f.payChoice;
  const payAmount = !quote ? 0 : payChoice === "full" ? quote.total : payChoice === "deposit" ? quote.deposit : f.payCustom;
  const payOptions: PayOption[] = [
    { value: "full", label: "Pago completo", hint: quote ? cop(quote.total) : "Elige las fechas" },
    ...(offerDeposit ? [{ value: "deposit" as const, label: `Abono del ${depositPctOf(quote)} %`, hint: cop(quote.deposit) }] : []),
    { value: "custom", label: "Otro valor", hint: "El que recibiste" },
  ];
  const payAmountError =
    payChoice !== "custom"
      ? ""
      : f.payCustom <= 0
        ? "Escribe el valor que recibiste."
        : quote && f.payCustom > quote.total
          ? `No puede ser más que el total (${cop(quote.total)}).`
          : "";

  const errs: Record<string, string> = {};
  if (!type) errs.cabinTypeId = "Elige la cabaña.";
  if (!range) errs.checkIn = "Elige la llegada y la salida.";
  else if (!free) errs.checkIn = unit ? `${cabinLabel(type!.id, unit)} no está libre en esas fechas.` : "No hay unidades libres de esta cabaña en esas fechas.";
  else if (nightsBetween(range.ci, range.co) > 30) errs.checkIn = "La estadía máxima es de 30 noches.";
  if (type && guests > type.maxPersonas) errs.adults = `Máximo ${type.maxPersonas} personas en esta cabaña.`;
  extra.forEach((c, i) => {
    const t = typeOf(c.type);
    if (!t) errs[`more.${i}`] = "Elige la cabaña.";
    else if (c.adults + c.children > t.maxPersonas) errs[`more.${i}`] = `Máximo ${t.maxPersonas} personas en esta cabaña.`;
    else if (range && !alloc[i + 1])
      errs[`more.${i}`] = c.unit
        ? `${cabinLabel(t.id, Number(c.unit))} no está libre en esas fechas.`
        : "No quedan unidades libres de esta cabaña en esas fechas.";
  });
  if (f.fullName.trim().length < 3) errs["guest.fullName"] = "Escribe el nombre completo.";
  if (!/^\+\d{8,15}$/.test(normalizePhone(f.phone))) errs["guest.phone"] = "Escribe el celular con WhatsApp.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) errs["guest.email"] = "Escribe un correo válido: ahí le llega la confirmación.";
  if (!/^[A-Za-z0-9]{5,15}$/.test(f.docNumber.trim())) errs["guest.docNumber"] = "Escribe el número de documento (sin puntos).";
  if (f.special && (!f.total || f.total < 10_000)) errs.total = "Escribe el precio acordado.";
  if (f.payNow && payAmountError) errs.payAmount = payAmountError;
  if (f.payNow && !f.payMethod) errs.payMethod = "Elige si pagó en efectivo o por transferencia.";
  if (due?.tooShort) errs.holdMinutes = "Ya no queda tiempo para pagar antes de la llegada: crea la reserva y registra el pago manualmente.";
  const err = (k: string) => (tried ? (errs[k] ?? server[k]) : server[k]);
  const blocked = Object.keys(errs).length > 0;

  // La reserva ya existe: si el pago no entra, no se pierde nada y se puede registrar desde su ficha.
  async function registerPayment(code: string) {
    try {
      const r = await api.admin.action({
        code,
        action: "confirm",
        method: f.payMethod!,
        note: f.payNote.trim(),
        ...(payChoice === "full" ? { full: true } : { amount: payAmount }),
        ...(extra.length > 0 && { group: true }),
      });
      if (r.status !== 200) return false;
      await reload();
      return true;
    } catch {
      return false;
    }
  }

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
      ...(extra.length > 0 && {
        more: extra.map((c) => ({ cabinTypeId: c.type, unit: c.unit ? Number(c.unit) : null, adults: c.adults, children: c.children })),
      }),
    };
    try {
      const r = await api.admin.createReservation(body);
      if (r.status === 401 || r.status === 403) return onAuthError();
      if (r.status === 201 && r.data && "reservation" in r.data) {
        const result = r.data;
        const created = result.group ?? [result.reservation];
        setData((d) => ({ ...d, reservations: [...created, ...d.reservations.filter((x) => !created.some((c) => c.code === x.code))] }));
        const paid = f.payNow ? await registerPayment(result.reservation.code) : false;
        if (f.payNow && !paid) setPayFailed(true);
        setDone(result);
        toast(paid ? `Reserva ${result.reservation.code} creada y pago de ${cop(payAmount)} registrado` : `Reserva ${result.reservation.code} creada`);
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
        payFailed={payFailed}
        onClose={onClose}
        onOpen={() => {
          onClose();
          go(paths.reserva(done.reservation.code));
        }}
      />
    );

  // Una sola lista, por número de cabaña como se conocen en la finca: cada una con su tipo, personas, precio y si está libre.
  // Al final, «cualquiera libre» por tipo: el sistema asigna como en la web.
  const cabinOptions = [
    ...cabins
      .flatMap((c) =>
        Array.from({ length: c.units }, (_, i) => {
          const u = i + 1;
          const ok = !range || unitFree(occ, c.units, c.id, u, range.ci, range.co);
          return {
            n: unitLabel(c, u),
            value: pickValue(c.id, String(u)),
            label: `Cabaña ${unitLabel(c, u)}`,
            description: `${c.nombre} · ${peopleText(c)} · desde ${cop(rateFrom(c).price)}${range ? (ok ? " · Libre" : " · Ocupada en esas fechas") : ""}`,
            keywords: c.nombre,
          };
        }),
      )
      .sort((x, y) => (Number(x.n) || Infinity) - (Number(y.n) || Infinity) || x.n.localeCompare(y.n))
      .map((o) => ({ value: o.value, label: o.label, description: o.description, keywords: o.keywords })),
    ...cabins
      .filter((c) => c.units > 1)
      .map((c) => ({
        value: pickValue(c.id, ""),
        label: `Cualquiera libre · ${c.nombre}`,
        description: `${peopleText(c)} · desde ${cop(rateFrom(c).price)} · como en la web: deja libres las que también se venden en Booking`,
        keywords: c.nombre,
      })),
  ];
  const picked = (typeId: string, u: string) => pickValue(typeId, u || (typeOf(typeId)?.units === 1 ? "1" : ""));
  const pick = (v: string) => {
    const [typeId, u] = v.split(":");
    return { type: typeId, unit: u ?? "" };
  };
  // Si cobra desde más personas de las que vienen, se avisa: se cobra la primera fila de su tabla.
  const minNote = (typeId: string, people: number) => {
    const t = typeOf(typeId);
    const from = personSteps(t?.preciosPersonas)[0];
    return t && from && people < from
      ? `Esta cabaña cobra desde ${plural(from, "persona", "personas")}: con ${people} se cobra la tarifa de ${from}.`
      : undefined;
  };

  return (
    // Es un formulario largo: un clic afuera por error no debe borrar lo escrito. Se cierra con la X o con Cancelar.
    <Modal
      onClose={onClose}
      labelledBy="nr-title"
      dismissOnBackdrop={false}
      initialFocus={range ? "[data-autofocus]" : "[data-dates] button"}
      className="m-auto w-[calc(100%-32px)] max-w-[760px] rounded-[26px] p-0"
    >
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-full bg-success-soft text-success">
            <CalendarIcon size={18} variant="plus" />
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <h2 id="nr-title" className="text-[18px] font-bold tracking-[-0.02em] text-ink">
              Nueva reserva
            </h2>
            <p className="text-[13.5px] text-ink-muted">
              Si ya pagó, registra el pago aquí mismo. Si no, las fechas quedan apartadas hasta el plazo que elijas y se liberan solas.
            </p>
          </div>
          <IconButton label="Cerrar" onClick={onClose} className="flex-none">
            <CloseIcon size={18} />
          </IconButton>
        </div>

        {/* Estadía */}
        <section aria-labelledby="nr-stay" className="flex flex-col gap-3">
          <h3 id="nr-stay" className="flex items-center gap-2 text-[12px] font-bold tracking-[.06em] text-ink-muted uppercase">
            <HomeIcon size={14} />
            Estadía
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Cabaña" className="sm:col-span-2" error={err("cabinTypeId")} hint={minNote(f.type, guests)}>
              {(p) => (
                <Combobox
                  id={p.id}
                  describedBy={p["aria-describedby"]}
                  value={picked(f.type, f.unit)}
                  onChange={(v) => set(pick(v))}
                  options={cabinOptions}
                  searchPlaceholder="Número o tipo de cabaña…"
                />
              )}
            </Field>
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
            {extra.map((c, i) => {
              const t = typeOf(c.type);
              return (
                <fieldset key={i} className="grid grid-cols-1 gap-3 rounded-[18px] border border-line p-3 sm:col-span-2 sm:grid-cols-2">
                  <legend className="flex w-full items-center justify-between gap-2 px-1 text-[13px] font-semibold text-ink">{`Cabaña ${i + 2}`}</legend>
                  <div className="-mt-2 flex items-start justify-end sm:col-span-2">
                    <Button size="sm" variant="ghost" icon={<CloseIcon size={14} />} onClick={() => setExtra((xs) => xs.filter((_, j) => j !== i))}>
                      Quitar
                    </Button>
                  </div>
                  <Field label="Cabaña" className="sm:col-span-2" error={err(`more.${i}`)} hint={minNote(c.type, c.adults + c.children)}>
                    {(p) => (
                      <Combobox
                        id={p.id}
                        describedBy={p["aria-describedby"]}
                        value={picked(c.type, c.unit)}
                        onChange={(v) => setX(i, pick(v))}
                        options={cabinOptions}
                        searchPlaceholder="Número o tipo de cabaña…"
                      />
                    )}
                  </Field>
                  <Field label="Adultos">
                    {(p) => <Stepper id={p.id} value={c.adults} onChange={(v) => setX(i, { adults: v })} min={1} max={t?.maxPersonas ?? 20} />}
                  </Field>
                  <Field label="Niños">
                    {(p) => (
                      <Stepper id={p.id} value={c.children} onChange={(v) => setX(i, { children: v })} min={0} max={Math.max(0, (t?.maxPersonas ?? 20) - 1)} />
                    )}
                  </Field>
                </fieldset>
              );
            })}
            {all.length < MAX_GROUP_CABINS && (
              <div className="sm:col-span-2">
                <Button
                  variant="secondary"
                  icon={<PlusIcon size={14} />}
                  onClick={() => setExtra((xs) => [...xs, { type: f.type, unit: "", adults: 2, children: 0 }])}
                >
                  Agregar otra cabaña
                </Button>
                {extra.length > 0 && (
                  <p className="mt-1.5 text-[12.5px] text-ink-muted">Mismas fechas y huésped. Se crea con un solo código, un solo pago y un solo correo.</p>
                )}
              </div>
            )}
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
            <Field label="Correo" error={err("guest.email")} hint="Ahí le llega la confirmación cuando se registre el pago.">
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
          <Switch
            checked={f.payNow}
            onChange={(v) => set({ payNow: v })}
            label="El huésped ya pagó"
            description="Registra el pago completo, el abono u otro valor. La reserva queda confirmada al crearla."
          />
          {f.payNow ? (
            <>
              <PaymentFields
                options={payOptions}
                choice={payChoice}
                onChoice={(c) => set({ payChoice: c })}
                custom={f.payCustom}
                onCustom={(n) => set({ payCustom: n })}
                amountError={payAmountError}
                method={f.payMethod}
                onMethod={(m) => set({ payMethod: m })}
                note={f.payNote}
                onNote={(s) => set({ payNote: s })}
                tried={tried}
              />
              {err("holdMinutes") && <FieldError>{err("holdMinutes")}</FieldError>}
            </>
          ) : (
            <fieldset className="flex min-w-0 flex-col gap-1.5">
              <legend className="mb-1.5 text-[13px] font-semibold text-ink">Plazo para pagar el abono</legend>
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
                  {`Si no registras el abono antes del ${fmtDeadline(due.dueAt)}, las fechas se liberan`}
                  {due.capped ? " (no puede pasar del día de llegada)" : ""}
                </p>
              )}
              {err("holdMinutes") && <FieldError>{err("holdMinutes")}</FieldError>}
            </fieldset>
          )}
        </section>

        {quote && quotes && range && alloc.every(Boolean) && (
          <Callout tone="success">
            {extra.length > 0 ? (
              <>
                <span className="font-semibold">{plural(all.length, "cabaña", "cabañas")}</span> · {fmtDate(range.ci)} → {fmtDate(range.co)} ·{" "}
                {plural(nightsBetween(range.ci, range.co), "noche", "noches")}
                <span className="mt-1 block">
                  {all.map((c, i) => (
                    <span key={i} className="block">
                      {`${cabinLabel(c.type, alloc[i])} · ${plural(c.adults + c.children, "persona", "personas")} · ${cop(quotes[i].total)}`}
                    </span>
                  ))}
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold">{cabinLabel(type!.id, unit ?? undefined)}</span>
                {unit ? "" : " (la unidad se asigna al crear)"} · {fmtDate(range.ci)} → {fmtDate(range.co)} ·{" "}
                {plural(nightsBetween(range.ci, range.co), "noche", "noches")} · {plural(guests, "persona", "personas")}
              </>
            )}
            <span className="mt-1 block">
              Total <strong>{cop(quote.total)}</strong>
              {quote.adjustment ? ` (${quote.adjustment < 0 ? "descuento" : "recargo"} de ${cop(Math.abs(quote.adjustment))})` : ""} · abono para confirmar{" "}
              <strong>{cop(quote.deposit)}</strong>
            </span>
            {f.payNow && payAmount > 0 && !payAmountError && (
              <span className="mt-1 block">
                {`Se registra un pago de ${cop(payAmount)}: la reserva queda confirmada`}
                {payAmount < quote.total ? ` y con un saldo de ${cop(quote.total - payAmount)} por cobrar.` : " y pagada por completo."}
              </span>
            )}
          </Callout>
        )}
        {error && <FieldError>{error}</FieldError>}
      </div>
      <div className="flex flex-col-reverse gap-2 rounded-b-[26px] border-t border-line bg-canvas/70 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-end sm:px-6">
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="primary"
          loading={busy}
          disabled={tried && blocked}
          icon={blocked && tried ? <WarningIcon size={14} /> : <CheckIcon size={14} />}
          onClick={save}
        >
          {f.payNow && payAmount > 0 && !payAmountError ? `Crear y registrar ${cop(payAmount)}` : "Crear reserva"}
        </Button>
      </div>
    </Modal>
  );
}

// Reserva creada: confirmada si se registró un pago; si no, pendiente de abono hasta el plazo.
function Created({ result, payFailed, onClose, onOpen }: { result: ManualReservationResult; payFailed: boolean; onClose: () => void; onOpen: () => void }) {
  const { data, cabinLabel } = useAdmin();
  // La reserva puede actualizarse en vivo (p. ej. otro miembro del equipo registró el abono): se muestra la versión más reciente.
  const lead: Reservation = data.reservations.find((x) => x.code === result.reservation.code) ?? result.reservation;
  // Varias cabañas: el estado es el de la principal y los valores, los del grupo.
  const group = (result.group ?? [result.reservation]).map((g) => data.reservations.find((x) => x.code === g.code) ?? g);
  const r = groupMoney(group.length ? group : [lead]);
  const paid = r.status !== "pending_deposit";
  return (
    <Modal onClose={onClose} labelledBy="nr-done" className="m-auto w-[calc(100%-32px)] max-w-[600px] rounded-[26px] p-0">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-full bg-success-soft text-success">
            <CheckIcon size={18} />
          </span>
          <div className="min-w-0 pt-1">
            <h2 id="nr-done" className="text-[18px] font-bold tracking-[-0.02em] text-ink">
              {`Reserva ${r.code} creada`}
            </h2>
            <p className="text-[13.5px] text-ink-muted">
              {r.guest.fullName} · {group.length > 1 ? group.map((g) => cabinLabel(g.cabinTypeId, g.unit)).join(", ") : cabinLabel(r.cabinTypeId, r.unit)} ·{" "}
              {fmtDate(r.checkIn)} → {fmtDate(r.checkOut)}
            </p>
          </div>
        </div>
        {payFailed && !paid && (
          <Callout tone="warning" role="alert">
            La reserva quedó creada, pero <strong>el pago no se pudo registrar</strong>. Ábrela y regístralo desde su ficha.
          </Callout>
        )}
        {paid ? (
          <Callout tone="success">
            {r.status === "confirmed"
              ? r.paid >= r.quote.total
                ? `Confirmada y pagada por completo (${cop(r.paid)}).`
                : `Confirmada. Pago de ${cop(r.paid)} registrado; queda un saldo de ${cop(r.quote.total - r.paid)}.`
              : "La reserva ya no está pendiente de pago."}
          </Callout>
        ) : (
          <p className="text-[14px] text-ink">
            Queda pendiente del abono de <strong>{cop(r.quote.deposit)}</strong> (o el total de <strong>{cop(r.quote.total)}</strong>) hasta el{" "}
            <strong>{fmtDeadline(r.depositDueAt)}</strong>. Cuando el huésped pague, regístralo en la reserva: se confirma y le llega el correo.
          </p>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 rounded-b-[26px] border-t border-line bg-canvas/70 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-end sm:px-6">
        <Button onClick={onClose}>Cerrar</Button>
        <Button variant="secondary" onClick={onOpen}>
          Ver la reserva
        </Button>
      </div>
    </Modal>
  );
}

// Suma de las tarifas de varias cabañas (el abono, el ajuste y el total del grupo).
function sumQuotes(qs: Quote[]): Quote {
  if (qs.length === 1) return qs[0];
  const add = (f: (q: Quote) => number) => qs.reduce((s, q) => s + f(q), 0);
  const adjustment = add((q) => q.adjustment ?? 0);
  return {
    ...qs[0],
    base: add((q) => q.base),
    extraAmount: add((q) => q.extraAmount),
    total: add((q) => q.total),
    deposit: add((q) => q.deposit),
    balance: add((q) => q.balance),
    ...(adjustment ? { adjustment } : { adjustment: undefined }),
  };
}

// Unidad de cada cabaña (0 = sin cupo): la elegida si está libre o la primera libre; la siguiente del mismo tipo ya no ve
// las anteriores, como lo hace el servidor.
function allocate(all: Extra[], cabins: { id: string; units: number }[], occ: Occupancy, range: { ci: string; co: string } | null): number[] {
  let taken = occ.blocks;
  return all.map((c) => {
    const t = cabins.find((x) => x.id === c.type);
    if (!t || !range) return 0;
    const o = { reservations: occ.reservations, blocks: taken };
    const u = c.unit ? (unitFree(o, t.units, t.id, Number(c.unit), range.ci, range.co) ? Number(c.unit) : 0) : findUnit(o, t.units, t.id, range.ci, range.co);
    if (u) taken = [...taken, { cabinTypeId: t.id, unit: u, from: range.ci, to: addDays(range.co, -1) }];
    return u;
  });
}
