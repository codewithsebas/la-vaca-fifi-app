import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Caveat, Manrope, Source_Code_Pro } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import { SiteProvider } from "@/components/site-provider";
import { config } from "@/lib/config";
import { getSiteCabins } from "@/lib/server/cabins";
import { getSiteContent } from "@/lib/server/site";
import "./globals.css";

const bebas = Bebas_Neue({ variable: "--font-bebas", weight: "400", subsets: ["latin"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const caveat = Caveat({ variable: "--font-caveat", weight: ["500", "600"], subsets: ["latin"] });
// La letra del logo («Stellarium» junto a la S de estrellas): solo para el nombre de la marca.
const sourceCode = Source_Code_Pro({ variable: "--font-source-code", weight: "400", subsets: ["latin"] });

// Las páginas se regeneran cada hora o al guardar contenido en el panel (revalidatePath).
export const revalidate = 3600;

export const metadata: Metadata = {
  title: { default: config.name, template: `%s | ${config.name}` },
  description: "Glamping en domos geodésicos con jacuzzi privado, a 2.950 metros de altura en Murillo, Tolima.",
  openGraph: { locale: "es_CO", siteName: config.name, type: "website" },
  // PWA: los íconos salen de app/favicon.ico, app/icon.tsx y app/apple-icon.tsx (el logo, lib/app-icon.tsx); el manifiesto, de app/manifest.webmanifest.
  manifest: "/manifest.webmanifest",
  applicationName: config.name,
  appleWebApp: { capable: true, title: "Stellarium", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#1A1F3A",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [content, cabins] = await Promise.all([getSiteContent(), getSiteCabins()]);
  return (
    <html lang="es" data-scroll-behavior="smooth" className={`${bebas.variable} ${manrope.variable} ${caveat.variable} ${sourceCode.variable}`}>
      <body>
        <SiteProvider content={content} cabins={cabins}>
          {children}
        </SiteProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
