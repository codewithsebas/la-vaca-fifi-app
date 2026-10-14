import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { MARK_FIFI, MARK_FIFI_VIEWBOX } from "@/components/icons";

// Íconos de la app (pestaña, pantalla de inicio, PWA) y logo de los correos: el logo, Fifí en su sello azul.
// "site": el logo (sitio de reservas). "panel": el logo más pequeño sobre la tinta de Fifí, para distinguir la app del
// equipo cuando ambas quedan instaladas en el mismo celular. "badge": silueta blanca de Fifí, sobre transparente, para
// la barra de estado de Android en las notificaciones push (el sistema solo usa la forma, así que el logo ilustrado no
// sirve ahí).

export type IconTheme = "site" | "panel" | "badge";
// rounded: esquinas transparentes (pestaña y "any" de la PWA) · square: a sangre, el sistema redondea (iOS)
// maskable: a sangre y con el logo dentro de la zona segura (círculo del 80 %) que Android recorta.
export type IconShape = "rounded" | "square" | "maskable";

// El logo ya viene recortado en círculo, con las esquinas transparentes.
const LOGO = `data:image/png;base64,${await readFile(join(process.cwd(), "public/logo-la-vaca-fifi.png"), "base64")}`;

// Fondo y fracción del ancho que ocupa el logo. El sitio, a sangre, va sobre el azul del sello; el panel, sobre la tinta.
const LAYOUT: Record<Exclude<IconTheme, "badge">, { bg: string; fill: Record<IconShape, number> }> = {
  site: { bg: "#2FA8E0", fill: { rounded: 1, square: 0.94, maskable: 0.8 } },
  panel: { bg: "#221A16", fill: { rounded: 0.74, square: 0.7, maskable: 0.64 } },
};

export function appIcon(size: number, { theme = "site", shape = "rounded", headers }: { theme?: IconTheme; shape?: IconShape; headers?: HeadersInit } = {}) {
  const box = { display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center" } as const;
  if (theme === "badge") {
    const w = Math.round(size * 0.94);
    return new ImageResponse(
      (
        <div style={box}>
          <svg width={w} height={Math.round((w * 282) / 330)} viewBox={MARK_FIFI_VIEWBOX}>
            {MARK_FIFI.map((d) => (
              <path key={d} d={d} fill="#FFFFFF" fillRule="evenodd" />
            ))}
          </svg>
        </div>
      ),
      { width: size, height: size, headers },
    );
  }
  const { bg, fill } = LAYOUT[theme];
  const w = Math.round(size * fill[shape]);
  // El logo del sitio en forma redondeada ocupa todo el ícono: sin fondo, sus esquinas quedan transparentes.
  const background = theme === "site" && shape === "rounded" ? "transparent" : bg;
  return new ImageResponse(
    (
      <div style={{ ...box, background, borderRadius: shape === "rounded" ? size * 0.22 : 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse dibuja <img>, no next/image */}
        <img src={LOGO} width={w} height={w} alt="" />
      </div>
    ),
    { width: size, height: size, headers },
  );
}
