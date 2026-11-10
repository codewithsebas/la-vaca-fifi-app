import type { Metadata } from "next";
import { LandingView } from "@/components/landing/landing-view";
import { siteViewport } from "@/components/site/site-theme";
import { config, type Cabin } from "@/lib/config";
import { cop } from "@/lib/format";
import { getSiteCabins } from "@/lib/server/cabins";
import { getSite } from "@/lib/server/site";
import type { SiteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: `${config.name} · Cabañas, restaurante y café en Murillo, Tolima` },
  description:
    "Cabañas de colores con baño privado, balcón con vista a la montaña y desayuno americano incluido, a 5 minutos de Murillo, Tolima. Restaurante y café de comida casera, parque infantil y pet friendly. Reserva en línea.",
  openGraph: {
    title: `${config.name} · Murillo, Tolima`,
    description: "Duerme rico y come mejor donde Fifí: cabañas, restaurante y café a 5 minutos de Murillo.",
  },
  twitter: { card: "summary_large_image" },
};

// Página estática que se regenera cada hora o al guardar tarifas en el panel.
export const revalidate = 3600;

export function generateViewport() {
  return siteViewport();
}

function jsonLd(cabins: Cabin[], site: SiteConfig) {
  const prices = cabins.length ? cabins.map((c) => c.couple) : [0];
  return {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: config.name,
    description: config.tagline,
    telephone: "+57 " + site.phones[0],
    address: {
      "@type": "PostalAddress",
      streetAddress: config.street,
      addressLocality: config.city,
      addressRegion: config.region,
      addressCountry: config.country,
    },
    geo: { "@type": "GeoCoordinates", latitude: config.lat, longitude: config.lng },
    priceRange: `${cop(Math.min(...prices))} - ${cop(Math.max(...prices))} COP por noche`,
    checkinTime: site.checkInStart,
    checkoutTime: site.checkOutTime,
    petsAllowed: true,
    currenciesAccepted: "COP",
  };
}

export default async function HomePage() {
  const [cabins, { c: site, photos, texts, services }] = await Promise.all([getSiteCabins(), getSite()]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(cabins, site)).replace(/</g, "\\u003c") }} />
      <LandingView cabins={cabins} site={site} photos={photos} texts={texts} services={services} />
    </>
  );
}
