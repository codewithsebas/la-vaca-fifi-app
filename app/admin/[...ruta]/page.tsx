import { notFound } from "next/navigation";

// Cualquier otra dirección bajo /admin muestra el «no encontrado» del panel (con su menú), no el del sitio.
export default function UnknownAdminPage() {
  notFound();
}
