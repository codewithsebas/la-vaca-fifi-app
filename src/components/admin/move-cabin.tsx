"use client";

// Cambiar de cabaña: mismas fechas y mismo valor. Solo se ofrecen las cabañas libres todas las noches y donde quepan todos.
import { useState } from "react";
import { CheckIcon, SwapIcon } from "@/components/ui/icons";
import { Combobox } from "@/components/ui/combobox";
import { busyBlocks, unitFree, unitLabel } from "@/lib/booking";
import { api } from "@/lib/client/api";
import { fmtDate, plural } from "@/lib/format";
import type { Reservation } from "@/lib/types";
import { useAdmin } from "@/components/admin/context";
import { Button, Callout, Field, FieldError, Modal } from "@/components/admin/ui";

const ERRORS: Record<string, string> = {
  DATES_UNAVAILABLE: "Esa cabaña ya no está libre en esas fechas. Elige otra.",
  OVER_CAPACITY: "En esa cabaña no caben todas las personas de la reserva.",
  INVALID_TRANSITION: "Esta reserva ya no se puede cambiar de cabaña.",
};

export function MoveCabinDialog({ r, onClose }: { r: Reservation; onClose: () => void }) {
  const { data, reload, toast, cabinLabel, onAuthError } = useAdmin();
  const [pick, setPick] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const occ = { reservations: data.reservations, blocks: busyBlocks(data) };
  const people = r.adults + r.children;
  const options = data.cabinTypes
    .filter((c) => c.activa && people <= c.maxPersonas)
    // Primero las del mismo tipo: el cambio más común.
    .sort((a, b) => Number(b.id === r.cabinTypeId) - Number(a.id === r.cabinTypeId))
    .flatMap((c) =>
      Array.from({ length: c.units }, (_, i) => i + 1)
        .filter((u) => !(c.id === r.cabinTypeId && u === r.unit) && unitFree(occ, c.units, c.id, u, r.checkIn, r.checkOut, r.code))
        .map((u) => ({
          value: `${c.id}:${u}`,
          label: `Cabaña ${unitLabel(c, u)}`,
          description: `${c.nombre} · hasta ${plural(c.maxPersonas, "persona", "personas")}`,
          keywords: c.nombre,
        })),
    );
  const linked = (data.channelStays ?? []).some((s) => s.reservationCode === r.code && !s.removedAt);

  async function save() {
    setTried(true);
    if (busy || !pick) return;
    const [cabinTypeId, unit] = pick.split(":");
    setBusy(true);
    setError("");
    try {
      const res = await api.admin.action({ code: r.code, action: "move", cabinTypeId, unit: Number(unit) });
      if (res.status === 401 || res.status === 403) return onAuthError();
      if (res.status !== 200)
        return setError(ERRORS[(res.data as { error?: string } | null)?.error ?? ""] ?? "No se pudo cambiar la cabaña. Inténtalo de nuevo.");
      await reload();
      toast("Cabaña cambiada", "ok");
      onClose();
    } catch {
      setError("Sin conexión con el servidor. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="mv-title" className="m-auto w-[calc(100%-32px)] max-w-[480px] rounded-[26px] p-0">
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
              <SwapIcon size={18} />
            </span>
            <div className="min-w-0 pt-1">
              <h2 id="mv-title" className="text-[18px] font-bold tracking-[-0.02em] text-ink">
                Cambiar de cabaña
              </h2>
              <p className="text-[13.5px] text-ink-muted">{`${r.code} · ${r.guest.fullName} · ${fmtDate(r.checkIn)} → ${fmtDate(r.checkOut)}`}</p>
            </div>
          </div>
          <p className="text-[13.5px] text-ink">
            {`Ahora está en ${cabinLabel(r.cabinTypeId, r.unit)}. Las fechas, el valor y lo pagado no cambian, y el huésped no recibe ningún correo.`}
          </p>
          {options.length > 0 ? (
            <Field label="Nueva cabaña" error={tried && !pick ? "Elige la cabaña." : undefined}>
              {(p) => (
                <Combobox
                  id={p.id}
                  describedBy={p["aria-describedby"]}
                  invalid={!!p["aria-invalid"]}
                  value={pick}
                  onChange={setPick}
                  options={options}
                  placeholder="Elegir cabaña libre"
                  searchPlaceholder="Número o tipo de cabaña…"
                />
              )}
            </Field>
          ) : (
            <Callout tone="warning">{`No hay otra cabaña libre esas noches donde quepan ${plural(people, "persona", "personas")}.`}</Callout>
          )}
          {linked && <Callout tone="warning">Esta reserva viene de Booking: muévela también en el extranet a la misma cabaña.</Callout>}
          {error && <FieldError>{error}</FieldError>}
        </div>
        <div className="flex flex-col-reverse gap-2 rounded-b-[26px] border-t border-line bg-canvas/70 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!options.length} icon={<CheckIcon size={14} />}>
            Cambiar de cabaña
          </Button>
        </div>
      </form>
    </Modal>
  );
}
