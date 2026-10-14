"use client";

// Preferencias de este navegador (localStorage): sonido y vista del calendario. Se leen con usePref y
// cualquier cambio (en Configuración, en la campana o en otra pestaña) se refleja en todo el panel.
import { useSyncExternalStore } from "react";

export const PREF = {
  sound: "sg-admin-sound", // "on" | "off"
  mutedSounds: "sg-admin-sound-muted", // grupos silenciados, separados por coma
  calendarView: "sg-admin-calendar-view", // "auto" | vista del calendario
} as const;

const listeners = new Set<() => void>();

export function readPref(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    removeEventListener("storage", l);
  };
}

export function usePref(key: string, fallback: string) {
  return useSyncExternalStore(
    subscribe,
    () => readPref(key, fallback),
    () => fallback,
  );
}
