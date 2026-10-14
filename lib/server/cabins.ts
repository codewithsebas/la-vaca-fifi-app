import "server-only";
import { cache } from "react";
import { fallbackCabins, shortCabinName, type Cabin } from "@/lib/config";
import type { CabinType } from "@/lib/types";
import { createServiceClient, hasServiceConfig } from "@/lib/supabase/server";
import { loadCabinTypes } from "./db";

export const toPublicCabin = (t: CabinType): Cabin => ({
  id: t.id,
  name: shortCabinName(t.nombre),
  full: t.nombre,
  couple: t.precioPareja,
  extra: t.personaAdicional,
  max: t.maxPersonas,
  badge: t.badge,
  description: t.descripcion,
  features: t.caracteristicas,
  photos: t.fotos,
});

// Domos activos para las páginas públicas, en el orden del panel. Si Supabase no responde, los de config.
export const getSiteCabins = cache(async (): Promise<Cabin[]> => {
  if (!hasServiceConfig()) return fallbackCabins;
  try {
    const { types } = await loadCabinTypes(createServiceClient(), { activeOnly: true });
    return types.map(toPublicCabin);
  } catch (e) {
    console.error("No se pudieron leer los domos de Supabase:", e);
    return fallbackCabins;
  }
});
