import type { Metadata } from "next";
import { Suspense } from "react";
import { ReservationWizard } from "@/components/booking/wizard";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: { absolute: `Reservar | ${config.name} · Murillo, Tolima` },
  description: "Reserva tu cabaña en La Vaca Fifí, a 5 minutos de Murillo, Tolima. Elige fechas y cabaña, y confirma con tu abono en línea.",
  openGraph: { title: `Reservar | ${config.name}`, description: "Elige fechas y cabaña, y reserva en línea en Murillo, Tolima." },
  robots: { index: false },
};

export default function ReservePage() {
  return (
    <Suspense fallback={<div className="min-h-[70vh]" />}>
      <ReservationWizard />
    </Suspense>
  );
}
