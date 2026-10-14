import type { Metadata } from "next";
import { config } from "@/lib/config";
import { wa } from "@/lib/format";
import { BALANCE_MINUTES, HOLD_MINUTES } from "@/lib/payments";
import { getSite } from "@/lib/server/site";

export const metadata: Metadata = {
  title: "Políticas de reserva",
  description: `Términos de reserva de ${config.name}: abono, horarios de check-in y check-out, cambios de fecha, mascotas y responsabilidades.`,
  openGraph: { title: `Políticas de reserva · ${config.name}`, description: "Abono del 30 %, horarios, cambios de fecha y mascotas." },
};

const h2 = "text-[1.15rem] font-extrabold";

export default async function PoliciesPage() {
  const { c } = await getSite();
  return (
    <main className="gutter-860 flex flex-col gap-5 pt-6 pb-[72px] leading-[1.6]">
      <h1 className="page-title">
        <span>Políticas</span> <span className="text-accent">de reserva</span>
      </h1>
      <p className="max-w-[62ch]">Estas condiciones aplican a todas las reservas de {c.name}. Al enviar una solicitud de reserva aceptas lo siguiente.</p>
      <section className="flex flex-col gap-[18px] rounded-lg bg-card p-[clamp(20px,4vw,36px)] text-on-light">
        <h2 className={h2}>Horarios</h2>
        <p>
          Check-in: {c.checkIn}. Check-out: {c.checkOut}.
        </p>
        <h2 className={h2}>Abono, confirmación y saldo</h2>
        <p>
          La reserva se confirma cuando se aprueba el pago en línea del abono del {c.depositPct} % del valor total, o del valor total si prefieres pagarlo de una vez. Mientras pagas, las fechas quedan apartadas durante {HOLD_MINUTES} minutos; si el pago no se aprueba en ese tiempo, se liberan.
        </p>
        <p>
          El saldo se puede pagar en línea en cualquier momento antes de llegar, o después del check-in con un plazo de {BALANCE_MINUTES / 60} hora desde que se registra tu llegada. Si el plazo vence, el saldo se paga en recepción. El check-out se realiza con el saldo pagado.
        </p>
        {c.policies.map((p) => (
          <div key={p.id} className="contents">
            <h2 className={h2}>{p.q}</h2>
            <p className="whitespace-pre-line">{p.a}</p>
          </div>
        ))}
        <h2 className={h2}>Tarifas</h2>
        <p>
          Las tarifas incluyen 2 personas. Desde la 3.ª persona se cobra un valor adicional por persona y por noche. Adultos y niños cuentan igual para la capacidad y la tarifa. La decoración para ocasiones especiales tiene un valor adicional que se cotiza aparte.
        </p>
      </section>
      <p>
        ¿Dudas?{" "}
        <a href={wa(c.whatsapp)} target="_blank" rel="noopener" className="font-extrabold underline">
          Escríbenos por WhatsApp
        </a>
        .
      </p>
    </main>
  );
}
