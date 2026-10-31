import { appIcon } from "@/lib/app-icon";

// Ícono de la pestaña del navegador (además de app/favicon.ico): el logo redondo.
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return appIcon(192);
}
