"use client";

import Link from "next/link";
import { Card, EmptyState, PageHeader, buttonClass } from "@/components/admin/ui";
import { SearchIcon } from "@/components/icons";

// Rutas del panel que no existen (o un detalle con un identificador inválido): se muestra dentro del panel.
export default function AdminNotFound() {
  return (
    <>
      <PageHeader title="Página no encontrada" />
      <Card className="p-4">
        <EmptyState
          icon={<SearchIcon size={18} />}
          title="Esta dirección no existe en el panel"
          text="Puede que el enlace esté incompleto o que lo que buscas se haya eliminado. Usa el menú para ir a cualquier módulo."
          action={
            <Link href="/admin" className={buttonClass("primary")}>
              Ir al Dashboard
            </Link>
          }
        />
      </Card>
    </>
  );
}
