import { notFound } from "next/navigation";
import { ReservationDetail } from "@/components/admin/reservation-detail";

export default async function ReservationPage({ params }: PageProps<"/admin/reservas/[codigo]">) {
  const code = decodeURIComponent((await params).codigo).toUpperCase();
  if (!/^[A-Z0-9]{2,5}-[A-Z0-9]{3,8}$/.test(code)) notFound();
  return <ReservationDetail code={code} />;
}
