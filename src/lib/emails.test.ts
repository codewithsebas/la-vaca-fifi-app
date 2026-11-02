import { describe, expect, it } from "vitest";
import { arrivalReminderEmail, reservationEndedEmail, reservationReceivedEmail } from "@/lib/emails";
import { defaultContent, mergeSite } from "@/lib/site";

const c = mergeSite(defaultContent.settings, defaultContent.policies, defaultContent.texts);
const stay = {
  nombre: "Laura <b>Gómez</b>",
  codigo: "VF-7W9DX",
  cabana: "Cabaña Doble",
  checkIn: "2026-12-10",
  checkOut: "2026-12-12",
  adultos: 2,
  ninos: 1,
  logoUrl: "https://x/logo.png",
};

describe("correos automáticos de la reserva", () => {
  it("reserva recibida: código, abono y plazo", () => {
    const e = reservationReceivedEmail(c, {
      ...stay,
      mascota: false,
      total: 500000,
      abono: 150000,
      plazo: "2026-12-01T20:00:00Z",
      miReservaUrl: "https://x/mi-reserva?code=VF-7W9DX",
      whatsappUrl: "https://wa.me/573000000000",
    });
    expect(e.subject).toContain("VF-7W9DX");
    expect(e.html).toContain("$150.000");
    expect(e.html).toContain("Ver mi reserva");
    expect(e.text).toContain("$150.000");
  });

  it("sin el sitio público (solo panel) no enlaza «Mi reserva» ni «Reservar»", () => {
    const received = reservationReceivedEmail(c, {
      ...stay,
      mascota: false,
      total: 500000,
      abono: 150000,
      plazo: "2026-12-01T20:00:00Z",
      miReservaUrl: "",
      whatsappUrl: "https://wa.me/573000000000",
    });
    expect(received.html).not.toContain("Ver mi reserva");
    expect(received.text).not.toContain("Ver mi reserva");
    const expired = reservationEndedEmail(c, { ...stay, vencida: true, reservarUrl: "", whatsappUrl: "https://wa.me/573000000000" });
    expect(expired.html).not.toContain("Reservar de nuevo");
    expect(expired.html).toContain("escríbenos por WhatsApp");
  });

  it("cancelada y vencida tienen asunto propio", () => {
    const base = { ...stay, reservarUrl: "https://x/reservar", whatsappUrl: "https://wa.me/1" };
    expect(reservationEndedEmail(c, { ...base, vencida: false }).subject).toBe("Tu reserva VF-7W9DX fue cancelada");
    expect(reservationEndedEmail(c, { ...base, vencida: true }).subject).toBe("Tu reserva VF-7W9DX venció");
  });

  it("recordatorio con su saldo y sin HTML del huésped", () => {
    const reminder = arrivalReminderEmail(c, { ...stay, saldo: 350000, comoLlegarUrl: "https://maps", miReservaUrl: "", whatsappUrl: "https://wa.me/1" });
    expect(reminder.html).toContain("$350.000");
    expect(reminder.html).not.toContain("Ver mi reserva");
    // Lo que escribe el huésped se escapa: nunca entra HTML suyo al correo.
    expect(reminder.html).not.toContain("<b>");
  });
});
