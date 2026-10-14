import { appIcon } from "@/lib/app-icon";

// Ícono del panel en la pantalla de inicio de iPhone/iPad: colores invertidos para no confundirlo con el sitio.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIcon(180, { theme: "panel", shape: "square" });
}
