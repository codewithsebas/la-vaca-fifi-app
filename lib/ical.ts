// Calendarios iCal (RFC 5545), solo lo necesario para sincronizar disponibilidad con Booking.com:
// leer los eventos de día completo que exporta Booking y publicar los nuestros. Sin dependencias (también se prueba suelto).

export type IcsEvent = { uid: string; checkIn: string; checkOut: string; summary: string }; // checkOut exclusivo (AAAA-MM-DD)

const TZ = "America/Bogota";
const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

const addDay = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const unescapeText = (s: string) => s.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? " " : c));
const escapeText = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");

// "20261010" (VALUE=DATE) → "2026-10-10". Con hora: en UTC ("…Z") se pasa a la fecha de Colombia; flotante o con TZID se
// toma la fecha tal cual (Booking usa fechas de día completo, así que esto es solo por si acaso).
function toDate(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h && z) return ymd.format(new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)));
  const iso = `${y}-${mo}-${d}`;
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso;
}

// Separa "DTSTART;VALUE=DATE:20261010" en nombre, parámetros y valor (los dos puntos dentro de comillas no cuentan).
function property(line: string) {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const semi = head.indexOf(";");
  return { name: (semi < 0 ? head : head.slice(0, semi)).toUpperCase(), params: semi < 0 ? "" : head.slice(semi + 1).toUpperCase(), value: line.slice(colon + 1) };
}

// Eventos de un calendario: fechas de entrada y salida (exclusiva). Sin DTEND, una noche. Los cancelados no cuentan.
export function parseIcs(text: string): IcsEvent[] {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("No es un calendario iCal");
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out: IcsEvent[] = [];
  let ev: Record<string, string> | null = null;
  for (const line of lines) {
    const t = line.trim().toUpperCase();
    if (t === "BEGIN:VEVENT") ev = {};
    else if (t === "END:VEVENT") {
      if (ev) {
        const checkIn = ev.DTSTART ? toDate(ev.DTSTART) : null;
        let checkOut = ev.DTEND ? toDate(ev.DTEND) : null;
        if (checkIn && (!checkOut || checkOut <= checkIn)) checkOut = addDay(checkIn, 1);
        if (checkIn && checkOut && (ev.STATUS ?? "").toUpperCase() !== "CANCELLED") {
          const summary = unescapeText(ev.SUMMARY ?? "").slice(0, 200);
          out.push({ uid: (ev.UID || `${checkIn}/${checkOut}/${summary}`).slice(0, 500), checkIn, checkOut, summary });
        }
      }
      ev = null;
    } else if (ev) {
      const p = property(line);
      if (p && ["UID", "DTSTART", "DTEND", "SUMMARY", "STATUS"].includes(p.name)) ev[p.name] = p.value.trim();
    }
  }
  // Un UID repetido (eventos recurrentes o calendarios mal formados): gana el último.
  return [...new Map(out.map((e) => [e.uid, e])).values()];
}

// Líneas de máximo 75 octetos (RFC 5545 §3.1): las largas siguen en la siguiente línea con un espacio al inicio.
function fold(line: string) {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (bytes.encode(cur + ch).length > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = "";
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const compact = (iso: string) => iso.replace(/-/g, "");

// Calendario para importar en otra plataforma: un evento de día completo por estadía o cierre (sin datos personales).
export function buildIcs(events: IcsEvent[], opts: { name: string; prodId: string; now?: Date }): string {
  const now = stamp(opts.now ?? new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${opts.prodId}`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeText(opts.name)}`];
  for (const e of events)
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${compact(e.checkIn)}`,
      `DTEND;VALUE=DATE:${compact(e.checkOut)}`,
      `SUMMARY:${escapeText(e.summary)}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
