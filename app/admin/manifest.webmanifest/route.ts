import { manifestResponse, panelManifest } from "@/lib/pwa";

// Manifiesto de la PWA del panel (enlazado desde el metadata de app/admin/layout.tsx).
export const dynamic = "force-static";

export const GET = () => manifestResponse(panelManifest);
