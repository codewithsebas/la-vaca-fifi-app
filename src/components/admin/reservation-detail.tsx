"use client";

// Una reserva: la página (/admin/reservas/[codigo]) y el modal que abre el calendario muestran lo mismo. Arriba, el estado,
// las acciones y cinco tarjetas (estadía, cabaña, pago, huéspedes y el siguiente paso); debajo, el huésped (editable, con su
// historial de cliente) y la estadía como línea de tiempo, y después el pago, los correos, los comprobantes y las notas.
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  AlertIcon,
  ArrowRightIcon,
  BookingIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  FileTextIcon,
  HomeIcon,
  ListIcon,
  LockIcon,
  LoginIcon,
  LogoutIcon,
  MailIcon,
  MoonIcon,
  NoteIcon,
  PencilIcon,
  RefreshIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
  WhatsAppIcon,
} from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/status-pill";
import { balanceDue, buildClients, pendingOf, typeMarks, type ClientSummary } from "@/lib/admin-metrics";
import { ACTIVE_STATUSES, CHANNEL_NAME, busyBlocks, isFromBooking, unitLabel, validateGuest } from "@/lib/booking";
import { api } from "@/lib/client/api";
import { config } from "@/lib/config";
import { can } from "@/lib/permissions";
import { groupMoney, groupOf } from "@/lib/groups";
import { addDays, cop, dateOf, fmtClock, fmtDate, fmtDateTime, nightsBetween, plural, timeAgo, waTo } from "@/lib/format";
import { PaymentFields, type PayChoice, type PayOption } from "@/components/admin/payment-fields";
import { PAYMENT_STATUS, depositPctOf, kindLabel, unpaidUntil } from "@/lib/payments";
import { fmtTime } from "@/lib/site";
import type { DocType, EmailRecord, Guest, PayMethod, PaymentRecord, Reservation } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin } from "@/components/admin/context";
import { BathroomWarning } from "@/components/admin/bathrooms";
import { initialsOf } from "@/components/admin/calendar/shared";
import { MoveCabinDialog } from "@/components/admin/move-cabin";
import { AdjustReservationDialog } from "@/components/admin/adjust-reservation";
import { ACTION_ICON, ActionMenu, inMenu, type Action, type ActionKind } from "@/components/admin/action-menu";
import { ProofCard } from "@/components/admin/proofs";
import { paths } from "@/components/admin/routes";
import { SyncMark } from "@/components/admin/sync";
import { useRouteParam } from "@/components/admin/route-param";
import { EMAIL_KIND, TRUST, type ConfirmCfg, adminInput } from "@/components/admin/shared";
import {
  ACCENT,
  Badge,
  Button,
  CopyButton,
  Card,
  CardHeader,
  EmptyState,
  Field,
  FieldError,
  IconButton,
  Modal,
  ModalPresence,
  PageHeader,
  StatCard,
  Stars,
  buttonClass,
} from "@/components/admin/ui";

const OCC: Record<string, string> = { aniversario: "Aniversario", cumpleanos: "Cumpleaños", propuesta: "Propuesta", otra: "Otra" };

export type { ActionKind } from "@/components/admin/action-menu";
type ActionId = "checkin" | "checkout" | "cancel" | "reschedule";

/* ───────────── Página y modal ───────────── */

export function ReservationRoute() {
  return <ReservationDetail code={useRouteParam().toUpperCase()} />;
}

export function ReservationDetail({ code }: { code: string }) {
  const { data } = useAdmin();
  const r = data.reservations.find((x) => x.code === code);
  if (!r)
    return (
      <>
        <PageHeader title="Reserva no encontrada" />
        <Card className="p-4">
          <EmptyState
            icon={<ListIcon size={18} />}
            title={`No existe una reserva con el código ${code}`}
            text="Revisa el código o búscala en la lista de reservas."
            action={
              <Link href={paths.reservas()} className={buttonClass("primary")}>
                Ir a Reservas
              </Link>
            }
          />
        </Card>
      </>
    );
  return <ReservationView r={r} />;
}

// Desde el calendario: la misma vista en un modal, sin salir del calendario. «Página completa» abre la ruta de la reserva.
export function ReservationModal({ code, onClose }: { code: string; onClose: () => void }) {
  const { data } = useAdmin();
  const r = data.reservations.find((x) => x.code === code);
  return (
    <Modal
      onClose={onClose}
      labelledBy="rm-title"
      dismissOnBackdrop
      initialFocus="#rm-close"
      className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-24px)] max-w-[1360px] overflow-y-auto rounded-[28px] bg-canvas! p-0"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur-md sm:px-6">
        <p className="min-w-0 truncate text-[13px] font-semibold text-ink-muted">
          Reserva <span className="text-ink">{code}</span>
        </p>
        <div className="flex flex-none items-center gap-1.5">
          {r && (
            <Link href={paths.reserva(code)} className={buttonClass("ghost", "sm")}>
              Página completa
              <ArrowRightIcon size={14} />
            </Link>
          )}
          <IconButton id="rm-close" label="Cerrar" variant="secondary" size="sm" onClick={onClose}>
            <CloseIcon size={16} />
          </IconButton>
        </div>
      </div>
      <div className="flex flex-col gap-5 p-4 sm:p-6">
        {r ? (
          <ReservationView r={r} modal />
        ) : (
          <EmptyState icon={<ListIcon size={18} />} title={`No existe una reserva con el código ${code}`} text="Puede que se haya eliminado." />
        )}
      </div>
    </Modal>
  );
}

/* ───────────── Vista ───────────── */

