"use client";

// Preferencias de este navegador (localStorage): sonido, vista del calendario, barra lateral y apariencia. Se leen con usePref y
// cualquier cambio (en Configuración, en la campana o en otra pestaña) se refleja en todo el panel.
import { useSyncExternalStore } from "react";

export const PREF = {
  sound: "vf-admin-sound", // "on" | "off"
  mutedSounds: "vf-admin-sound-muted", // grupos silenciados, separados por coma
  calendarView: "vf-admin-calendar-view", // "auto" | vista del calendario
  sidebar: "vf-admin-sidebar", // "full" | "mini" (barra lateral contraída)
  theme: "vf-admin-theme", // "light" | "dark" | "system" (apariencia; app/layout.tsx la lee antes de pintar)
  pageSize: "vf-admin-page-size", // prefijo: filas por página de cada tabla ("vf-admin-page-size:reservas")
  importMap: "vf-admin-import-map", // importación: habitación del archivo → cabaña y unidad del panel (JSON)
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
