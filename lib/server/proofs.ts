import "server-only";

// Comprobantes de pago: bucket privado. Nunca se generan URLs públicas, solo firmadas para el panel.
export const PROOF_BUCKET = "payment-proofs";
