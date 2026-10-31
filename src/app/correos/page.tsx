import type { Metadata } from "next";
import { EmailPreview } from "@/components/email-preview";

export const metadata: Metadata = {
  title: "Plantillas de correo",
  robots: { index: false, follow: false },
};

export default function EmailsPage() {
  return <EmailPreview />;
}
