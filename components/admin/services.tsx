"use client";

import { useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, EyeIcon, EyeOffIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { ServiceCard } from "@/components/service-card";
import { api } from "@/lib/api";
import { isMockApi } from "@/lib/config";
import { SERVICE_ICONS, SERVICE_ICON_KEYS, serviceIconPath } from "@/lib/service-icons";
import { SERVICE_LIMITS, type SiteService } from "@/lib/site";
import { useAdmin } from "./context";
import { adminInput } from "./shared";
import { themeStyle } from "./theme";
import { Badge, Button, Callout, Card, CardHeader, EmptyState, Field, IconButton, Modal, Switch } from "./ui";

// Servicios de «Servicios incluidos»: crear, editar, mostrar u ocultar, ordenar y eliminar. Cada cambio se publica
// de inmediato en el sitio (no usa la barra de guardado).

type Draft = Omit<SiteService, "id"> & { id?: string };
const EMPTY: Draft = { title: "", description: "", icon: "check", note: "", visible: true };

const Icon = ({ icon, size = 20 }: { icon: string; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={serviceIconPath(icon)} />
  </svg>
);

export function ServicesManager() {
  const { data, setData, ask, toast, onAuthError } = useAdmin();
  const services = data.site.services;
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const visible = services.filter((s) => s.visible);

  const apply = (list: SiteService[]) => setData((d) => ({ ...d, site: { ...d.site, services: list } }));
  // Ejecuta una operación y aplica la lista que devuelve el servidor (o deshace el cambio optimista si falla).
  async function run(key: string, call: () => Promise<{ status: number; data: SiteService[] | object | null }>, ok: string, undo?: SiteService[]) {
    setBusy(key);
    try {
      const r = await call();
      if (r.status === 401 || r.status === 403) return onAuthError();
      if (r.status !== 200 || !Array.isArray(r.data)) throw new Error();
      apply(r.data);
      toast(ok);
    } catch {
      if (undo) apply(undo);
      toast("No se pudo guardar el cambio. Inténtalo de nuevo.", "error");
    } finally {
      setBusy(null);
    }
  }

  const move = (i: number, dir: -1 | 1) => {
    const next = [...services];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    apply(next);
    void run(`move-${next[i + dir].id}`, () => api.admin.services.reorder(next.map((s) => s.id)), "Orden actualizado", services);
  };
  const toggle = (s: SiteService) => {
    const next = services.map((x) => (x.id === s.id ? { ...x, visible: !x.visible } : x));
    apply(next);
    void run(
      `vis-${s.id}`,
      () => api.admin.services.update({ ...s, visible: !s.visible }),
      s.visible ? `«${s.title}» quedó oculto` : `«${s.title}» ya se ve en el sitio`,
      services,
    );
  };
  const remove = (s: SiteService) =>
    ask({
      title: "Eliminar servicio",
      text: `«${s.title}» dejará de aparecer en el sitio. Si solo quieres quitarlo por un tiempo, mejor ocúltalo.`,
      okLabel: "Eliminar",
      danger: true,
      done: "Servicio eliminado",
      run: () => api.admin.services.remove(s.id),
    });

  return (
    <>
      <Callout>
        Los cambios se publican <strong>al instante</strong> en la sección «Servicios incluidos». Ocultar un servicio lo quita del sitio sin borrarlo.
        {isMockApi && <strong> En modo simulado se guardan solo en este navegador.</strong>}
      </Callout>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <Card aria-labelledby="sv-title" className="flex flex-col gap-4 p-4 sm:p-5">
          <CardHeader
            id="sv-title"
            icon={<CheckIcon size={18} />}
            title="Servicios"
            subtitle={`${services.length} en total · ${visible.length} visibles en el sitio`}
            actions={
              <Button
                variant="primary"
                size="sm"
                icon={<PlusIcon size={15} />}
                disabled={services.length >= SERVICE_LIMITS.max}
                onClick={() => setEditing({ ...EMPTY })}
              >
                Nuevo servicio
              </Button>
            }
          />
          {services.length ? (
            <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
              {services.map((s, i) => (
                <li key={s.id} className={`flex items-center gap-3 px-3 py-2.5 transition-opacity sm:px-4 ${s.visible ? "" : "bg-canvas/60"}`}>
                  <span
                    aria-hidden="true"
                    className={`grid size-10 flex-none place-items-center rounded-xl ${s.note ? "bg-warning-soft text-warning" : "bg-success-soft text-success"} ${s.visible ? "" : "opacity-50"}`}
                  >
                    <Icon icon={s.icon} />
                  </span>
                  <div className={`min-w-0 flex-1 ${s.visible ? "" : "opacity-60"}`}>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] font-semibold text-ink">
                      <span className="truncate">{s.title}</span>
                      {s.note && <Badge tone="warning">{s.note}</Badge>}
                      {!s.visible && <Badge>Oculto</Badge>}
                    </p>
                    {s.description && <p className="truncate text-[12.5px] text-ink-muted">{s.description}</p>}
                  </div>
                  <div className="flex flex-none items-center gap-0.5">
                    <IconButton
                      label={s.visible ? `Ocultar «${s.title}»` : `Mostrar «${s.title}»`}
                      size="sm"
                      disabled={!!busy}
                      onClick={() => toggle(s)}
                      aria-pressed={!s.visible}
                    >
                      {s.visible ? <EyeIcon size={16} /> : <EyeOffIcon size={16} />}
                    </IconButton>
                    <IconButton label={`Subir «${s.title}»`} size="sm" disabled={!!busy || i === 0} onClick={() => move(i, -1)}>
                      <ArrowUpIcon size={15} />
                    </IconButton>
                    <IconButton label={`Bajar «${s.title}»`} size="sm" disabled={!!busy || i === services.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDownIcon size={15} />
                    </IconButton>
                    <IconButton label={`Editar «${s.title}»`} size="sm" disabled={!!busy} onClick={() => setEditing({ ...s })}>
                      <PencilIcon size={15} />
                    </IconButton>
                    <IconButton label={`Eliminar «${s.title}»`} size="sm" variant="danger-ghost" disabled={!!busy} onClick={() => remove(s)}>
                      <TrashIcon size={15} />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<CheckIcon size={18} />}
              title="Aún no hay servicios"
              text="Agrega lo que incluye la estadía: desayuno, parqueadero, wifi…"
              action={
                <Button variant="primary" icon={<PlusIcon size={15} />} onClick={() => setEditing({ ...EMPTY })}>
                  Nuevo servicio
                </Button>
              }
            />
          )}
        </Card>

        {/* Así se ven en el sitio (solo los visibles, en orden) */}
        <section aria-labelledby="sv-prev" className="flex flex-col gap-2 xl:sticky xl:top-20">
          <h3 id="sv-prev" className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted">
            <CheckIcon size={14} />
            Así se ven en el sitio
          </h3>
          <ul
            aria-hidden="true"
            style={themeStyle(data.site.theme)}
            className="grid max-h-[70dvh] grid-cols-2 gap-1 overflow-y-auto rounded-2xl bg-surface p-3 text-on-dark"
          >
            {visible.map((s) => (
              <li key={s.id}>
                <ServiceCard s={s} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      {editing && (
        <ServiceEditor
          draft={editing}
          onClose={() => setEditing(null)}
          onSaved={(list, title, isNew) => {
            apply(list);
            setEditing(null);
            toast(isNew ? `«${title}» agregado al sitio` : "Cambios publicados");
          }}
          onAuthError={onAuthError}
        />
      )}
    </>
  );
}

function ServiceEditor({
  draft,
  onClose,
  onSaved,
  onAuthError,
}: {
  draft: Draft;
  onClose: () => void;
  onSaved: (list: SiteService[], title: string, isNew: boolean) => void;
  onAuthError: () => void;
}) {
  const theme = useAdmin().data.site.theme;
  const [d, setD] = useState<Draft>(draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const isNew = !d.id;
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  async function save() {
    if (!d.title.trim()) return setErrors({ title: "Escribe el nombre del servicio." });
    setBusy(true);
    setErrors({});
    try {
      const body = { title: d.title, description: d.description, icon: d.icon, note: d.note, visible: d.visible };
      const r = d.id ? await api.admin.services.update({ id: d.id, ...body }) : await api.admin.services.create(body);
      if (r.status === 401 || r.status === 403) return onAuthError();
      if (r.status === 200 && Array.isArray(r.data)) return onSaved(r.data, d.title.trim(), isNew);
      const fields = (r.data as { fields?: Record<string, string> } | null)?.fields;
      setErrors(fields ?? { form: "No se pudo guardar. Inténtalo de nuevo." });
    } catch {
      setErrors({ form: "Error de conexión. Inténtalo de nuevo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      labelledBy="sv-ed-title"
      initialFocus="[data-autofocus]"
      className="m-auto w-[calc(100%-32px)] max-w-[860px] rounded-2xl p-0 motion-safe:open:animate-pop-in"
    >
      <div className="grid grid-cols-1 gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-4">
          <h2 id="sv-ed-title" className="text-[17px] font-bold text-ink">
            {isNew ? "Nuevo servicio" : "Editar servicio"}
          </h2>
          <Field label="Nombre" error={errors.title} hint={`${d.title.length}/${SERVICE_LIMITS.title}`}>
            {(p) => (
              <input
                {...p}
                data-autofocus
                type="text"
                maxLength={SERVICE_LIMITS.title}
                value={d.title}
                onChange={(e) => set({ title: e.target.value })}
                className={adminInput}
                placeholder="Ej. Wifi en la cabaña"
              />
            )}
          </Field>
          <Field
            label="Descripción (opcional)"
            error={errors.description}
            hint={`Una línea que lo explique. ${d.description.length}/${SERVICE_LIMITS.description}`}
          >
            {(p) => (
              <textarea
                {...p}
                rows={2}
                maxLength={SERVICE_LIMITS.description}
                value={d.description}
                onChange={(e) => set({ description: e.target.value })}
                className={`${adminInput} resize-y leading-relaxed`}
              />
            )}
          </Field>
          <Field label="Etiqueta (opcional)" error={errors.note} hint="Ej. «Valor adicional». Lo destaca como extra, con borde dorado.">
            {(p) => (
              <input {...p} type="text" maxLength={SERVICE_LIMITS.note} value={d.note} onChange={(e) => set({ note: e.target.value })} className={adminInput} />
            )}
          </Field>
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1.5 text-[13px] font-semibold text-ink">Ícono</legend>
            <div role="radiogroup" aria-label="Ícono del servicio" className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1.5">
              {SERVICE_ICON_KEYS.map((k) => {
                const on = d.icon === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={SERVICE_ICONS[k].label}
                    title={SERVICE_ICONS[k].label}
                    onClick={() => set({ icon: k })}
                    className={`grid aspect-square place-items-center rounded-xl border transition-[background-color,border-color,color,transform] duration-150 motion-safe:active:scale-95 ${on ? "border-ink bg-ink text-panel" : "border-line bg-panel text-ink hover:border-line-strong hover:bg-canvas"}`}
                  >
                    <Icon icon={k} />
                  </button>
                );
              })}
            </div>
            {errors.icon && <p className="text-[13px] font-semibold text-error">{errors.icon}</p>}
          </fieldset>
          <Switch
            checked={d.visible}
            onChange={(v) => set({ visible: v })}
            label="Visible en el sitio"
            description="Si lo apagas, queda guardado pero no se muestra."
          />
          {errors.form && (
            <Callout tone="error" role="alert">
              {errors.form}
            </Callout>
          )}
        </div>

        <div className="flex flex-col gap-2 md:pt-10">
          <p className="text-[13px] font-semibold text-ink-muted">Vista previa</p>
          <div aria-hidden="true" style={themeStyle(theme)} className="rounded-2xl bg-surface p-3 text-on-dark">
            <ServiceCard s={{ ...d, title: d.title.trim() || "Nombre del servicio" }} />
          </div>
          <p className="text-[12px] text-ink-muted">Pasa el mouse por el servicio para ver la animación.</p>
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 rounded-b-2xl border-t border-line bg-canvas/60 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={busy} icon={<CheckIcon size={14} />} onClick={save}>
          {isNew ? "Agregar servicio" : "Guardar cambios"}
        </Button>
      </div>
    </Modal>
  );
}
