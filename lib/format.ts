import { config, type CabinTypeId } from "./config";
import type { SiteConfig } from "./site";
import type { Reservation, ReservationStatus } from "./types";

// Fechas de calendario como cadenas ISO (AAAA-MM-DD), siempre en hora de Colombia.
const TZ = "America/Bogota";

export const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const MS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const WD = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const WD_FULL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const WD_MIN = ["D", "L", "M", "X", "J", "V", "S"];

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
export const todayISO = () => ymd.format(new Date());
// Fecha (AAAA-MM-DD) en hora de Colombia de una marca de tiempo ISO.
export const dateOf = (ts: string) => ymd.format(new Date(ts));

// "hace 5 min", "hace 3 h", "ayer", "12 sep"
export function timeAgo(ts: string, now = Date.now()) {
  const s = Math.max(0, (now - Date.parse(ts)) / 1000);
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 172800) return "ayer";
  const d = parseISO(dateOf(ts));
  return `${d.getUTCDate()} ${MS[d.getUTCMonth()]}`;
}

export const parseISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toISO = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => {
  const d = parseISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
};
export const nightsBetween = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 864e5);
export const isISO = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const monthStart = (s: string) => s.slice(0, 7) + "-01";

export const cop = (n: number | undefined | null) => "$" + String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export const fmtDate = (s: string, withYear = false) => {
  const d = parseISO(s);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MS[d.getUTCMonth()]}${withYear ? " " + d.getUTCFullYear() : ""}`;
};
export const fmtLong = (s: string) => {
  const d = parseISO(s);
  return `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
};
// "Miércoles, 30 de septiembre de 2026"
export const fmtFullDate = (s: string) => {
  const d = parseISO(s);
  return `${WD_FULL[d.getUTCDay()]}, ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
};
// Hora del día en Colombia: "3:45 p. m."
export const fmtClock = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
export const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

// Horas que faltan para el inicio del check-in (hora de Colombia, UTC-5).
export const hoursUntilCheckIn = (s: string, checkInStart: string) => (Date.parse(`${s}T${checkInStart}:00-05:00`) - Date.now()) / 36e5;

export const countdown = (iso: string) => {
  let ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "Vencido";
  const h = Math.floor(ms / 36e5);
  ms -= h * 36e5;
  const m = Math.floor(ms / 6e4);
  const s = Math.floor((ms - m * 6e4) / 1000);
  return `${h} h ${String(m).padStart(2, "0")} min ${String(s).padStart(2, "0")} s`;
};

export const wa = (whatsapp: string, text?: string) => `https://wa.me/${whatsapp}${text ? "?text=" + encodeURIComponent(text) : ""}`;
export const waTo = (phone: string, text?: string) =>
  `https://wa.me/${String(phone || "").replace(/\D/g, "")}${text ? "?text=" + encodeURIComponent(text) : ""}`;
export const tel = (p: string) => "tel:+57" + p.replace(/\D/g, "");
export const mask = (doc: string) => (doc ? "****" + String(doc).slice(-4) : "");
export const dirHref = () => `https://www.google.com/maps/dir/?api=1&destination=${config.lat},${config.lng}`;
const cabinName = (id: string) => config.cabins[id as CabinTypeId]?.full ?? id;
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const STATUS: Record<ReservationStatus, { label: string; bg: string }> = {
  pending_deposit: { label: "Pendiente de abono", bg: "var(--color-status-pending)" },
  confirmed: { label: "Confirmada", bg: "var(--color-status-confirmed)" },
  cancelled: { label: "Cancelada", bg: "var(--color-status-cancelled)" },
  expired: { label: "Expirada", bg: "var(--color-status-expired)" },
  rescheduled: { label: "Reprogramada", bg: "var(--color-status-rescheduled)" },
  checked_in: { label: "En estadía", bg: "var(--color-status-checked-in)" },
  completed: { label: "Finalizada", bg: "var(--color-status-completed)" },
};
export const statusOf = (s: string) => STATUS[s as ReservationStatus] ?? { label: s, bg: "var(--color-card-muted)" };

export const ics = (r: Pick<Reservation, "code" | "checkIn" | "checkOut" | "cabinTypeId">, c: SiteConfig, cabin = cabinName(r.cabinTypeId)) => {
  const d = (s: string) => s.replace(/-/g, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//La Vaca Fifi//Reservas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${r.code}@lavacafifi`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${d(r.checkIn)}`,
    `DTEND;VALUE=DATE:${d(r.checkOut)}`,
    `SUMMARY:${config.name} · ${cabin} (${r.code})`,
    `LOCATION:${config.address}`,
    `GEO:${config.lat};${config.lng}`,
    `DESCRIPTION:Código ${r.code}. Check-in ${c.checkIn}. Check-out ${c.checkOut}. Presenta tu documento de identidad físico. WhatsApp +${c.whatsapp}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
};

// Descarga un contenido generado o ya en memoria. `host`: dónde insertar el enlace temporal (dentro de un <dialog> modal, el resto de la página queda inerte).
export const download = (name: string, data: BlobPart, type: string, host: Element = document.body) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.hidden = true;
  host.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
};
