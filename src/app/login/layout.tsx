import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { PANEL_THEME_CSS } from "@/components/admin/panel-theme";
import { config } from "@/lib/config";

// Ingreso al panel en su propia página: la misma letra y los mismos colores del panel (app/admin/layout.tsx).
const adminFont = Plus_Jakarta_Sans({ variable: "--font-admin", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { absolute: `Iniciar sesión | ${config.name}` },
  robots: { index: false, follow: false },
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Panel Vaca Fifí", statusBarStyle: "default" },
};

// La barra del navegador en el celular toma el crema del fondo del panel.
export const viewport: Viewport = { themeColor: "#f7f2e8" };

export default function LoginLayout({ children }: LayoutProps<"/login">) {
  return (
    <div className={`${adminFont.variable} admin-theme`}>
      <style dangerouslySetInnerHTML={{ __html: PANEL_THEME_CSS }} />
      {children}
    </div>
  );
}
