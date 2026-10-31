import { appIcon } from "@/lib/app-icon";

// Ícono al agregar el sitio a la pantalla de inicio en iPhone/iPad (iOS redondea las esquinas).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIcon(180, { shape: "square" });
}
