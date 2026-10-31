import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/shell";
import { siteViewport } from "@/components/site-theme";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: { absolute: `Panel de reservas | ${config.name}` },
  robots: { index: false, follow: false },
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Panel Vaca Fifí", statusBarStyle: "black" },
};

// El panel usa los colores del sitio: la barra del navegador en el celular toma el del encabezado.
export function generateViewport() {
  return siteViewport();
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminShell>{children}</AdminShell>;
}
