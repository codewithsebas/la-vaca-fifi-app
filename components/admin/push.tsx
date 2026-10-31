"use client";

import { useCallback, useEffect, useState } from "react";
import { BellIcon, CheckIcon, SendIcon } from "@/components/icons";
import { api, type PushDevice } from "@/lib/api";
import { isMockApi } from "@/lib/config";
import { GROUP_IDS, NOTIFICATION_GROUPS, type NotificationGroup } from "@/lib/notification-groups";
import { timeAgo } from "@/lib/format";
import { useAdmin } from "./context";
import { Button, Callout, Card, CardHeader, Switch } from "./ui";

/* ───────────── Notificaciones push de este dispositivo ───────────── */

// El navegador crea la suscripción (con la llave pública VAPID) y el servidor la guarda con los grupos elegidos.
// lib/server/push.ts envía cada aviso nuevo del panel; public/sw.js lo muestra aunque el panel esté cerrado.

type PushState =
  | { s: "loading" }
  | { s: "mock" } // modo simulado: sin servidor
  | { s: "unsupported" } // navegador sin Web Push
  | { s: "ios-install" } // iPhone/iPad: solo con el panel agregado a la pantalla de inicio
  | { s: "unconfigured" } // faltan las llaves VAPID en el servidor
  | { s: "denied" } // el usuario bloqueó las notificaciones del sitio
  | { s: "off" }
  | { s: "on"; endpoint: string; device: PushDevice };

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const CHANGED = "vacafifi:push-changed"; // avisa a las otras vistas (campana, Configuración) que el estado cambió

function keyBytes(b64: string) {
  const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => !!a && a.byteLength === b.length && new Uint8Array(a).every((v, i) => v === b[i]);
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isDevice = (d: unknown): d is PushDevice => !!d && typeof d === "object" && "groups" in d;

async function detect(): Promise<PushState> {
  if (isMockApi) return { s: "mock" };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return { s: isIos() && !standalone() ? "ios-install" : "unsupported" };
  if (!VAPID_KEY) return { s: "unconfigured" };
  if (Notification.permission === "denied") return { s: "denied" };
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub || Notification.permission !== "granted") return { s: "off" };
  const r = await api.admin.push.status(sub.endpoint).catch(() => null);
  if (r?.status === 200 && r.data && !r.data.configured) return { s: "unconfigured" };
  if (r?.status === 200 && r.data?.subscription) return { s: "on", endpoint: sub.endpoint, device: r.data.subscription };
  // El navegador conserva la suscripción pero el servidor ya no (p. ej. se borró): se registra de nuevo.
  const again = await api.admin.push.subscribe({ subscription: sub.toJSON() }).catch(() => null);
  return again?.status === 200 && isDevice(again.data) ? { s: "on", endpoint: sub.endpoint, device: again.data } : { s: "off" };
}

