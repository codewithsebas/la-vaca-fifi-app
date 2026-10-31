import type { Metadata } from "next";
import { Suspense } from "react";
import { LookupForm } from "@/components/booking/lookup-form";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: "Mi reserva",
  description: `Consulta el estado de tu reserva en ${config.name} con tu código y tu correo.`,
  openGraph: { title: `Consulta tu reserva · ${config.name}`, description: "Estado, fechas, montos y fecha límite del abono de tu reserva." },
};

export default function MyReservationPage() {
  return (
    <main className="flex flex-col gap-5 gutter-1000 pt-6 pb-[72px]">
      <h1 className="page-title">
        <span>Consulta</span> <span className="text-accent">tu reserva</span>
      </h1>
      <Suspense>
        <LookupForm />
      </Suspense>
    </main>
  );
}
