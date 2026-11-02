"use client";

// Empleados del panel (solo administradores): cuentas del equipo, su rol, su acceso y su contraseña inicial.
import { useCallback, useEffect, useState } from "react";
import {
  BanIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  IdCardIcon,
  PencilIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
  TrashIcon,
  UserPlusIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { api } from "@/lib/client/api";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/permissions";
import { fmtDate, dateOf, timeAgo } from "@/lib/format";
import type { ApiResult, Employee, EmployeeInput, PanelRole } from "@/lib/types";
import { useAdmin } from "@/components/admin/context";
import { MODULES } from "@/components/admin/routes";
import { Avatar, RoleBadge, RoleCapabilities, displayName } from "@/components/admin/account";
import { Paginator, usePaged } from "@/components/admin/paginator";
import { adminInput, norm } from "@/components/admin/shared";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  FieldError,
  IconButton,
  Modal,
  ModalPresence,
  PageHeader,
  Segmented,
  Skeleton,
  StatCard,
  Switch,
} from "@/components/admin/ui";

type Filter = "todos" | PanelRole | "inactivos";
type Draft = { id?: string; name: string; email: string; role: PanelRole; password: string; active: boolean };

const ROLES: PanelRole[] = ["recepcion", "admin"];

// Mensaje de los rechazos del servidor que no son de un campo.
const REFUSAL: Record<string, string> = {
  SELF_LOCKOUT: "No puedes quitarte tu propio acceso de administrador ni desactivar o borrar tu cuenta.",
  LAST_ADMIN: "Debe quedar al menos un administrador activo.",
};

// Contraseña inicial legible (sin caracteres que se confunden: 0/O, 1/l/I).
function newPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const n = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(n, (x) => chars[x % chars.length]).join("");
}

