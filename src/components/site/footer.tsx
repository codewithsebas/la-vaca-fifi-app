import { SiteFooterView } from "@/components/site/footer-view";
import { getSite } from "@/lib/server/site";

// Pie de página con lo publicado. El diseño está en footer-view.tsx, que también usa la vista previa del panel.
export async function SiteFooter({ tall = false }: { tall?: boolean } = {}) {
  const { c, texts } = await getSite();
  return <SiteFooterView c={c} texts={texts} tall={tall} />;
}
