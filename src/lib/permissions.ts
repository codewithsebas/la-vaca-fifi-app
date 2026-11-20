import type { PanelRole } from "@/lib/types";

// Permisos del panel por rol. El superadministrador puede todo; el administrador, todo menos el registro de actividad y
// las cuentas de superadministradores; recepción opera el día a día. La API aplica el mismo criterio
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
  | "import" // importar reservas
  | "activity"; // registro de actividad del equipo (solo superadministradores)

const RECEPCION: Permission[] = [];

const SUPERADMIN_ONLY: Permission[] = ["activity"];

// Administrador del negocio: «admin» o «superadmin» (lo que antes era solo de «admin»).
export const isAdminRole = (role: PanelRole | null | undefined) => role === "admin" || role === "superadmin";

export const can = (role: PanelRole | null | undefined, p: Permission) =>
  role === "superadmin" || (role === "admin" && !SUPERADMIN_ONLY.includes(p)) || (role === "recepcion" && RECEPCION.includes(p));

// Quién puede crear, editar, desactivar o borrar una cuenta con ese rol (o darle ese rol): las de superadministrador, solo
// otro superadministrador; las demás, cualquier administrador.
export const canManageRole = (actor: PanelRole | null | undefined, target: PanelRole) =>
  actor === "superadmin" || (actor === "admin" && target !== "superadmin");

export const ROLE_LABEL: Record<PanelRole, string> = { superadmin: "Superadministrador", admin: "Administrador", recepcion: "Recepción" };
export const ROLE_HINT: Record<PanelRole, string> = {
  superadmin: "Todo lo del administrador, más el registro de actividad del equipo y las cuentas de otros superadministradores.",
  admin: "Todo el panel, incluidos empleados, tarifas, cabañas, contenido del sitio y finanzas.",
  recepcion:
    "Reservas, calendario, pagos, check-in y check-out, clientes, bloqueos y baños. Sin finanzas, tarifas, cabañas, contenido del sitio, cancelaciones ni eliminaciones.",
};
export const isRole = (v: unknown): v is PanelRole => v === "superadmin" || v === "admin" || v === "recepcion";

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
  { label: "Registro de actividad e inicios de sesión", perm: "activity" },
];
