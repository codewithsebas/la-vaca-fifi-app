"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertIcon,
  BellIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  FileTextIcon,
  LoginIcon,
  MailIcon,
  RefreshIcon,
  SlidersIcon,
  VolumeIcon,
  VolumeOffIcon,
  WalletIcon,
  WarningIcon,
} from "@/components/ui/icons";
import { api } from "@/lib/api";
import { isMockApi } from "@/lib/config";
import { NOTIFICATION_GROUPS, type NotificationGroup } from "@/lib/notification-groups";
import { addDays, countdown, dateOf, fmtClock, fmtFullDate, plural, timeAgo } from "@/lib/format";
import type { AdminNotification, NotificationKind } from "@/lib/types";
import { useAdmin, useParam } from "@/components/admin/context";
import { Popover } from "@/components/ui/floating";
import { PREF, readPref, usePref, writePref } from "@/components/admin/prefs";
import { PushPrompt } from "@/components/admin/push";
import { paths } from "@/components/admin/routes";
import { Button, Card, CardHeader, EmptyState, IconButton, PageHeader, Segmented, buttonClass } from "@/components/admin/ui";

/* ───────────── Tiempo real (Supabase Realtime) ───────────── */

export type LiveStatus = "off" | "connecting" | "live" | "offline";

let browser: SupabaseClient | null = null;
const browserClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (isMockApi || !url || !key) return null;
  // Lee la sesión del administrador desde las cookies que dejó el inicio de sesión: Realtime aplica RLS con ese usuario.
  return (browser ??= createBrowserClient(url, key));
};

type Row = { id: number; kind: string; title: string; body: string; reservation_code: string | null; read_at: string | null; created_at: string };
const toNotification = (n: Row): AdminNotification => ({
  id: n.id,
  kind: n.kind as NotificationKind,
  title: n.title,
  body: n.body,
  reservationCode: n.reservation_code,
  readAt: n.read_at,
  createdAt: n.created_at,
});

// Escucha notificaciones nuevas y cambios en reservas, comprobantes, bloqueos y fechas de Booking (sin sondeos).
export function useRealtime(handlers: { onNotification: (n: AdminNotification) => void; onChange: () => void }) {
  const [status, setStatus] = useState<LiveStatus>(() => (browserClient() ? "connecting" : "off"));
  const h = useRef(handlers);
  useEffect(() => {
    h.current = handlers;
  });
  useEffect(() => {
    const sb = browserClient();
    if (!sb) return;
    let channel: ReturnType<SupabaseClient["channel"]> | null = null;
    let alive = true;
    (async () => {
      const { data } = await sb.auth.getSession();
      if (!alive) return;
      if (data.session) sb.realtime.setAuth(data.session.access_token);
      const changed = () => h.current.onChange();
      channel = sb
        .channel("panel-admin")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_notifications" }, (p) =>
          h.current.onNotification(toNotification(p.new as Row)),
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, changed)
        .on("postgres_changes", { event: "*", schema: "public", table: "payment_proofs" }, changed)
        .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, changed)
        .on("postgres_changes", { event: "*", schema: "public", table: "email_outbox" }, changed)
        .on("postgres_changes", { event: "*", schema: "public", table: "blocks" }, changed)
        .on("postgres_changes", { event: "*", schema: "public", table: "channel_stays" }, changed)
        .subscribe(
          (st) => alive && setStatus(st === "SUBSCRIBED" ? "live" : st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED" ? "offline" : "connecting"),
        );
    })();
    // El token de la sesión se renueva: Realtime necesita el nuevo para seguir autorizado.
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => session && sb.realtime.setAuth(session.access_token));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      if (channel) sb.removeChannel(channel);
    };
  }, []);
  return status;
}

export const LIVE_LABEL: Record<LiveStatus, string> = {
  live: "En vivo: las reservas y pagos nuevos llegan sin recargar",
  connecting: "Conectando…",
  offline: "Sin conexión en vivo",
  off: "Modo simulado (sin tiempo real)",
};

/* ───────────── Sonido ───────────── */

// Los mismos grupos que eligen qué notificaciones push recibe cada dispositivo (lib/notification-groups.ts).
type SoundGroup = NotificationGroup;
export const SOUND_GROUPS = NOTIFICATION_GROUPS;

let audio: AudioContext | null = null;

