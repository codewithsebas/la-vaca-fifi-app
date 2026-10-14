import { notFound } from "next/navigation";
import { ClientDetail } from "@/components/admin/clients";
import { clientKeyOf } from "@/components/admin/routes";

export default async function ClientPage({ params }: PageProps<"/admin/clientes/[cliente]">) {
  const key = clientKeyOf(decodeURIComponent((await params).cliente));
  if (!key) notFound();
  return <ClientDetail clientKey={key} />;
}
