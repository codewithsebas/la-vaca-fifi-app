// Contenido de la página de inicio. Las fotos de cada experiencia se suben desde el panel (hueco exp-<id>).
import type { ServiceIcon } from "./service-icons";

export const EXPERIENCES = [
  { id: "jacuzzi", label: "Jacuzzi al aire libre" },
  { id: "estrellas", label: "Noches bajo las estrellas" },
  { id: "desayuno", label: "Desayuno con vista" },
  { id: "fogata", label: "Fogata y vino" },
  { id: "nevado", label: "Nevado del Ruiz" },
];

// Servicios por defecto: los mismos que siembra la migración «servicios_del_sitio». Desde el panel se crean, editan,
// ocultan, ordenan y eliminan (tabla site_services); estos solo se usan si la base de datos no responde.
export const DEFAULT_SERVICES: { title: string; icon: ServiceIcon; description?: string; note?: string }[] = [
  { title: "Domo geodésico", icon: "domo" },
  { title: "Jacuzzi privado al aire libre", icon: "jacuzzi" },
  { title: "Cielo estrellado", icon: "estrellas" },
  { title: "Cama king", icon: "cama" },
  { title: "Baño privado con ducha", icon: "ducha" },
  { title: "Calefacción", icon: "calefaccion" },
  { title: "Desayuno en tu domo", icon: "desayuno" },
  { title: "Terraza con vista a las montañas", icon: "montana" },
  { title: "Zona de fogata", icon: "fogata" },
  { title: "Minibar", icon: "minibar" },
  { title: "Juegos de mesa", icon: "juegos" },
  { title: "Parqueadero privado", icon: "parqueadero" },
  { title: "Pet friendly, sin costo", icon: "mascota" },
  { title: "Vino y decoración para ocasiones", icon: "corazon", note: "Valor adicional" },
];
