import { appIcon } from "@/lib/app-icon";

// Logo de los correos en PNG (muchos clientes de correo no muestran SVG ni imágenes en data:). 96 px para pantallas retina.
export const dynamic = "force-static";

export function GET() {
  return appIcon(96, { headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
}
