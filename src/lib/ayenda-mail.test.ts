import { describe, expect, it } from "vitest";
import { parseAyendaText, readAyendaEmail, signedByAyenda } from "@/lib/ayenda-mail";

// Correo con la misma forma que los reales de Ayenda (texto en iso-8859-1, quoted-printable), con datos inventados.
const AUTH_OK =
  "Authentication-Results: mx.google.com;\r\n       dkim=pass header.i=@ayenda.co header.s=s1 header.b=AbCdEf12;\r\n       dkim=pass header.i=@sendgrid.info header.s=smtpapi header.b=XyZ;\r\n       dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=ayenda.co";

const qp = (s: string) =>
  Buffer.from(s, "latin1")
    .toString("latin1")
    .replace(/[^\n\r\x20-\x3c\x3e-\x7e]/g, (c) => "=" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));

function ayendaEmail({
  auth = AUTH_OK,
  from = "no-responder@ayenda.co",
  subject = "=?UTF-8?Q?Cancelaci=C3=B3n?= Reserva Ayenda Hoteles: Ana Prueba",
  title = "Cancelación Reserva desde Ayenda Hoteles: Ana Prueba",
  phone = "3001234567",
  email = "aprueba.123456@guest.booking.com",
  ref = "4200001",
  checkIn = "2026-12-14",
  checkOut = "2026-12-15",
  total = "$ 320.000",
  extraHeaders = "",
} = {}) {
  const nb = " ";
  const text = [
    "Nueva Reserva",
    "",
    `${title}${nb}`,
    "",
    "Detalles de tu reserva:",
    "",
    "A continuación los datos del huésped:",
    "",
    `Nombre Completo:${nb}Ana Prueba`,
    "",
    `Teléfonos:${nb}${phone}`,
    "",
    `Email:${nb}${email}`,
    "",
    `Número Único de Reserva:${nb}${ref}`,
    "",
    `Checkin:${nb}${checkIn}`,
    "",
    "Checkout:",
    "",
    checkOut,
    "",
    `Total:${nb}${total}`,
    "",
    `Pago:${nb}Hotel`,
    "",
    `Estado:${nb}Pendiente`,
    "",
    `Link`,
    ` a la reserva en Ayenda https://pms.ayenda.co/reservations/${ref}`,
  ].join("\r\n");
  const headers = [
    "Delivered-To: buzon@example.com",
    auth,
    extraHeaders,
    "Content-Type: multipart/alternative; boundary=b1",
    "Date: Mon, 02 Nov 2026 23:14:10 +0000 (UTC)",
    `From: ${from}`,
    "Mime-Version: 1.0",
    `Message-ID: <prueba-${ref}@geopod-ismtpd-5>`,
    `Subject: ${subject}`,
    "To: buzon@example.com",
  ].filter(Boolean);
  const plain = ["Content-Transfer-Encoding: quoted-printable", "Content-Type: text/plain; charset=iso-8859-1", "", qp(text)];
  const html = ["Content-Type: text/html; charset=iso-8859-1", "", "<html><body>Reserva</body></html>"];
  return [...headers, "", "--b1", ...plain, "--b1", ...html, "--b1--", ""].join("\r\n");
}

describe("readAyendaEmail", () => {
  it("lee una cancelación con sus datos", async () => {
    const r = await readAyendaEmail(ayendaEmail());
    expect(r).toEqual({
      messageId: "prueba-4200001@geopod-ismtpd-5",
      receivedAt: "2026-11-02T23:14:10.000Z",
      ok: true,
      booking: {
        kind: "cancelled",
        ref: "4200001",
        guest: "Ana Prueba",
        email: "aprueba.123456@guest.booking.com",
        phone: "3001234567",
        checkIn: "2026-12-14",
        checkOut: "2026-12-15",
        total: 320000,
      },
    });
  });

  it("distingue reserva nueva y modificación por el asunto", async () => {
    const nueva = await readAyendaEmail(ayendaEmail({ subject: "Nueva Reserva Ayenda Hoteles: Ana Prueba" }));
    const mod = await readAyendaEmail(ayendaEmail({ subject: "=?UTF-8?Q?Modificaci=C3=B3n?= Reserva Ayenda Hoteles: Ana Prueba" }));
    expect(nueva?.ok && nueva.booking.kind).toBe("new");
    expect(mod?.ok && mod.booking.kind).toBe("modified");
  });

  it("deja el teléfono vacío cuando Ayenda manda 0", async () => {
    const r = await readAyendaEmail(ayendaEmail({ phone: "0" }));
    expect(r?.ok && r.booking.phone).toBe("");
  });

  it("ignora correos sin firma de Ayenda o de otro remitente", async () => {
    expect(await readAyendaEmail(ayendaEmail({ auth: AUTH_OK.replace("dkim=pass header.i=@ayenda.co", "dkim=fail header.i=@ayenda.co") }))).toBeNull();
    expect(await readAyendaEmail(ayendaEmail({ from: "reservas@ayenda.co.example.com" }))).toBeNull();
  });

  it("no acepta una firma falsa escrita más abajo por quien envía", async () => {
    const fake = ayendaEmail({
      auth: "Authentication-Results: mx.google.com; dkim=none; spf=fail",
      extraHeaders: "Authentication-Results: mx.google.com; dkim=pass header.i=@ayenda.co",
    });
    expect(await readAyendaEmail(fake)).toBeNull();
  });

  it("ignora los correos de Ayenda que no son de reservas", async () => {
    expect(await readAyendaEmail(ayendaEmail({ subject: "Resumen semanal de tu hotel" }))).toBeNull();
  });

  it("devuelve el error si el correo firmado no se entiende", async () => {
    const r = await readAyendaEmail(ayendaEmail({ checkOut: "2026-12-10" }));
    expect(r).toMatchObject({ ok: false, error: "las fechas no son válidas" });
  });
});

describe("signedByAyenda", () => {
  it("exige que el primer Authentication-Results sea del servidor del buzón", () => {
    expect(signedByAyenda(`${AUTH_OK}\r\nFrom: x\r\n\r\ncuerpo`)).toBe(true);
    expect(signedByAyenda(`${AUTH_OK}\r\nFrom: x\r\n\r\ncuerpo`, "mx.otro.com")).toBe(false);
    expect(signedByAyenda("Authentication-Results: mx.google.com; dkim=pass header.i=@ayenda.co.evil.com\r\n\r\nx")).toBe(false);
  });
});

describe("parseAyendaText", () => {
  it("rechaza asuntos que no son de reservas", () => {
    expect(parseAyendaText("Tu factura de Ayenda", "")).toEqual({ error: "el asunto no es de una reserva" });
  });

  it("lee valores con centavos y sin símbolo", () => {
    const text = "Nombre Completo: Ana\nNúmero Único de Reserva: 12\nCheckin: 2026-12-01\nCheckout:\n\n2026-12-03\nTotal: 1.250.000,00";
    expect(parseAyendaText("Nueva Reserva Ayenda Hoteles: Ana", text)).toMatchObject({ booking: { total: 1250000, email: "", phone: "" } });
  });
});
