import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { SiteTheme, siteViewport } from "@/components/site/site-theme";

export function generateViewport() {
  return siteViewport();
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-ui flex min-h-screen flex-col text-on-light">
      <SiteTheme />
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
