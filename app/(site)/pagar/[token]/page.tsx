import type { Metadata } from "next";
import { PayLink } from "@/components/pay-link";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: "Paga tu reserva",
  description: `Confirma tu reserva en ${config.name} con un pago seguro.`,
  robots: { index: false },
  referrer: "no-referrer",
};

// Enlace de pago que el equipo envía por WhatsApp (/pagar/<token>): la reserva ya está tomada y el huésped solo paga.
export default async function PayLinkPage({ params }: PageProps<"/pagar/[token]">) {
  const { token } = await params;
  return (
    <main className="gutter-1000 flex flex-col gap-5 pt-6 pb-[72px]">
      <PayLink token={token} />
    </main>
  );
}
