import { simpleParser } from "mailparser";
import { EMAIL_RE } from "@/lib/booking";

// Correos de Ayenda (no-responder@ayenda.co) con las reservas de Booking.com: «Nueva Reserva», «Modificación Reserva» y
// «Cancelación Reserva Ayenda Hoteles: <huésped>». Traen el número único de Ayenda, el huésped, las fechas y el valor,
// pero no la cabaña. Se lee la parte de texto plano, que tiene una etiqueta por dato.

export const AYENDA_SENDER = "no-responder@ayenda.co";

export type AyendaKind = "new" | "modified" | "cancelled";

export type AyendaBooking = {
  kind: AyendaKind;
  ref: string; // «Número Único de Reserva» de Ayenda
  guest: string;
  email: string; // alias de Booking (…@guest.booking.com); vacío si no viene
  phone: string; // solo dígitos; vacío si Ayenda manda «0»
  checkIn: string;
  checkOut: string;
  total: number;
};

export type AyendaEmail = { messageId: string; receivedAt: string } & (
  | { ok: true; booking: AyendaBooking }
  | { ok: false; error: string } // del remitente, pero no se pudo leer: el panel avisa
);

const KINDS: [RegExp, AyendaKind][] = [
  [/^Nueva Reserva\b/i, "new"],
  [/^Modificaci[oó]n Reserva\b/i, "modified"],
  [/^Cancelaci[oó]n Reserva\b/i, "cancelled"],
];
const kindOf = (subject: string) => KINDS.find(([re]) => re.test(subject.trim()))?.[1];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().startsWith(s);

// Valor de una etiqueta: lo que sigue en la misma línea (o, para las fechas, en la siguiente: «Checkout:» va sola).
const field = (text: string, label: string, nextLine = false) => {
  const m = text.match(new RegExp(`^[ \\t]*${label}:${nextLine ? "\\s*" : "[ \\t]*"}(.*)$`, "imu"));
  return m ? m[1].trim() : "";
};

/** Lee la parte de texto de un correo de Ayenda. Devuelve el error en palabras si falta o sobra algo. */
export function parseAyendaText(subject: string, text: string): { booking: AyendaBooking } | { error: string } {
  const kind = kindOf(subject);
  if (!kind) return { error: "el asunto no es de una reserva" };
  const t = text.replace(/ /g, " ").replace(/\r\n?/g, "\n");

  const ref = field(t, "N[uú]mero [UÚ]nico de Reserva");
  if (!/^\d{1,20}$/.test(ref)) return { error: "sin número de reserva" };
  const guest = field(t, "Nombre Completo").replace(/\s+/g, " ").slice(0, 120);
  if (!guest) return { error: "sin nombre del huésped" };
  const checkIn = field(t, "Checkin", true);
  const checkOut = field(t, "Checkout", true);
  if (!validDate(checkIn) || !validDate(checkOut) || checkOut <= checkIn) return { error: "las fechas no son válidas" };
  if ((Date.parse(checkOut) - Date.parse(checkIn)) / 864e5 > 60) return { error: "la estadía supera 60 noches" };
  // «$ 320.000» (puntos de miles; si trae centavos con coma, se ignoran).
  const money = field(t, "Total")
    .replace(/,\d{1,2}$/, "")
    .replace(/[^\d]/g, "");
  const total = Number(money);
  if (!money || !Number.isSafeInteger(total) || total > 100_000_000) return { error: "el valor no es válido" };

  const rawEmail = field(t, "Email").split(/\s/)[0] ?? "";
  const email = EMAIL_RE.test(rawEmail) && rawEmail.length <= 160 ? rawEmail.toLowerCase() : "";
  const digits = field(t, "Tel[eé]fonos").replace(/\D/g, "").slice(0, 15);
  const phone = digits.length >= 7 ? digits : "";
  return { booking: { kind, ref, guest, email, phone, checkIn, checkOut, total } };
}

// La firma la comprueba el servidor de correo del buzón y la deja en el primer «Authentication-Results» (el de más
// arriba). Los que vengan más abajo los pudo escribir cualquiera, así que solo cuenta ese, y solo si es de `authserv`.
export function signedByAyenda(raw: string, authserv = "mx.google.com") {
  const head = raw.split(/\r?\n\r?\n/, 1)[0].replace(/\r?\n[ \t]+/g, " ");
  const first = head.split(/\r?\n/).find((l) => /^authentication-results:/i.test(l));
  if (!first) return false;
  const value = first.slice(first.indexOf(":") + 1).trim();
  if (!value.toLowerCase().startsWith(authserv.toLowerCase() + ";")) return false;
  return /(^|;)\s*dkim=pass\b[^;]*\bheader\.(i|d)=@?ayenda\.co(?=[\s;]|$)/i.test(value);
}

const normalizeId = (id: string) => id.trim().replace(/^<|>$/g, "");

/**
 * Lee un correo completo (RFC 822). null: no es de Ayenda, no viene firmado por ellos (para que nadie pueda crear
 * reservas con un correo falso) o es otro tipo de correo de Ayenda que no trata de una reserva. Se ignora sin avisar.
 */
export async function readAyendaEmail(raw: Buffer | string, authserv?: string): Promise<AyendaEmail | null> {
  const source = typeof raw === "string" ? raw : raw.toString("latin1");
  if (!signedByAyenda(source, authserv)) return null;
  const mail = await simpleParser(raw);
  const from = mail.from?.value[0]?.address?.toLowerCase();
  if (from !== AYENDA_SENDER || !mail.messageId || !kindOf(mail.subject ?? "")) return null;
  const messageId = normalizeId(mail.messageId);
  const receivedAt = (mail.date ?? new Date()).toISOString();
  const r = parseAyendaText(mail.subject ?? "", mail.text ?? "");
  return "error" in r ? { messageId, receivedAt, ok: false, error: r.error } : { messageId, receivedAt, ok: true, booking: r.booking };
}

export { normalizeId as normalizeMessageId };