function ReservationView({ r, modal = false }: { r: Reservation; modal?: boolean }) {
  const { data, cabinLabel, today } = useAdmin();
  const [editing, setEditing] = useState(false);
  const cabin = cabinLabel(r.cabinTypeId, r.unit);
  // Reserva con varias cabañas: pagos, comprobantes y correos son del grupo; los valores se suman.
  const group = groupOf(data.reservations, r);
  const inGroup = group.length > 1;
  const codes = new Set(group.map((x) => x.code));
  const gm = groupMoney(group);
  const m: Reservation = inGroup ? { ...r, quote: gm.quote, paid: gm.paid, depositPaidAt: gm.depositPaidAt, balancePaidAt: gm.balancePaidAt } : r;
  const proofs = data.proofs.filter((p) => codes.has(p.reservationCode));
  const payments = data.payments.filter((p) => codes.has(p.reservationCode));
  const emails = data.emails.filter((e) => !!e.reservationCode && codes.has(e.reservationCode));
  const pendingProof = proofs.some((p) => p.status === "pending");
  const due = balanceDue(m);
  const nights = nightsBetween(r.checkIn, r.checkOut);
  const cabinType = data.cabinTypes.find((c) => c.id === r.cabinTypeId);

  const { actions, earlyDue, whatsapp, dialog } = useReservationActions(r);

  const client = buildClients(
    data.reservations.filter((x) => x.clientKey === r.clientKey),
    data.clients,
    today,
  )[0];

  // Lo que toca hacer ahora con la reserva.
  const days = nightsBetween(today, r.checkIn);
  const next: { value: string; hint: string } =
    r.status === "pending_deposit"
      ? { value: "Registrar el abono", hint: "Sin abono no aparta las fechas" }
      : r.status === "expired"
        ? { value: "Reactivar o liberar", hint: "La retención venció sin abono" }
        : r.status === "confirmed" || r.status === "rescheduled"
          ? days === 0
            ? { value: "Check-in hoy", hint: r.estimatedArrival ? `Llegada estimada ${r.estimatedArrival}` : "Llega hoy" }
            : days > 0
              ? { value: days === 1 ? "Llega mañana" : `Llega en ${days} días`, hint: earlyDue ? `Saldo por cobrar ${cop(earlyDue)}` : "Pagada por completo" }
              : { value: "Check-in pendiente", hint: `Debía llegar el ${fmtDate(r.checkIn)}` }
          : r.status === "checked_in"
            ? due
              ? { value: "Cobrar el saldo", hint: `${cop(due.amount)} antes del check-out` }
              : { value: "Check-out", hint: `Sale el ${fmtDate(r.checkOut)} · se finaliza sola a las ${autoCheckout(data.site.settings.checkOutTime)}` }
            : r.status === "completed"
              ? { value: "Estadía finalizada", hint: `Salió el ${fmtDate(r.checkOut)}` }
              : { value: "Cancelada", hint: "Las fechas quedaron libres" };
  const pct = m.quote.total ? Math.min(100, Math.round((m.paid / m.quote.total) * 100)) : 0;
  const owed = pendingOf(m).total;

  const badges = (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill status={r.status} size="sm" />
      <SyncMark entity={`reservations:${r.code}`} />
      {inGroup && <Badge tone="info">{`Grupo ${r.groupCode} · ${plural(group.length, "cabaña", "cabañas")}`}</Badge>}
      {r.source === "panel" && <Badge tone="neutral">Creada por el equipo</Badge>}
      {isFromBooking(r) ? (
        <Badge tone="neutral" icon={<BookingIcon size={12} />}>
          {CHANNEL_NAME}
        </Badge>
      ) : (
        r.source === "import" && <Badge tone="neutral">{`Importada${r.channel ? ` · ${r.channel}` : ""}`}</Badge>
      )}
      {(data.channelStays ?? []).some((s) => s.reservationCode === r.code && !s.removedAt) && <Badge tone="info">Enlazada con Booking</Badge>}
      {pendingProof && (
        <Badge tone="info" icon={<FileTextIcon size={12} />}>
          Comprobante por revisar
        </Badge>
      )}
      {r.status === "pending_deposit" && <Badge tone="warning">Sin confirmar · no aparta fechas</Badge>}
      {due && <Badge tone="warning">{`Saldo por cobrar: ${cop(due.amount)}`}</Badge>}
    </div>
  );
  // A la vista, lo del día a día; lo que cambia la reserva y cancelar, en «Editar reserva».
  const buttons = (
    <>
      {actions
        .filter((a) => !inMenu(a))
        .map((a) => (
          <Button key={a.label} variant={a.primary ? "primary" : "secondary"} onClick={a.run} disabled={!!a.disabled} icon={ACTION_ICON[a.id].icon(16)}>
            {a.label}
          </Button>
        ))}
      <a href={whatsapp} target="_blank" rel="noopener" className={buttonClass("secondary")}>
        <WhatsAppIcon size={16} />
        WhatsApp
      </a>
      <ActionMenu actions={actions.filter(inMenu)} />
    </>
  );
  // Editar desde la tarjeta que muestra el dato.
  const cardAction = (id: ActionKind, label: string) => {
    const a = actions.find((x) => x.id === id);
    return a ? (
      <button
        type="button"
        onClick={a.run}
        className="mt-1 self-start rounded-full bg-paper/70 px-3 py-1 text-[12.5px] font-semibold text-ink transition-colors hover:bg-paper"
      >
        {label}
      </button>
    ) : null;
  };

  return (
    <>
      {modal ? (
        <header className="flex flex-col gap-3">
          {badges}
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <h2 id="rm-title" className="text-[clamp(1.4rem,2.4vw,1.9rem)] leading-tight font-bold tracking-[-0.03em] text-ink">
                {r.guest.fullName}
              </h2>
              <p className="mt-1 text-[14px] text-ink-muted">{`${r.code} · ${cabin} · ${plural(nights, "noche", "noches")}`}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">{buttons}</div>
          </div>
        </header>
      ) : (
        <PageHeader title={r.code} description={`${r.guest.fullName} · ${cabin} · ${plural(nights, "noche", "noches")}`} actions={buttons}>
          <div className="mt-2">{badges}</div>
        </PageHeader>
      )}

      {/* Columnas según el ancho disponible (modal o página, con o sin barra lateral), no el de la pantalla. */}
      <div className="@container flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-5">
          <StatCard
            accent="yellow"
            label="Estadía"
            value={`${fmtDate(r.checkIn)} → ${fmtDate(r.checkOut)}`}
            hint={plural(nights, "noche", "noches")}
            icon={<CalendarIcon size={15} />}
            action={cardAction("reschedule", "Cambiar fechas")}
          />
          <StatCard
            accent="pink"
            label="Cabaña"
            value={unitLabel(cabinType, r.unit)}
            hint={cabinType?.nombre}
            icon={<HomeIcon size={15} />}
            action={cardAction("move", "Cambiar")}
          />
          <StatCard
            accent="green"
            label="Pagado"
            value={cop(m.paid)}
            hint={
              <span className="flex w-full flex-col gap-1.5">
                <span>{`${owed > 0 ? `de ${cop(m.quote.total)} · faltan ${cop(owed)}` : `de ${cop(m.quote.total)} · pagada`}${inGroup ? " · del grupo" : ""}`}</span>
                <span aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-paper/60">
                  <span className="block h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${pct}%` }} />
                </span>
              </span>
            }
            icon={<WalletIcon size={15} />}
          />
          <StatCard
            accent="blue"
            label="Huéspedes"
            value={r.adults + r.children}
            hint={`${plural(r.adults, "adulto", "adultos")}${r.children ? ` · ${plural(r.children, "niño", "niños")}` : ""}${r.pet?.hasPet ? " · mascota" : ""}`}
            icon={<UsersIcon size={15} />}
            action={cardAction("adjust", "Editar")}
          />
          <StatCard accent="yellow" label="Siguiente paso" value={next.value} hint={next.hint} icon={<ClockIcon size={15} />} />
        </div>

        {ACTIVE_STATUSES.includes(r.status) && <BathroomWarning cabinTypeId={r.cabinTypeId} unit={r.unit} from={r.checkIn} to={addDays(r.checkOut, -1)} />}
        {inGroup && <GroupCard r={r} group={group} />}
        {(r.status === "pending_deposit" || r.status === "expired") && <HoldCard r={r} />}

        {/* Quién viene y cuándo, a la vista; debajo, el pago y las notas. */}
        <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
          <GuestCard r={r} client={client} onEdit={() => setEditing(true)} />
          <StayCard r={r} cabin={cabin} />
        </div>

        <div className="grid grid-cols-1 items-start gap-4 @3xl:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            <PaymentSummary r={m} payments={payments} />
            <EmailsCard emails={emails} />
            {proofs.length > 0 && (
              <Card aria-labelledby="dt-proofs" className="flex flex-col gap-3 p-5 sm:p-6">
                <CardHeader
                  id="dt-proofs"
                  icon={<FileTextIcon size={18} />}
                  title="Comprobantes de pago"
                  subtitle="Transferencias que envió el huésped desde «Mi reserva»."
                  actions={
                    <span className="flex items-center gap-1 text-[12px] text-ink-subtle">
                      <LockIcon size={12} />
                      Privados
                    </span>
                  }
                />
                <ul className="flex flex-col gap-2">
                  {proofs.map((p) => (
                    <ProofCard key={p.id} p={p} r={r} />
                  ))}
                </ul>
              </Card>
            )}
          </div>
          <Notes r={r} />
        </div>
      </div>

      <ModalPresence>{editing && <GuestEditor r={r} onClose={() => setEditing(false)} />}</ModalPresence>
      {dialog}
    </>
  );
}