function usePush() {
  const [state, setState] = useState<PushState>({ s: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const run = () => void detect().then((s) => alive && setState(s), () => alive && setState({ s: "off" }));
    run();
    window.addEventListener(CHANGED, run);
    return () => {
      alive = false;
      window.removeEventListener(CHANGED, run);
    };
  }, []);

  const changed = (s: PushState) => {
    setState(s);
    window.dispatchEvent(new Event(CHANGED));
  };

  const act = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudo completar. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }, []);

  const enable = () =>
    act(async () => {
      // El permiso se pide primero, todavía dentro del clic (Safari lo exige).
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        changed({ s: permission === "denied" ? "denied" : "off" });
        if (permission !== "denied") throw new Error("Para recibir avisos debes permitir las notificaciones cuando el navegador lo pregunte.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const key = keyBytes(VAPID_KEY);
      let sub = await reg.pushManager.getSubscription();
      // Una suscripción hecha con otras llaves no recibiría nada: se reemplaza.
      if (sub && !sameKey(sub.options.applicationServerKey, key)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const r = await api.admin.push.subscribe({ subscription: sub.toJSON(), groups: GROUP_IDS });
      if (r.status === 503) return changed({ s: "unconfigured" });
      if (r.status !== 200 || !isDevice(r.data)) throw new Error("El servidor no pudo registrar este dispositivo. Inténtalo de nuevo.");
      changed({ s: "on", endpoint: sub.endpoint, device: r.data });
    });

  const disable = () =>
    act(async () => {
      if (state.s !== "on") return;
      const reg = await navigator.serviceWorker.getRegistration("/");
      await (await reg?.pushManager.getSubscription())?.unsubscribe();
      await api.admin.push.unsubscribe(state.endpoint);
      changed({ s: "off" });
    });

  const setGroups = (groups: NotificationGroup[]) =>
    act(async () => {
      if (state.s !== "on") return;
      setState({ ...state, device: { ...state.device, groups } });
      const r = await api.admin.push.setGroups(state.endpoint, groups);
      if (r.status !== 200 || !isDevice(r.data)) {
        setState(state);
        throw new Error("No se pudo guardar la preferencia. Inténtalo de nuevo.");
      }
      changed({ ...state, device: r.data });
    });

  // Devuelve true si la notificación de prueba salió.
  const test = async () => {
    let sent = false;
    await act(async () => {
      if (state.s !== "on") return;
      const r = await api.admin.push.test(state.endpoint);
      if (r.status === 410) {
        changed({ s: "off" });
        throw new Error("Este dispositivo ya no estaba registrado. Activa las notificaciones de nuevo.");
      }
      if (r.status !== 200) throw new Error("El servicio de notificaciones del navegador no respondió. Inténtalo en un momento.");
      sent = true;
    });
    return sent;
  };

  return { state, busy, error, enable, disable, setGroups, test };
}

// Tarjeta de Configuración: activar, elegir qué avisos llegan, probar y desactivar en este dispositivo.
export function PushSettingsCard() {
  const { toast, now } = useAdmin();
  const { state, busy, error, enable, disable, setGroups, test } = usePush();
  const on = state.s === "on" ? state : null;
  const toggle = (g: NotificationGroup, v: boolean) => on && setGroups(v ? [...new Set([...on.device.groups, g])] : on.device.groups.filter((x) => x !== g));

  return (
    <Card aria-labelledby="st-push" className="flex flex-col gap-4 p-4 sm:p-5">
      <CardHeader
        id="st-push"
        icon={<BellIcon size={18} />}
        title="Notificaciones en este dispositivo"
        subtitle="Avisos de reservas y pagos en el celular o el computador, aunque el panel esté cerrado."
        actions={
          on && (
            <Button size="sm" icon={<SendIcon size={14} />} loading={busy} onClick={async () => (await test()) && toast("Notificación de prueba enviada")}>
              Enviar prueba
            </Button>
          )
        }
      />

      {state.s === "loading" && <p className="text-[13.5px] text-ink-muted">Revisando este dispositivo…</p>}
      {state.s === "mock" && <Callout>Las notificaciones push no están disponibles en modo simulado.</Callout>}
      {state.s === "unsupported" && <Callout tone="warning">Este navegador no permite notificaciones push. Usa Chrome, Edge, Firefox o Safari actualizados.</Callout>}
      {state.s === "ios-install" && (
        <Callout>
          En iPhone y iPad las notificaciones solo llegan con el panel instalado: en Safari toca <strong>Compartir → Agregar a inicio</strong>, abre el panel desde ese ícono y vuelve a esta página para activarlas.
        </Callout>
      )}
      {state.s === "unconfigured" && <Callout tone="warning">El servidor aún no tiene las llaves de notificaciones (VAPID). Agrégalas a las variables de entorno y vuelve a desplegar.</Callout>}
      {state.s === "denied" && (
        <Callout tone="warning">
          Bloqueaste las notificaciones de este sitio. Para activarlas, toca el ícono junto a la dirección (el candado o los ajustes del sitio), permite las <strong>Notificaciones</strong> y recarga la página.
        </Callout>
      )}
      {state.s === "off" && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[13.5px] text-ink-muted">Recibe al instante las reservas confirmadas, los pagos y las alertas. Cada dispositivo se activa por separado.</p>
          <Button variant="primary" icon={<BellIcon size={15} />} loading={busy} onClick={enable}>
            Activar notificaciones
          </Button>
        </div>
      )}
      {on && (
        <>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-success-soft px-3.5 py-3 text-[13.5px] font-semibold text-success">
            <CheckIcon size={15} />
            Activas en este dispositivo{on.device.device ? ` · ${on.device.device}` : ""}
            {on.device.lastSuccessAt && <span className="font-medium text-ink-muted">· último aviso {timeAgo(on.device.lastSuccessAt, now)}</span>}
          </p>
          <fieldset disabled={busy} className="flex min-w-0 flex-col gap-3">
            <legend className="mb-1 text-[13px] font-semibold text-ink">Qué avisos llegan</legend>
            {NOTIFICATION_GROUPS.map((g) => (
              <Switch key={g.id} checked={on.device.groups.includes(g.id)} onChange={(v) => toggle(g.id, v)} label={g.label} description={g.description} />
            ))}
          </fieldset>
          {!on.device.groups.length && <Callout tone="warning">Apagaste todos los grupos: este dispositivo no recibirá avisos.</Callout>}
          <Button variant="danger-ghost" size="sm" disabled={busy} onClick={disable} className="self-start">
            Desactivar en este dispositivo
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-error">
          {error}
        </p>
      )}
    </Card>
  );
}

// Invitación breve en la campana cuando este dispositivo aún no recibe notificaciones.
export function PushPrompt() {
  const { state, busy, error, enable } = usePush();
  if (state.s !== "off") return null;
  return (
    <div className="flex flex-col gap-2 border-t border-line bg-canvas/60 px-4 py-3">
      <p className="text-[12.5px] text-ink-muted">Recibe estos avisos en este dispositivo aunque el panel esté cerrado.</p>
      <Button size="sm" variant="secondary" icon={<BellIcon size={14} />} loading={busy} onClick={enable} className="self-start">
        Activar notificaciones
      </Button>
      {error && (
        <p role="alert" className="text-[12.5px] font-semibold text-error">
          {error}
        </p>
      )}
    </div>
  );
}
