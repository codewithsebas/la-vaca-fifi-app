import { describe, expect, it } from "vitest";
import { buildIcs, parseIcs } from "@/lib/server/ical";
import { busyBlocks, channelBlocks, staysWithoutData } from "@/lib/booking";
import type { ChannelStay } from "@/lib/types";

// Con la misma forma que el calendario que exporta Booking (ical.booking.com/v1/export), con UID repetido como lo manda.
const BOOKING = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//admin.booking.com\\\, b.v.//NONSGML v1.0//EN",
  "CALSCALE:GREGORIAN",
  "METHOD:PUBLISH",
  "BEGIN:VEVENT",
  "DTSTAMP:20261106T234435Z",
  "DTSTART;VALUE=DATE:20261106",
  "DTEND;VALUE=DATE:20261108",
  "UID:c20c889fd33e6c741b3bc650061b4ea8@booking.com",
  "SUMMARY:CLOSED - Not available",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTAMP:20261106T234435Z",
  "DTSTART;VALUE=DATE:20261114",
  "DTEND;VALUE=DATE:20261115",
  "UID:270ef876564f03f7d99874210c87b9f6@booking.com",
  "SUMMARY:CLOSED - Not available",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("calendario de Booking", () => {
  it("lee las noches ocupadas con salida exclusiva", () => {
    expect(parseIcs(BOOKING)).toEqual([
      { uid: "c20c889fd33e6c741b3bc650061b4ea8@booking.com", checkIn: "2026-11-06", checkOut: "2026-11-08", summary: "CLOSED - Not available" },
      { uid: "270ef876564f03f7d99874210c87b9f6@booking.com", checkIn: "2026-11-14", checkOut: "2026-11-15", summary: "CLOSED - Not available" },
    ]);
  });

  it("rechaza lo que no es un calendario", () => {
    expect(() => parseIcs("<html>login</html>")).toThrow();
  });

  it("publica un calendario que se vuelve a leer igual", () => {
    const ics = buildIcs([{ uid: "cerrado-1@x", checkIn: "2026-12-24", checkOut: "2026-12-26", summary: "No disponible" }], {
      name: "Cabaña 1",
      prodId: "-//x//ES",
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261224");
    expect(parseIcs(ics)).toEqual([{ uid: "cerrado-1@x", checkIn: "2026-12-24", checkOut: "2026-12-26", summary: "No disponible" }]);
  });
});

describe("noches de Booking en la disponibilidad", () => {
  const stay = (o: Partial<ChannelStay>): ChannelStay => ({
    id: "s1",
    calendarId: "c1",
    cabinTypeId: "doble",
    reservationCode: null,
    unit: 1,
    checkIn: "2026-11-06",
    checkOut: "2026-11-08",
    summary: "CLOSED - Not available",
    echo: false,
    firstSeenAt: "2026-11-06T00:00:00Z",
    removedAt: null,
    ...o,
  });

  it("ocupan hasta la última noche, sin ecos ni canceladas", () => {
    const blocks = channelBlocks([stay({}), stay({ id: "s2", echo: true }), stay({ id: "s3", removedAt: "2026-11-06T01:00:00Z" })]);
    expect(blocks).toEqual([
      { id: "booking:s1", cabinTypeId: "doble", unit: 1, from: "2026-11-06", to: "2026-11-07", reason: "Reserva Booking", notes: "CLOSED - Not available" },
    ]);
  });

  it("enlazada a una reserva no ocupa por su cuenta: ocupa la reserva", () => {
    expect(channelBlocks([stay({ reservationCode: "VF-AAAAA" })])).toEqual([]);
    expect(staysWithoutData([stay({ id: "s2" }), stay({ reservationCode: "VF-AAAAA" })], "2026-11-06").map((s) => s.id)).toEqual(["s2"]);
  });

  it("un cierre largo del extranet no se pide completar", () => {
    expect(staysWithoutData([stay({ checkIn: "2026-12-07", checkOut: "2027-01-30" })], "2026-11-06")).toEqual([]);
  });

  it("se suman a los bloqueos del panel, también con una copia sin conexión antigua", () => {
    expect(busyBlocks({ blocks: [], channelStays: [stay({})] })).toHaveLength(1);
    expect(busyBlocks({ blocks: [] })).toEqual([]);
  });
});
