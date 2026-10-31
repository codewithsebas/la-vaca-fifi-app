import { describe, expect, it } from "vitest";
import { addDays, cop, isISO, nightsBetween, plural } from "@/lib/format";

describe("fechas", () => {
  it("suma días cruzando meses y años", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("cuenta noches entre llegada y salida", () => {
    expect(nightsBetween("2026-11-10", "2026-11-13")).toBe(3);
  });

  it("valida el formato AAAA-MM-DD", () => {
    expect(isISO("2026-11-10")).toBe(true);
    expect(isISO("10/11/2026")).toBe(false);
    expect(isISO(undefined)).toBe(false);
  });
});

describe("textos", () => {
  it("formatea pesos colombianos con punto de miles", () => {
    expect(cop(1_234_567)).toBe("$1.234.567");
    expect(cop(null)).toBe("$0");
  });

  it("elige singular o plural", () => {
    expect(plural(1, "noche", "noches")).toBe("1 noche");
    expect(plural(3, "noche", "noches")).toBe("3 noches");
  });
});