// Filas de dato con la etiqueta a la izquierda (como el detalle de la visita del diseño): se leen de un vistazo.
// `copy`: el valor que se copia con el botón de la derecha (celular, correo, documento…).
export function Facts({ rows, className = "" }: { rows: { k: string; v: ReactNode; copy?: string }[]; className?: string }) {
  return (
    <dl className={`flex flex-col text-[14px] ${className}`}>
      {rows.map((x) => (
        <div key={x.k} className="grid grid-cols-[minmax(0,104px)_minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-ink/8 py-2.5 last:border-b-0">
          <dt className="text-[13px] text-ink/65">{x.k}</dt>
          <dd className="min-w-0 font-semibold break-words text-ink">{x.v}</dd>
          {x.copy ? <CopyButton value={x.copy} label={`Copiar ${x.k.toLowerCase()}`} className="-my-1.5 self-center" /> : <span />}
        </div>
      ))}
    </dl>
  );
}

/* ───────────── Estadía ───────────── */

// Horas en las fichas: "15:00" → "3:00 p. m."; el mediodía, corto: "12:00 m.".
// Hora en que el sistema finaliza sola una estadía pagada: 30 minutos después de la hora de salida (run_auto_checkouts).
const autoCheckout = (checkOutTime: string) => {
  const [h, m] = (checkOutTime || "12:00").split(":").map(Number);
  const total = h * 60 + m + 30;
  return fmtTime(`${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`);
};

const clock = (t: string) => (t.startsWith("12:00") ? "12:00 m." : fmtTime(t));

// Cuánto falta (o pasó) desde hoy hasta una fecha, en palabras.
function fromToday(today: string, day: string) {
  const n = nightsBetween(today, day);
  return n === 0 ? "Hoy" : n === 1 ? "Mañana" : n === -1 ? "Ayer" : n > 0 ? `En ${n} días` : `Hace ${-n} días`;
}

// Llegada y salida como una línea de tiempo (con las horas del sitio), y los detalles de la estadía.
function StayCard({ r, cabin }: { r: Reservation; cabin: string }) {
  const { data, today } = useAdmin();
  const type = data.cabinTypes.find((c) => c.id === r.cabinTypeId)?.nombre;
  const s = data.site.settings;
  const nights = nightsBetween(r.checkIn, r.checkOut);
  const arrived = !!r.checkedInAt;
  const left = r.status === "completed";
  const live = ACTIVE_STATUSES.includes(r.status) && !left;
  return (
    <Card aria-labelledby="dt-stay" className="flex flex-col gap-4 p-5 sm:p-6">
      <CardHeader
        id="dt-stay"
        icon={<CalendarIcon size={18} />}
        accent="yellow"
        title="Estadía"
        subtitle={`${cabin}${type ? ` (${type})` : ""} · ${plural(nights, "noche", "noches")}`}
        actions={live && !arrived ? <Chip>{fromToday(today, r.checkIn)}</Chip> : undefined}
      />
      <ol className="flex flex-col">
        <Stop
          accent="yellow"
          icon={arrived ? <CheckIcon size={16} /> : <LoginIcon size={16} />}
          label="Llegada"
          day={fmtDate(r.checkIn, true)}
          text={arrived ? `Check-in registrado el ${fmtDate(dateOf(r.checkedInAt!))}` : `Check-in de ${clock(s.checkInStart)} a ${clock(s.checkInEnd)}`}
          time={arrived ? fmtClock(r.checkedInAt!) : clock(r.estimatedArrival || s.checkInStart)}
          timeLabel={arrived ? "Hora del check-in" : r.estimatedArrival ? "Llegada estimada" : "Inicio del check-in"}
        />
        <li
          aria-hidden="true"
          className="ml-[33px] flex items-center gap-3 border-l-2 border-dashed border-line-strong py-2.5 pl-5 text-[12.5px] font-semibold text-ink-muted"
        >
          <MoonIcon size={13} />
          {plural(nights, "noche", "noches")}
        </li>
        <Stop
          accent="green"
          icon={left ? <CheckIcon size={16} /> : <LogoutIcon size={16} />}
          label="Salida"
          day={fmtDate(r.checkOut, true)}
          text={left ? "Estadía finalizada" : `Check-out hasta las ${clock(s.checkOutTime)}`}
          time={clock(s.checkOutTime)}
          timeLabel="Hora del check-out"
        />
      </ol>
      <Facts
        className="-my-1"
        rows={[
          { k: "Huéspedes", v: `${plural(r.adults, "adulto", "adultos")}${r.children ? ` · ${plural(r.children, "niño", "niños")}` : ""}` },
          { k: "Mascota", v: r.pet?.hasPet ? `Sí${r.pet.smallBreedConfirmed ? " · raza pequeña" : ""}` : "No" },
          {
            k: "Decoración",
            v: r.decoration?.requested ? `${OCC[r.decoration.occasion] || "Sí"}${r.decoration.notes ? ` · ${r.decoration.notes}` : ""}` : "No",
          },
          { k: "Canal", v: r.source === "import" ? r.channel || "Importada" : r.source === "panel" ? "Creada por el equipo" : "Sitio web" },
          { k: "Solicitudes", v: r.specialRequests || "—" },
          { k: "Creada", v: fmtDateTime(r.createdAt) },
        ]}
      />
    </Card>
  );
}

