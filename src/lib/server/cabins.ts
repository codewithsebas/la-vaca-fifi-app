import "server-only";
import { cache } from "react";
import { fallbackCabins, shortCabinName, type Cabin } from "@/lib/config";
import type { CabinType } from "@/lib/types";
import { createServiceClient, hasServiceConfig } from "@/lib/supabase/server";
import { loadCabinTypes } from "@/lib/server/db";

const toPublicCabin = (t: CabinType): Cabin => ({
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

// Cabañas activas para las páginas públicas, en el orden del panel. Si Supabase no responde, las de config. Una cabaña
// sin fotos subidas muestra las del diseño de su tipo (public/fotos), si las hay.
export const getSiteCabins = cache(async (): Promise<Cabin[]> => {
  if (!hasServiceConfig()) return fallbackCabins;
  try {
    const { types } = await loadCabinTypes(createServiceClient(), { activeOnly: true });
    return types.map(toPublicCabin).map((c) => (c.photos.length ? c : { ...c, photos: fallbackCabins.find((f) => f.id === c.id)?.photos ?? [] }));
  } catch (e) {
    console.error("No se pudieron leer las cabañas de Supabase:", e);
    return fallbackCabins;
  }
});
