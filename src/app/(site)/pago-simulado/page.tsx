import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PaymentSimulator } from "@/components/booking/payment-simulator";
import { simulatorAllowed } from "@/lib/server/payments";

export const metadata: Metadata = {
  title: "Pasarela de pagos simulada",
  robots: { index: false, follow: false },
};

// Checkout de pruebas (solo desarrollo o ALLOW_PAYMENT_SIMULATOR=1): reemplaza a Wompi mientras no haya llaves.
// Se decide en cada petición para leer la variable en el servidor, no al compilar.
export default async function PaymentSimulatorPage() {
  await connection();
  if (!simulatorAllowed()) notFound();
  return (
    <main className="flex flex-col gap-5 gutter-860 pt-6 pb-[72px]">
      <Suspense>
        <PaymentSimulator />
      </Suspense>
    </main>
  );
}
