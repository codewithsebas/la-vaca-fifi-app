// Íconos de los servicios (trazo de 24×24, mismo estilo del sitio). El panel los ofrece en un selector y cada servicio
// guarda solo la clave (site_services.icon). Agregar un ícono aquí lo deja disponible de inmediato.

// Círculo como trazo SVG (para combinar con otros trazos en un solo `d`).
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

export const SERVICE_ICONS = {
  cabana: { label: "Cabaña", d: "M2 11 12 4l10 7M5 9v11h14V9M2 20h20M10 20v-5h4v5M7 13h2M15 13h2" },
  restaurante: { label: "Restaurante", d: "M4 3v7a3 3 0 0 0 6 0V3M7 3v18M17 21V3c-2.5 1-4 3.5-4 7v3h4" },
  parque: { label: "Parque infantil", d: "M3 21 7 4h10l4 17M10 4v10M14 4v10M8.5 14h7" },
  flores: { label: "Jardín / flores", d: "M12 22v-9M12 13c-3-1-5-4-3-7 1.5 1 3 2.5 3 4 0-1.5 1.5-3 3-4 2 3 0 6-3 7zM12 18c-2-2.5-5-3-7-2 1 2.5 4 3.5 7 2zM12 18c2-2.5 5-3 7-2-1 2.5-4 3.5-7 2z" },
  estrellas: { label: "Cielo estrellado", d: "M10 3c.5 4 2.5 6 6.5 6.5-4 .5-6 2.5-6.5 6.5-.5-4-2.5-6-6.5-6.5 4-.5 6-2.5 6.5-6.5zM18 14v4M16 16h4M19.5 3v3M18 4.5h3M6 18v3M4.5 19.5h3" },
  chalet: { label: "Casa", d: "M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  aves: { label: "Aves", d: "M16 7h.01M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.3-2.3L2 20M20 7l2 .5-2 .5M10 18v3M14 17.8V21M7 18a6 6 0 0 0 3.8-10.6" },
  sendero: { label: "Sendero", d: "M4 16v-2.4C4 11.5 3 10.5 3 8c0-2.7 1.5-6 4.5-6C9.4 2 10 3.8 10 5.5c0 3.1-2 5.7-2 8.7V16a2 2 0 1 1-4 0ZM20 20v-2.4c0-2.1 1-3.1 1-5.6 0-2.7-1.5-6-4.5-6-1.9 0-2.5 1.8-2.5 3.5 0 3.1 2 5.7 2 8.7V20a2 2 0 1 0 4 0ZM16 17h4M4 13h4" },
  altillo: { label: "Altillo / escalera", d: "M7 3v18M17 3v18M7 7h10M7 12h10M7 17h10" },
  malla: { label: "Malla / hamaca", d: "M3 9h18l-2 8H5zM7.5 9l1.5 8M12 9v8M16.5 9 15 17M4 13h16" },
  cama: { label: "Cama", d: "M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9" },
  ducha: { label: "Baño / ducha", d: "M4 4l2.5 2.5M13.5 6.5a5 5 0 0 0-7 7M15 5 5 15M14 17v.01M10 16v.01M13 13v.01M16 10v.01M11 20v.01M17 14v.01M20 11v.01" },
  fogata: { label: "Fogata", d: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z" },
  parqueadero: {
    label: "Parqueadero",
    d: "M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2M9 17h6" + circle(7, 17, 2) + circle(17, 17, 2),
  },
  desayuno: { label: "Desayuno / café", d: "M10 2v2M14 2v2M6 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" },
  montana: { label: "Montaña / vista", d: "M8 3l4 8 5-5 5 15H2L8 3zM4.1 15.1c2.6-1.6 5.2-1.4 7.9.4 2.7 1.9 5.5 2 8.2.2" },
  mascota: {
    label: "Mascotas",
    d: circle(11, 4, 2) + circle(18, 8, 2) + circle(20, 16, 2) + "M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.8 1C6.5 17.5 4.5 16.8 4.5 16.8A3.5 3.5 0 0 1 5.5 10Z",
  },
  corazon: { label: "Ocasión especial", d: "M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z" },
  jacuzzi: { label: "Jacuzzi", d: "M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zM6.5 20 5.5 22M17.5 20l1 2" + circle(8, 8, 1.2) + circle(12, 5.5, 1.5) + circle(16, 8.5, 1.2) },
  minibar: { label: "Minibar / nevera", d: "M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM5 10h14M9 5.5v2M9 13v3" },
  wifi: { label: "Wifi", d: "M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0M12 20h.01" },
  tv: { label: "Televisión", d: "M4 5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 21h8M12 18v3" },
  cocina: { label: "Cocina", d: "M2 10h20M6 10V9a6 6 0 0 1 12 0v1M5 10v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8M12 3V2" },
  asado: { label: "Asado / BBQ", d: "M4 10h16a8 8 0 0 1-16 0zM8 17l-2 5M16 17l2 5M9 6c0-1 1-1.5 1-2.5M13 6c0-1 1-1.5 1-2.5" },
  chimenea: { label: "Chimenea", d: "M3 21h18M5 21V9h14v12M3 5h18v4H3zM9 21v-3a3 3 0 0 1 6 0v3" },
  calefaccion: { label: "Calefacción", d: "M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0zM12 9v6" },
  bosque: { label: "Bosque / naturaleza", d: "M12 22v-5M7 17h10l-3-4h2l-4-5h1.5L12 2 8.5 8H10l-4 5h2z" },
  agua: { label: "Cascada / agua", d: "M12 2.7l5.7 5.7a8 8 0 1 1-11.3 0z" },
  nieve: { label: "Frío / nevado", d: "M12 2v20M4.9 7l14.2 10M4.9 17 19.1 7M9 4l3 2 3-2M9 20l3-2 3 2" },
  sol: { label: "Sol / terraza", d: circle(12, 12, 4) + "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" },
  estrella: { label: "Destacado", d: "M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" },
  juegos: { label: "Juegos", d: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01" },
  musica: { label: "Música", d: "M9 18V5l12-2v13" + circle(6, 18, 3) + circle(18, 16, 3) },
  spa: { label: "Relax / spa", d: "M12 3c3 3 3 6 0 9-3-3-3-6 0-9zM3 12c3 0 6 1.5 9 6 3-4.5 6-6 9-6M12 18v3" },
  seguridad: { label: "Seguridad", d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" },
  reloj: { label: "Horario / 24 h", d: circle(12, 12, 9) + "M12 7v5l3 2" },
  regalo: { label: "Detalle / regalo", d: "M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z" },
  check: { label: "Genérico", d: circle(12, 12, 9) + "M8 12l3 3 5-6" },
} as const satisfies Record<string, { label: string; d: string }>;

export type ServiceIcon = keyof typeof SERVICE_ICONS;
export const SERVICE_ICON_KEYS = Object.keys(SERVICE_ICONS) as ServiceIcon[];
export const isServiceIcon = (v: unknown): v is ServiceIcon => typeof v === "string" && v in SERVICE_ICONS;
// Ícono de un servicio guardado (si la clave ya no existe, el genérico).
export const serviceIconPath = (icon: string) => (isServiceIcon(icon) ? SERVICE_ICONS[icon].d : SERVICE_ICONS.check.d);