// ¿Debe sonar este aviso? Respeta el interruptor general y los grupos silenciados en Configuración.
export function soundFor(kind: NotificationKind) {
  if (readPref(PREF.sound, "on") === "off") return false;
  const muted = readPref(PREF.mutedSounds, "").split(",");
  const group = SOUND_GROUPS.find((g) => g.kinds.includes(kind));
  return !group || !muted.includes(group.id);
}

// Interruptor general del sonido, compartido por la campana y Configuración.
export function useSound() {
  const on = usePref(PREF.sound, "on") !== "off";
  const set = (v: boolean) => {
    writePref(PREF.sound, v ? "on" : "off");
    if (v) {
      unlockAudio();
      setTimeout(chime, 60);
    }
  };
  return [on, set] as const;
}

// Los navegadores solo permiten sonido después de una interacción: se prepara con el primer clic o tecla.
export function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {}
}

// Dos notas suaves (mi → la). Devuelve false si el navegador aún no permite reproducir.
export function chime() {
  if (!audio || audio.state !== "running") return false;
  const t = audio.currentTime;
  for (const [freq, at] of [
    [659.25, 0],
    [880, 0.13],
  ]) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.exponentialRampToValueAtTime(0.16, t + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.4);
    o.connect(g).connect(audio.destination);
    o.start(t + at);
    o.stop(t + at + 0.45);
  }
  return true;
}

/* ───────────── Piezas compartidas ───────────── */

const KIND: Record<NotificationKind, { icon: typeof BellIcon; tone: string; group: SoundGroup }> = {
  reservation_created: { icon: LoginIcon, tone: "bg-success-soft text-success", group: "reservas" },
  reservation_confirmed: { icon: LoginIcon, tone: "bg-success-soft text-success", group: "reservas" },
  reservation_cancelled: { icon: CloseIcon, tone: "bg-error-soft text-error", group: "cambios" },
  balance_paid: { icon: WalletIcon, tone: "bg-success-soft text-success", group: "pagos" },
  payment_declined: { icon: AlertIcon, tone: "bg-error-soft text-error", group: "pagos" },
  payment_refund: { icon: WalletIcon, tone: "bg-error-soft text-error", group: "pagos" },
  balance_overdue: { icon: ClockIcon, tone: "bg-warning-soft text-warning", group: "cambios" },
  email_failed: { icon: MailIcon, tone: "bg-error-soft text-error", group: "cambios" },
  reservation_expired: { icon: ClockIcon, tone: "bg-warning-soft text-warning", group: "cambios" },
  proof_uploaded: { icon: FileTextIcon, tone: "bg-info-soft text-info", group: "pagos" },
  proof_approved: { icon: CheckIcon, tone: "bg-success-soft text-success", group: "pagos" },
  proof_rejected: { icon: AlertIcon, tone: "bg-error-soft text-error", group: "pagos" },
  channel_conflict: { icon: WarningIcon, tone: "bg-error-soft text-error", group: "reservas" },
  channel_moved: { icon: RefreshIcon, tone: "bg-info-soft text-info", group: "cambios" },
  channel_sync_failed: { icon: RefreshIcon, tone: "bg-warning-soft text-warning", group: "cambios" },
};
const kindOf = (n: AdminNotification) => KIND[n.kind] ?? KIND.reservation_created;

type Reminder = { key: string; icon: typeof BellIcon; tone: string; title: string; body: string; code: string };

