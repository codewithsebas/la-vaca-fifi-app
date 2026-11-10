"use client";

// Cambiar las personas y el valor de una reserva: mismas fechas y misma cabaña. Al cambiar las personas se sugiere el valor
// nuevo; quien edita puede escribir otro.
import { useState } from "react";
import { CheckIcon, PencilIcon } from "@/components/ui/icons";
import { suggestedTotal } from "@/lib/booking";
import { api } from "@/lib/client/api";
import { cop, fmtDate } from "@/lib/format";
import type { Reservation } from "@/lib/types";
import { useAdmin } from "@/components/admin/context";
import { Button, Callout, Field, FieldError, Modal, MoneyInput, Stepper } from "@/components/admin/ui";

const MIN_TOTAL = 10_000;
const ERRORS: Record<string, string> = {
  OVER_CAPACITY: "En esta cabaña no caben tantas personas.",
  INVALID_TRANSITION: "Esta reserva ya no se puede editar.",
};

export function AdjustReservationDialog({ r, onClose }: { r: Reservation; onClose: () => void }) {
  const { data, reload, toast, cabinLabel, onAuthError } = useAdmin();
  const [adults, setAdults] = useState(r.adults);
  const [children, setChildren] = useState(r.children);
  // null: sigue el valor sugerido; con un número, es el que escribió el equipo.
  const [typed, setTyped] = useState<number | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const type = data.cabinTypes.find((c) => c.id === r.cabinTypeId);
  const capacity = type?.maxPersonas ?? 20;
  const suggested = type ? suggestedTotal(r, type, adults + children, data.seasons) : r.quote.total;
  const total = typed ?? suggested;
  const invalidTotal = total < MIN_TOTAL;
  const unchanged = adults === r.adults && children === r.children && total === r.quote.total;
  const pending = Math.max(0, total - r.paid);
  const surplus = Math.max(0, r.paid - total);
  const linked = (data.channelStays ?? []).some((s) => s.reservationCode === r.code && !s.removedAt);

  async function save() {
    setTried(true);
    if (busy || invalidTotal || unchanged) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.admin.action({ code: r.code, action: "adjust", adults, children, total });
      if (res.status === 401 || res.status === 403) return onAuthError();
      if (res.status !== 200)
        return setError(ERRORS[(res.data as { error?: string } | null)?.error ?? ""] ?? "No se pudo guardar el cambio. Inténtalo de nuevo.");
      await reload();
      toast("Reserva actualizada", "ok");
      onClose();
    } catch {
      setError("Sin conexión con el servidor. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="adj-title" className="m-auto w-[calc(100%-32px)] max-w-[480px] rounded-[26px] p-0">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-full bg-success-soft text-success">
              <PencilIcon size={18} />
            </span>
            <div className="min-w-0 pt-1">
              <h2 id="adj-title" className="text-[18px] font-bold tracking-[-0.02em] text-ink">
                Editar personas y valor
              </h2>
              <p className="text-[13.5px] text-ink-muted">{`${r.code} · ${r.guest.fullName} · ${fmtDate(r.checkIn)} → ${fmtDate(r.checkOut)}`}</p>
            </div>
          </div>
          <p className="text-[13.5px] text-ink">
            {`${r.groupCode ? `Cambias solo ${cabinLabel(r.cabinTypeId, r.unit)}. ` : ""}Las fechas y la cabaña no cambian, y el huésped no recibe ningún correo.`}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Adultos">{(p) => <Stepper id={p.id} value={adults} onChange={setAdults} min={1} max={Math.max(1, capacity - children)} />}</Field>
            <Field label="Niños">{(p) => <Stepper id={p.id} value={children} onChange={setChildren} min={0} max={Math.max(0, capacity - adults)} />}</Field>
          </div>
          <Field
            label="Valor total"
            error={tried && invalidTotal ? `Escribe un valor de al menos ${cop(MIN_TOTAL)}.` : undefined}
            hint={
              typed !== null && typed !== suggested ? (
                <button type="button" className="font-semibold underline" onClick={() => setTyped(null)}>
                  {`Usar el valor sugerido: ${cop(suggested)}`}
                </button>
              ) : (
                `Antes: ${cop(r.quote.total)}`
              )
            }
          >
            {(p) => <MoneyInput id={p.id} value={total} onChange={setTyped} invalid={!!p["aria-invalid"]} describedBy={p["aria-describedby"]} />}
          </Field>
          <p className="text-[13.5px] text-ink-muted">{`Ya pagado: ${cop(r.paid)} · Queda por cobrar: ${cop(pending)}`}</p>
          {surplus > 0 && (
            <Callout tone="warning">{`Lo pagado supera el valor nuevo por ${cop(surplus)}. Este cambio no registra ninguna devolución.`}</Callout>
          )}
          {r.source === "import" && (
            <Callout tone="info">{`El valor de esta reserva lo definió ${r.channel || "el canal"}: no cambia solo con las personas.`}</Callout>
          )}
          {linked && <Callout tone="warning">Esta reserva viene de Booking: haz el mismo cambio en el extranet.</Callout>}
          {error && <FieldError>{error}</FieldError>}
        </div>
        <div className="flex flex-col-reverse gap-2 rounded-b-[26px] border-t border-line bg-canvas/70 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={unchanged} icon={<CheckIcon size={14} />}>
            Guardar cambios
          </Button>
        </div>
      </form>
    </Modal>
  );
}
