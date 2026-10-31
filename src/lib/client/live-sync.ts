"use client";

// Avisos en tiempo real para el sitio público (Supabase Realtime, Broadcast en canales públicos).
// Un aviso es solo una señal: quien lo recibe vuelve a consultar la API, que es la que calcula y valida los datos.
// Un canal público también admite mensajes de cualquiera, así que el contenido se valida y la frecuencia se limita.
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { isMockApi } from "@/lib/config";
import { MOCK_DB_KEY } from "@/lib/mock/mock-server";

export type SyncStatus = "connecting" | "live" | "offline" | "off";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let client: Promise<SupabaseClient> | null = null;
// El cliente se carga aparte, después de mostrar la página: no pesa en la carga inicial del sitio.
const getClient = () =>
  (client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }),
  ));

const GROUP_MS = 300; // avisos seguidos se agrupan
const MIN_GAP_MS = 1500; // como máximo una actualización cada 1,5 s
const STALE_MS = 30_000; // al volver a una pestaña oculta más de 30 s se resincroniza

/**
 * Escucha `event` en el canal `topic` (null: sin conexión) y llama a `onChange` con los avisos agrupados y limitados en frecuencia.
 * `parse` valida cada aviso; si devuelve null, se pide resincronizar todo.
 * Tras una caída de la conexión, al recuperar internet o al volver a la pestaña, llega `null` (resincronizar todo),
 * porque en ese tiempo pudo perderse algún aviso.
 */
export function useBroadcastSync<T>(
  topic: string | null,
  event: string,
  parse: (payload: unknown) => T | null,
  onChange: (changes: T[] | null) => void,
): SyncStatus {
  const handler = useRef({ parse, onChange });
  useEffect(() => {
    handler.current = { parse, onChange };
  });
  const [status, setStatus] = useState<SyncStatus>(() => (isMockApi ? "live" : url && key ? "connecting" : "off"));

  useEffect(() => {
    if (!topic || (!isMockApi && !(url && key))) return;
    let pending: T[] | null | undefined; // undefined = nada pendiente
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = 0;
    const flush = () => {
      timer = undefined;
      const changes = pending;
      pending = undefined;
      last = Date.now();
      if (changes !== undefined) handler.current.onChange(changes);
    };
    const queue = (c: T | null) => {
      pending = c === null || pending === null ? null : [...(pending ?? []), c];
      timer ??= setTimeout(flush, Math.max(GROUP_MS, MIN_GAP_MS - (Date.now() - last)));
    };

    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > STALE_MS) queue(null);
    };
    const onOnline = () => queue(null);
    addEventListener("visibilitychange", onVisibility);
    addEventListener("online", onOnline);
    const cleanupBase = () => {
      clearTimeout(timer);
      removeEventListener("visibilitychange", onVisibility);
      removeEventListener("online", onOnline);
    };

    // Modo simulado: los datos viven en localStorage; un cambio en otra pestaña (el panel) llega como evento storage.
    if (isMockApi) {
      const onStorage = (e: StorageEvent) => e.key === MOCK_DB_KEY && queue(null);
      addEventListener("storage", onStorage);
      return () => {
        cleanupBase();
        removeEventListener("storage", onStorage);
      };
    }

    let alive = true;
    let channel: RealtimeChannel | null = null;
    let sb: SupabaseClient | null = null;
    let down = false;
    getClient().then((c) => {
      if (!alive) return;
      sb = c;
      channel = c
        .channel(topic)
        .on("broadcast", { event }, ({ payload }) => queue(handler.current.parse(payload)))
        .subscribe((st) => {
          if (!alive) return;
          if (st === "SUBSCRIBED") {
            setStatus("live");
            // Reconectado después de una caída: se pudo perder algún aviso.
            if (down) queue(null);
            down = false;
          } else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") {
            setStatus("offline");
            down = true;
          }
        });
    });
    return () => {
      alive = false;
      cleanupBase();
      if (sb && channel) sb.removeChannel(channel);
    };
  }, [topic, event]);

  return status;
}

const nothing = () => null;

/**
 * Cambios de una reserva consultada en «Mi reserva» (estado, fechas, montos, comprobante).
 * El canal lleva la clave aleatoria que entrega la consulta con código y correo; el aviso no trae datos.
 */
export const useReservationSync = (liveKey: string | null | undefined, onChange: () => void) =>
  useBroadcastSync(liveKey ? `reserva:${liveKey}` : null, "reservation_changed", nothing, onChange);
