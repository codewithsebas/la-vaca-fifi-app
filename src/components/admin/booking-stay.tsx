"use client";

// Noches de Booking sin datos del huésped: el iCal solo dice que la cabaña está ocupada. El equipo copia los datos del
// extranet y la noche se convierte en una reserva del panel (confirmada, sin abono y sin correos).
import { useState } from "react";
import { BookingIcon, CheckIcon, CloseIcon, HomeIcon, UsersIcon } from "@/components/ui/icons";
import { Combobox } from "@/components/ui/combobox";
import { CHANNEL_NAME, staysWithoutData } from "@/lib/booking";
import { api, type ValidationError } from "@/lib/client/api";
import { fmtDate, nightsBetween, plural } from "@/lib/format";
import type { ChannelStay, DocType, Reservation } from "@/lib/types";
import { useBookingSync } from "@/components/admin/booking-calendars";
import { useAdmin } from "@/components/admin/context";
import { adminInput } from "@/components/admin/shared";
import { Button, Callout, Card, EmptyState, Field, FieldError, IconButton, Modal, MoneyInput, Stepper } from "@/components/admin/ui";

const DOCS: { value: DocType; label: string }[] = [
  { value: "SD", label: "Sin documento" },
  { value: "CC", label: "CC" },
  { value: "CE", label: "CE" },
  { value: "Pasaporte", label: "Pasaporte" },
  { value: "PPT", label: "PPT" },
];

const ERRORS: Record<string, string> = {
  STAY_UNAVAILABLE: "Esa noche de Booking ya tiene datos o ya no existe. Actualiza el calendario.",
  DATES_UNAVAILABLE: "Ya hay una reserva confirmada en esa cabaña y esas fechas. Revísala antes de completar esta.",
  DUPLICATE: "Ya existe una reserva con ese número de Booking.",
  NEEDS_CONNECTION: "Necesitas conexión para enlazar con Booking.",
  NOT_FOUND: "Esa noche de Booking ya no existe. Actualiza el calendario.",
};

const SECTION = "col-span-2 flex items-center gap-2 text-[12px] font-bold tracking-[.06em] text-ink-muted uppercase";

