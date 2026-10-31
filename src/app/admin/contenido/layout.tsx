import { ContentLayout } from "@/components/admin/content";

// Las secciones de contenido son rutas propias, pero comparten un solo formulario: los cambios sin guardar se conservan al cambiar de sección.
export default function SiteContentLayout({ children }: LayoutProps<"/admin/contenido">) {
  return <ContentLayout>{children}</ContentLayout>;
}
