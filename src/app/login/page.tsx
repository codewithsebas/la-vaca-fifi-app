import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginPage } from "@/components/admin/login";
import { panelNext } from "@/lib/panel-next";
import { isRole } from "@/lib/permissions";
import { createSessionClient } from "@/lib/supabase/server";

// ¿Hay una sesión del equipo (admin o recepción)? Sin la configuración de Supabase (demo con datos en el navegador) o
// si falla la consulta, se muestra el formulario como siempre.
async function hasStaffSession() {
  try {
    const sb = await createSessionClient();
    const { data } = await sb.auth.getClaims();
    return isRole((data?.claims?.app_metadata as { role?: string } | undefined)?.role);
  } catch {
    return false;
  }
}

// Ingreso del equipo. El panel manda aquí cuando no hay sesión (/login?next=/admin/...) y, al entrar, vuelve a esa ruta.
// Con la sesión ya abierta no se vuelve a pedir: pasa directo al panel (o a la ruta de ?next=).
export default async function Page({ searchParams }: PageProps<"/login">) {
  if (await hasStaffSession()) redirect(panelNext((await searchParams).next));
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