export function EmployeesView() {
  const { data, ask, onAuthError, now } = useAdmin();
  const [list, setList] = useState<Employee[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");

  const load = useCallback(
    () =>
      api.admin.employees
        .list()
        .then((r) => {
          if (r.status === 401 || r.status === 403) return onAuthError();
          if (r.status !== 200 || !Array.isArray(r.data)) throw 0;
          setFailed(false);
          setList(r.data);
        })
        .catch(() => setFailed(true)),
    [onAuthError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const all = list ?? [];
  const nq = norm(q.trim());
  const shown = all.filter(
    (e) => (filter === "todos" || (filter === "inactivos" ? !e.active : e.active && e.role === filter)) && (!nq || norm(`${e.name} ${e.email}`).includes(nq)),
  );
  const paged = usePaged(shown, "empleados", `${filter}|${nq}`);
  const active = all.filter((e) => e.active);

  // Desactivar quita el acceso sin borrar la cuenta; activar lo devuelve. La propia cuenta no se puede desactivar.
  const toggle = (e: Employee) =>
    ask({
      title: e.active ? "Desactivar la cuenta" : "Activar la cuenta",
      text: e.active
        ? `${displayName(e)} no podrá entrar al panel hasta que la vuelvas a activar. La cuenta y su historial se conservan.`
        : `${displayName(e)} podrá volver a entrar al panel con su correo y su contraseña.`,
      details: [
        { k: "Correo", v: e.email },
        { k: "Rol", v: ROLE_LABEL[e.role] },
      ],
      okLabel: e.active ? "Desactivar" : "Activar",
      danger: e.active,
      done: e.active ? "Cuenta desactivada" : "Cuenta activada",
      run: async () => {
        const r = await api.admin.employees.update({ id: e.id, active: !e.active });
        if (r.status === 200 && Array.isArray(r.data)) setList(r.data);
        const code = (r.data as { error?: string } | null)?.error;
        return (code && REFUSAL[code] ? { status: r.status, data: { fields: { cuenta: REFUSAL[code] } } } : r) as ApiResult<unknown>;
      },
    });
  const toggleButton = (e: Employee) =>
    e.id !== data.me.id && (
      <Button size="sm" variant="ghost" icon={e.active ? <BanIcon size={14} /> : <CheckIcon size={14} />} onClick={() => toggle(e)}>
        {e.active ? "Desactivar" : "Activar"}
        <span className="sr-only">{` a ${displayName(e)}`}</span>
      </Button>
    );

  const remove = (e: Employee) =>
    ask({
      title: "Borrar la cuenta",
      text: `${displayName(e)} ya no podrá entrar al panel. Si solo quieres quitarle el acceso por un tiempo, desactívala.`,
      details: [
        { k: "Correo", v: e.email },
        { k: "Rol", v: ROLE_LABEL[e.role] },
      ],
      okLabel: "Borrar cuenta",
      danger: true,
      done: "Cuenta borrada",
      run: async () => {
        const r = await api.admin.employees.remove(e.id);
        if (r.status === 200 && Array.isArray(r.data)) {
          setList(r.data);
          setEditing(null);
        }
        const code = (r.data as { error?: string } | null)?.error;
        return (code && REFUSAL[code] ? { status: r.status, data: { fields: { cuenta: REFUSAL[code] } } } : r) as ApiResult<unknown>;
      },
    });

  return (
    <>
      <PageHeader
        title={MODULES.empleados.label}
        description="Cada persona del equipo entra con su propio correo y contraseña. El rol decide qué puede ver y hacer en el panel."
        actions={
          <Button
            variant="primary"
            icon={<UserPlusIcon size={15} />}
            onClick={() => setEditing({ name: "", email: "", role: "recepcion", password: newPassword(), active: true })}
          >
            Nuevo empleado
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard accent="pink" label="Cuentas activas" value={list ? active.length : "—"} hint="pueden entrar al panel" icon={<UsersIcon size={15} />} />
        <StatCard
          accent="yellow"
          label="Administradores"
          value={list ? active.filter((e) => e.role === "admin").length : "—"}
          hint="todo el panel"
          icon={<ShieldIcon size={15} />}
        />
        <StatCard
          accent="blue"
          label="Recepción"
          value={list ? active.filter((e) => e.role === "recepcion").length : "—"}
          hint="el día a día"
          icon={<IdCardIcon size={15} />}
        />
      </div>

      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-[320px]">
            <SearchIcon size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Buscar empleados"
              placeholder="Buscar por nombre o correo"
              className={`${adminInput} pl-9`}
            />
          </div>
          <Segmented
            label="Mostrar"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "todos", label: "Todos", count: all.length },
              { value: "admin", label: "Administradores" },
              { value: "recepcion", label: "Recepción" },
              { value: "inactivos", label: "Desactivados", count: all.length - active.length || undefined },
            ]}
          />
        </div>

        {failed ? (
          <ErrorState
            title="No pudimos cargar los empleados"
            text="Revisa tu conexión e inténtalo de nuevo."
            onRetry={() => {
              setFailed(false);
              load();
            }}
          />
        ) : !list ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : shown.length ? (
          <>
            <div className="hidden overflow-hidden rounded-[18px] bg-paper/60 lg:block">
              <table className="w-full text-[14px]">
                <thead className="border-b border-line text-left text-[12px] font-semibold text-ink-muted">
                  <tr>
                    {["Empleado", "Rol", "Estado", "Último ingreso", "Creada"].map((h) => (
                      <th key={h} scope="col" className="px-4 py-2.5 font-semibold">
                        {h}
                      </th>
                    ))}
                    <th scope="col">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {paged.rows.map((e) => (
                    // Desactivada: los datos se atenúan, las acciones no (para que «Activar» se vea disponible).
                    <tr key={e.id} className={e.active ? "" : "[&>td:not(:last-child)]:opacity-60"}>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-3">
                          <Avatar user={e} size={36} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-2 font-semibold text-ink">
                              <span className="truncate">{displayName(e)}</span>
                              {e.id === data.me.id && <Badge>Tú</Badge>}
                            </span>
                            <span className="block truncate text-[12.5px] text-ink-muted">{e.email}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={e.role} />
                      </td>
                      <td className="px-4 py-3">{e.active ? <Badge tone="success">Activa</Badge> : <Badge>Desactivada</Badge>}</td>
                      <td className="px-4 py-3 text-ink-muted">{e.lastSignInAt ? timeAgo(e.lastSignInAt, now) : "Nunca"}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{fmtDate(dateOf(e.createdAt), true)}</td>
                      <td className="pr-3">
                        <div className="flex items-center justify-end gap-1">
                          {toggleButton(e)}
                          <IconButton
                            label={`Editar a ${displayName(e)}`}
                            size="sm"
                            onClick={() => setEditing({ id: e.id, name: e.name, email: e.email, role: e.role, password: "", active: e.active })}
                          >
                            <PencilIcon size={15} />
                          </IconButton>
                          {e.id !== data.me.id && (
                            <IconButton label={`Borrar la cuenta de ${displayName(e)}`} size="sm" variant="danger-ghost" onClick={() => remove(e)}>
                              <TrashIcon size={15} />
                            </IconButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="flex flex-col gap-2 lg:hidden">
              {paged.rows.map((e) => (
                // En el celular, activar o desactivar va en su propia fila: así el nombre y el correo conservan su espacio.
                <li key={e.id} className="overflow-hidden rounded-[18px] bg-paper/60">
                  <button
                    type="button"
                    onClick={() => setEditing({ id: e.id, name: e.name, email: e.email, role: e.role, password: "", active: e.active })}
                    className={`flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-paper ${e.active ? "" : "opacity-60"}`}
                  >
                    <Avatar user={e} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold text-ink">{displayName(e)}</span>
                      <span className="block truncate text-[12.5px] text-ink-muted">{e.email}</span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        <RoleBadge role={e.role} />
                        {!e.active && <Badge>Desactivada</Badge>}
                        {e.id === data.me.id && <Badge>Tú</Badge>}
                      </span>
                    </span>
                    <PencilIcon size={15} className="flex-none text-ink-subtle" />
                  </button>
                  {e.id !== data.me.id && <div className="flex justify-end border-t border-line px-2 py-1.5">{toggleButton(e)}</div>}
                </li>
              ))}
            </ul>
            <Paginator p={paged} noun="cuentas" />
          </>
        ) : (
          <EmptyState
            icon={<UsersIcon size={18} />}
            title={all.length ? "Nadie coincide con la búsqueda" : "Aún no hay empleados"}
            text={all.length ? "Prueba con otro nombre o cambia el filtro." : "Crea una cuenta para cada persona del equipo."}
          />
        )}
      </Card>

      <section aria-labelledby="em-roles" className="flex flex-col gap-3">
        <div>
          <h2 id="em-roles" className="text-[17px] font-bold tracking-[-0.01em] text-ink">
            Roles del panel
          </h2>
          <p className="text-[13.5px] text-ink-muted">Lo que incluye cada rol. La API y la base de datos aplican las mismas reglas.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(["admin", "recepcion"] as PanelRole[]).map((role) => (
            <Card key={role} aria-labelledby={`em-role-${role}`} className="flex flex-col gap-4 p-4 sm:p-5">
              <CardHeader
                id={`em-role-${role}`}
                icon={role === "admin" ? <ShieldIcon size={18} /> : <IdCardIcon size={18} />}
                accent={role === "admin" ? "pink" : "blue"}
                title={ROLE_LABEL[role]}
                subtitle={ROLE_HINT[role]}
              />
              <RoleCapabilities role={role} />
            </Card>
          ))}
        </div>
      </section>

      <ModalPresence>
        {editing && (
          <EmployeeEditor
            key={editing.id ?? "nuevo"}
            initial={editing}
            isSelf={editing.id === data.me.id}
            onClose={() => setEditing(null)}
            onSaved={(l) => {
              setList(l);
              setEditing(null);
            }}
            onDelete={editing.id && editing.id !== data.me.id ? () => remove(all.find((e) => e.id === editing.id)!) : undefined}
          />
        )}
      </ModalPresence>
    </>
  );
}

/* ───────────── Crear / editar ───────────── */

function EmployeeEditor({
  initial,
  isSelf,
  onClose,
  onSaved,
  onDelete,
}: {
  initial: Draft;
  isSelf: boolean;
  onClose: () => void;
  onSaved: (list: Employee[]) => void;
  onDelete?: () => void;
}) {
  const { toast, onAuthError } = useAdmin();
  const [d, setD] = useState(initial);
  const [show, setShow] = useState(!initial.id);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const isNew = !initial.id;
  const set = (p: Partial<Draft>) => {
    setD((x) => ({ ...x, ...p }));
    setError("");
  };

  const local: Record<string, string> = {
    name: d.name.trim().length < 2 ? "Escribe el nombre (2 a 80 caracteres)." : "",
    email: isNew && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()) ? "Escribe un correo válido." : "",
    password: (isNew || d.password) && d.password.length < 8 ? "Mínimo 8 caracteres." : "",
  };
  const err = (k: string) => errors[k] || (tried ? local[k] : "") || undefined;

  async function save() {
    setTried(true);
    if (busy || Object.values(local).some(Boolean)) return;
    setBusy(true);
    setErrors({});
    const body: EmployeeInput = isNew
      ? { email: d.email.trim().toLowerCase(), name: d.name.trim(), role: d.role, password: d.password }
      : {
          id: d.id,
          ...(d.name.trim() !== initial.name && { name: d.name.trim() }),
          ...(d.role !== initial.role && { role: d.role }),
          ...(d.active !== initial.active && { active: d.active }),
          ...(d.password && { password: d.password }),
        };
    try {
      const r = isNew ? await api.admin.employees.create(body) : await api.admin.employees.update(body);
      if (r.status === 401 || r.status === 403) return onAuthError();
      if ((r.status !== 200 && r.status !== 201) || !Array.isArray(r.data)) {
        const res = r.data as { error?: string; fields?: Record<string, string> } | null;
        if (res?.fields) setErrors(res.fields);
        else setError((res?.error && REFUSAL[res.error]) || "No se pudo guardar. Inténtalo de nuevo.");
        return;
      }
      toast(isNew ? `Cuenta creada para ${d.name.trim()}` : "Cambios guardados");
      onSaved(r.data);
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="em-title" initialFocus="input" className="m-auto w-[calc(100%-32px)] max-w-[560px] rounded-[26px] p-0">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-full bg-pink text-ink">
              {isNew ? <UserPlusIcon size={18} /> : <PencilIcon size={17} />}
            </span>
            <div className="pt-1">
              <h2 id="em-title" className="text-[18px] font-bold tracking-[-0.02em] text-ink">
                {isNew ? "Nuevo empleado" : `Editar a ${initial.name || initial.email}`}
              </h2>
              <p className="text-[13.5px] text-ink-muted">
                {isNew ? "La cuenta queda lista para entrar con el correo y la contraseña inicial." : initial.email}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre" error={err("name")} className={isNew ? "" : "sm:col-span-2"}>
              {(p) => <input {...p} value={d.name} maxLength={80} autoComplete="off" onChange={(e) => set({ name: e.target.value })} className={adminInput} />}
            </Field>
            {isNew && (
              <Field label="Correo" error={err("email")}>
                {(p) => (
                  <input
                    {...p}
                    type="email"
                    value={d.email}
                    maxLength={160}
                    autoComplete="off"
                    onChange={(e) => set({ email: e.target.value })}
                    className={adminInput}
                  />
                )}
              </Field>
            )}
          </div>

          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1.5 text-[13px] font-semibold text-ink">Rol</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ROLES.map((role) => {
                const on = d.role === role;
                return (
                  <label
                    key={role}
                    className={`flex cursor-pointer flex-col gap-1 rounded-[18px] border p-3.5 transition-colors ${on ? "border-ink bg-paper" : "border-line-strong hover:bg-paper/60"} ${isSelf && role !== d.role ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                      <input
                        type="radio"
                        name="em-role"
                        value={role}
                        checked={on}
                        disabled={isSelf && role !== d.role}
                        onChange={() => set({ role })}
                        className="size-4 accent-[var(--color-ink)]"
                      />
                      {ROLE_LABEL[role]}
                    </span>
                    <span className="text-[12.5px] leading-snug text-ink-muted">{ROLE_HINT[role]}</span>
                  </label>
                );
              })}
            </div>
            {isSelf && <p className="text-[12.5px] text-ink-muted">Tu propio rol no se puede cambiar desde aquí.</p>}
          </fieldset>

          <Field
            label={isNew ? "Contraseña inicial" : "Nueva contraseña (opcional)"}
            hint={isNew ? "Entrégasela a la persona; podrá cambiarla en «Mi perfil»." : "Déjala vacía para no cambiarla."}
            error={err("password")}
          >
            {(p) => (
              <div className="flex gap-2">
                <input
                  {...p}
                  type={show ? "text" : "password"}
                  value={d.password}
                  autoComplete="new-password"
                  onChange={(e) => set({ password: e.target.value })}
                  className={`${adminInput} min-w-0 flex-1 font-mono`}
                />
                <IconButton label={show ? "Ocultar la contraseña" : "Mostrar la contraseña"} variant="secondary" onClick={() => setShow(!show)}>
                  {show ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </IconButton>
                <IconButton
                  label="Generar otra contraseña"
                  variant="secondary"
                  onClick={() => {
                    set({ password: newPassword() });
                    setShow(true);
                  }}
                >
                  <RefreshIcon size={16} />
                </IconButton>
              </div>
            )}
          </Field>

          {!isNew && (
            <div className="rounded-[18px] border border-line px-4 py-3">
              <Switch
                checked={d.active}
                onChange={(v) => set({ active: v })}
                disabled={isSelf}
                label="Cuenta activa"
                description={isSelf ? "No puedes desactivar tu propia cuenta." : "Desactivada, no puede entrar al panel. Se puede reactivar cuando quieras."}
              />
            </div>
          )}
          {error && <FieldError>{error}</FieldError>}
        </div>
        <div className="flex flex-col-reverse gap-2 rounded-b-[26px] border-t border-line bg-canvas/70 px-5 py-3.5 sm:flex-row sm:items-center sm:px-6">
          {onDelete && (
            <Button variant="danger-ghost" icon={<TrashIcon size={14} />} onClick={onDelete} className="sm:mr-auto">
              Borrar cuenta
            </Button>
          )}
          <Button onClick={onClose} className="sm:ml-auto">
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={busy} icon={<CheckIcon size={14} />}>
            {isNew ? "Crear cuenta" : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
