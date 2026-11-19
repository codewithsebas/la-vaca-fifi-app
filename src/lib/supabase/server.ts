import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";
import { env } from "@/lib/server/env";

export class MissingSupabaseConfig extends Error {
  constructor(name: string) {
    super(`Falta la variable de entorno ${name}`);
  }
}

// Encabezados de la operación del panel que la base de datos lee para el registro de actividad (activity_log): cuándo se
// hizo de verdad (algo hecho sin conexión llega después) y su clave de idempotencia. La base de datos los valida.
const FORWARD = ["x-occurred-at", "idempotency-key"];

async function forwarded(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const h = await headers();
    for (const k of FORWARD) {
      const v = h.get(k);
      if (v) out[k] = v.slice(0, 64);
    }
  } catch {
    // Fuera de una solicitud (no hay encabezados que reenviar).
  }
  return out;
}

// Sesión del equipo (cookies). Respeta RLS: solo ve datos si el usuario tiene app_metadata.role = "superadmin", "admin" o
// "recepcion".
export async function createSessionClient() {
  const { supabaseUrl: url, supabasePublishableKey: publishableKey } = env;
  if (!url || !publishableKey) throw new MissingSupabaseConfig(!url ? "NEXT_PUBLIC_SUPABASE_URL" : "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const cookieStore = await cookies();
  return createServerClient<Database>(url, publishableKey, {
    global: { headers: await forwarded() },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: las rutas /api refrescan la sesión.
        }
      },
    },
  });
}

// Clave secreta: se salta RLS. Solo para rutas públicas del servidor que hacen sus propias validaciones.
export function createServiceClient() {
  const { supabaseUrl: url, supabaseSecretKey: secretKey } = env;
  if (!url || !secretKey) throw new MissingSupabaseConfig(!url ? "NEXT_PUBLIC_SUPABASE_URL" : "SUPABASE_SECRET_KEY");
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// Clave secreta en nombre de alguien del equipo: para las rutas del panel que escriben sin RLS (Booking, importación,
// correos…). La base de datos atribuye esas escrituras a `actorId` en el registro de actividad; solo confía en ese
// encabezado cuando la solicitud usa la clave secreta.
export async function createActorClient(actorId: string) {
  const { supabaseUrl: url, supabaseSecretKey: secretKey } = env;
  if (!url || !secretKey) throw new MissingSupabaseConfig(!url ? "NEXT_PUBLIC_SUPABASE_URL" : "SUPABASE_SECRET_KEY");
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { ...(await forwarded()), "x-actor-id": actorId } },
  });
}

export const hasServiceConfig = () => !!(env.supabaseUrl && env.supabaseSecretKey);