export function BookingStayDialog({ stay, onClose }: { stay: ChannelStay; onClose: () => void }) {
  const { data, reload, toast, cabinLabel, onAuthError, openReservation } = useAdmin();
  const { offline } = useBookingSync();
  const type = data.cabinTypes.find((t) => t.id === stay.cabinTypeId);
  const [f, setF] = useState({
    fullName: "",
    phone: "",
    city: "",
    email: "",
    docType: "SD" as DocType,
    docNumber: "",
    adults: 2,
    children: 0,
    total: 0,
    ref: "",
    notes: "",
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nights = nightsBetween(stay.checkIn, stay.checkOut);

  async function save() {
    if (busy || offline) return;
    setBusy(true);
    setError("");
    setFields({});
    try {
      const res = await api.admin.channels.completeStay({
        stayId: stay.id,
        guest: { fullName: f.fullName, docType: f.docType, docNumber: f.docNumber, email: f.email, phone: f.phone, city: f.city },
        adults: f.adults,
        children: f.children,
        total: f.total,
        ref: f.ref,
        notes: f.notes,
      });
      if (res.status === 401 || res.status === 403) return onAuthError();
      if (res.status === 422) return setFields((res.data as ValidationError).fields ?? {});
      if (res.status !== 201) return setError(ERRORS[(res.data as { error?: string } | null)?.error ?? ""] ?? "No se pudo guardar. Inténtalo de nuevo.");
      await reload();
      toast("Reserva de Booking completada", "ok");
      onClose();
      openReservation((res.data as Reservation).code);
    } catch {
      setError("Sin conexión con el servidor. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const text = (
    key: "fullName" | "phone" | "city" | "email" | "ref" | "notes",
    label: string,
    opts: { error?: string; span?: boolean; type?: string; max?: number; placeholder?: string } = {},
  ) => (
    <Field label={label} className={opts.span ? "col-span-2" : ""} error={opts.error}>
      {(p) => (
        <input
          {...p}
          type={opts.type ?? "text"}
          autoComplete="off"
          maxLength={opts.max}
          placeholder={opts.placeholder}
          value={f[key]}
          onChange={(e) => set({ [key]: e.target.value })}
          className={adminInput}
        />
      )}
    </Field>
  );

  return (
    // Es un formulario para copiar datos: un clic afuera por error no debe borrar lo escrito.
    <Modal
      onClose={onClose}
      labelledBy="bs-title"
      dismissOnBackdrop={false}
      initialFocus="input"
      className="m-auto w-[calc(100%-32px)] max-w-[920px] rounded-[26px] p-0"
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-full bg-info-soft text-info">
              <BookingIcon size={18} />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <h2 id="bs-title" className="text-[18px] font-bold tracking-[-0.02em] text-ink">
                Completar datos de la reserva
              </h2>
              <p className="text-[13.5px] text-ink-muted">
                {`${CHANNEL_NAME} · ${cabinLabel(stay.cabinTypeId, stay.unit)} · ${fmtDate(stay.checkIn)} → ${fmtDate(stay.checkOut)} · ${plural(nights, "noche", "noches")}`}
              </p>
            </div>
            <IconButton label="Cerrar" onClick={onClose} className="flex-none">
              <CloseIcon size={18} />
            </IconButton>
          </div>
          <p className="text-[13.5px] text-ink">
            Copia los datos del extranet de Booking. Quedará confirmada, sin pedir abono y sin correos al huésped. Si esas noches son un cierre y no una
            reserva, no hagas nada aquí.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <section aria-labelledby="bs-guest" className="grid min-w-0 grid-cols-2 content-start gap-3 pb-4 lg:pr-6 lg:pb-0">
              <h3 id="bs-guest" className={SECTION}>
                <UsersIcon size={14} />
                Huésped
              </h3>
              {text("fullName", "Nombre completo", { span: true, max: 120, error: fields["guest.fullName"] })}
              {text("phone", "Celular (WhatsApp)", { type: "tel", max: 24, placeholder: "300 123 4567", error: fields["guest.phone"] })}
              {text("city", "Ciudad (opcional)", { max: 60, error: fields["guest.city"] })}
              {text("email", "Correo (opcional)", { span: true, type: "email", max: 160, error: fields["guest.email"] })}
              <Field label="Tipo de documento" error={fields["guest.docType"]}>
                {(p) => <Combobox id={p.id} value={f.docType} onChange={(v) => set({ docType: v as DocType })} options={DOCS} />}
              </Field>
              <Field label="Número de documento" error={f.docType === "SD" ? undefined : fields["guest.docNumber"]}>
                {(p) => (
                  <input
                    {...p}
                    type="text"
                    autoComplete="off"
                    maxLength={15}
                    disabled={f.docType === "SD"}
                    value={f.docType === "SD" ? "" : f.docNumber}
                    onChange={(e) => set({ docNumber: e.target.value.replace(/[^A-Za-z0-9]/g, "") })}
                    className={adminInput}
                  />
                )}
              </Field>
            </section>
            <section
              aria-labelledby="bs-stay"
              className="grid min-w-0 grid-cols-2 content-start gap-3 border-t border-line pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
            >
              <h3 id="bs-stay" className={SECTION}>
                <HomeIcon size={14} />
                Reserva
              </h3>
              <Field label="Adultos" error={fields.adults}>
                {(p) => <Stepper id={p.id} value={f.adults} onChange={(v) => set({ adults: v })} min={1} max={type?.maxPersonas ?? 20} />}
              </Field>
              <Field label="Niños">
                {(p) => (
                  <Stepper id={p.id} value={f.children} onChange={(v) => set({ children: v })} min={0} max={Math.max(0, (type?.maxPersonas ?? 20) - 1)} />
                )}
              </Field>
              <Field label="Valor total en Booking" error={fields.total} className="col-span-2">
                {(p) => (
                  <MoneyInput id={p.id} describedBy={p["aria-describedby"]} invalid={!!p["aria-invalid"]} value={f.total} onChange={(v) => set({ total: v })} />
                )}
              </Field>
              {text("ref", "Número de reserva (opcional)", { span: true, max: 60, error: fields.ref })}
              {text("notes", "Notas (opcional)", { span: true, max: 500, error: fields.notes })}
            </section>
          </div>
          {offline && <Callout tone="warning">Necesitas conexión para enlazar con Booking.</Callout>}
          {error && <FieldError>{error}</FieldError>}
        </div>
        <div className="flex flex-col-reverse gap-2 rounded-b-[26px] border-t border-line bg-canvas/70 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={offline} icon={<CheckIcon size={14} />}>
            Guardar reserva
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Vista «Booking sin datos» de la lista de reservas.
export function BookingStaysPending({ onComplete }: { onComplete: (s: ChannelStay) => void }) {
  const { data, today, cabinLabel } = useAdmin();
  const stays = staysWithoutData(data.channelStays ?? [], today);
  if (!stays.length)
    return (
      <EmptyState
        icon={<BookingIcon size={22} />}
        title="Todas las reservas de Booking tienen sus datos"
        text="Las noches nuevas de Booking aparecerán aquí hasta que completes el huésped."
      />
    );
  return (
    <Card className="overflow-hidden bg-paper! ring-1 ring-line">
      <ul className="divide-y divide-line">
        {stays.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-ink">{cabinLabel(s.cabinTypeId, s.unit)}</p>
              <p className="text-[12.5px] text-ink-muted">{`${fmtDate(s.checkIn)} → ${fmtDate(s.checkOut)} · ${plural(nightsBetween(s.checkIn, s.checkOut), "noche", "noches")}`}</p>
            </div>
            <Button size="sm" onClick={() => onComplete(s)}>
              Completar datos
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
