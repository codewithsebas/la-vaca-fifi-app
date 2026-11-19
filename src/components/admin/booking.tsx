"use client";

// Booking.com en el panel. Arriba, las cifras de lo que llega de Booking (por llegar, este mes, sin datos del huésped y
// canceladas); debajo, los calendarios iCal de cada cabaña (solo administradores) y las reservas que llegan por correo
// de Ayenda. El correo trae el huésped, las fechas y el valor, pero no la cabaña: cada una entra «por asignar» y alguien
// del equipo elige la cabaña. En ese momento se crea la reserva (confirmada, canal Booking, se paga en el hotel) y las
// fechas quedan bloqueadas en el sitio.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookingIcon, CalendarIcon, CheckIcon, CloseIcon, ExternalLinkIcon, MailIcon, PhoneIcon, UserIcon } from "@/components/ui/icons";
import { Combobox } from "@/components/ui/combobox";
import { busyBlocks, findUnit, isFromBooking, staysWithoutData, unitFree, unitLabel, type Occupancy } from "@/lib/booking";
import { api } from "@/lib/client/api";
import { can, isAdminRole } from "@/lib/permissions";
import { addDays, cop, fmtDate, nightsBetween, plural, timeAgo } from "@/lib/format";
import { money } from "@/components/admin/board";
import type { CabinTypeId } from "@/lib/config";
import type { BookingInboxItem } from "@/lib/types";
import { useAdmin } from "@/components/admin/context";
import { useSyncStatus } from "@/components/admin/sync";
import { BookingCalendars } from "@/components/admin/booking-calendars";
import { MODULES, paths } from "@/components/admin/routes";
import { Badge, Button, Callout, Card, CardHeader, EmptyState, ErrorState, Field, PageHeader, Skeleton, StatCard, type Tone } from "@/components/admin/ui";

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
      <PageHeader title={MODULES.booking.label} description="Conexión con Booking.com: el calendario de cada cabaña y las reservas que llegan por correo." />

      <BookingFigures inbox={list} />

      {isAdminRole(data.me.role) && <BookingCalendars offline={offline} />}

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
          <Card data-tour="booking-inbox" className="flex flex-col gap-4 p-4 sm:p-5">
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
  const occ: Occupancy = useMemo(() => ({ reservations: data.reservations, blocks: busyBlocks(data) }), [data]);
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
                label: `Cabaña ${unitLabel(cabin, k + 1)}`,
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

/* ───────────── Cifras de Booking ───────────── */

// Lo que llega de Booking, por las dos vías de Fifí: las reservas que entran por correo de Ayenda (bandeja y reservas ya
// creadas con canal Booking) y las noches de los calendarios iCal que aún no tienen reserva en el panel.
const ACTIVE = ["pending_deposit", "confirmed", "rescheduled", "checked_in"];

function BookingFigures({ inbox }: { inbox: BookingInboxItem[] | null }) {
  const { data, today } = useAdmin();
  const money$ = can(data.me.role, "finance");
  const m = useMemo(() => {
    const month = today.slice(0, 7);
    const res = data.reservations.filter(isFromBooking);
    // Por llegar: reservas de Booking que aún no salen, correos por asignar y noches del calendario sin reserva.
    const resUpcoming = res.filter((r) => r.checkOut > today && ACTIVE.includes(r.status));
    const inboxUpcoming = (inbox ?? []).filter((i) => i.status === "pending" && i.checkOut > today);
    const stays = data.channelStays.filter((s) => !s.echo);
    const staysUpcoming = stays.filter((s) => !s.removedAt && !s.reservationCode && s.checkOut > today);
    const nightsFrom = (ci: string, co: string) => nightsBetween(ci < today ? today : ci, co);
    const upcomingNights =
      resUpcoming.reduce((n, r) => n + nightsFrom(r.checkIn, r.checkOut), 0) +
      inboxUpcoming.reduce((n, i) => n + nightsFrom(i.checkIn, i.checkOut), 0) +
      staysUpcoming.reduce((n, s) => n + nightsFrom(s.checkIn, s.checkOut), 0);
    // Este mes: reservas de Booking que llegan en el mes (sin canceladas), su valor y sus noches.
    const monthStays = res.filter((r) => r.checkIn.slice(0, 7) === month && r.status !== "cancelled" && r.status !== "expired");
    // Canceladas en Booking en los últimos 30 días: correos de cancelación y noches que el calendario quitó.
    const since = addDays(today, -30);
    const cancelled =
      (inbox ?? []).filter((i) => i.status === "cancelled" && i.lastEmailAt.slice(0, 10) >= since).length +
      stays.filter((s) => s.removedAt && s.removedAt.slice(0, 10) >= since).length;
    return {
      upcoming: resUpcoming.length + inboxUpcoming.length + staysUpcoming.length,
      upcomingNights,
      monthCount: monthStays.length,
      monthValue: monthStays.reduce((s, r) => s + r.quote.total, 0),
      monthNights: monthStays.reduce((n, r) => n + nightsBetween(r.checkIn, r.checkOut), 0),
      withoutGuest: staysWithoutData(data.channelStays, today).length,
      cancelled,
    };
  }, [data, today, inbox]);

  return (
    <div className="grid grid-cols-1 gap-3 min-[460px]:grid-cols-2 xl:grid-cols-4">
      <StatCard
        accent="blue"
        label="Por llegar"
        value={m.upcoming}
        hint={m.upcoming ? plural(m.upcomingNights, "noche reservada", "noches reservadas") : "Booking no tiene estadías por llegar"}
        icon={<BookingIcon size={15} />}
      />
      <StatCard
        accent="pink"
        label="Booking este mes"
        value={money$ ? money(m.monthValue) : m.monthCount}
        hint={`${plural(m.monthCount, "estadía", "estadías")} · ${plural(m.monthNights, "noche", "noches")}`}
        icon={<CalendarIcon size={15} />}
      />
      <StatCard
        accent="yellow"
        label="Sin datos del huésped"
        value={m.withoutGuest}
        hint={m.withoutGuest ? "noches del calendario sin reserva: complétalas" : "todas tienen su reserva"}
        icon={<UserIcon size={15} />}
      />
      <StatCard accent="green" label="Canceladas en Booking" value={m.cancelled} hint="en los últimos 30 días" icon={<CloseIcon size={15} />} />
    </div>
  );
}
