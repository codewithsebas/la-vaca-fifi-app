import type { Metadata } from "next";
import { LandingPreview } from "@/components/landing/landing-preview";

export const metadata: Metadata = {
  title: { absolute: "Vista previa del sitio" },
  robots: { index: false, follow: false },
};

// La página de inicio con el borrador del panel. Se abre dentro de Contenido del sitio.
export default function PreviewPage() {
  return <LandingPreview />;
}
