import type { Metadata } from "next";
import { config } from "@/lib/config";
import { getSite } from "@/lib/server/site";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: `Política de tratamiento de datos personales de ${config.name}, conforme a la Ley 1581 de 2012.`,
  openGraph: { title: `Política de privacidad · ${config.name}` },
};

const h2 = "text-[1.1rem] font-extrabold";

export default async function PrivacyPage() {
  const { c } = await getSite();
  return (
    <main className="flex flex-col gap-5 gutter-860 pt-6 pb-[72px] leading-[1.6]">
      <h1 className="page-title">
        <span>Política de tratamiento</span> <span className="text-accent">de datos personales</span>
      </h1>
      <p className="rounded-md bg-surface px-4 py-3 text-[.9rem]">
        Plantilla conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013. Completa los campos entre llaves y haz que la revise un abogado antes de publicarla.
      </p>
      <section className="flex flex-col gap-3.5 rounded-lg bg-card p-[clamp(20px,4vw,36px)] text-on-light">
        <h2 className={h2}>1. Responsable del tratamiento</h2>
        <p>
          {"{RAZON_SOCIAL}"} (en adelante, «{c.name}»), identificado con NIT {"{NIT}"}, con domicilio en {c.address}. Correo: {c.correoReservas}. Teléfono:{" "}
          {c.phones[0]}.
        </p>
        <h2 className={h2}>2. Datos que recolectamos</h2>
        <p>
          Nombre completo, tipo y número de documento, correo, celular, ciudad de procedencia, hora estimada de llegada, información sobre mascotas,
          preferencias de decoración y solicitudes especiales que nos compartas al reservar.
        </p>
        <h2 className={h2}>3. Finalidades</h2>
        <ul className="list-disc pl-5">
          <li>Gestionar tu reserva, el abono, el check-in y el check-out.</li>
          <li>Cumplir obligaciones legales del sector turismo, como el registro de huéspedes.</li>
          <li>Comunicarnos contigo por correo, llamada o WhatsApp sobre tu estadía.</li>
          <li>Enviarte promociones, solo si lo autorizaste de forma expresa.</li>
        </ul>
        <h2 className={h2}>4. Derechos del titular</h2>
        <p>
          Puedes conocer, actualizar, rectificar y suprimir tus datos; solicitar prueba de la autorización; ser informado sobre su uso; revocar la autorización
          y presentar quejas ante la Superintendencia de Industria y Comercio.
        </p>
        <h2 className={h2}>5. Cómo ejercer tus derechos</h2>
        <p>
          Escribe a {config.correoReservas} con tu nombre, documento y la solicitud. Respondemos consultas en máximo 10 días hábiles y reclamos en máximo 15
          días hábiles, según la ley.
        </p>
        <h2 className={h2}>6. Seguridad y conservación</h2>
        <p>
          Aplicamos medidas técnicas y administrativas para proteger tus datos. Los conservamos durante el tiempo necesario para las finalidades descritas y las
          obligaciones legales.
        </p>
        <h2 className={h2}>7. Vigencia</h2>
        <p>Esta política rige desde el {"{FECHA_DE_VIGENCIA}"}. Publicaremos aquí cualquier cambio.</p>
      </section>
    </main>
  );
}
