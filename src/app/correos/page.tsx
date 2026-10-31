import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmailPreview } from "@/components/dev/email-preview";

export const metadata: Metadata = {
  title: "Plantillas de correo",
  robots: { index: false, follow: false },
};

// Vista previa de las plantillas de correo: herramienta de desarrollo, no se publica en producción.
export default function EmailsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <EmailPreview />;
}
