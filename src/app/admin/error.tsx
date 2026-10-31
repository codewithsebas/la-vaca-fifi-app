"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ErrorState, PageHeader, buttonClass } from "@/components/admin/ui";

// Un error al mostrar una página del panel no tumba el panel: la navegación y los datos siguen disponibles.
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <>
      <PageHeader title="Algo salió mal" />
      <ErrorState
        text="No pudimos mostrar esta página. Tus datos no se perdieron: puedes reintentar o volver al Dashboard."
        onRetry={retry}
        action={
          <Link href="/admin" className={buttonClass()}>
            Ir al Dashboard
          </Link>
        }
      />
    </>
  );
}
