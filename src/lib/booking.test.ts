import { describe, expect, it } from "vitest";
import { clashingReservations, computeQuote, normalizePhone, unitFree, validateReservation, withTotal, type Occupancy } from "@/lib/booking";
import type { CabinType, RateSeason, ReservationInput } from "@/lib/types";

const cabin = { id: "doble", precioPareja: 160_000, personaAdicional: 40_000 } as const;
const season = (s: Partial<RateSeason>) => ({ activa: true, cabinTypeId: "doble", precioPareja: 200_000, personaAdicional: 50_000, ...s }) as RateSeason;

describe("computeQuote", () => {
  it("cobra la tarifa base por noche para una pareja", () => {
    const q = computeQuote(cabin, "2026-11-10", "2026-11-12", 2);
    expect(q).toMatchObject({ nights: 2, base: 320_000, extraGuests: 0, extraAmount: 0, total: 320_000, seasonNights: 0 });
  });

  it("suma la persona adicional por cada noche", () => {
    const q = computeQuote(cabin, "2026-11-10", "2026-11-12", 4);
    expect(q).toMatchObject({ extraGuests: 2, extraAmount: 2 * 2 * 40_000, total: 320_000 + 160_000 });
  });

  it("aplica la temporada solo a las noches que cubre (fin incluido)", () => {
    const q = computeQuote(cabin, "2026-12-30", "2027-01-02", 2, [season({ from: "2026-12-31", to: "2026-12-31" })]);
    expect(q).toMatchObject({ nights: 3, seasonNights: 1, base: 160_000 + 200_000 + 160_000 });
  });

  it("ignora temporadas inactivas o de otra cabaña", () => {
    const seasons = [
      season({ from: "2026-11-01", to: "2026-11-30", activa: false }),
      season({ from: "2026-11-01", to: "2026-11-30", cabinTypeId: "familiar" }),
    ];
    expect(computeQuote(cabin, "2026-11-10", "2026-11-11", 2, seasons).total).toBe(160_000);
  });

  it("calcula el abono con el porcentaje configurado y el saldo como el resto", () => {
    const q = computeQuote(cabin, "2026-11-10", "2026-11-11", 2);
    expect(q.deposit).toBe(Math.round(q.total * 0.3));
    expect(q.deposit + q.balance).toBe(q.total);
  });
});

describe("withTotal", () => {
  it("recalcula abono y saldo con un precio especial y deja la diferencia en adjustment", () => {
    const q = withTotal(computeQuote(cabin, "2026-11-10", "2026-11-11", 2), 100_000);
    expect(q).toMatchObject({ total: 100_000, deposit: 30_000, balance: 70_000, adjustment: -60_000 });
  });
});

describe("unitFree", () => {
  const occ: Occupancy = {
    reservations: [{ code: "VF-AAAAA", cabinTypeId: "doble", unit: 1, checkIn: "2026-11-10", checkOut: "2026-11-12", status: "confirmed" }],
    blocks: [{ cabinTypeId: "doble", unit: 2, from: "2026-11-20", to: "2026-11-21" }],
  };

  it("detecta el choque con una reserva activa (salida exclusiva)", () => {
    expect(unitFree(occ, 2, "doble", 1, "2026-11-11", "2026-11-13")).toBe(false);
    expect(unitFree(occ, 2, "doble", 1, "2026-11-12", "2026-11-14")).toBe(true);
  });

  it("respeta los bloqueos con el último día incluido", () => {
    expect(unitFree(occ, 2, "doble", 2, "2026-11-21", "2026-11-22")).toBe(false);
    expect(unitFree(occ, 2, "doble", 2, "2026-11-22", "2026-11-23")).toBe(true);
  });

  it("no cuenta la propia reserva al reprogramarla", () => {
    expect(unitFree(occ, 2, "doble", 1, "2026-11-10", "2026-11-12", "VF-AAAAA")).toBe(true);
  });

  it("libera las fechas de reservas canceladas", () => {
    const cancelled: Occupancy = { ...occ, reservations: [{ ...occ.reservations[0], status: "cancelled" }] };
    expect(unitFree(cancelled, 2, "doble", 1, "2026-11-10", "2026-11-12")).toBe(true);
  });
});

describe("clashingReservations", () => {
  it("encuentra reservas activas que se cruzan con un bloqueo", () => {
    const rs = [
      { code: "A", cabinTypeId: "doble", unit: 1, checkIn: "2026-11-10", checkOut: "2026-11-12", status: "confirmed" as const },
      { code: "B", cabinTypeId: "doble", unit: 1, checkIn: "2026-11-12", checkOut: "2026-11-13", status: "cancelled" as const },
    ];
    expect(clashingReservations(rs, "doble", 1, "2026-11-11", "2026-11-12").map((r) => r.code)).toEqual(["A"]);
  });
});

describe("normalizePhone", () => {
  it.each([
    ["300 123 4567", "+573001234567"],
    ["573001234567", "+573001234567"],
    ["+1 (555) 010-9999", "+15550109999"],
    ["", ""],
  ])("%s → %s", (input, out) => expect(normalizePhone(input)).toBe(out));
});

describe("validateReservation", () => {
  const types = [{ id: "doble", maxPersonas: 2 }] as CabinType[];
  const base = {
    checkIn: "2026-11-10",
    checkOut: "2026-11-12",
    cabinTypeId: "doble",
    adults: 2,
    children: 0,
    guest: { fullName: "Ana Gómez" },
  } as unknown as ReservationInput;

  it("rechaza fechas pasadas, invertidas o de más de 30 noches", () => {
    expect(validateReservation({ ...base, checkIn: "2026-11-01" }, types, "2026-11-05").checkIn).toBeDefined();
    expect(validateReservation({ ...base, checkOut: "2026-11-09" }, types, "2026-11-01").checkIn).toBeDefined();
    expect(validateReservation({ ...base, checkOut: "2026-12-20" }, types, "2026-11-01").checkIn).toBeDefined();
  });

  it("rechaza más huéspedes que la capacidad de la cabaña", () => {
    expect(validateReservation({ ...base, adults: 3 }, types, "2026-11-01").adults).toBe("Máximo 2 personas.");
  });
});
