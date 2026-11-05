import { describe, expect, it } from "vitest";
import { MAX_GROUP_CABINS, availability, splitTotal, validateExtraCabins, type Occupancy } from "@/lib/booking";
import { groupMoney, groupOf } from "@/lib/groups";
import type { CabinType, Quote, Reservation } from "@/lib/types";

const type = (id: string, maxPersonas: number, units = 2): CabinType =>
  ({ id, nombre: `Cabaña ${id}`, precioPareja: 200000, personaAdicional: 50000, maxPersonas, units, activa: true }) as CabinType;
const TYPES = [type("doble", 2, 3), type("familiar", 6, 1)];

const quote = (total: number, deposit = Math.round(total * 0.3)): Quote => ({
  base: total,
  extraGuests: 0,
  extraAmount: 0,
  total,
  deposit,
  balance: total - deposit,
  pricePerNight: total,
  extraPerNight: 0,
  nights: 1,
});

const res = (code: string, groupCode: string | null, total: number, extra: Partial<Reservation> = {}): Reservation =>
  ({
    code,
    groupCode,
    status: "pending_deposit",
    cabinTypeId: "doble",
    unit: 1,
    checkIn: "2030-01-10",
    checkOut: "2030-01-11",
    adults: 2,
    children: 0,
    quote: quote(total),
    paid: 0,
    depositPaidAt: null,
    balancePaidAt: null,
    ...extra,
  }) as Reservation;

describe("splitTotal", () => {
  it("reparte en proporción a la tarifa y deja el redondeo en la primera", () => {
    expect(splitTotal([quote(300000), quote(100000)], 200000)).toEqual([150000, 50000]);
    const parts = splitTotal([quote(100000), quote(100000), quote(100000)], 100000);
    expect(parts.reduce((s, x) => s + x, 0)).toBe(100000);
    expect(parts).toEqual([33334, 33333, 33333]);
  });
});

describe("validateExtraCabins", () => {
  it("acepta cabañas válidas y no exige nada sin grupo", () => {
    expect(validateExtraCabins(undefined, TYPES)).toEqual({});
    expect(validateExtraCabins([{ cabinTypeId: "familiar", adults: 4, children: 2 }], TYPES)).toEqual({});
  });
  it("marca la cabaña con el problema", () => {
    expect(validateExtraCabins([{ cabinTypeId: "doble", adults: 3, children: 0 }], TYPES)).toHaveProperty("more.0");
    expect(validateExtraCabins([{ cabinTypeId: "x", adults: 1, children: 0 }], TYPES)).toHaveProperty("more.0");
    expect(validateExtraCabins([{ cabinTypeId: "doble", adults: 0, children: 1 }], TYPES)).toHaveProperty("more.0");
    expect(validateExtraCabins([{ cabinTypeId: "doble", adults: 1, children: 0, unit: 9 }], TYPES, { doble: 3 })).toHaveProperty("more.0");
  });
  it("limita cuántas cabañas tiene una reserva", () => {
    const many = Array.from({ length: MAX_GROUP_CABINS }, () => ({ cabinTypeId: "doble", adults: 1, children: 0 }));
    expect(validateExtraCabins(many, TYPES)).toHaveProperty("more");
  });
});

describe("groupOf y groupMoney", () => {
  const a = res("VF-AAAAA", "VF-AAAAA", 300000);
  const b = res("VF-BBBBB", "VF-AAAAA", 200000, { paid: 60000, depositPaidAt: "2030-01-01" });
  const c = res("VF-CCCCC", "VF-AAAAA", 100000, { status: "cancelled" });
  const solo = res("VF-SOLO1", null, 500000);

  it("trae la principal primero y omite las canceladas", () => {
    expect(groupOf([b, c, a, solo], b).map((x) => x.code)).toEqual(["VF-AAAAA", "VF-BBBBB"]);
    expect(groupOf([b, c, a, solo], solo)).toEqual([solo]);
  });
  it("suma valores, pagos y personas del grupo", () => {
    const m = groupMoney([a, b]);
    expect(m.code).toBe("VF-AAAAA");
    expect(m.quote.total).toBe(500000);
    expect(m.quote.deposit).toBe(150000);
    expect(m.paid).toBe(60000);
    expect(m.adults).toBe(4);
    // Queda pagada solo cuando lo están todas.
    expect(m.depositPaidAt).toBeNull();
    expect(groupMoney([solo])).toBe(solo);
  });
});

describe("availability para grupos", () => {
  it("da las unidades libres de toda la estadía y la tarifa por personas", () => {
    const occ: Occupancy = {
      reservations: [{ code: "X", cabinTypeId: "doble", unit: 1, checkIn: "2030-01-10", checkOut: "2030-01-12", status: "confirmed" }],
      blocks: [{ cabinTypeId: "doble", unit: 2, from: "2030-01-11", to: "2030-01-11" }],
    };
    const av = availability(occ, TYPES, { doble: 3, familiar: 1 }, "2030-01-10", "2030-01-12", 8);
    const doble = av.options.find((o) => o.cabinTypeId === "doble")!;
    // La unidad 2 está libre la primera noche pero no la segunda: no sirve para toda la estadía.
    expect(doble.unitsFree).toBe(1);
    expect(Object.keys(doble.quoteBy!)).toEqual(["1", "2"]);
    expect(av.options.find((o) => o.cabinTypeId === "familiar")!.quoteBy!["6"].total).toBeGreaterThan(0);
  });
});