// Parada de la línea de tiempo: círculo de color, qué es y qué día, y la hora en una píldora (como la agenda del diseño).
function Stop({
  accent,
  icon,
  label,
  day,
  text,
  time,
  timeLabel,
}: {
  accent: "yellow" | "green";
  icon: ReactNode;
  label: string;
  day: string;
  text: string;
  time: string;
  timeLabel: string;
}) {
  return (
    <li className="flex items-center gap-3 rounded-[18px] bg-paper/70 p-3 pr-3.5">
      <span aria-hidden="true" className={`grid size-10 flex-none place-items-center rounded-full text-ink ${ACCENT[accent].bg}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold text-ink-muted">{label}</span>
        <span className="block text-[16px] leading-tight font-bold tracking-[-0.01em] text-ink">{day}</span>
        <span className="mt-0.5 block text-[12.5px] text-ink-muted">{text}</span>
      </span>
      <span className={`flex-none rounded-full px-3 py-1 text-[12.5px] font-bold whitespace-nowrap text-ink tabular-nums ${ACCENT[accent].bg}`}>
        <span className="sr-only">{`${timeLabel}: `}</span>
        {time}
      </span>
    </li>
  );
}

const Chip = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <span className={`inline-flex items-center gap-1 rounded-full bg-paper px-3 py-1 text-[12.5px] font-bold whitespace-nowrap text-ink ${className}`}>
    {children}
  </span>
);

/* ───────────── Huésped ───────────── */

const DOC_TYPES: { value: DocType; label: string; description?: string }[] = [
  { value: "CC", label: "Cédula de ciudadanía" },
  { value: "CE", label: "Cédula de extranjería" },
  { value: "Pasaporte", label: "Pasaporte" },
  { value: "PPT", label: "Permiso por protección temporal" },
  { value: "SD", label: "Sin documento", description: "El cliente se agrupa por su celular" },
];
const docLabel = (g: Guest) => (g.docType === "SD" ? "Sin documento" : `${g.docType} ${g.docNumber}`);

// El huésped y su historial como cliente, en el bloque turquesa del diseño (el detalle de la visita): nombre grande,
// etiquetas y los datos de contacto a la vista. El nombre abre la ficha del cliente.
function GuestCard({ r, client, onEdit }: { r: Reservation; client?: ClientSummary; onEdit: () => void }) {
  const { data } = useAdmin();
  const g = r.guest;
  const trust = client?.profile && client.profile.trust !== "sin_evaluar" ? TRUST[client.profile.trust] : null;
  const tags: { label: string; alert?: boolean }[] = [
    ...(client
      ? [{ label: client.isRecurring ? `Recurrente · ${plural(client.stays, "estadía", "estadías")}` : client.stays ? "Primera estadía" : "Primera reserva" }]
      : []),
    ...(trust ? [{ label: trust.label, alert: trust.tone === "danger" || trust.tone === "warning" }] : []),
    ...(client?.incidents ? [{ label: plural(client.incidents, "incidencia", "incidencias"), alert: true }] : []),
    ...(r.consents?.marketing ? [{ label: "Acepta promociones" }] : []),
    ...(client?.profile?.tags.slice(0, 3).map((t) => ({ label: t })) ?? []),
  ];
  const whatsapp = waTo(g.phone, `Hola ${g.fullName.split(" ")[0]}, te escribimos de ${config.name} por tu reserva ${r.code}.`);
  return (
    <section aria-labelledby="dt-guest" className="@container flex min-w-0 flex-col gap-4 rounded-[22px] bg-pink p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <span
            aria-hidden="true"
            className="grid size-13 flex-none place-items-center rounded-full bg-paper text-[17px] font-bold tracking-[-0.02em] text-ink"
          >
            {initialsOf(g.fullName)}
          </span>
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold text-ink/70">Huésped</p>
            <h2 id="dt-guest" className="text-[clamp(1.15rem,1.9vw,1.4rem)] leading-tight font-bold tracking-[-0.02em] break-words text-ink">
              {client ? (
                <Link href={paths.cliente(client.key)} className="underline decoration-ink/35 decoration-2 underline-offset-4 hover:decoration-ink">
                  {g.fullName}
                </Link>
              ) : (
                g.fullName
              )}
            </h2>
          </div>
        </div>
        <Button size="sm" icon={<PencilIcon size={13} />} onClick={onEdit} className="flex-none bg-paper! ring-0!">
          Editar
        </Button>
      </div>

      {tags.length > 0 && (
        <ul aria-label="Etiquetas del cliente" className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <li
              key={t.label}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] leading-none font-semibold ${t.alert ? "bg-error-soft text-error" : "bg-pink-deep text-ink"}`}
            >
              {t.alert && <AlertIcon size={12} />}
              {t.label}
            </li>
          ))}
        </ul>
      )}

      {/* Su historial en cifras, como los indicadores de las tarjetas del diseño. */}
      {client && (
        <dl className={`grid gap-2 rounded-[18px] bg-paper/45 px-4 py-3 ${can(data.me.role, "finance") ? "grid-cols-2 @md:grid-cols-4" : "grid-cols-3"}`}>
          {[
            { k: "Reservas", v: client.reservations.length },
            { k: "Estadías", v: client.stays },
            { k: "Noches", v: client.nights },
            ...(can(data.me.role, "finance") ? [{ k: "Ha generado", v: cop(client.value) }] : []),
          ].map((x) => (
            <div key={x.k} className="min-w-0">
              <dt className="text-[11px] font-semibold tracking-[.06em] text-ink/60 uppercase">{x.k}</dt>
              <dd className="truncate text-[17px] font-bold tracking-[-0.01em] text-ink tabular-nums">{x.v}</dd>
            </div>
          ))}
        </dl>
      )}

      <Facts
        className="-my-1"
        rows={[
          {
            k: "Celular",
            copy: g.phone,
            v: g.phone ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <a href={`tel:${g.phone}`} className="tabular-nums hover:underline">
                  {g.phone}
                </a>
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 rounded-full bg-paper px-2.5 py-0.5 text-[12px] font-semibold text-ink transition-colors hover:bg-paper/70"
                >
                  <WhatsAppIcon size={12} />
                  Escribir
                </a>
              </span>
            ) : (
              "—"
            ),
          },
          {
            k: "Correo",
            copy: g.email,
            v: g.email ? (
              <a href={`mailto:${g.email}`} className="break-all hover:underline">
                {g.email}
              </a>
            ) : (
              "Sin correo"
            ),
          },
          { k: "Documento", v: docLabel(g), copy: g.docType === "SD" ? "" : g.docNumber },
          { k: "Ciudad", v: g.city || "—", copy: g.city },
          ...(client
            ? [
                {
                  k: "Valoración",
                  v: (
                    <span className="flex items-center gap-2">
                      <Stars value={client.profile?.rating ?? null} size={15} />
                      {!client.profile?.rating && <span className="text-[13px] font-medium text-ink/65">Sin evaluar</span>}
                    </span>
                  ),
                },
              ]
            : []),
          ...(client?.profile?.preferences ? [{ k: "Preferencias", v: client.profile.preferences }] : []),
        ]}
      />

      {client && (
        <Link href={paths.cliente(client.key)} className={buttonClass("secondary", "sm", "mt-auto self-start bg-paper/60! ring-0!")}>
          Ver ficha del cliente
          <ArrowRightIcon size={14} />
        </Link>
      )}
    </section>
  );
}

