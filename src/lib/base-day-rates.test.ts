import { describe, expect, it } from "vitest";
import { computeQuote, invalidBaseDayRates, nightlyRate } from "@/lib/booking";
import type { CabinType, RateSeason, SeasonDayRate } from "@/lib/types";

// La Doble: $160.000 de lunes a jueves y $170.000 viernes, sábado y domingo (noches).
const weekend: SeasonDayRate = { weekdays: [5, 6, 0], dates: [], precioPareja: 170000, personaAdicional: 0 };
const doble = { id: "doble", precioPareja: 160000, personaAdicional: 0, preciosPersonas: {}, maxPersonas: 2, dayRates: [weekend] } as unknown as CabinType;

describe("precio por día de la semana en la tarifa base", () => {
  it("cobra el fin de semana distinto", () => {
    // 2030-01-03 es jueves: noches jue, vie, sáb, dom → 160 + 170 + 170 + 170.
    expect(computeQuote(doble, "2030-01-03", "2030-01-07", 2, [], 30).total).toBe(670000);
    // Lunes a jueves: todo a 160.
    expect(computeQuote(doble, "2030-01-07", "2030-01-10", 2, [], 30).total).toBe(480000);
    expect(nightlyRate(doble, [], "2030-01-05").dayRate).toBe(weekend);
    expect(nightlyRate(doble, [], "2030-01-08").dayRate).toBeNull();
  });

  it("una temporada reemplaza la tarifa base y su precio por día", () => {
    const season: RateSeason = {
      id: "s",
      cabinTypeId: "doble",
      nombre: "Fin de año",
      from: "2030-01-01",
      to: "2030-01-10",
      precioPareja: 250000,
      personaAdicional: 0,
      activa: true,
      dayRates: [],
    } as RateSeason;
    expect(computeQuote(doble, "2030-01-04", "2030-01-06", 2, [season], 30).total).toBe(500000);
  });

  it("valida que solo use días de la semana", () => {
    expect(invalidBaseDayRates(undefined)).toBeNull();
    expect(invalidBaseDayRates([weekend])).toBeNull();
    expect(invalidBaseDayRates([{ ...weekend, weekdays: [], dates: ["2030-01-04"] }])).not.toBeNull();
    expect(invalidBaseDayRates([weekend, { ...weekend, weekdays: [0] }])).not.toBeNull(); // el domingo dos veces
  });
});
