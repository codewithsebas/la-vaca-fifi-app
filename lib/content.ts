// Contenido de la página de inicio. Las fotos de cada experiencia se suben desde el panel (hueco exp-<id>).
import type { ServiceIcon } from "./service-icons";

export const EXPERIENCES = [
  { id: "restaurante", label: "Restaurante y café de finca" },
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
