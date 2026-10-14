import { notFound } from "next/navigation";
import { CabinEditor } from "@/components/admin/cabins";

export default async function EditCabinPage({ params }: PageProps<"/admin/domos/[id]">) {
  const id = decodeURIComponent((await params).id);
  if (!/^[a-z0-9-]{2,40}$/.test(id)) notFound();
  return <CabinEditor id={id} />;
}
