import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { PaymentKind, PaymentProvider, PaymentStatus } from "@/lib/types";
import type { Tables } from "@/lib/supabase/database.types";
import type { Db } from "./db";

// Pasarela de pagos. Con las llaves de Wompi se usa Wompi (Web Checkout + eventos); sin ellas, en desarrollo,
// un checkout simulado que pasa por las mismas funciones de la base de datos. En producción el simulador está apagado
// salvo que ALLOW_PAYMENT_SIMULATOR=1 (nunca debe activarse con huéspedes reales: confirmaría reservas sin cobrar).

type GatewayStatus = Extract<PaymentStatus, "pending" | "approved" | "declined" | "error">;
type PaymentRow = Tables<"payments">;

const wompiKeys = () => {
  const publicKey = process.env.WOMPI_PUBLIC_KEY?.trim();
  const integrity = process.env.WOMPI_INTEGRITY_SECRET?.trim();
  if (!publicKey || !integrity) return null;
  return {
    publicKey,
    integrity,
    events: process.env.WOMPI_EVENTS_SECRET?.trim() ?? "",
    // Solo servidor: Wompi exige la llave privada para consultar una transacción (con la pública responde 404).
    privateKey: process.env.WOMPI_PRIVATE_KEY?.trim() ?? "",
    api: publicKey.startsWith("pub_prod_") ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1",
  };
};

export const simulatorAllowed = () => process.env.NODE_ENV !== "production" || process.env.ALLOW_PAYMENT_SIMULATOR === "1";

// Proveedor activo: PAYMENTS_PROVIDER lo fuerza ("wompi" o "simulado"); si no, Wompi con llaves o el simulador en desarrollo.
export function activeProvider(): Exclude<PaymentProvider, "manual"> | null {
  const forced = process.env.PAYMENTS_PROVIDER;
  if (forced === "wompi") return wompiKeys() ? "wompi" : null;
  if (forced === "simulado") return simulatorAllowed() ? "simulado" : null;
  if (wompiKeys()) return "wompi";
  return simulatorAllowed() ? "simulado" : null;
}

// Referencia única por intento: VF-7W9DX-A-K3M9QZ (A = abono, T = pago total, S = saldo). Sin caracteres ambiguos.
export function newReference(code: string, kind: PaymentKind) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const tail = Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join("");
  return `${code}-${kind === "deposit" ? "A" : kind === "full" ? "T" : "S"}-${tail}`;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// URL base del sitio para los enlaces que salen de él (retorno de la pasarela, correos).
export const siteUrl = (requestOrigin: string) => (process.env.NEXT_PUBLIC_SITE_URL?.trim() || requestOrigin).replace(/\/$/, "");

type Payer = { email: string; fullName: string; phone: string; docType: string; docNumber: string };

// El CDN de Wompi rechaza (403) el checkout si la URL de retorno es localhost o 127.0.0.1. En desarrollo se vuelve por
// un subdominio de localhost, que el navegador también resuelve a este equipo. En producción la base es el dominio https.
const wompiReturnBase = (base: string) => base.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1|\[::1\])(?=[:/]|$)/, "$1lavacafifi.localhost");

// A dónde llevar al huésped para pagar. Wompi: Web Checkout con firma de integridad y vencimiento (no acepta pagos
// después de que termine la retención o el plazo del saldo). Simulado: página propia de pruebas.
export function checkoutUrl(p: PaymentRow, payer: Payer, base: string) {
  if (p.provider !== "wompi") return `${base}/pago-simulado?ref=${encodeURIComponent(p.reference)}`;
  const back = `${wompiReturnBase(base)}/confirmacion?ref=${encodeURIComponent(p.reference)}`;
  const k = wompiKeys()!;
  const cents = String(p.amount * 100);
  const expires = p.expires_at ? new Date(p.expires_at).toISOString() : "";
  const q = new URLSearchParams({
    "public-key": k.publicKey,
    currency: "COP",
    "amount-in-cents": cents,
    reference: p.reference,
    "signature:integrity": sha256(`${p.reference}${cents}COP${expires}${k.integrity}`),
    "redirect-url": back,
    "customer-data:email": payer.email,
    "customer-data:full-name": payer.fullName,
  });
  if (expires) q.set("expiration-time", expires);
  const phone = payer.phone.replace(/\D/g, "").replace(/^57(?=3\d{9}$)/, "");
  if (/^3\d{9}$/.test(phone)) {
    q.set("customer-data:phone-number", phone);
    q.set("customer-data:phone-number-prefix", "+57");
  }
  const legalType = ({ CC: "CC", CE: "CE", Pasaporte: "PP" } as Record<string, string>)[payer.docType];
  if (legalType) {
    q.set("customer-data:legal-id", payer.docNumber);
    q.set("customer-data:legal-id-type", legalType);
  }
  return `https://checkout.wompi.co/p/?${q}`;
}

