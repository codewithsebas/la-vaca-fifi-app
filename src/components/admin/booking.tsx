"use client";

// Reservas de Booking que llegan por correo de Ayenda. El correo trae el huésped, las fechas y el valor, pero no la
// cabaña: cada una entra «por asignar» y alguien del equipo elige la cabaña. En ese momento se crea la reserva
// (confirmada, canal Booking, se paga en el hotel) y las fechas quedan bloqueadas en el sitio.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckIcon, CloseIcon, ExternalLinkIcon, MailIcon, PhoneIcon } from "@/components/ui/icons";
import { Combobox } from "@/components/ui/combobox";
import { findUnit, unitFree, type Occupancy } from "@/lib/booking";
import { api } from "@/lib/client/api";
import { cop, fmtDate, nightsBetween, plural, timeAgo } from "@/lib/format";
import type { CabinTypeId } from "@/lib/config";
import type { BookingInboxItem } from "@/lib/types";
import { useAdmin } from "@/components/admin/context";
import { useSyncStatus } from "@/components/admin/sync";
import { MODULES, paths } from "@/components/admin/routes";
import { Badge, Button, Callout, Card, CardHeader, EmptyState, ErrorState, Field, PageHeader, Skeleton, type Tone } from "@/components/admin/ui";

const AYENDA_URL = (ref: string) => `https://pms.ayenda.co/reservations/${ref}`;

const STATUS: Record<BookingInboxItem["status"], { label: string; tone: Tone }> = {
  pending: { label: "Por asignar", tone: "info" },
  assigned: { label: "Asignada", tone: "success" },
  cancelled: { label: "Cancelada en Booking", tone: "danger" },
  dismissed: { label: "Descartada", tone: "neutral" },
};

const ERRORS: Record<string, string> = {
  DATES_UNAVAILABLE: "Esa cabaña ya está ocupada en esas fechas. Elige otra unidad.",
  NOT_PENDING: "Esta reserva ya no está por asignar (alguien más la resolvió o Booking la canceló).",
  DUPLICATE: "Esta reserva de Booking ya está en el panel.",
};

