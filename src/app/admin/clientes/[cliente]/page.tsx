import { notFound } from "next/navigation";
import { ClientRoute } from "@/components/admin/clients";
import { clientKeyOf } from "@/components/admin/routes";

export default async function ClientPage({ params }: PageProps<"/admin/clientes/[cliente]">) {
  const key = clientKeyOf(decodeURIComponent((await params).cliente));
  if (!key) notFound();
  return <ClientRoute />;
}
