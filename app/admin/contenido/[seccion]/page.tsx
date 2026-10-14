import { notFound } from "next/navigation";
import { ContentSection } from "@/components/admin/content";
import { isContentSection } from "@/components/admin/routes";

export default async function SiteContentSectionPage({ params }: PageProps<"/admin/contenido/[seccion]">) {
  const { seccion } = await params;
  if (!isContentSection(seccion)) notFound();
  return <ContentSection id={seccion} />;
}