export function BookingView() {
  const { sync, onAuthError, data } = useAdmin();
  const offline = useSyncStatus(sync).network === "offline";
  const [list, setList] = useState<BookingInboxItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    () =>
      api.admin.booking
        .list()
        .then((r) => {
          if (r.status === 401 || r.status === 403) return onAuthError();
          if (r.status !== 200 || !Array.isArray(r.data)) throw 0;
          setFailed(false);
          setList(r.data);
        })
        .catch(() => setFailed(true)),
    [onAuthError],
  );

  // Se vuelve a pedir cuando llega un aviso de Booking (reserva nueva, cambio o cancelación).
  const lastBookingNotice = data.notifications.find((n) => n.kind.startsWith("booking_"))?.id ?? 0;
  useEffect(() => {
    load();
  }, [load, lastBookingNotice]);

  const pending = (list ?? []).filter((i) => i.status === "pending");
  const done = (list ?? []).filter((i) => i.status !== "pending").sort((a, b) => b.lastEmailAt.localeCompare(a.lastEmailAt));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={MODULES.booking.label}
        description="Reservas de Booking.com que llegan por correo de Ayenda. El correo no dice la cabaña: elige una y la reserva queda creada y las fechas bloqueadas en el sitio."
      />

      {offline && <Callout tone="warning">Sin conexión: para asignar o descartar reservas de Booking necesitas internet.</Callout>}

      {failed ? (
        <ErrorState
          title="No pudimos cargar las reservas de Booking"
          text="Revisa tu conexión e inténtalo de nuevo."
          onRetry={() => {
            setFailed(false);
            load();
          }}
        />
      ) : !list ? (
        <div className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : (
        <>
          <Card className="flex flex-col gap-4 p-4 sm:p-5">
            <CardHeader
              title="Por asignar"
              subtitle={pending.length ? `${plural(pending.length, "reserva espera", "reservas esperan")} una cabaña` : undefined}
              icon={<MailIcon size={16} />}
              accent="blue"
            />
            {pending.length ? (
              <ul className="flex flex-col gap-3">
                {pending.map((i) => (
                  <PendingCard key={i.ref} item={i} disabled={offline} onChange={setList} onGone={load} />
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={<CheckIcon size={20} />}
                title="Nada por asignar"
                text="Cuando llegue una reserva de Booking aparecerá aquí, con un aviso en el panel."
              />
            )}
          </Card>

          {done.length > 0 && (
            <Card className="flex flex-col gap-4 p-4 sm:p-5">
              <CardHeader title="Últimos 30 días" subtitle="Reservas de Booking ya resueltas" />
              <ul className="divide-y divide-line">
                {done.map((i) => (
                  <DoneRow key={i.ref} item={i} />
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Stay({ item }: { item: BookingInboxItem }) {
  const nights = nightsBetween(item.checkIn, item.checkOut);
  return (
    <>
      {fmtDate(item.checkIn, true)} → {fmtDate(item.checkOut, true)} · {plural(nights, "noche", "noches")} · {cop(item.total)}
    </>
  );
}

function PendingCard({
  item,
  disabled,
  onChange,
  onGone,
}: {
  item: BookingInboxItem;
  disabled: boolean;
  onChange: (list: BookingInboxItem[]) => void;
  onGone: () => void;
}) {
  const { data, ask, toast, go, now } = useAdmin();
  const cabins = data.cabinTypes.filter((c) => c.units > 0);
  const occ: Occupancy = useMemo(() => ({ reservations: data.reservations, blocks: data.blocks }), [data.reservations, data.blocks]);
  const freeOf = (id: string, units: number) =>
    Array.from({ length: units }, (_, k) => k + 1).filter((u) => unitFree(occ, units, id, u, item.checkIn, item.checkOut));

  // Por defecto, la primera cabaña con una unidad libre todas las noches.
  const first = cabins.find((c) => findUnit(occ, c.units, c.id, item.checkIn, item.checkOut) > 0);
  const [type, setType] = useState<string>(first?.id ?? cabins[0]?.id ?? "");
  const cabin = cabins.find((c) => c.id === type);
  const free = cabin ? freeOf(cabin.id, cabin.units) : [];
  const [unit, setUnit] = useState<string>(String(first ? findUnit(occ, first.units, first.id, item.checkIn, item.checkOut) : 1));
  const unitOk = free.includes(Number(unit));
  const [busy, setBusy] = useState(false);

  const assign = async () => {
    setBusy(true);
    try {
      const r = await api.admin.booking.assign(item.ref, type as CabinTypeId, Number(unit));
      const d = r.data as { code?: string; items?: BookingInboxItem[]; error?: string } | null;
      if (r.status === 200 && d?.code && d.items) {
        onChange(d.items);
        toast(`Reserva creada · ${d.code}`, "ok", { label: "Ver reserva", onClick: () => go(paths.reserva(d.code!)) });
      } else {
        toast(ERRORS[d?.error ?? ""] ?? "No se pudo crear la reserva. Inténtalo de nuevo.", "error");
        if (d?.error === "NOT_PENDING") onGone();
      }
    } catch {
      toast("Sin conexión: no se pudo crear la reserva.", "error");
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () =>
    ask({
      title: "Descartar la reserva de Booking",
      text: `${item.guest} no se agregará al panel. Úsalo si ya la registraste a mano. Si Booking la modifica después, vuelve a aparecer aquí.`,
      details: [
        { k: "Fechas", v: `${fmtDate(item.checkIn, true)} → ${fmtDate(item.checkOut, true)}` },
        { k: "Reserva Ayenda", v: item.ref },
      ],
      okLabel: "Descartar",
      danger: true,
      done: "Reserva de Booking descartada",
      run: async () => {
        const r = await api.admin.booking.dismiss(item.ref);
        if (r.status === 200 && Array.isArray(r.data)) onChange(r.data);
        return r;
      },
    });

  return (
    <li className="flex flex-col gap-3 rounded-[18px] bg-blue-soft p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink">{item.guest}</p>
          <p className="text-[13px] text-ink">
            <Stay item={item} />
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-[12.5px] text-ink-muted">
            {item.phone && (
              <span className="inline-flex items-center gap-1">
                <PhoneIcon size={12} />
                {item.phone}
              </span>
            )}
            {item.email && <span className="truncate">{item.email}</span>}
            <span>Llegó {timeAgo(item.lastEmailAt, now)}</span>
          </p>
        </div>
        <a
          href={AYENDA_URL(item.ref)}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-info hover:underline"
        >
          Ver la cabaña en Ayenda · {item.ref}
          <ExternalLinkIcon size={12} />
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Cabaña" className="col-span-2 sm:col-span-1">
          {(p) => (
            <Combobox
              id={p.id}
              value={type}
              onChange={(v) => {
                setType(v);
                const c = cabins.find((x) => x.id === v);
                setUnit(String((c && findUnit(occ, c.units, c.id, item.checkIn, item.checkOut)) || 1));
              }}
              options={cabins.map((c) => {
                const n = freeOf(c.id, c.units).length;
                return { value: c.id, label: c.nombre, description: n ? plural(n, "unidad libre", "unidades libres") : "Sin unidades libres en esas fechas" };
              })}
            />
          )}
        </Field>
        <Field
          label="Unidad"
          className="col-span-2 sm:col-span-1"
          error={cabin && !free.length ? "No hay unidades libres de esta cabaña en esas fechas." : undefined}
        >
          {(p) => (
            <Combobox
              id={p.id}
              value={unit}
              onChange={setUnit}
              options={Array.from({ length: cabin?.units ?? 0 }, (_, k) => ({
                value: String(k + 1),
                label: `Unidad ${k + 1}`,
                description: free.includes(k + 1) ? "Libre" : "Ocupada en esas fechas",
                disabled: !free.includes(k + 1),
              }))}
            />
          )}
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon={<CheckIcon size={14} />} loading={busy} disabled={disabled || !unitOk} onClick={assign}>
          Asignar y crear la reserva
        </Button>
        <Button size="sm" variant="danger-ghost" icon={<CloseIcon size={14} />} disabled={disabled || busy} onClick={dismiss}>
          Descartar
        </Button>
      </div>
    </li>
  );
}

function DoneRow({ item }: { item: BookingInboxItem }) {
  const st = STATUS[item.status];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-ink">{item.guest}</p>
        <p className="text-[12.5px] text-ink-muted">
          <Stay item={item} /> · Ayenda {item.ref}
        </p>
      </div>
      <Badge tone={st.tone}>{st.label}</Badge>
      {item.reservationCode && (
        <Link href={paths.reserva(item.reservationCode)} className="text-[13px] font-semibold text-info hover:underline">
          {item.reservationCode}
        </Link>
      )}
    </li>
  );
}
