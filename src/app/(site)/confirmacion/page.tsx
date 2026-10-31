import type { Metadata } from "next";
import { Suspense } from "react";
import { Confirmation } from "@/components/booking/confirmation";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: "Estado de tu pago",
  description: `Resultado del pago de tu reserva en ${config.name}.`,
  robots: { index: false },
};

export default function ConfirmationPage() {
  return (
    <main className="flex flex-col gap-5 gutter-1000 pt-6 pb-[72px]">
      <Suspense>
        <Confirmation />
      </Suspense>
    </main>
  );
}