// Situaciones que piden atención ahora (se calculan con los datos; no se guardan).
function useReminders(): Reminder[] {
  const { data, today, now } = useAdmin();
  const tomorrow = addDays(today, 1);
  const out: Reminder[] = [];
  for (const p of data.proofs.filter((p) => p.status === "pending")) {
    const r = data.reservations.find((x) => x.code === p.reservationCode);
    out.push({
      key: `p${p.id}`,
      icon: FileTextIcon,
      tone: "bg-info-soft text-info",
      title: `Comprobante por revisar · ${p.reservationCode}`,
      body: r?.guest.fullName ?? "",
      code: p.reservationCode,
    });
  }
  for (const p of data.payments.filter((p) => p.needsRefund))
    out.push({
      key: `r${p.id}`,
      icon: WalletIcon,
      tone: "bg-error-soft text-error",
      title: `Pago por reembolsar · ${p.reservationCode}`,
      body: p.detail,
      code: p.reservationCode,
    });
  for (const e of data.emails.filter((e) => e.status === "failed" && e.kind === "reservation_confirmed" && e.reservationCode))
    out.push({
      key: `e${e.id}`,
      icon: MailIcon,
      tone: "bg-error-soft text-error",
      title: `Confirmación sin enviar · ${e.reservationCode}`,
      body: e.lastError,
      code: e.reservationCode!,
    });
  for (const r of data.reservations) {
    if (r.status === "checked_in" && !r.balancePaidAt && r.balanceDueAt)
      out.push(
        r.balanceOverdueAt || Date.parse(r.balanceDueAt) <= now
          ? {
              key: `s${r.code}`,
              icon: ClockIcon,
              tone: "bg-error-soft text-error",
              title: `Saldo vencido sin pagar · ${r.code}`,
              body: `${r.guest.fullName} · registra el pago en recepción`,
              code: r.code,
            }
          : {
              key: `s${r.code}`,
              icon: WalletIcon,
              tone: "bg-warning-soft text-warning",
              title: `Saldo por pagar · ${r.code}`,
              body: `${r.guest.fullName} · vence en ${countdown(r.balanceDueAt)}`,
              code: r.code,
            },
      );
    if (r.checkIn === tomorrow && ["confirmed", "rescheduled", "pending_deposit"].includes(r.status))
      out.push({
        key: `a${r.code}`,
        icon: LoginIcon,
        tone: "bg-success-soft text-success",
        title: `Llega mañana · ${r.guest.fullName}`,
        body: `${r.code}${r.estimatedArrival ? ` · ${r.estimatedArrival}` : ""}`,
        code: r.code,
      });
  }
  return out;
}

// Marca como leídas (al instante en pantalla; el servidor confirma en segundo plano).
function useMarkRead() {
  const { setData } = useAdmin();
  return async (b: { ids?: number[]; all?: boolean }) => {
    const at = new Date().toISOString();
    setData((d) => ({ ...d, notifications: d.notifications.map((n) => (b.all || b.ids?.includes(n.id) ? { ...n, readAt: n.readAt ?? at } : n)) }));
    try {
      await api.admin.markNotifications(b);
    } catch {}
  };
}

