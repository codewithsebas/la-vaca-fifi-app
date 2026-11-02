import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";
import { env } from "@/lib/server/env";

export class MissingSupabaseConfig extends Error {
  constructor(name: string) {
    super(`Falta la variable de entorno ${name}`);
  }
}

// Sesión del equipo (cookies). Respeta RLS: solo ve datos si el usuario tiene app_metadata.role = "admin" o "recepcion".
export async function createSessionClient() {
  const { supabaseUrl: url, supabasePublishableKey: publishableKey } = env;
  if (!url || !publishableKey) throw new MissingSupabaseConfig(!url ? "NEXT_PUBLIC_SUPABASE_URL" : "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const cookieStore = await cookies();
  return createServerClient<Database>(url, publishableKey, {
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

export const hasServiceConfig = () => !!(env.supabaseUrl && env.supabaseSecretKey);
