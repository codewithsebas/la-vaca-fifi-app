"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useState } from "react";
import type { AdminData, CabinType } from "@/lib/types";
import type { LiveStatus } from "./notifications";
import type { Ask } from "./shared";

export type Toast = (text: string, kind?: "ok" | "error", action?: { label: string; onClick: () => void }) => void;

export type AdminCtx = {
  data: AdminData;
  setData: (fn: (d: AdminData) => AdminData) => void;
  reload: () => Promise<void>;
  ask: Ask;
  toast: Toast;
  go: (href: string) => void; // navegación del panel (router de Next)
  openReservation: (code: string) => void;
  onAuthError: () => void;
  logout: () => void;
  live: LiveStatus;
  today: string;
  now: number;
  cabin: (id: string) => CabinType | undefined;
  cabinLabel: (id: string, unit?: number) => string;
};

const Ctx = createContext<AdminCtx | null>(null);
export const AdminProvider = Ctx.Provider;

export function useAdmin() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdmin() fuera del panel");
  return v;
}

/* ───────────── Estado en la URL ───────────── */

// Escribe parámetros en la URL con history.replaceState (Next lo integra con useSearchParams): sin recargar ni pedir datos.
export function useSetParams() {
  const pathname = usePathname();
  return useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const p = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === "") p.delete(k);
        else p.set(k, v);
      }
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname],
  );
}

// Filtro, vista u orden guardado en ?key=: responde al instante (estado local) y se conserva al volver atrás o al compartir el enlace.
// El valor por defecto no se escribe en la URL.
export function useParam<T extends string = string>(key: string, fallback: NoInfer<T>): [T, (v: T) => void] {
  const params = useSearchParams();
  const setParams = useSetParams();
  const fromUrl = (params.get(key) ?? fallback) as T;
  const [value, setValue] = useState<T>(fromUrl);
  // `seen` sigue a la URL. Si cambia desde fuera (un enlace a la misma página con otros filtros), manda la URL.
  // La URL llega en una transición, después del estado local: al escribir rápido nunca adopta un valor intermedio.
  const [seen, setSeen] = useState(fromUrl);
  if (fromUrl !== seen) {
    setSeen(fromUrl);
    if (fromUrl !== value) setValue(fromUrl);
  }
  const set = useCallback(
    (v: T) => {
      setValue(v);
      setParams({ [key]: v === fallback ? null : v });
    },
    [key, fallback, setParams],
  );
  return [value, set];
}
