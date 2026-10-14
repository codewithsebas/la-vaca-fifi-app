import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentSimulator } from "@/components/payment-simulator";

export const metadata: Metadata = {
  title: "Pasarela de pagos simulada",
  robots: { index: false, follow: false },
};

// Checkout de pruebas (solo desarrollo o ALLOW_PAYMENT_SIMULATOR=1): reemplaza a Wompi mientras no haya llaves.
export default function PaymentSimulatorPage() {
  return (
    <main className="gutter-860 flex flex-col gap-5 pt-6 pb-[72px]">
      <Suspense>
        <PaymentSimulator />
      </Suspense>
    </main>
  );
}
