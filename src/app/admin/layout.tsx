import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AdminShell } from "@/components/admin/shell";
import { config } from "@/lib/config";

// Tipografía del panel: geométrica y legible en tamaños pequeños (tablas, etiquetas). El sitio conserva la suya.
const adminFont = Plus_Jakarta_Sans({ variable: "--font-admin", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { absolute: `Panel de reservas | ${config.name}` },
  robots: { index: false, follow: false },
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Panel Vaca Fifí", statusBarStyle: "default" },
};

// La barra del navegador en el celular toma el crema del fondo del panel.
export const viewport: Viewport = { themeColor: "#f7f2e8" };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className={`${adminFont.variable} admin-theme`}>
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
