import { NextResponse, type NextRequest } from "next/server";

// Modo «solo panel» (SOLO_PANEL=1): mientras el sitio público no esté contratado, solo se publica el panel.
// Las páginas del sitio redirigen a /admin y su API responde 404. Siguen abiertas las rutas del panel y el despachador de
// avisos push (lo llama la base de datos).
const ABIERTAS = ["/admin", "/api/admin", "/api/push", "/icon", "/apple-icon", "/icons", "/correo", "/manifest.webmanifest"];

const abierta = (path: string) => ABIERTAS.some((p) => path === p || path.startsWith(`${p}/`));

export function proxy(req: NextRequest) {
  if (process.env.SOLO_PANEL !== "1") return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (abierta(pathname)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.redirect(new URL("/admin", req.url));
}

// Fuera del proxy: archivos de Next y todo lo que tenga extensión (fotos, logo, sw.js, offline.html…).
export const config = { matcher: ["/((?!_next/|.*\\.[a-zA-Z0-9]+$).*)"] };
