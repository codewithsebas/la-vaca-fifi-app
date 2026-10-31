// Se ejecuta una vez al arrancar el servidor de Next.js.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkEnv } = await import("@/lib/server/env");
  checkEnv();
}
