// Cabañas tal como las ve el huésped. Lo usan las páginas públicas (lo publicado) y la vista previa del panel.
import { rateFrom } from "@/lib/booking";
import { fallbackCabins, shortCabinName, type Cabin } from "@/lib/config";
import type { CabinType } from "@/lib/types";

const toPublicCabin = (t: CabinType): Cabin => ({
  id: t.id,
  name: shortCabinName(t.nombre),
  full: t.nombre,
  couple: rateFrom(t).price,
  fromGuests: rateFrom(t).guests,
  extra: t.personaAdicional,
  tiers: t.preciosPersonas && Object.keys(t.preciosPersonas).length ? t.preciosPersonas : undefined,
  max: t.maxPersonas,
  badge: t.badge,
  description: t.descripcion,
  features: t.caracteristicas,
  photos: t.fotos,
});

// Solo las activas, en el orden del panel. Una cabaña sin fotos subidas muestra las del diseño de su tipo (public/fotos), si las hay.
export const publicCabins = (types: CabinType[]): Cabin[] =>
  types
    .filter((t) => t.activa)
    .map(toPublicCabin)
    .map((c) => (c.photos.length ? c : { ...c, photos: fallbackCabins.find((f) => f.id === c.id)?.photos ?? [] }));
