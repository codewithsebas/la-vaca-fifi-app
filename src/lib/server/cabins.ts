import "server-only";
import { cache } from "react";
import { fallbackCabins, type Cabin } from "@/lib/config";
import { publicCabins } from "@/lib/public-cabins";
import { createServiceClient, hasServiceConfig } from "@/lib/supabase/server";
import { loadCabinTypes } from "@/lib/server/db";

// Cabañas activas para las páginas públicas, en el orden del panel. Si Supabase no responde, las de config.
export const getSiteCabins = cache(async (): Promise<Cabin[]> => {
  if (!hasServiceConfig()) return fallbackCabins;
  try {
    const { types } = await loadCabinTypes(createServiceClient(), { activeOnly: true });
    return publicCabins(types);
  } catch (e) {
    console.error("No se pudieron leer las cabañas de Supabase:", e);
    return fallbackCabins;
  }
});
