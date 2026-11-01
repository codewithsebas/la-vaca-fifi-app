import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { checkEnv } = await import("@/lib/server/env");

const QA = "https://tknhymkjuxmohywwaxnv.supabase.co";
const PDN = "https://menpgghjhztsswnmpzjk.supabase.co";

const run = (vars: { NODE_ENV: string; APP_ENV?: string; url: string }) => {
  vi.stubEnv("NODE_ENV", vars.NODE_ENV);
  vi.stubEnv("APP_ENV", vars.APP_ENV);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", vars.url);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  return () => checkEnv();
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("candado de entorno", () => {
  it("en desarrollo solo acepta la base de QA", () => {
    expect(run({ NODE_ENV: "development", url: QA })).not.toThrow();
    expect(run({ NODE_ENV: "development", url: PDN })).toThrow(/QA/);
  });

  it("cada entorno desplegado exige su propia base", () => {
    expect(run({ NODE_ENV: "production", APP_ENV: "pdn", url: PDN })).not.toThrow();
    expect(run({ NODE_ENV: "production", APP_ENV: "qa", url: QA })).not.toThrow();
    expect(run({ NODE_ENV: "production", APP_ENV: "qa", url: PDN })).toThrow(/QA/);
    expect(run({ NODE_ENV: "production", APP_ENV: "pdn", url: QA })).toThrow(/PDN/);
  });

  it("rechaza un APP_ENV desconocido", () => {
    expect(run({ NODE_ENV: "production", APP_ENV: "staging", url: QA })).toThrow(/no es válido/);
  });

  it("sin APP_ENV en producción solo avisa", () => {
    expect(run({ NODE_ENV: "production", url: PDN })).not.toThrow();
  });
});
