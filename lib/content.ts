// Contenido de la página de inicio. Las fotos de cada experiencia se suben desde el panel (hueco exp-<id>); la del
// restaurante (exp-restaurante) va en su propia sección.
import type { ServiceIcon } from "@/lib/service-icons";

export const EXPERIENCES = [
  { id: "desayuno", label: "Desayuno con vista a la montaña" },
  { id: "parque", label: "Parque infantil" },
  { id: "jardines", label: "Jardines y flores" },
  { id: "finca", label: "Ambiente de finca tradicional" },
];

// Servicios por defecto: los mismos que siembra la migración «servicios_del_sitio». Desde el panel se crean, editan,
// ocultan, ordenan y eliminan (tabla site_services); estos solo se usan si la base de datos no responde.
export const DEFAULT_SERVICES: { title: string; icon: ServiceIcon; description?: string; note?: string }[] = [
  { title: "Desayuno americano incluido", icon: "desayuno" },
  { title: "Baño privado con agua caliente", icon: "ducha" },
  { title: "Balcón con vista a la montaña", icon: "montana" },
  { title: "TV de pantalla plana", icon: "tv" },
  { title: "Wifi en toda la finca", icon: "wifi" },
  { title: "Restaurante y café", icon: "restaurante" },
  { title: "Zona de fogata", icon: "fogata" },
  { title: "Parque infantil", icon: "parque" },
  { title: "Jardines", icon: "flores" },
  { title: "Parqueadero privado gratis", icon: "parqueadero" },
  { title: "Pet friendly, sin costo", icon: "mascota" },
  { title: "Celebraciones y eventos", icon: "corazon", note: "Se cotiza aparte" },
];

// Lo que distingue a La Vaca Fifí, en las etiquetas (aretes) bajo la portada.
export const HIGHLIGHTS = ["Desayuno americano incluido", "Mascotas sin costo", "Parqueadero gratis", "Wifi", "Parque infantil"];

// Calificación de los huéspedes en Booking.com (octubre de 2026), para la insignia de la portada.
export const RATING = { score: "9,2", source: "Booking.com", reviews: 242 };
