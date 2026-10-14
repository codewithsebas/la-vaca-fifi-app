import { appIcon, type IconShape, type IconTheme } from "@/lib/app-icon";

// Íconos PNG de los manifiestos de la PWA (/icons/icon-512.png, /icons/panel-maskable-512.png…). Se generan en el build.
const ICONS: Record<string, { size: number; theme: IconTheme; shape: IconShape }> = {
  "icon-192.png": { size: 192, theme: "site", shape: "rounded" },
  "icon-512.png": { size: 512, theme: "site", shape: "rounded" },
  "maskable-512.png": { size: 512, theme: "site", shape: "maskable" },
  "panel-192.png": { size: 192, theme: "panel", shape: "rounded" },
  "panel-512.png": { size: 512, theme: "panel", shape: "rounded" },
  "panel-maskable-512.png": { size: 512, theme: "panel", shape: "maskable" },
  // Ícono pequeño de las notificaciones push en la barra de estado de Android.
  "badge-96.png": { size: 96, theme: "badge", shape: "square" },
};

export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(ICONS).map((name) => ({ name }));

export async function GET(_req: Request, ctx: RouteContext<"/icons/[name]">) {
  const { name } = await ctx.params;
  const icon = ICONS[name];
  if (!icon) return new Response(null, { status: 404 });
  return appIcon(icon.size, icon);
}
