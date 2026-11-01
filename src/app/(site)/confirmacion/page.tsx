import { redirect } from "next/navigation";

// Enlaces antiguos (/confirmacion?code=… o el retorno de la pasarela de pagos) → «Mi reserva».
export default async function ConfirmationPage({ searchParams }: PageProps<"/confirmacion">) {
  const code = (await searchParams).code;
  redirect(typeof code === "string" && code ? `/mi-reserva?code=${encodeURIComponent(code)}` : "/mi-reserva");
}
