// JavaScript plano: así Next no tiene que compilar la config con SWC (en Hostinger solo carga la versión WASM).
// Fotos del sitio servidas desde Supabase Storage (bucket público site-images).
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : undefined;

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Hostinger arranca el servidor standalone (.next/standalone/server.js).
  output: "standalone",
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, port: "", pathname: "/storage/v1/object/public/site-images/**", search: "" }]
      : [],
    // 90 para las fotos del sitio (PhotoSlot); 75 queda para miniaturas del panel.
    qualities: [75, 90],
  },
  // PWA: el service worker nunca se guarda en caché (así cada despliegue llega a los celulares) y solo ejecuta código propio.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
