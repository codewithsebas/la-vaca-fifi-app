import type { PanelRole } from "@/lib/types";

// Permisos del panel por rol. El administrador puede todo; recepción opera el día a día. La API aplica el mismo criterio
// (y la base de datos, con RLS y triggers); en el panel decide qué módulos y acciones se muestran.
export type Permission =
  | "finance" // módulo Finanzas e ingresos
  | "rates" // tarifas, temporadas y condiciones de pago (abono)
  | "cabins" // crear y editar cabañas
  | "content" // contenido del sitio
  | "cancel" // cancelar reservas
  | "delete" // eliminar bloqueos, baños y registros
  | "bathrooms" // crear baños y asignarlos
  | "employees" // empleados
  | "import"; // importar reservas

const RECEPCION: Permission[] = [];

export const can = (role: PanelRole | null | undefined, p: Permission) => role === "admin" || (role === "recepcion" && RECEPCION.includes(p));

export const ROLE_LABEL: Record<PanelRole, string> = { admin: "Administrador", recepcion: "Recepción" };
export const ROLE_HINT: Record<PanelRole, string> = {
  admin: "Todo el panel, incluidos empleados, tarifas, cabañas, contenido del sitio y finanzas.",
  recepcion:
    "Reservas, calendario, pagos, check-in y check-out, clientes, bloqueos y baños. Sin finanzas, tarifas, cabañas, contenido del sitio, cancelaciones ni eliminaciones.",
};
export const isRole = (v: unknown): v is PanelRole => v === "admin" || v === "recepcion";

// Lo que incluye cada rol, en palabras del equipo (perfil y empleados). Sin `perm`: lo tienen todos los roles.
export const CAPABILITIES: { label: string; perm?: Permission }[] = [
  { label: "Reservas, calendario, check-in y check-out" },
  { label: "Registrar pagos y revisar comprobantes" },
  { label: "Clientes, bloqueos y estado de los baños" },
  { label: "Cancelar reservas", perm: "cancel" },
  { label: "Eliminar bloqueos, baños y registros", perm: "delete" },
  { label: "Finanzas e ingresos", perm: "finance" },
  { label: "Tarifas, temporadas y condiciones de pago", perm: "rates" },
  { label: "Crear y editar cabañas", perm: "cabins" },
  { label: "Contenido del sitio", perm: "content" },
  { label: "Importar reservas desde Excel", perm: "import" },
  { label: "Empleados y roles", perm: "employees" },
];
