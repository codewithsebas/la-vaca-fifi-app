import { manifestResponse, siteManifest } from "@/lib/pwa";

// Manifiesto de la PWA del sitio (enlazado desde el metadata del layout raíz).
export const dynamic = "force-static";

export const GET = () => manifestResponse(siteManifest);