// Corregir los datos del huésped (nombre, documento, contacto). Cambiar el documento cambia el cliente al que pertenece.
function GuestEditor({ r, onClose }: { r: Reservation; onClose: () => void }) {
  const { reload, toast, onAuthError } = useAdmin();
  const [g, setG] = useState<Guest>({ ...r.guest, docNumber: r.guest.docType === "SD" ? "" : r.guest.docNumber });
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [server, setServer] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const local = validateGuest(g);
  const err = (k: string) => server[k] || (tried ? local[k] : "") || undefined;
  const set = (p: Partial<Guest>) => {
    setG((x) => ({ ...x, ...p }));
    setServer({});
    setError("");
  };

  async function save() {
    setTried(true);
    if (busy || Object.keys(local).length) return;
    setBusy(true);
    try {
      const res = await api.admin.action({ code: r.code, action: "guest", guest: g });
      if (res.status === 401 || res.status === 403) return onAuthError();
      if (res.status !== 200) {
        const fields = (res.data as { fields?: Record<string, string> } | null)?.fields;
        if (fields) setServer(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k.replace(/^guest\./, ""), v])));
        else setError("No se pudieron guardar los datos. Inténtalo de nuevo.");
        return;
      }
      await reload();
      toast("Datos del huésped actualizados");
      onClose();
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="ge-title" initialFocus="input" className="m-auto w-[calc(100%-32px)] max-w-[560px] rounded-[26px] p-0">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-full bg-blue text-ink">
              <UserIcon size={18} />
            </span>
            <div className="pt-1">
              <h2 id="ge-title" className="text-[18px] font-bold tracking-[-0.02em] text-ink">
                Datos del huésped
              </h2>
              <p className="text-[13.5px] text-ink-muted">{`${r.code} · se usan en los correos y para agrupar al cliente.`}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre completo" error={err("fullName")} className="col-span-2">
              {(p) => (
                <input
                  {...p}
                  value={g.fullName}
                  maxLength={120}
                  autoComplete="off"
                  onChange={(e) => set({ fullName: e.target.value })}
                  className={adminInput}
                />
              )}
            </Field>
            <Field label="Tipo de documento" error={err("docType")} className="col-span-2 sm:col-span-1">
              {(p) => <Combobox id={p.id} value={g.docType} onChange={(v) => set({ docType: v as DocType })} searchable={false} options={DOC_TYPES} />}
            </Field>
            <Field
              label="Número"
              error={g.docType === "SD" ? undefined : err("docNumber")}
              hint={g.docType === "SD" ? "Sin documento: se usa el celular." : "Si lo cambias, la reserva pasa al cliente con ese documento."}
              className="col-span-2 sm:col-span-1"
            >
              {(p) => (
                <input
                  {...p}
                  value={g.docType === "SD" ? "" : g.docNumber}
                  disabled={g.docType === "SD"}
                  maxLength={15}
                  autoComplete="off"
                  onChange={(e) => set({ docNumber: e.target.value })}
                  className={`${adminInput} disabled:opacity-50`}
                />
              )}
            </Field>
            <Field label="Celular" error={err("phone")} className="col-span-2 sm:col-span-1">
              {(p) => (
                <input
                  {...p}
                  type="tel"
                  value={g.phone}
                  maxLength={20}
                  autoComplete="off"
                  onChange={(e) => set({ phone: e.target.value })}
                  className={adminInput}
                />
              )}
            </Field>
            <Field label="Ciudad" error={err("city")} className="col-span-2 sm:col-span-1">
              {(p) => <input {...p} value={g.city} maxLength={60} autoComplete="off" onChange={(e) => set({ city: e.target.value })} className={adminInput} />}
            </Field>
            <Field label="Correo (opcional)" error={err("email")} className="col-span-2">
              {(p) => (
                <input
                  {...p}
                  type="email"
                  value={g.email}
                  maxLength={160}
                  autoComplete="off"
                  onChange={(e) => set({ email: e.target.value })}
                  className={adminInput}
                />
              )}
            </Field>
          </div>
          {error && <FieldError>{error}</FieldError>}
        </div>
        <div className="flex flex-col-reverse gap-2 rounded-b-[26px] border-t border-line bg-canvas/70 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={busy} icon={<CheckIcon size={14} />}>
            Guardar datos
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Reserva con varias cabañas: todas, con su unidad, personas y valor; un toque abre cada una.
function GroupCard({ r, group }: { r: Reservation; group: Reservation[] }) {
  const { cabinLabel } = useAdmin();
  return (
    <Card aria-labelledby="dt-group" className="flex flex-col gap-3 p-4 sm:p-5">
      <CardHeader
        id="dt-group"
        icon={<UsersIcon size={18} />}
        title={`Reserva de ${plural(group.length, "cabaña", "cabañas")}`}
        subtitle={`Código del huésped: ${r.groupCode}. El pago, el plazo y los correos son de todo el grupo.`}
      />
      <ul className="flex flex-col gap-1.5">
        {group.map((x) => {
          const body = (
            <>
              <span className="min-w-0 flex-1 truncate font-semibold text-ink">{cabinLabel(x.cabinTypeId, x.unit)}</span>
              <span className="text-ink-muted">{plural(x.adults + x.children, "persona", "personas")}</span>
              <span className="font-semibold text-ink tabular-nums">{cop(x.quote.total)}</span>
              <span className="w-[86px] text-right text-[12px] text-ink-subtle">{x.code === r.groupCode ? "Principal" : x.code}</span>
            </>
          );
          return (
            <li key={x.code}>
              {x.code === r.code ? (
                <div aria-current="true" className="flex items-center gap-3 rounded-[14px] bg-yellow-soft px-3 py-2 text-[13.5px]">
                  {body}
                </div>
              ) : (
                <Link
                  href={paths.reserva(x.code)}
                  className="flex items-center gap-3 rounded-[14px] bg-panel px-3 py-2 text-[13.5px] transition-colors hover:bg-canvas"
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// Sin abono no hay plazo: la reserva no aparta fechas y, si otra las paga primero, se corre a las próximas libres. Una
// vencida (llegó su día sin abono) se puede reactivar mientras no haya pasado la llegada.
function HoldCard({ r }: { r: Reservation }) {
  const { setData, toast, onAuthError, now, reload } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const late = Date.parse(unpaidUntil(r.checkIn)) <= now;

  async function apply() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.admin.action({ code: r.code, action: "extend_hold", ...(r.groupCode && { group: true }) });
      if (res.status === 401 || res.status === 403) return onAuthError();
      if (res.status !== 200 || !res.data) {
        const code = (res.data as { error?: string } | null)?.error;
        setError(
          code === "HOLD_TOO_SHORT"
            ? "Ya pasó el día de llegada: registra el pago directamente."
            : code === "NEEDS_CONNECTION"
              ? "En una reserva con varias cabañas, se reactiva con conexión."
              : "No se pudo reactivar. Inténtalo de nuevo.",
        );
        return;
      }
      const updated = res.data;
      setData((d) => ({ ...d, reservations: d.reservations.map((x) => (x.code === updated.code ? updated : x)) }));
      if (r.groupCode) await reload();
      toast("Reserva reactivada sin confirmar");
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card aria-labelledby="dt-hold" className="flex flex-col gap-3 p-4 sm:p-5">
      <CardHeader
        id="dt-hold"
        icon={<ClockIcon size={18} />}
        title={r.status === "expired" ? "Venció sin abono" : "Sin confirmar"}
        subtitle={
          r.status === "expired"
            ? "Llegó el día de llegada sin abono. Si el huésped todavía quiere venir, puedes reactivarla: vuelve a quedar sin confirmar."
            : "No aparta las fechas hasta que se registre el abono o el pago total. Si otra reserva las paga primero, se corre a las próximas fechas libres con el mismo valor y le avisamos al huésped por correo. Si no paga, vence al terminar su día de llegada."
        }
        actions={
          r.status === "expired" && !late ? (
            <Button size="sm" variant="primary" loading={busy} onClick={apply}>
              Reactivar
            </Button>
          ) : undefined
        }
      />
      {error && <FieldError>{error}</FieldError>}
    </Card>
  );
}

/* ───────────── Registrar un pago ───────────── */

const PAY_ERRORS: Record<string, string> = {
  ALREADY_PAID: "La reserva ya está pagada por completo.",
  INVALID_AMOUNT: "El valor no puede ser mayor a lo que falta por pagar.",
  NO_AVAILABILITY: "Esas fechas ya no están libres: la reserva no se puede reactivar.",
  DATES_UNAVAILABLE: "Esas fechas ya no están libres: la reserva no se puede reactivar.",
  NOT_APPLICABLE: "En su estado actual la reserva no admite pagos.",
  INVALID_TRANSITION: "La reserva cambió mientras tanto. Ciérralo y vuelve a intentarlo.",
  NEEDS_CONNECTION: "Los pagos de una reserva con varias cabañas se registran con conexión.",
};

// Pago recibido en persona: todo lo que falta, el abono del 30 % o un valor a elección, con el medio (efectivo o
// transferencia) y una nota. Cualquier pago confirma una reserva pendiente; lo que falte queda como saldo.
// `group`: reserva con varias cabañas; `r` trae los valores del grupo y el servidor reparte el pago entre las cabañas.
/* ───────────── Acciones de una reserva ───────────── */

// Lo que se puede hacer con una reserva según su estado (pagos, check-in/out, reprogramar, cancelar) y el enlace de
// WhatsApp. Lo usan el detalle y cada fila de la lista de reservas; `dialog` es el diálogo de pago, que va en la página.
export function useReservationActions(r: Reservation) {
  const { data, ask, cabinLabel, today, reload } = useAdmin();
  const [paying, setPaying] = useState<string | null>(null); // título del diálogo de pago abierto
  const [moving, setMoving] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const cabin = cabinLabel(r.cabinTypeId, r.unit);
  const group = groupOf(data.reservations, r);
  const inGroup = group.length > 1;
  const gm = groupMoney(group);
  const m: Reservation = inGroup ? { ...r, quote: gm.quote, paid: gm.paid, depositPaidAt: gm.depositPaidAt, balancePaidAt: gm.balancePaidAt } : r;
  const units = data.cabinTypes.find((c) => c.id === r.cabinTypeId)?.units ?? 1;
  const due = balanceDue(m);

  const act = (
    label: string,
    action: ActionId,
    opts: Partial<ConfirmCfg> & { primary?: boolean; disabled?: string; group?: boolean; hint?: string } = {},
  ): Action => ({
    id: (action === "cancel" && opts.group ? "cancel-group" : action) as ActionKind,
    label,
    hint: opts.hint,
    primary: !!opts.primary,
    danger: !!opts.danger,
    disabled: opts.disabled,
    run: () =>
      ask({
        title: label,
        text: `${r.code} · ${r.guest.fullName}`,
        okLabel: label,
        done: `${label}: listo`,
        run: (cf) => {
          if (action === "reschedule") {
            if (!cf.ci || !cf.co || cf.co <= cf.ci) return Promise.resolve({ status: 400, data: null });
            return api.admin.action({ code: r.code, action, checkIn: cf.ci, checkOut: cf.co });
          }
          if (action === "cancel" && r.groupCode)
            // Todo el grupo o solo esta cabaña: lo hace el servidor; después se recargan las demás.
            return api.admin.action({ code: r.code, action, group: !!opts.group }).then(async (res) => {
              if (res.status === 200) await reload();
              return res;
            });
          return api.admin.action({ code: r.code, action });
        },
        ...opts,
      }),
  });
  // Registrar un pago abre su propio diálogo (valor, medio y nota).
  const pay = (label: string, primary: boolean): Action => ({ id: "pay", label, primary, danger: false, run: () => setPaying(label) });

  const actions: Action[] = [];
  if (r.status === "pending_deposit" || r.status === "expired")
    actions.push(pay(r.status === "expired" ? "Registrar pago y reactivar" : "Registrar pago", true));
  const earlyDue = (r.status === "confirmed" || r.status === "rescheduled") && !m.balancePaidAt ? Math.max(0, m.quote.total - m.paid) : 0;
  if (r.status === "confirmed" || r.status === "rescheduled")
    actions.push(
      act("Marcar check-in", "checkin", {
        primary: true,
        text: earlyDue
          ? `Queda un saldo de ${cop(earlyDue)} por cobrar en recepción. El check-out se habilita cuando lo registres.`
          : "La estadía ya está pagada: no queda saldo por cobrar.",
      }),
    );
  if (earlyDue) actions.push(pay(m.depositPaidAt ? "Registrar pago del saldo" : "Registrar pago", false));
  if (r.status === "checked_in") {
    if (due) actions.push(pay("Registrar pago del saldo", true));
    actions.push(act("Marcar check-out", "checkout", { primary: !due, disabled: due ? "Disponible cuando el saldo esté pagado" : undefined }));
  }
  const move: Action = {
    id: "move",
    label: "Cambiar de cabaña",
    hint: "Mismas fechas y mismo valor",
    primary: false,
    danger: false,
    run: () => setMoving(true),
  };
  const adjust: Action = {
    id: "adjust",
    label: "Personas y valor",
    hint: "Adultos, niños y valor total",
    primary: false,
    danger: false,
    run: () => setAdjusting(true),
  };
  if (r.status === "checked_in") actions.push(move, adjust);
  if (["pending_deposit", "confirmed", "rescheduled"].includes(r.status)) {
    actions.push(move, adjust);
    actions.push(
      act("Cambiar fechas", "reschedule", {
        hint: "Valida la disponibilidad y recalcula el valor",
        reschedule: true,
        ci: r.checkIn,
        co: r.checkOut,
        marks: typeMarks(data.reservations, busyBlocks(data), r.cabinTypeId, units, today, addDays(today, 365), r.code),
        text: "Elige las nuevas fechas. Se valida la disponibilidad de la misma cabaña y se recalcula el total con las tarifas vigentes (lo ya pagado se conserva).",
      }),
    );
    const refund = m.depositPaidAt ? "El abono recibido no es reembolsable según las políticas." : "Las fechas quedarán libres.";
    if (can(data.me.role, "cancel") && !inGroup)
      actions.push(act("Cancelar reserva", "cancel", { hint: "Libera las fechas y avisa al huésped", danger: true, text: `${r.code} · ${refund}` }));
    if (can(data.me.role, "cancel") && inGroup) {
      // La principal lleva el código del grupo: se cancela con todas. Las demás pueden salir solas.
      if (r.code !== r.groupCode)
        actions.push(
          act("Cancelar esta cabaña", "cancel", {
            hint: "Sale del grupo y libera sus fechas",
            danger: true,
            text: `${r.code} · ${cabin} sale de la reserva ${r.groupCode} y sus fechas quedan libres. Lo pagado por esta cabaña se queda con ella. El huésped recibe un correo.`,
          }),
        );
      actions.push(
        act("Cancelar todo el grupo", "cancel", {
          hint: "Cancela todas las cabañas del grupo",
          danger: true,
          group: true,
          text: `${r.groupCode} · ${plural(group.length, "cabaña", "cabañas")}. ${refund}`,
        }),
      );
    }
  }

  const whatsapp = waTo(r.guest.phone, `Hola ${r.guest.fullName.split(" ")[0]}, te escribimos de ${config.name} por tu reserva ${r.code}.`);
  const dialog = (
    <>
      <ModalPresence>{paying && <PaymentDialog r={m} group={inGroup} title={paying} onClose={() => setPaying(null)} />}</ModalPresence>
      <ModalPresence>{moving && <MoveCabinDialog r={r} onClose={() => setMoving(false)} />}</ModalPresence>
      <ModalPresence>{adjusting && <AdjustReservationDialog r={r} onClose={() => setAdjusting(false)} />}</ModalPresence>
    </>
  );
  return { actions, whatsapp, earlyDue, dialog };
}

function PaymentDialog({ r, title, group = false, onClose }: { r: Reservation; title: string; group?: boolean; onClose: () => void }) {
  const { reload, toast, onAuthError } = useAdmin();
  const owed = Math.max(0, r.quote.total - r.paid);
  const deposit = Math.min(r.quote.deposit, owed);
  const pending = r.status === "pending_deposit" || r.status === "expired";
  const offerDeposit = !r.depositPaidAt && deposit > 0 && deposit < owed;
  const [choice, setChoice] = useState<PayChoice>(pending && offerDeposit ? "deposit" : "full");
  const [custom, setCustom] = useState(0);
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");
  const amount = choice === "full" ? owed : choice === "deposit" ? deposit : custom;
  const amountError =
    choice !== "custom" ? "" : custom <= 0 ? "Escribe el valor que recibiste." : custom > owed ? `No puede ser más de lo que falta (${cop(owed)}).` : "";
  const left = Math.max(0, owed - amount);

  const options: PayOption[] = [
    { value: "full", label: r.paid > 0 ? "Todo lo que falta" : "Pago completo", hint: cop(owed) },
    ...(offerDeposit ? [{ value: "deposit" as const, label: `Abono del ${depositPctOf(r.quote)} %`, hint: cop(deposit) }] : []),
    { value: "custom", label: "Otro valor", hint: "El que recibiste" },
  ];

  async function save() {
    setTried(true);
    if (busy || amountError || !method) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.admin.action({
        code: r.code,
        action: pending ? "confirm" : "balance",
        method,
        note: note.trim(),
        ...(choice === "full" ? { full: true } : { amount }),
        ...(group && { group: true }),
      });
      if (res.status === 401 || res.status === 403) return onAuthError();
      if (res.status !== 200) {
        const code = (res.data as { error?: string } | null)?.error ?? "";
        setError(PAY_ERRORS[code] ?? "No se pudo registrar el pago. Inténtalo de nuevo.");
        return;
      }
      await reload();
      toast(`Pago de ${cop(amount)} registrado`);
      onClose();
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  // Lo que pasará con la reserva al registrar este valor.
  const outcome = amountError
    ? null
    : [
        pending &&
          (r.status === "expired" ? "La reserva se reactiva y queda confirmada." : "La reserva queda confirmada y se envía el correo de confirmación."),
        left ? `Queda un saldo de ${cop(left)} por cobrar.` : "Queda pagada por completo.",
      ].filter(Boolean);

  return (
    <Modal onClose={onClose} labelledBy="pay-title" initialFocus="input:checked" className="m-auto w-[calc(100%-32px)] max-w-[560px] rounded-[26px] p-0">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-full bg-green text-ink">
              <WalletIcon size={18} />
            </span>
            <div className="min-w-0 pt-1">
              <h2 id="pay-title" className="text-[18px] font-bold tracking-[-0.02em] text-ink">
                {title}
              </h2>
              <p className="text-[13.5px] text-ink-muted">{`${group ? `Grupo ${r.groupCode}` : r.code} · ${r.guest.fullName}`}</p>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-2 rounded-[18px] bg-panel px-4 py-3">
            {[
              { k: "Total", v: cop(r.quote.total) },
              { k: "Pagado", v: cop(r.paid) },
              { k: "Falta", v: cop(owed) },
            ].map((x) => (
              <div key={x.k} className="min-w-0">
                <dt className="text-[11px] font-semibold tracking-[.06em] text-ink-muted uppercase">{x.k}</dt>
                <dd className="truncate text-[16px] font-bold text-ink tabular-nums">{x.v}</dd>
              </div>
            ))}
          </dl>

          <PaymentFields
            options={options}
            choice={choice}
            onChoice={setChoice}
            custom={custom}
            onCustom={setCustom}
            amountError={amountError}
            method={method}
            onMethod={setMethod}
            note={note}
            onNote={setNote}
            tried={tried}
          />

          {outcome && (
            <div className="flex flex-col gap-0.5 rounded-[16px] bg-green-soft px-4 py-3 text-[13.5px] text-ink" aria-live="polite">
              {outcome.map((line) => (
                <p key={String(line)}>{line}</p>
              ))}
            </div>
          )}
          {error && <FieldError>{error}</FieldError>}
        </div>
        <div className="flex flex-col-reverse gap-2 rounded-b-[26px] border-t border-line bg-canvas/70 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={busy} icon={<CheckIcon size={14} />}>
            {amount > 0 && !amountError ? `Registrar ${cop(amount)}` : "Registrar pago"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PaymentSummary({ r, payments }: { r: Reservation; payments: PaymentRecord[] }) {
  const q = r.quote;
  const pct = q.total ? Math.min(100, Math.round((r.paid / q.total) * 100)) : 0;
  const due = balanceDue(r);
  const fullPayment = payments.some((p) => p.kind === "full" && p.status === "approved");
  // Cada parte del pago como una fila de la lista del diseño: círculo de color con el estado y el valor en una píldora.
  const line = (label: string, amount: number, state: ReactNode, tone: "ok" | "wait" | "bad" | "muted") => (
    <li className="flex items-center gap-3 rounded-[18px] bg-paper/70 p-3 pr-3.5">
      <span
        aria-hidden="true"
        className={`grid size-10 flex-none place-items-center rounded-full ${tone === "ok" ? "bg-green text-ink" : tone === "wait" ? "bg-yellow text-ink" : tone === "bad" ? "bg-error-soft text-error" : "bg-panel text-ink-subtle"}`}
      >
        {tone === "ok" ? <CheckIcon size={16} /> : tone === "wait" ? <ClockIcon size={16} /> : <span className="size-1.5 rounded-full bg-current" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold text-ink">{label}</span>
        <span className={`block text-[12.5px] ${tone === "bad" ? "font-semibold text-error" : "text-ink-muted"}`}>{state}</span>
      </span>
      <span className={`flex-none rounded-full px-3 py-1 text-[13px] font-bold text-ink tabular-nums ${tone === "ok" ? "bg-green" : "bg-panel"}`}>
        {cop(amount)}
      </span>
    </li>
  );
  // El abono es el primer pago (puede ser un valor distinto al 30 %); lo demás es saldo, que puede pagarse por partes.
  // En un grupo cada cabaña tiene su parte del abono: se suma el primer pago de cada una.
  const firsts = [...new Set(payments.map((p) => p.reservationCode))]
    .map((code) => payments.filter((p) => p.reservationCode === code && p.status === "approved" && p.kind === "deposit").at(-1))
    .filter((p): p is PaymentRecord => !!p);
  const depositAmount = firsts.length ? firsts.reduce((s, p) => s + p.amount, 0) : r.depositPaidAt ? Math.min(q.deposit, r.paid || q.deposit) : q.deposit;
  const balanceAmount = Math.max(0, q.total - depositAmount);
  const balanceReceived = r.depositPaidAt ? Math.max(0, Math.min(balanceAmount, r.paid - depositAmount)) : 0;
  return (
    <Card aria-labelledby="dt-pay" className="p-5 sm:p-6">
      <CardHeader
        id="dt-pay"
        icon={<WalletIcon size={18} />}
        accent="green"
        title="Pago"
        subtitle={pct >= 100 ? "Pagada por completo" : `${cop(r.paid)} cobrado · ${pct} %`}
        actions={
          <p className="text-[12.5px] leading-tight font-semibold text-ink-muted sm:text-right">
            Total
            <strong className="block text-[22px] font-bold tracking-[-0.02em] text-ink tabular-nums">{cop(q.total)}</strong>
          </p>
        }
      />
      <span aria-hidden="true" className="mt-4 block h-2.5 overflow-hidden rounded-full bg-ink/8">
        <span className="block h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </span>
      <ul className="mt-4 flex flex-col gap-2">
        {line(
          depositAmount === q.deposit ? `Abono (${depositPctOf(q)} %)` : "Abono",
          depositAmount,
          r.depositPaidAt
            ? `Recibido el ${fmtDate(dateOf(r.depositPaidAt))}${fullPayment ? " · pago total" : ""}`
            : r.status === "pending_deposit"
              ? "Sin confirmar · no aparta las fechas"
              : r.status === "expired"
                ? "No se pagó a tiempo"
                : "No recibido",
          r.depositPaidAt ? "ok" : r.status === "pending_deposit" ? "wait" : "muted",
        )}
        {line(
          "Saldo",
          balanceAmount,
          r.balancePaidAt
            ? `Pagado el ${fmtDate(dateOf(r.balancePaidAt))}${fullPayment ? " · pago total" : r.checkedInAt && r.balancePaidAt < r.checkedInAt ? " · antes de llegar" : ""}`
            : balanceReceived > 0
              ? `${cop(balanceReceived)} recibido · faltan ${cop(balanceAmount - balanceReceived)}`
              : due
                ? "En estadía · regístralo cuando lo pague en recepción"
                : r.status === "confirmed" || r.status === "rescheduled"
                  ? "Se paga antes de llegar o en recepción"
                  : r.status === "cancelled"
                    ? "No aplica (cancelada)"
                    : "—",
          r.balancePaidAt ? "ok" : due || r.status === "confirmed" || r.status === "rescheduled" ? "wait" : "muted",
        )}
      </ul>
      {q.seasonNights ? (
        <p className="mt-2 text-[12px] text-ink-muted">{`Incluye ${plural(q.seasonNights, "noche", "noches")} con tarifa de temporada.`}</p>
      ) : null}
      <PaymentHistory payments={payments} />
    </Card>
  );
}

// Pagos registrados de la reserva (también los de pagos en línea anteriores, si los hay).
function PaymentHistory({ payments }: { payments: PaymentRecord[] }) {
  const { now } = useAdmin();
  const [all, setAll] = useState(false);
  if (!payments.length) return <p className="mt-4 border-t border-line pt-4 text-[13px] text-ink-muted">Aún no hay pagos registrados.</p>;
  const list = all ? payments : payments.slice(0, 4);
  return (
    <div className="mt-4 border-t border-line pt-4">
      <h3 className="mb-2 text-[13px] font-bold text-ink">Pagos registrados</h3>
      <ul className="flex flex-col gap-1.5">
        {list.map((p) => {
          const st = PAYMENT_STATUS[p.status];
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[16px] bg-paper/50 px-3.5 py-2.5">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold text-ink">
                  {kindLabel(p.kind)} · {cop(p.amount)}
                  <Badge tone={st.tone}>{st.label}</Badge>
                </span>
                <span className="block text-[12px] text-ink-muted">
                  {p.provider === "manual" ? "Registrado por el equipo" : "Pago en línea (anterior)"} · {timeAgo(p.approvedAt ?? p.createdAt, now)} ·{" "}
                  {p.reference}
                </span>
                {p.detail && !(p.provider === "manual" && p.detail === "Registrado por el equipo") && (
                  <span className={`block text-[12px] ${p.status === "declined" || p.status === "error" ? "text-error" : "text-ink-muted"}`}>{p.detail}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {payments.length > 4 && (
        <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>
          {all ? "Ver menos" : `Ver los ${payments.length} pagos`}
        </Button>
      )}
    </div>
  );
}

const EMAIL_STATUS: Record<EmailRecord["status"], { label: string; tone: "success" | "warning" | "danger" | "info" }> = {
  pending: { label: "En cola", tone: "info" },
  sending: { label: "Enviando", tone: "info" },
  sent: { label: "Enviado", tone: "success" },
  failed: { label: "No enviado", tone: "danger" },
};

// Correos de la reserva: si la confirmación no salió, se ve el motivo y se puede reintentar (sin duplicarla).
function EmailsCard({ emails }: { emails: EmailRecord[] }) {
  const { reload, toast, onAuthError, now } = useAdmin();
  const [busy, setBusy] = useState<string | null>(null);
  if (!emails.length) return null;
  const retry = async (id: string) => {
    setBusy(id);
    try {
      const r = await api.admin.retryEmail(id);
      if (r.status === 401 || r.status === 403) return onAuthError();
      const e = r.data as EmailRecord | null;
      if (r.status !== 200 || !e) throw 0;
      toast(e.status === "sent" ? "Correo enviado" : `No se pudo enviar: ${e.lastError}`, e.status === "sent" ? "ok" : "error");
      await reload();
    } catch {
      toast("No se pudo reintentar el envío", "error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card aria-labelledby="dt-mail" className="flex flex-col gap-3 p-4 sm:p-5">
      <CardHeader
        id="dt-mail"
        icon={<MailIcon size={18} />}
        title="Correos"
        subtitle="Los de la reserva salen solos: al crearla, al confirmarla, si se cancela o vence y dos días antes de la llegada."
      />
      <ul className="flex flex-col gap-2">
        {emails.map((e) => {
          const st = EMAIL_STATUS[e.status];
          return (
            <li
              key={e.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-[16px] px-4 py-2.5 ${e.status === "failed" ? "bg-error-soft" : "bg-canvas/60"}`}
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold text-ink">
                  {EMAIL_KIND[e.kind] ?? (e.subject || "Mensaje del equipo")}
                  <Badge tone={st.tone}>{st.label}</Badge>
                </span>
                <span className="block text-[12px] text-ink-muted">
                  {e.to} · {e.sentAt ? `enviado ${timeAgo(e.sentAt, now)}` : `${plural(e.attempts, "intento", "intentos")}`}
                </span>
                {e.status === "failed" && e.lastError && <span className="block text-[12px] text-error">{e.lastError}</span>}
              </span>
              {e.status !== "sent" && e.status !== "sending" && (
                <Button size="sm" icon={<RefreshIcon size={14} />} loading={busy === e.id} onClick={() => retry(e.id)}>
                  Reintentar
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Notes({ r }: { r: Reservation }) {
  const { ask } = useAdmin();
  const [note, setNote] = useState("");
  const addNote = () => {
    const text = note.trim();
    if (!text) return;
    ask({
      title: "Agregar nota interna",
      text: "La nota solo es visible para el equipo.",
      okLabel: "Agregar",
      done: "Nota agregada",
      run: async () => {
        const res = await api.admin.action({ code: r.code, action: "note", text });
        if (res.status < 400) setNote("");
        return res;
      },
    });
  };
  return (
    <Card aria-labelledby="dt-notes" className="flex flex-col gap-4 p-5 sm:p-6">
      <CardHeader
        id="dt-notes"
        icon={<NoteIcon size={18} />}
        accent="blue"
        title="Notas internas"
        subtitle={r.notes.length ? `${plural(r.notes.length, "nota", "notas")} · solo las ve el equipo` : "Solo las ve el equipo."}
      />
      {r.notes.length ? (
        <ol className="flex flex-col gap-2">
          {r.notes.map((n) => (
            <li key={n.at} className="rounded-[18px] bg-paper/70 px-4 py-3">
              <p className="text-[12px] font-semibold text-ink-muted">{fmtDateTime(n.at)}</p>
              <p className="mt-1 text-[14px] leading-relaxed whitespace-pre-wrap text-ink">{n.text}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-[18px] border border-dashed border-line-strong px-4 py-3 text-[13px] text-ink-muted">Aún no hay notas para esta reserva.</p>
      )}
      <Field label="Nueva nota">
        {(p) => (
          <textarea
            {...p}
            rows={3}
            value={note}
            placeholder="Algo que el equipo deba saber: hora de llegada, pedidos, acuerdos…"
            onChange={(e) => setNote(e.target.value)}
            className={`${adminInput} resize-y leading-relaxed`}
          />
        )}
      </Field>
      <Button variant="primary" size="sm" disabled={!note.trim()} onClick={addNote} className="self-start">
        Agregar nota
      </Button>
    </Card>
  );
}
