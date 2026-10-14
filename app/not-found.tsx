import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SiteTheme } from "@/components/site-theme";

export const metadata: Metadata = {
  title: "Página no encontrada",
  description: "La página que buscas no existe. Reserva tu cabaña en La Vaca Fifí, a 5 minutos de Murillo, Tolima.",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteTheme />
      <SiteHeader />
      <main className="gutter-1000 flex flex-1 flex-col items-start gap-[18px] pt-12 pb-20">
        <p className="-rotate-3 font-script text-[1.8rem]">Esta vaca se salió del potrero</p>
        <h1 className="display text-[clamp(3.4rem,10vw,8rem)] leading-[.88]">
          <span className="block">Error 404</span>
          <span className="block text-accent">página no encontrada</span>
        </h1>
        <p className="max-w-[46ch] text-[1.1rem]">La página que buscas no existe o cambió de dirección. Las cabañas siguen en su sitio, a 5 minutos de Murillo.</p>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/reservar" className="btn btn-card min-h-14 px-7">
            Reservar cabaña →
          </Link>
          <Link href="/" className="btn btn-outline-dark min-h-14 px-7">
            Ir al inicio
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