const WOMPI_STATUS: Record<string, GatewayStatus> = { PENDING: "pending", APPROVED: "approved", DECLINED: "declined", VOIDED: "declined", ERROR: "error" };

type GatewayTx = { id: string; reference: string; status: GatewayStatus; amountInCents: number; currency: string; method: string; detail: string };

function toTx(t: Record<string, unknown> | undefined): GatewayTx | null {
  if (!t || typeof t.id !== "string" || typeof t.reference !== "string") return null;
  const status = WOMPI_STATUS[String(t.status)];
  if (!status) return null;
  return {
    id: t.id,
    reference: t.reference,
    status,
    amountInCents: Number(t.amount_in_cents),
    currency: String(t.currency ?? ""),
    method: String(t.payment_method_type ?? ""),
    detail: typeof t.status_message === "string" ? t.status_message : status === "declined" ? "Transacción rechazada por la entidad financiera" : "",
  };
}

// Consulta una transacción en Wompi (con la llave privada). Se usa al volver de la pasarela y para refrescar pagos en proceso,
// así el resultado llega aunque el evento (webhook) se demore o no alcance el servidor (p. ej. en desarrollo local).
export async function fetchWompiTransaction(id: string): Promise<GatewayTx | null> {
  const k = wompiKeys();
  if (!k?.privateKey || !/^[\w-]{3,80}$/.test(id)) return null;
  try {
    const res = await fetch(`${k.api}/transactions/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${k.privateKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: Record<string, unknown> };
    return toTx(body.data);
  } catch {
    return null;
  }
}

// Evento de Wompi: la firma es SHA-256 de los valores de signature.properties + timestamp + secreto de eventos.
export function parseWompiEvent(body: unknown, headerChecksum: string | null): GatewayTx | null {
  const k = wompiKeys();
  const e = body as { event?: string; data?: Record<string, unknown>; signature?: { properties?: string[]; checksum?: string }; timestamp?: number } | null;
  if (!k?.events || !e || e.event !== "transaction.updated" || !e.data || !Array.isArray(e.signature?.properties) || typeof e.timestamp !== "number")
    return null;
  const value = (path: string) =>
    path.split(".").reduce<unknown>((o, key) => (o && typeof o === "object" ? (o as Record<string, unknown>)[key] : undefined), e.data);
  const expected = sha256(e.signature.properties.map((p) => String(value(p) ?? "")).join("") + e.timestamp + k.events).toUpperCase();
  const given = String(headerChecksum || e.signature.checksum || "").toUpperCase();
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
  return toTx(e.data.transaction as Record<string, unknown> | undefined);
}

type SettleResult = { code: string; kind: PaymentKind; status: PaymentStatus; changed: boolean; outcome?: string | null };

// Registra el resultado de una transacción. Antes valida que el monto y la moneda sean los del intento:
// si no coinciden, el pago se marca con error (nunca confirma una reserva por un valor distinto).
export async function settleTransaction(sb: Db, p: Pick<PaymentRow, "reference" | "amount">, tx: GatewayTx) {
  const mismatch = tx.reference !== p.reference || tx.currency !== "COP" || tx.amountInCents !== p.amount * 100;
  const { data, error } = await sb.rpc("settle_payment", {
    p_reference: p.reference,
    p_tx_id: tx.id,
    p_status: mismatch ? "error" : tx.status,
    p_method: tx.method,
    p_detail: mismatch ? "El monto o la referencia de la transacción no coinciden con el pago" : tx.detail,
  });
  if (error) throw error;
  return data as SettleResult;
}

// Errores de negocio que lanzan las funciones de la base de datos → respuesta HTTP.
const BUSINESS: Record<string, number> = {
  NOT_FOUND: 404,
  PAYMENT_NOT_FOUND: 404,
  HOLD_EXPIRED: 409,
  PAYMENT_IN_PROGRESS: 409,
  ALREADY_PAID: 409,
  NO_AVAILABILITY: 409,
  DUPLICATE: 409,
  NOT_PAYABLE: 422,
  NOT_APPLICABLE: 422,
  BALANCE_DEADLINE_PASSED: 422,
  BALANCE_PENDING: 422,
  DEPOSIT_REQUIRED: 422,
  FORBIDDEN: 403,
};

export function businessError(e: unknown): { status: number; error: string } | null {
  const message = (e as { message?: string } | null)?.message ?? "";
  const code = Object.keys(BUSINESS).find((k) => message === k || message.startsWith(k + " ") || message.includes(`"${k}"`));
  return code ? { status: BUSINESS[code], error: code } : null;
}
