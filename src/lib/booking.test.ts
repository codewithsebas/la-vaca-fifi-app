import { describe, expect, it } from "vitest";
import {
  clashingReservations,
  computeQuote,
  dayRateLabel,
  invalidDayRates,
  cleanUnitLabels,
  invalidPersonRates,
  invalidUnitLabels,
  rateFrom,
  unitLabel,
  tierPrice,
  normalizePhone,
  unitFree,
  validateReservation,
  withTotal,
  type Occupancy,
} from "@/lib/booking";
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

describe("precios por día de una temporada", () => {
  const cabin = { id: "doble", precioPareja: 160_000, personaAdicional: 40_000 } as CabinType;
  // Diciembre 2026: el 25 es viernes, el 26 sábado y el 31 jueves.
  const s = season({
    from: "2026-12-20",
    to: "2027-01-10",
    dayRates: [
      { weekdays: [5, 6], dates: [], precioPareja: 250_000, personaAdicional: 60_000 },
      { weekdays: [], dates: ["2026-12-31", "2026-12-26"], precioPareja: 400_000, personaAdicional: 80_000 },
    ],
  });

  it("cobra cada noche con su regla: fecha puntual, luego día de la semana, luego la temporada", () => {
    // Noches: jue 24 (temporada), vie 25 (fin de semana), sáb 26 (fecha puntual, gana sobre el sábado), dom 27 (temporada).
    const q = computeQuote(cabin, "2026-12-24", "2026-12-28", 3, [s]);
    expect(q.base).toBe(200_000 + 250_000 + 400_000 + 200_000);
    expect(q.extraAmount).toBe(50_000 + 60_000 + 80_000 + 50_000);
    expect(q.seasonNights).toBe(4);
  });

  it("describe cada regla en palabras", () => {
    expect(dayRateLabel(s.dayRates[0])).toBe("Vie y Sáb");
    expect(dayRateLabel({ weekdays: [1, 2, 3, 4], dates: [], precioPareja: 1, personaAdicional: 0 })).toBe("Lun a Jue");
    expect(dayRateLabel(s.dayRates[1])).toBe("26 dic, 31 dic");
  });

  it("valida días y fechas", () => {
    expect(invalidDayRates(s.dayRates, s.from, s.to)).toBeNull();
    expect(invalidDayRates([{ weekdays: [], dates: [], precioPareja: 1, personaAdicional: 0 }], s.from, s.to)).toMatch(/Elige los días/);
    expect(invalidDayRates([{ weekdays: [], dates: ["2027-02-01"], precioPareja: 1, personaAdicional: 0 }], s.from, s.to)).toMatch(/dentro de la temporada/);
    const twice = { weekdays: [5], dates: [], precioPareja: 1, personaAdicional: 0 };
    expect(invalidDayRates([twice, twice], s.from, s.to)).toMatch(/viernes está en dos/);
    expect(invalidDayRates([{ ...twice, precioPareja: 0 }], s.from, s.to)).toMatch(/precio/);
  });

  it("una temporada sin precios por día sigue como antes", () => {
    expect(computeQuote(cabin, "2026-12-25", "2026-12-26", 2, [season({ from: "2026-12-20", to: "2026-12-31" })]).base).toBe(200_000);
  });
});

