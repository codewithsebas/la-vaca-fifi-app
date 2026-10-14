import type { Metadata, Viewport } from "next";
import { Alegreya_SC, Bebas_Neue, Caveat, Manrope } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import { SiteProvider } from "@/components/site-provider";
import { config } from "@/lib/config";
import { getSiteCabins } from "@/lib/server/cabins";
import { getSiteContent } from "@/lib/server/site";
import "./globals.css";

const bebas = Bebas_Neue({ variable: "--font-bebas", weight: "400", subsets: ["latin"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const caveat = Caveat({ variable: "--font-caveat", weight: ["500", "600"], subsets: ["latin"] });
// La letra del letrero (romana con versalitas): solo para el nombre de la marca.
const alegreyaSc = Alegreya_SC({ variable: "--font-alegreya-sc", weight: "800", subsets: ["latin"] });

// Las páginas se regeneran cada hora o al guardar contenido en el panel (revalidatePath).
export const revalidate = 3600;

export const metadata: Metadata = {
  title: { default: config.name, template: `%s | ${config.name}` },
  description: "Cabañas y restaurante de finca a 5 minutos de Murillo, Tolima: baño privado, balcón con vista a la montaña y desayuno incluido.",
  openGraph: { locale: "es_CO", siteName: config.name, type: "website" },
  // PWA: los íconos salen de app/favicon.ico, app/icon.tsx y app/apple-icon.tsx (el logo, lib/app-icon.tsx); el manifiesto, de app/manifest.webmanifest.
  manifest: "/manifest.webmanifest",
  applicationName: config.name,
  appleWebApp: { capable: true, title: "La Vaca Fifí", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#22301C",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [content, cabins] = await Promise.all([getSiteContent(), getSiteCabins()]);
  return (
    <html lang="es" data-scroll-behavior="smooth" className={`${bebas.variable} ${manrope.variable} ${caveat.variable} ${alegreyaSc.variable}`}>
      <body>
        <SiteProvider content={content} cabins={cabins}>
          {children}
        </SiteProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
