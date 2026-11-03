"use client";

import { usePathname } from "next/navigation";

// Último tramo de la dirección. El panel lo lee de aquí y no del servidor: sin conexión, una sola copia de la página sirve para
// cualquier reserva, cliente o cabaña (public/sw.js).
export function useRouteParam() {
  const last = usePathname().split("/").filter(Boolean).pop() ?? "";
  return decodeURIComponent(last);
}
