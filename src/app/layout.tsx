import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Lilita_One, Nunito } from "next/font/google";
import { ServiceWorker } from "@/components/site/service-worker";
import { SiteProvider } from "@/components/site/site-provider";
import { config } from "@/lib/config";
import { getSiteCabins } from "@/lib/server/cabins";
import { getSiteContent } from "@/lib/server/site";
import "@/app/globals.css";

// Las letras de Fifí: Lilita One para títulos y nombre (redonda y gruesa, como las letras del letrero) y Nunito para
// el texto (redondeada y fácil de leer).
const lilita = Lilita_One({ variable: "--font-lilita", weight: "400", subsets: ["latin"] });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"] });

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
  themeColor: "#FFF8EB",
};

// Apariencia del panel antes de pintar (components/admin/appearance.tsx), para que el modo oscuro no destelle en claro.
const ADMIN_THEME = `try{if(location.pathname.startsWith("/admin")){var p=localStorage.getItem("vf-admin-theme");document.documentElement.dataset.adminTheme=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light"}}catch(e){}`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [content, cabins] = await Promise.all([getSiteContent(), getSiteCabins()]);
  return (
    <html lang="es" data-scroll-behavior="smooth" className={`${lilita.variable} ${nunito.variable}`} suppressHydrationWarning>
      <body>
        <Script id="admin-theme" strategy="beforeInteractive">
          {ADMIN_THEME}
        </Script>
        <SiteProvider content={content} cabins={cabins}>
          {children}
        </SiteProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
