import type { PublicReservation } from "./types";

// La confirmación lee la última solicitud enviada en esta pestaña.
export type LastReservation = { res: PublicReservation; email: string; name: string; adults: number; children: number };

const KEY = "vf-last";

export function saveLastReservation(v: LastReservation) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
  rememberReservation(v.res.code, v.email);
}

export function readLastReservation(): LastReservation | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

// Reservas hechas o consultadas en este dispositivo (las 5 más recientes): «Mi reserva» completa el código y el correo sola.
type Mine = { code: string; email: string };
const MINE = "vf-mis-reservas";

function readMine(): Mine[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(MINE) || "[]");
    return Array.isArray(v) ? v.filter((x): x is Mine => typeof x?.code === "string" && typeof x?.email === "string") : [];
  } catch {
    return [];
  }
}

function writeMine(list: Mine[]) {
  try {
    localStorage.setItem(MINE, JSON.stringify(list.slice(0, 5)));
  } catch {}
}

export const rememberReservation = (code: string, email: string) => writeMine([{ code, email }, ...readMine().filter((x) => x.code !== code)]);
export const forgetReservation = (code: string) => writeMine(readMine().filter((x) => x.code !== code));

// Con código: el correo guardado para esa reserva. Sin código: la última reserva de este dispositivo.
export function rememberedReservation(code?: string | null): Mine | null {
  const list = readMine();
  if (!code) return list[0] ?? null;
  const c = code.trim().toUpperCase();
  const last = readLastReservation();
  return list.find((x) => x.code === c) ?? (last?.res.code === c ? { code: c, email: last.email } : null);
}
