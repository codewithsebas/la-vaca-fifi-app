import type { Metadata } from "next";
import Link from "next/link";
import { Fifi } from "@/components/brand/fifi";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { SiteTheme } from "@/components/site/site-theme";

export const metadata: Metadata = {
  title: "Página no encontrada",
  description: "La página que buscas no existe. Reserva tu cabaña en La Vaca Fifí, a 5 minutos de Murillo, Tolima.",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div className="site-ui flex min-h-screen flex-col text-on-light">
      <SiteTheme />
      <SiteHeader />
      <main className="grid flex-1 items-center gap-8 gutter-1000 py-14 md:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]">
        <div className="flex flex-col items-start gap-5">
          <p className="rounded-full bg-[color-mix(in_srgb,var(--c-yellow)_22%,var(--color-card))] px-3.5 py-1 text-[.85rem] font-bold">Error 404</p>
          <h1 className="h-pro text-[clamp(2.2rem,5.5vw,3.6rem)] leading-[1.05]">
            Esta vaca se salió <span className="text-[#1f6fc4]">del potrero</span>
          </h1>
          <p className="max-w-[46ch] text-[1.05rem] text-on-light-muted">
            La página que buscas no existe o cambió de dirección. Las cabañas y el restaurante siguen en su sitio, a 5 minutos de Murillo.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/reservar" className="btn btn-cta min-h-12 px-6">
              Reservar cabaña →
            </Link>
            <Link href="/" className="btn btn-card min-h-12 px-6">
              Ir al inicio
            </Link>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[340px] motion-safe:animate-fifi-bob">
          <Fifi />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
