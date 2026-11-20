// Ruta del panel a la que se vuelve después de entrar (?next= de /login). Solo se aceptan rutas del propio panel, para
// que el enlace no pueda llevar a otro sitio; cualquier otra cosa lleva al inicio del panel.
export const panelNext = (next: unknown) => (typeof next === "string" && /^\/admin(\/|$|\?)/.test(next) && !next.startsWith("//") ? next : "/admin");
