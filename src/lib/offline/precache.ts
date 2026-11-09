// Prepara este dispositivo para abrir el panel sin internet: el service worker (public/sw.js) guarda las páginas y los archivos
// de la aplicación. Son públicos, sin datos: los datos viven en IndexedDB, por usuario.
import { CONTENT_SECTIONS, MODULES } from "@/components/admin/routes";

const PAGES = [
  ...new Set([
    ...Object.values(MODULES).map((m) => m.href),
    ...CONTENT_SECTIONS.map((s) => `/admin/contenido/${s.id}`),
    "/admin/cabanas/nueva",
    // Una copia por estructura de página (las mismas de public/sw.js): sirven para cualquier reserva, cliente o cabaña.
    "/admin/reservas/VF-00000",
    "/admin/clientes/cc-00000",
    "/admin/cabanas/plantilla",
  ]),
];

export async function precacheShell() {
  if (!("serviceWorker" in navigator)) return;
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((ok) => setTimeout(() => ok(null), 15000))]);
  reg?.active?.postMessage({ type: "vf-precache", pages: PAGES });
}