function ReminderList({ items, onPick }: { items: Reminder[]; onPick: (code: string) => void }) {
  return (
    <ul>
      {items.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            onClick={() => onPick(r.code)}
            className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-canvas"
          >
            <span aria-hidden="true" className={`grid size-8 flex-none place-items-center rounded-full ${r.tone}`}>
              <r.icon size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-ink">{r.title}</span>
              <span className="block truncate text-[12.5px] text-ink-muted">{r.body}</span>
            </span>
            <ChevronRightIcon size={15} className="mt-2 flex-none text-ink-subtle" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ───────────── Campana (acceso rápido) ───────────── */

export function NotificationCenter() {
  const { data, openReservation, now } = useAdmin();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useSound();
  const mark = useMarkRead();
  const reminders = useReminders();
  const unread = data.notifications.filter((n) => !n.readAt);
  const recent = (unread.length ? unread : data.notifications).slice(0, 8);

  const pick = (code: string | null, id?: number) => {
    if (id) void mark({ ids: [id] });
    setOpen(false);
    if (code) openReservation(code);
  };

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread.length ? `Notificaciones, ${unread.length} sin leer` : "Notificaciones"}
        onClick={() => setOpen(!open)}
        className="btn-icon relative size-10 text-current transition-colors hover:bg-ink/6 [.admin-dark_&]:hover:bg-white/10"
      >
        <BellIcon size={19} />
        {unread.length > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[10px] leading-none font-bold text-white tabular-nums ring-2 ring-[var(--bell-ring,var(--color-panel))] motion-safe:animate-pop-in"
          >
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={anchor}
        placement="bottom-end"
        label="Notificaciones"
        className="w-[400px] max-w-[calc(100vw-16px)]"
      >
        <div className="flex max-h-[min(640px,80dvh)] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 pt-3.5 pb-3">
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-ink">Notificaciones</h2>
            </div>
            <div className="flex items-center gap-1">
              <IconButton
                label={sound ? "Silenciar sonido de notificaciones" : "Activar sonido de notificaciones"}
                size="sm"
                onClick={() => setSound(!sound)}
                aria-pressed={sound}
              >
                {sound ? <VolumeIcon size={17} /> : <VolumeOffIcon size={17} />}
              </IconButton>
              {unread.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => mark({ all: true })}>
                  Marcar leídas
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {reminders.length > 0 && (
              <section aria-labelledby="nc-rem" className="border-b border-line px-2 py-2">
                <h3 id="nc-rem" className="px-2 pt-1 pb-1.5 text-[11.5px] font-bold tracking-[.06em] text-ink-muted uppercase">
                  Requiere atención
                </h3>
                <ReminderList items={reminders} onPick={(code) => pick(code)} />
              </section>
            )}
            <h3 className="px-4 pt-3 pb-1 text-[11.5px] font-bold tracking-[.06em] text-ink-muted uppercase">
              {unread.length ? `Sin leer · ${unread.length}` : "Recientes"}
            </h3>
            {recent.length ? (
              <ul className="px-2 pb-2">
                {recent.map((n) => {
                  const k = kindOf(n);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => pick(n.reservationCode, n.readAt ? undefined : n.id)}
                        className="flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-canvas"
                      >
                        <span aria-hidden="true" className={`grid size-8 flex-none place-items-center rounded-full ${k.tone}`}>
                          <k.icon size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[13.5px] text-ink ${n.readAt ? "font-medium" : "font-bold"}`}>{n.title}</span>
                          {n.body && <span className="block truncate text-[12.5px] text-ink-muted">{n.body}</span>}
                          <span className="mt-0.5 block text-[11.5px] text-ink-subtle">{timeAgo(n.createdAt, now)}</span>
                        </span>
                        {!n.readAt && <span aria-label="Sin leer" className="mt-1.5 size-2 flex-none rounded-full bg-error" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
                <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-canvas text-ink-muted">
                  <BellIcon size={18} />
                </span>
                <p className="text-[14px] font-semibold text-ink">Aún no hay notificaciones</p>
                <p className="max-w-[30ch] text-[12.5px] text-ink-muted">
                  Aquí aparecen las reservas nuevas, los comprobantes de pago y los cambios importantes.
                </p>
              </div>
            )}
          </div>
          <PushPrompt />
          <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2.5">
            <Link href={paths.notificaciones()} onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>
              Ver todas
              <ChevronRightIcon size={14} />
            </Link>
            <Link href={paths.configuracion} onClick={() => setOpen(false)} className={buttonClass("ghost", "sm", "text-ink-muted")}>
              <SlidersIcon size={14} />
              Configurar avisos
            </Link>
          </div>
        </div>
      </Popover>
    </>
  );
}

/* ───────────── Página de notificaciones ───────────── */

type Status = "sin-leer" | "todas";
type KindFilter = "todas" | SoundGroup;

export function NotificationsView() {
  const { data, today, now, openReservation } = useAdmin();
  const mark = useMarkRead();
  const reminders = useReminders();
  const [status, setStatus] = useParam<Status>("estado", "todas");
  const [kind, setKind] = useParam<KindFilter>("tipo", "todas");
  const unread = data.notifications.filter((n) => !n.readAt);
  const list = data.notifications.filter((n) => (status === "todas" || !n.readAt) && (kind === "todas" || kindOf(n).group === kind));

  // Agrupadas por día (hora de Colombia), de la más reciente a la más antigua.
  const days: { day: string; items: AdminNotification[] }[] = [];
  for (const n of list) {
    const day = dateOf(n.createdAt);
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push(n);
    else days.push({ day, items: [n] });
  }
  const dayLabel = (d: string) => (d === today ? "Hoy" : d === addDays(today, -1) ? "Ayer" : fmtFullDate(d));
  const countOf = (g: SoundGroup) => data.notifications.filter((n) => kindOf(n).group === g && (status === "todas" || !n.readAt)).length;

  return (
    <>
      <PageHeader
        title="Notificaciones"
        description="Historial de avisos del panel: reservas nuevas, comprobantes de pago, cancelaciones y vencimientos."
        actions={
          <>
            {unread.length > 0 && (
              <Button icon={<CheckIcon size={14} />} onClick={() => mark({ all: true })}>
                Marcar todas como leídas
              </Button>
            )}
            <Link href={paths.configuracion} className={buttonClass("ghost")}>
              <SlidersIcon size={15} />
              Sonido y avisos
            </Link>
          </>
        }
      />

      {reminders.length > 0 && (
        <Card aria-labelledby="nt-rem" className="flex flex-col gap-2 p-4 sm:p-5">
          <CardHeader
            id="nt-rem"
            icon={<AlertIcon size={18} />}
            title="Requiere atención"
            subtitle="Calculado con los datos actuales; desaparece cuando se resuelve."
          />
          <div className="-mx-2">
            <ReminderList items={reminders} onPick={openReservation} />
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Estado"
          value={status}
          onChange={setStatus}
          options={[
            { value: "todas", label: "Todas" },
            { value: "sin-leer", label: "Sin leer", count: unread.length },
          ]}
        />
        <Segmented
          label="Tipo"
          value={kind}
          onChange={setKind}
          options={[{ value: "todas", label: "Todos los tipos" }, ...SOUND_GROUPS.map((g) => ({ value: g.id, label: g.label, count: countOf(g.id) }))]}
        />
      </div>

      {days.length ? (
        <div className="flex flex-col gap-4">
          {days.map(({ day, items }) => (
            <Card key={day} aria-labelledby={`nt-${day}`} className="overflow-hidden">
              <h2 id={`nt-${day}`} className="border-b border-line bg-canvas/70 px-4 py-2 text-[12.5px] font-bold text-ink-muted">
                {dayLabel(day)} <span className="font-medium">· {plural(items.length, "aviso", "avisos")}</span>
              </h2>
              <ul className="divide-y divide-line">
                {items.map((n) => {
                  const k = kindOf(n);
                  return (
                    <li key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.readAt ? "" : "bg-highlight/6"}`}>
                      <span aria-hidden="true" className={`mt-0.5 grid size-9 flex-none place-items-center rounded-full ${k.tone}`}>
                        <k.icon size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-[14px] text-ink ${n.readAt ? "font-medium" : "font-bold"}`}>
                          {!n.readAt && <span className="sr-only">Sin leer: </span>}
                          {n.title}
                        </p>
                        {n.body && <p className="text-[13px] text-ink-muted">{n.body}</p>}
                        <p className="mt-0.5 text-[12px] text-ink-subtle">
                          {fmtClock(n.createdAt)} · {timeAgo(n.createdAt, now)}
                        </p>
                      </div>
                      <div className="flex flex-none items-center gap-1">
                        {n.reservationCode && (
                          <Link
                            href={paths.reserva(n.reservationCode)}
                            onClick={() => !n.readAt && void mark({ ids: [n.id] })}
                            className={buttonClass("secondary", "sm")}
                          >
                            Ver reserva
                          </Link>
                        )}
                        {!n.readAt && (
                          <IconButton label="Marcar como leída" size="sm" onClick={() => mark({ ids: [n.id] })}>
                            <CheckIcon size={15} />
                          </IconButton>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
          {data.notifications.length >= 150 && <p className="text-center text-[12.5px] text-ink-muted">Se muestran los 150 avisos más recientes.</p>}
        </div>
      ) : (
        <Card className="p-4">
          <EmptyState
            icon={<BellIcon size={18} />}
            title={
              status === "sin-leer" && unread.length === 0
                ? "Estás al día"
                : data.notifications.length
                  ? "No hay avisos con estos filtros"
                  : "Aún no hay notificaciones"
            }
            text={
              status === "sin-leer" && unread.length === 0
                ? "No tienes avisos sin leer."
                : "Aquí aparecen las reservas nuevas, los comprobantes de pago y los cambios importantes."
            }
            action={
              status !== "todas" || kind !== "todas" ? (
                <Button
                  onClick={() => {
                    setStatus("todas");
                    setKind("todas");
                  }}
                >
                  Ver todas
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}
    </>
  );
}

export function LiveDot({ status }: { status: LiveStatus }) {
  const cls = status === "live" ? "bg-success" : status === "connecting" ? "bg-highlight" : status === "offline" ? "bg-error" : "bg-ink-subtle";
  return (
    <span aria-hidden="true" className="relative inline-flex size-2">
      {status === "live" && <span className="absolute inset-0 rounded-full bg-success/60 motion-safe:animate-ping" />}
      <span className={`relative inline-flex size-2 rounded-full ${cls}`} />
    </span>
  );
}
