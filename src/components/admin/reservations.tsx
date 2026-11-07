"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  BanIcon,
  CalendarIcon,
  CloseIcon,
  FileTextIcon,
  HomeIcon,
  LoginIcon,
  LogoutIcon,
  PlusIcon,
  SearchIcon,
  WalletIcon,
  WhatsAppIcon,
} from "@/components/ui/icons";
import { useLabelTip } from "@/components/ui/floating";
import { StatusPill } from "@/components/ui/status-pill";
import { paymentState } from "@/lib/admin-metrics";
import { STATUS, isISO, monthStart, plural } from "@/lib/format";
import { lastOfMonth, monthOptions } from "@/components/admin/calendar/shared";
import type { Reservation, ReservationStatus } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin, useParam } from "@/components/admin/context";
import { DateRangePicker } from "@/components/admin/date-picker";
import { NewReservationDialog } from "@/components/admin/new-reservation";
import { Paginator, usePaged } from "@/components/admin/paginator";
import { MODULES, paths } from "@/components/admin/routes";
import { adminInput, norm, rowOf } from "@/components/admin/shared";
import { SyncMark } from "@/components/admin/sync";
import { useReservationActions, type ActionKind } from "@/components/admin/reservation-detail";
import { Badge, Button, Card, EmptyState, IconButton, ModalPresence, iconButtonClass } from "@/components/admin/ui";

// Más reciente primero; si dos se crearon a la vez (un grupo), desempata el código para que el orden no salte.
const newestFirst = (a: Reservation, b: Reservation) => b.createdAt.localeCompare(a.createdAt) || b.code.localeCompare(a.code);

// Un solo filtro de estado: los estados de la reserva y dos vistas de trabajo (comprobantes por revisar, próximas llegadas).
type View = "" | "comprobantes" | "proximas" | ReservationStatus;
type Sort = "creada-desc" | "llegada-desc" | "llegada-asc" | "valor-desc";

