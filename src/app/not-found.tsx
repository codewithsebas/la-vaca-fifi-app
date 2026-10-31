import type { Metadata } from "next";
import Link from "next/link";
import { Lick } from "@/components/brand/decor";
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
    <div className="flex min-h-screen flex-col">
      <SiteTheme />
      <SiteHeader />
      <main className="grid flex-1 items-center gap-8 gutter-1000 py-14 md:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]">
        <div className="flex flex-col items-start gap-5">
          <p className="rounded-full border-[2.5px] border-on-dark bg-highlight px-4 py-1 font-extrabold text-on-light">Error 404</p>
          <h1 className="display text-[clamp(2.6rem,7vw,4.8rem)] leading-[1]">
            Esta vaca se salió <Lick>del potrero</Lick>
          </h1>
          <p className="max-w-[46ch] text-[1.1rem] font-semibold">
            La página que buscas no existe o cambió de dirección. Las cabañas y el restaurante siguen en su sitio, a 5 minutos de Murillo.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/reservar" className="btn btn-cta min-h-14 px-7">
              Reservar cabaña →
            </Link>
            <Link href="/" className="btn btn-card min-h-14 px-7">
              Ir al inicio
            </Link>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[380px] motion-safe:animate-fifi-bob">
          <Fifi />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
