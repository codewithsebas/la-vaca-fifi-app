import "server-only";

// Comprobantes de pago: bucket privado. Nunca se generan URLs públicas, solo firmadas para el panel.
export const PROOF_BUCKET = "payment-proofs";
export const MAX_PROOF_BYTES = 10 * 1024 * 1024;
export const MAX_PROOFS_PER_RESERVATION = 5;

const SIGNATURES: { mime: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/webp", ext: "webp", test: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP" },
  { mime: "application/pdf", ext: "pdf", test: (b) => ascii(b, 0, 5) === "%PDF-" },
];

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

// Tipo real del archivo según sus primeros bytes (no se confía en la extensión ni en el tipo que declara el navegador).
export async function detectProofType(file: File) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return SIGNATURES.find((s) => s.test(head)) ?? null;
}

// Nombre para mostrar: sin rutas ni caracteres de control.
export const safeFileName = (name: string) =>
  (name.split(/[\\/]/).pop() ?? "comprobante")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120) || "comprobante";
