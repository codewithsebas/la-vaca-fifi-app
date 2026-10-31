import "server-only";

// Variables de entorno del servidor en un solo lugar. Se leen en cada acceso (no al importar el módulo): el servidor
// standalone de Hostinger las inyecta al arrancar y así un cambio en el panel solo pide reiniciar, no recompilar.
// Las NEXT_PUBLIC_* de los componentes de navegador no pasan por aquí: Next las incrusta al compilar.
const read = (name: string) => process.env[name]?.trim() || undefined;

export const env = {
  get supabaseUrl() {
    return read("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabasePublishableKey() {
    return read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  },
  get supabaseSecretKey() {
    return read("SUPABASE_SECRET_KEY");
  },
  get siteUrl() {
    return read("NEXT_PUBLIC_SITE_URL");
  },
  get resendApiKey() {
    return read("RESEND_API_KEY");
  },
  get emailFrom() {
    return read("EMAIL_FROM");
  },
  get emailReplyTo() {
    return read("EMAIL_REPLY_TO");
  },
  get vapidPublicKey() {
    return read("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  },
  get vapidPrivateKey() {
    return read("VAPID_PRIVATE_KEY");
  },
  get vapidSubject() {
    return read("VAPID_SUBJECT");
  },
  get channelSyncSecret() {
    return read("CHANNEL_SYNC_SECRET");
  },
  get beds24ApiUrl() {
    return read("BEDS24_API_URL");
  },
  get turnstileSecretKey() {
    return read("TURNSTILE_SECRET_KEY");
  },
  get wompiPublicKey() {
    return read("WOMPI_PUBLIC_KEY");
  },
  get wompiPrivateKey() {
    return read("WOMPI_PRIVATE_KEY");
  },
  get wompiEventsSecret() {
    return read("WOMPI_EVENTS_SECRET");
  },
  get wompiIntegritySecret() {
    return read("WOMPI_INTEGRITY_SECRET");
  },
  get paymentsProvider() {
    return read("PAYMENTS_PROVIDER");
  },
  get allowPaymentSimulator() {
    return read("ALLOW_PAYMENT_SIMULATOR") === "1";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};

// Sin estas la app no funciona; las demás activan integraciones opcionales (correo, push, pagos, Booking…).
const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"];
const OPTIONAL: Record<string, string[]> = {
  "correos (Resend)": ["RESEND_API_KEY"],
  "avisos push": ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"],
  "sincronización con Booking": ["CHANNEL_SYNC_SECRET"],
};

// Revisión al arrancar (src/instrumentation.ts): avisa en el log lo que falta, sin tumbar el servidor.
export function checkEnv() {
  const missing = REQUIRED.filter((n) => !read(n));
  if (missing.length) console.error(`[env] Faltan variables obligatorias: ${missing.join(", ")}. La app no podrá leer la base de datos.`);
  for (const [feature, names] of Object.entries(OPTIONAL)) {
    const off = names.filter((n) => !read(n));
    if (off.length) console.warn(`[env] ${feature} desactivado: falta ${off.join(", ")}.`);
  }
}