describe("precios por cantidad de personas", () => {
  const familiar = { id: "familiar", precioPareja: 160000, personaAdicional: 40000, preciosPersonas: { "2": 200000, "3": 210000, "4": 280000 } };
  const grande = { id: "grande", precioPareja: 160000, personaAdicional: 40000, preciosPersonas: { "4": 280000, "5": 350000, "6": 420000 } };
  const season = (p: object) => ({
    id: "s1",
    cabinTypeId: "familiar",
    nombre: "Alta",
    from: "2026-12-20",
    to: "2026-12-31",
    precioPareja: 100000,
    personaAdicional: 10000,
    activa: true,
    dayRates: [],
    ...p,
  });

  it.each([
    [2, 200000],
    [3, 210000],
    [4, 280000],
  ])("%i personas pagan su precio, aunque no suba parejo", (guests, price) => {
    const q = computeQuote(familiar, "2026-11-10", "2026-11-12", guests);
    expect([q.total, q.base, q.extraGuests, q.extraAmount]).toEqual([price * 2, price * 2, 0, 0]);
  });

  it("con menos personas que la primera fila se cobra esa fila", () => {
    expect(computeQuote(grande, "2026-11-10", "2026-11-11", 2).total).toBe(280000);
    expect(tierPrice(grande.preciosPersonas, 1)).toBe(280000);
  });

  it("con más personas que la última fila se cobra la última", () => {
    expect(tierPrice(familiar.preciosPersonas, 6)).toBe(280000);
  });

  it("sin tabla sigue siendo pareja + persona adicional", () => {
    const q = computeQuote({ id: "doble", precioPareja: 160000, personaAdicional: 40000 }, "2026-11-10", "2026-11-11", 3);
    expect([q.base, q.extraGuests, q.extraAmount, q.total]).toEqual([160000, 1, 40000, 200000]);
  });

  it("la temporada y el precio por día usan su propia tabla", () => {
    const s = season({
      preciosPersonas: { "2": 300000, "3": 320000 },
      dayRates: [{ weekdays: [], dates: ["2026-12-24"], precioPareja: 0, personaAdicional: 0, preciosPersonas: { "2": 500000, "3": 550000 } }],
    });
    expect(computeQuote(familiar, "2026-12-23", "2026-12-24", 3, [s]).total).toBe(320000);
    expect(computeQuote(familiar, "2026-12-24", "2026-12-25", 3, [s]).total).toBe(550000);
  });

  it("una temporada sin tabla cobra pareja + adicional, y mezcla bien con noches de tabla", () => {
    const q = computeQuote(familiar, "2026-12-19", "2026-12-21", 3, [season({})]);
    // 19 dic: tabla (210.000). 20 dic: temporada 100.000 + 1 adicional × 10.000.
    expect([q.base, q.extraGuests, q.extraAmount, q.total]).toEqual([310000, 1, 10000, 320000]);
    expect(q.extraPerNight).toBe(10000);
  });

  it("muestra el precio desde y para cuántas personas", () => {
    expect(rateFrom(grande)).toEqual({ price: 280000, guests: 4 });
    expect(rateFrom({ precioPareja: 160000 })).toEqual({ price: 160000, guests: 2 });
  });

  it("valida la tabla", () => {
    expect(invalidPersonRates({})).toBeNull();
    expect(invalidPersonRates(undefined)).toBeNull();
    expect(invalidPersonRates(familiar.preciosPersonas)).toBeNull();
    expect(invalidPersonRates({ "2": 100, "4": 200 })).toMatch(/no son válidos/);
    expect(invalidPersonRates({ "2": 100, "3": 0 })).toMatch(/3 personas/);
    expect(invalidPersonRates({ "13": 100 })).toMatch(/no son válidos/);
  });
});

describe("números de unidad", () => {
  it("muestra el número propio; sin él, la posición", () => {
    const c = { unitLabels: ["9", "2", " "] };
    expect([unitLabel(c, 1), unitLabel(c, 2), unitLabel(c, 3), unitLabel(c, 4)]).toEqual(["9", "2", "3", "4"]);
    expect(unitLabel({}, 2)).toBe("2");
    expect(unitLabel(undefined, 2)).toBe("2");
  });

  it("deja uno por unidad, sin lo que sobra", () => {
    expect(cleanUnitLabels([" 9 ", "2", "12"], 2)).toEqual(["9", "2"]);
    expect(cleanUnitLabels(["9"], 3)).toEqual(["9", "", ""]);
    expect(cleanUnitLabels(undefined, 2)).toEqual(["", ""]);
  });

  it("valida el formato y que no se repitan", () => {
    expect(invalidUnitLabels(["9", "2"], 2)).toBeNull();
    expect(invalidUnitLabels(["10A", ""], 2)).toBeNull();
    expect(invalidUnitLabels(undefined, 3)).toBeNull();
    expect(invalidUnitLabels(["9", "9"], 2)).toMatch(/9 está repetido/);
    // La unidad 2 en blanco se muestra como 2: chocaría con el número puesto en la 1.
    expect(invalidUnitLabels(["2", ""], 2)).toMatch(/2 está repetido/);
    expect(invalidUnitLabels(["<b>"], 1)).toMatch(/6 letras/);
    expect(invalidUnitLabels(["1234567"], 1)).toMatch(/6 letras/);
  });
});
