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
  get turnstileSecretKey() {
    return read("TURNSTILE_SECRET_KEY");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};

// Sin estas la app no funciona; las demás activan integraciones opcionales (correo, push).
const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"];
const OPTIONAL: Record<string, string[]> = {
  "correos (Resend)": ["RESEND_API_KEY"],
  "avisos push": ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"],
};

// Proyecto de Supabase de cada entorno. APP_ENV dice dónde corre la app (qa | pdn); en desarrollo local es QA siempre.
const SUPABASE_PROJECTS = { qa: "tknhymkjuxmohywwaxnv", pdn: "menpgghjhztsswnmpzjk" } as const;

// Candado entre entornos: si la base no corresponde al entorno, el servidor no arranca (nunca QA contra PDN ni al revés).
function assertEnvironment() {
  const appEnv = read("APP_ENV") ?? (process.env.NODE_ENV === "production" ? undefined : "qa");
  if (!appEnv) return console.warn("[env] APP_ENV no está definido (qa | pdn): no se puede comprobar que la base sea la del entorno.");
  if (appEnv !== "qa" && appEnv !== "pdn") throw new Error(`[env] APP_ENV="${appEnv}" no es válido: usa qa o pdn.`);
  const url = read("NEXT_PUBLIC_SUPABASE_URL") ?? "";
  const other = appEnv === "qa" ? "pdn" : "qa";
  if (url.includes(SUPABASE_PROJECTS[other]) || !url.includes(SUPABASE_PROJECTS[appEnv]))
    throw new Error(`[env] Entorno ${appEnv.toUpperCase()} apuntando a una base que no es la suya. Revisa NEXT_PUBLIC_SUPABASE_URL.`);
}

// Revisión al arrancar (src/instrumentation.ts): el candado de entorno detiene el arranque; lo demás solo avisa en el log.
export function checkEnv() {
  assertEnvironment();
  const missing = REQUIRED.filter((n) => !read(n));
  if (missing.length) console.error(`[env] Faltan variables obligatorias: ${missing.join(", ")}. La app no podrá leer la base de datos.`);
  for (const [feature, names] of Object.entries(OPTIONAL)) {
    const off = names.filter((n) => !read(n));
    if (off.length) console.warn(`[env] ${feature} desactivado: falta ${off.join(", ")}.`);
  }
}
