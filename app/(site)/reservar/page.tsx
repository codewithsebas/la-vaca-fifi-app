import type { Metadata } from "next";
import { Suspense } from "react";
import { ReservationWizard } from "@/components/reservar/wizard";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: { absolute: `Reservar | ${config.name} · Murillo, Tolima` },
  description: "Reserva tu domo geodésico con jacuzzi privado en Murillo, Tolima. Elige fechas y domo, y confirma con tu abono en línea.",
  openGraph: { title: `Reservar | ${config.name}`, description: "Elige fechas y domo, y reserva en línea en Murillo, Tolima." },
  robots: { index: false },
};

export default function ReservePage() {
  return (
    <Suspense fallback={<div className="min-h-[70vh]" />}>
      <ReservationWizard />
    </Suspense>
  );
}