// Lista de reservas. Los filtros viven en la URL: al abrir una reserva y volver, la lista sigue igual.
export function ReservationsView() {
  const { data, today, openReservation, cabinLabel } = useAdmin();
  const [q, setQ] = useParam("q", "");
  const [view, setView] = useParam<View>("estado", "");
  const [cabin, setCabin] = useParam("cabana", "");
  const [fromP, setFrom] = useParam("desde", "");
  const [toP, setTo] = useParam("hasta", "");
  const [sort, setSort] = useParam<Sort>("orden", "creada-desc");
  const [creating, setCreating] = useState(false);
  const from = isISO(fromP) ? fromP : null;
  const to = isISO(toP) ? toP : null;

  const proofCodes = useMemo(() => new Set(data.proofs.filter((p) => p.status === "pending").map((p) => p.reservationCode)), [data.proofs]);
  const inView = (r: Reservation) =>
    !view ||
    (view === "comprobantes"
      ? proofCodes.has(r.code)
      : view === "proximas"
        ? ["pending_deposit", "confirmed", "rescheduled"].includes(r.status) && r.checkIn >= today
        : r.status === view);
  const byStatus = (s: ReservationStatus) => data.reservations.filter((r) => r.status === s).length;

  const nq = norm(q.trim());
  const list = data.reservations
    .filter(
      (r) =>
        inView(r) &&
        (!cabin || r.cabinTypeId === cabin) &&
        (!from || r.checkIn >= from) &&
        (!to || r.checkIn <= to) &&
        (!nq || [r.code, r.guest.fullName, r.guest.email, r.guest.phone, r.guest.docNumber, r.externalRef ?? ""].some((v) => norm(v || "").includes(nq))),
    )
    .sort((a, b) =>
      sort === "llegada-asc"
        ? a.checkIn < b.checkIn
          ? -1
          : 1
        : sort === "llegada-desc"
          ? a.checkIn < b.checkIn
            ? 1
            : -1
          : sort === "valor-desc"
            ? b.quote.total - a.quote.total
            : newestFirst(a, b),
    );
  // El filtro de mes es un atajo del rango de llegada: muestra el mes solo si el rango lo cubre entero.
  const monthValue = from && to && from === monthStart(from) && to === lastOfMonth(from) ? from : "";
  const months = useMemo(() => monthOptions(today, from ?? today), [today, from]);
  // La última reserva creada (de todas, no solo de las filtradas) se pinta con otro fondo para ubicarla de un vistazo.
  const latest = data.reservations.reduce<Reservation | null>((a, r) => (!a || newestFirst(r, a) < 0 ? r : a), null)?.code;
  const paged = usePaged(list, "reservas", [nq, view, cabin, fromP, toP, sort].join("|"));
  const active = !!(q || view || cabin || from);
  const clear = () => {
    setQ("");
    setView("");
    setCabin("");
    setFrom("");
    setTo("");
  };

  return (
    <>
      <ModalPresence>{creating && <NewReservationDialog draft={{}} onClose={() => setCreating(false)} />}</ModalPresence>

      {/* Como el calendario: el título del mismo tamaño y, debajo, los filtros y «Nueva reserva» con su mismo alto. */}
      <div className="flex flex-col gap-3">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h1 id="ad-title" tabIndex={-1} className="text-[25px] leading-tight font-bold tracking-[-0.03em] text-ink focus:outline-none">
              {MODULES.reservas.label}
            </h1>
            <p className="text-[14.5px] text-ink-muted">{MODULES.reservas.description}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {active && (
              <Button size="sm" variant="ghost" icon={<CloseIcon size={14} />} onClick={clear}>
                Limpiar filtros
              </Button>
            )}
            <Button variant="primary" icon={<PlusIcon size={15} />} onClick={() => setCreating(true)}>
              Nueva reserva
            </Button>
          </div>
        </header>
        <form
          role="search"
          aria-label="Filtrar reservas"
          onSubmit={(e) => e.preventDefault()}
          className="grid grid-cols-2 items-center gap-2 md:grid-cols-3 xl:grid-cols-[minmax(0,1.5fr)_repeat(5,minmax(0,1fr))]"
        >
          <div className="relative col-span-2 min-w-0 md:col-span-3 xl:col-span-1">
            <label htmlFor="res-q" className="sr-only">
              Buscar reservas
            </label>
            <SearchIcon size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
            <input
              id="res-q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre, código, correo, celular o documento"
              className={`${adminInput} pl-8!`}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="res-estado" className="sr-only">
              Estado
            </label>
            <Combobox
              id="res-estado"
              value={view}
              onChange={(v) => setView(v as View)}
              options={[
                { value: "", label: "Todas las reservas" },
                { value: "comprobantes", label: "Comprobantes por revisar", description: plural(proofCodes.size, "reserva", "reservas") },
                { value: "proximas", label: "Próximas llegadas", description: "Pendientes, confirmadas y reprogramadas" },
                ...(Object.entries(STATUS) as [ReservationStatus, (typeof STATUS)[ReservationStatus]][]).map(([v, s]) => ({
                  value: v,
                  label: s.label,
                  color: s.bg,
                  description: plural(byStatus(v), "reserva", "reservas"),
                })),
              ]}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="res-cabana" className="sr-only">
              Cabaña
            </label>
            <Combobox
              id="res-cabana"
              value={cabin}
              onChange={setCabin}
              icon={<HomeIcon size={14} className="text-ink-muted" />}
              options={[
                { value: "", label: "Todas las cabañas" },
                ...data.cabinTypes.map((c) => ({ value: c.id, label: c.nombre, description: c.activa ? undefined : "Inactiva" })),
              ]}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="res-mes" className="sr-only">
              Mes de llegada
            </label>
            {/* Llegadas del mes elegido: fija «Llegada entre» al primer y al último día del mes. */}
            <Combobox
              id="res-mes"
              value={monthValue}
              onChange={(m) => {
                setFrom(m);
                setTo(m ? lastOfMonth(m) : "");
              }}
              options={[{ value: "", label: "Todos los meses" }, ...months]}
              searchable={false}
              selectedFirst
              icon={<CalendarIcon size={14} className="text-ink-muted" />}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="res-llegada" className="sr-only">
              Llegada entre
            </label>
            <DateRangePicker
              id="res-llegada"
              from={from}
              to={to}
              onChange={(a, b) => {
                setFrom(a ?? "");
                setTo(b ?? "");
              }}
              placeholder="Llegada: cualquier fecha"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="res-orden" className="sr-only">
              Ordenar por
            </label>
            <Combobox
              id="res-orden"
              value={sort}
              onChange={(v) => setSort(v as Sort)}
              searchable={false}
              options={[
                { value: "creada-desc", label: "Creada más reciente" },
                { value: "llegada-desc", label: "Llegada más reciente" },
                { value: "llegada-asc", label: "Llegada más antigua" },
                { value: "valor-desc", label: "Mayor valor" },
              ]}
            />
          </div>
        </form>
      </div>

      {list.length > 0 ? (
        <>
          <Card className="hidden overflow-hidden bg-paper! shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-line lg:block">
            <table className="w-full text-[14px]">
              <thead className="border-b border-line bg-canvas/70 text-left text-[12px] font-semibold text-ink-muted">
                <tr>
                  {["Reserva", "Huésped", "Cabaña", "Fechas", "Total", "Pago", "Estado"].map((h) => (
                    <th key={h} scope="col" className={`px-4 py-2.5 font-semibold ${h === "Total" ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paged.rows.map((r) => {
                  const x = rowOf(r, cabinLabel);
                  const pay = paymentState(r);
                  return (
                    <tr
                      key={r.code}
                      onClick={() => openReservation(r.code)}
                      className={`group cursor-pointer transition-colors ${r.code === latest ? "bg-yellow-soft/70 hover:bg-yellow-soft" : "hover:bg-canvas/70"}`}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={paths.reserva(r.code)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-sm font-bold whitespace-nowrap text-ink underline-offset-2 hover:underline"
                        >
                          {x.code}
                        </Link>
                        {r.source === "import" && <span className="block text-[11.5px] text-ink-muted">{r.channel || "Importada"}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="block font-semibold text-ink">{x.name}</span>
                        <span className="block text-[12.5px] text-ink-muted tabular-nums">{x.doc}</span>
                      </td>
                      <td className="px-4 py-3 text-ink">{x.cabin}</td>
                      <td className="px-4 py-3">
                        <span className="block whitespace-nowrap text-ink">{x.dates}</span>
                        <span className="block text-[12.5px] text-ink-muted">{`${x.nights} · ${r.checkIn.slice(0, 4)}`}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-ink tabular-nums">{x.total}</td>
                      <td className="px-4 py-3">
                        {proofCodes.has(r.code) ? (
                          <Badge tone="info" icon={<FileTextIcon size={12} />}>
                            Comprobante por revisar
                          </Badge>
                        ) : (
                          <Badge tone={pay.tone}>{pay.label}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex flex-col items-start gap-1">
                          <StatusPill status={r.status} size="sm" />
                          <SyncMark entity={`reservations:${r.code}`} />
                        </span>
                      </td>
                      <td className="py-3 pr-4 pl-2">
                        <RowActions r={r} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Paginator p={paged} noun="reservas" className="border-t border-line px-4 py-3" />
          </Card>
          <ul className="flex flex-col gap-2.5 lg:hidden">
            {paged.rows.map((r) => {
              const x = rowOf(r, cabinLabel);
              const pay = paymentState(r);
              return (
                <li key={r.code}>
                  <Link
                    href={paths.reserva(r.code)}
                    className={`flex w-full flex-col gap-1.5 rounded-[20px] p-4 text-left ring-1 ring-line transition-colors ${r.code === latest ? "bg-yellow-soft/70 hover:bg-yellow-soft" : "bg-paper hover:bg-canvas"}`}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <strong className="text-[13px] font-bold text-ink-muted">{x.code}</strong>
                      <StatusPill status={r.status} size="sm" />
                    </span>
                    <span className="text-[15px] font-semibold text-ink">{x.name}</span>
                    <span className="text-[13px] text-ink-muted">{`${x.cabin} · ${x.dates}`}</span>
                    <span className="flex w-full flex-wrap items-center justify-between gap-2 text-[13px]">
                      {proofCodes.has(r.code) ? <Badge tone="info">Comprobante por revisar</Badge> : <Badge tone={pay.tone}>{pay.label}</Badge>}
                      <strong className="font-semibold text-ink tabular-nums">{x.total}</strong>
                    </span>
                    <SyncMark entity={`reservations:${r.code}`} />
                  </Link>
                </li>
              );
            })}
          </ul>
          <Paginator p={paged} noun="reservas" className="rounded-[20px] bg-paper px-4 py-3 ring-1 ring-line lg:hidden" />
        </>
      ) : (
        <Card className="p-4">
          <EmptyState
            icon={<SearchIcon size={18} />}
            title={active ? "No hay reservas con esos filtros" : "Aún no hay reservas"}
            text={active ? "Prueba con otro estado, otras fechas u otro término de búsqueda." : "Las reservas que lleguen desde el sitio aparecerán aquí."}
            action={active ? <Button onClick={clear}>Limpiar filtros</Button> : undefined}
          />
        </Card>
      )}
    </>
  );
}

// Icono y gesto (globals.css, [data-gesture]) de cada acción de la fila.
const ACTION_ICON: Record<ActionKind, { icon: ReactNode; gesture: string }> = {
  pay: { icon: <WalletIcon size={15} />, gesture: "pay" },
  checkin: { icon: <LoginIcon size={15} />, gesture: "checkin" },
  checkout: { icon: <LogoutIcon size={15} />, gesture: "checkout" },
  reschedule: { icon: <CalendarIcon size={15} />, gesture: "calendar" },
  // Sin grupo, «Cancelar reserva»; en un grupo, la X es solo esta cabaña y el círculo tachado, todo el grupo.
  cancel: { icon: <CloseIcon size={15} />, gesture: "cancel" },
  "cancel-group": { icon: <BanIcon size={15} />, gesture: "cancel" },
};

// Las mismas acciones del detalle de la reserva, como botones de icono con su nombre en el tooltip. Los clics no abren la
// reserva (la fila entera sí).
function RowActions({ r }: { r: Reservation }) {
  const { actions, whatsapp, dialog } = useReservationActions(r);
  const waTip = useLabelTip("WhatsApp");
  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {actions.map((a) => (
        <IconButton
          key={a.label}
          label={a.disabled ? `${a.label} · ${a.disabled}` : a.label}
          size="sm"
          variant={a.primary ? "primary" : a.danger ? "danger-ghost" : "secondary"}
          disabled={!!a.disabled}
          data-gesture={ACTION_ICON[a.id].gesture}
          onClick={a.run}
        >
          {ACTION_ICON[a.id].icon}
        </IconButton>
      ))}
      <a
        href={whatsapp}
        target="_blank"
        rel="noopener"
        aria-label={`WhatsApp a ${r.guest.fullName}`}
        data-gesture="chat"
        className={iconButtonClass("secondary", "sm", "text-ink")}
        {...waTip}
      >
        <WhatsAppIcon size={15} />
      </a>
      {dialog}
    </div>
  );
}
