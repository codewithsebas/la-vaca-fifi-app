"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type DragEvent } from "react";
import {
  BathIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CheckIcon,
  CloseIcon,
  HomeIcon,
  ImageIcon,
  PencilIcon,
  PlusIcon,
  StarOutlineIcon,
  TagIcon,
  TrashIcon,
  UploadIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { api } from "@/lib/client/api";
import { isMockApi } from "@/lib/config";
import { cop, plural } from "@/lib/format";
import { imageSize, resizeImage } from "@/lib/client/image-resize";
import { CABIN_PHOTO } from "@/lib/site";
import type { CabinInput, CabinType } from "@/lib/types";
import { useAdmin } from "@/components/admin/context";
import { CabinBathrooms, cabinBathroomAlerts } from "@/components/admin/bathrooms";
import { MODULES, paths } from "@/components/admin/routes";
import { useTip } from "@/components/ui/floating";
import { adminInput } from "@/components/admin/shared";
import { themeStyle } from "@/components/admin/theme";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  Field,
  IconButton,
  MoneyInput,
  PageHeader,
  SaveBar,
  Spinner,
  Stepper,
  Switch,
  buttonClass,
} from "@/components/admin/ui";

const SUGGESTED = [
  "Cama doble",
  "Dos camas dobles",
  "Cama doble y camarote",
  "Baño privado con agua caliente",
  "Balcón con vista a la montaña",
  "TV de pantalla plana",
  "Wifi",
  "Desayuno americano",
  "Vista al Nevado",
  "Cerca del parque infantil",
  "Pet friendly",
];

/* ───────────── Listado ───────────── */

export function CabinList() {
  const { data, ask, setData, toast, onAuthError, today } = useAdmin();
  const tip = useTip();
  const cabins = data.cabinTypes;
  const count = (id: string) => data.reservations.filter((r) => r.cabinTypeId === id).length;

  const toInput = (c: CabinType): CabinInput => ({
    nombre: c.nombre,
    descripcion: c.descripcion,
    caracteristicas: c.caracteristicas,
    badge: c.badge,
    maxPersonas: c.maxPersonas,
    units: c.units,
    precioPareja: c.precioPareja,
    personaAdicional: c.personaAdicional,
    activa: c.activa,
  });
  const toggle = (c: CabinType) =>
    ask({
      title: c.activa ? "Desactivar cabaña" : "Activar cabaña",
      text: c.activa
        ? `${c.nombre} deja de mostrarse en el sitio y no se puede reservar. Las reservas existentes no cambian.`
        : `${c.nombre} vuelve a mostrarse en el sitio y se puede reservar.`,
      okLabel: c.activa ? "Desactivar" : "Activar",
      danger: c.activa,
      done: c.activa ? "Cabaña desactivada" : "Cabaña activada",
      run: () => api.admin.updateCabin({ ...toInput(c), id: c.id, activa: !c.activa }),
    });
  const move = async (i: number, d: number) => {
    const order = cabins.map((c) => c.id);
    [order[i], order[i + d]] = [order[i + d], order[i]];
    setData((x) => ({ ...x, cabinTypes: order.map((id) => x.cabinTypes.find((c) => c.id === id)!) }));
    try {
      const r = await api.admin.reorderCabins(order);
      if (r.status === 401 || r.status === 403) return onAuthError();
      if (r.status !== 200 || !r.data) throw 0;
      setData((x) => ({ ...x, cabinTypes: r.data! }));
    } catch {
      toast("No se pudo cambiar el orden", "error");
    }
  };
  const remove = (c: CabinType) =>
    ask({
      title: "Eliminar cabaña",
      text: `${c.nombre} se elimina con sus fotos, temporadas y bloqueos. Esta acción no se puede deshacer.`,
      okLabel: "Eliminar cabaña",
      danger: true,
      done: "Cabaña eliminada",
      run: () => api.admin.deleteCabin(c.id),
    });

  return (
    <>
      <PageHeader
        title={MODULES.cabanas.label}
        description="Lo que ves aquí es lo que se ofrece en el sitio. El orden también es el del sitio."
        actions={
          <Link href={paths.nuevaCabana} className={buttonClass("primary")}>
            <PlusIcon size={14} />
            Nueva cabaña
          </Link>
        }
      />
      {cabins.length ? (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cabins.map((c, i) => {
            const n = count(c.id);
            const bathAlerts = cabinBathroomAlerts(data, c.id, today);
            return (
              <li key={c.id} className={`flex flex-col overflow-hidden rounded-[22px] bg-panel transition-opacity ${c.activa ? "" : "opacity-80"}`}>
                <div className="relative aspect-[16/10] bg-canvas">
                  {c.fotos[0] ? (
                    <Image src={c.fotos[0]} alt={c.nombre} fill sizes="(min-width: 1280px) 400px, (min-width: 768px) 50vw, 100vw" className="object-cover" />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-ink-muted">
                      <span className="flex flex-col items-center gap-1 text-[13px]">
                        <ImageIcon size={24} className="opacity-60" />
                        Sin fotos
                      </span>
                    </div>
                  )}
                  <span className="absolute top-2.5 left-2.5 flex gap-1.5">
                    <Badge tone={c.activa ? "success" : "neutral"} className="shadow-panel">
                      {c.activa ? "Activa" : "Inactiva"}
                    </Badge>
                    {/* La etiqueta de la cabaña, como en el sitio. No usa Badge: su fondo neutro le gana al resaltado y no se lee sobre la foto. */}
                    {c.badge && (
                      <span className="inline-flex items-center rounded-full bg-yellow px-2.5 py-0.5 text-[12px] leading-[1.5] font-bold whitespace-nowrap text-ink shadow-panel">
                        {c.badge}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <h2 className="text-[16px] font-bold text-ink">{c.nombre}</h2>
                    {c.descripcion && <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-muted">{c.descripcion}</p>}
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-[12.5px]">
                    <div className="rounded-[14px] bg-canvas/70 px-3 py-2">
                      <dt className="text-ink-muted">Capacidad</dt>
                      <dd className="font-semibold text-ink">{plural(c.maxPersonas, "persona", "personas")}</dd>
                    </div>
                    <div className="rounded-[14px] bg-canvas/70 px-3 py-2">
                      <dt className="text-ink-muted">Unidades</dt>
                      <dd className="font-semibold text-ink">{c.units}</dd>
                    </div>
                    <div className="rounded-[14px] bg-canvas/70 px-3 py-2">
                      <dt className="text-ink-muted">Pareja/noche</dt>
                      <dd className="font-semibold text-ink tabular-nums">{cop(c.precioPareja)}</dd>
                    </div>
                  </dl>
                  <p className="text-[12.5px] text-ink-muted">
                    {plural(c.fotos.length, "foto", "fotos")} · {plural(c.caracteristicas.length, "característica", "características")} ·{" "}
                    {plural(n, "reserva", "reservas")}
                  </p>
                  {bathAlerts.length > 0 && (
                    <p className="flex items-center gap-2 rounded-[14px] bg-yellow-soft px-3 py-2 text-[12.5px] font-semibold text-warning">
                      <BathIcon size={14} />
                      {bathAlerts.length === 1 ? `${bathAlerts[0].name}: fuera de servicio hoy` : `${bathAlerts.length} baños fuera de servicio hoy`}
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                    <Link href={paths.cabana(c.id)} className={buttonClass("primary", "sm")}>
                      <PencilIcon size={13} />
                      Editar
                    </Link>
                    <Button size="sm" onClick={() => toggle(c)}>
                      {c.activa ? "Desactivar" : "Activar"}
                    </Button>
                    <span className="ml-auto flex gap-0.5">
                      <IconButton label="Subir en el orden" size="sm" disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUpIcon size={15} />
                      </IconButton>
                      <IconButton label="Bajar en el orden" size="sm" disabled={i === cabins.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDownIcon size={15} />
                      </IconButton>
                      {n ? (
                        <span
                          {...tip(() => "Tiene reservas: no se puede eliminar. Desactívala para ocultarla del sitio.")}
                          tabIndex={0}
                          className="inline-grid"
                        >
                          <IconButton label="No se puede eliminar: tiene reservas" size="sm" variant="danger-ghost" disabled>
                            <TrashIcon size={15} />
                          </IconButton>
                        </span>
                      ) : (
                        <IconButton label={`Eliminar ${c.nombre}`} size="sm" variant="danger-ghost" onClick={() => remove(c)}>
                          <TrashIcon size={15} />
                        </IconButton>
                      )}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card className="p-4">
          <EmptyState
            icon={<HomeIcon size={18} />}
            title="Aún no hay cabañas"
            text="Crea la primera para que aparezca en el sitio y se pueda reservar."
            action={
              <Link href={paths.nuevaCabana} className={buttonClass()}>
                Nueva cabaña
              </Link>
            }
          />
        </Card>
      )}
    </>
  );
}

/* ───────────── Editor ───────────── */

const EMPTY: CabinInput = {
  nombre: "",
  descripcion: "",
  caracteristicas: [],
  badge: "",
  maxPersonas: 2,
  units: 1,
  precioPareja: 0,
  personaAdicional: 0,
  activa: true,
};

// Crear (sin id) o editar una cabaña.
export function CabinEditor({ id }: { id?: string }) {
  const { data, setData, toast, go, onAuthError } = useAdmin();
  const current = id ? data.cabinTypes.find((c) => c.id === id) : null;
  const base: CabinInput = current
    ? {
        nombre: current.nombre,
        descripcion: current.descripcion,
        caracteristicas: current.caracteristicas,
        badge: current.badge,
        maxPersonas: current.maxPersonas,
        units: current.units,
        precioPareja: current.precioPareja,
        personaAdicional: current.personaAdicional,
        activa: current.activa,
      }
    : EMPTY;
  const [v, setV] = useState<CabinInput>(base);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [feature, setFeature] = useState("");
  const dirty = JSON.stringify(v) !== JSON.stringify(base);
  const set = (p: Partial<CabinInput>) => setV((x) => ({ ...x, ...p }));

  if (id && !current)
    return (
      <>
        <PageHeader title="Cabaña no encontrada" />
        <Card className="p-4">
          <EmptyState
            icon={<HomeIcon size={18} />}
            title="Esta cabaña ya no existe"
            action={
              <Link href={paths.cabanas} className={buttonClass("primary")}>
                Ir a Cabañas
              </Link>
            }
          />
        </Card>
      </>
    );

  const addFeature = (f: string) => {
    const t = f.trim();
    if (!t || v.caracteristicas.some((x) => x.toLowerCase() === t.toLowerCase()) || v.caracteristicas.length >= 20) return;
    set({ caracteristicas: [...v.caracteristicas, t.slice(0, 60)] });
    setFeature("");
  };

  async function save() {
    if (busy) return;
    const e: Record<string, string> = {};
    if (v.nombre.trim().length < 3) e.nombre = "El nombre debe tener al menos 3 caracteres.";
    if (v.precioPareja <= 0) e.precioPareja = "Escribe la tarifa por noche para 2 personas.";
    setErrors(e);
    if (Object.keys(e).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('main [aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    try {
      const body = { ...v, nombre: v.nombre.trim(), descripcion: v.descripcion.trim(), badge: v.badge.trim() };
      const r = current ? await api.admin.updateCabin({ ...body, id: current.id }) : await api.admin.createCabin(body);
      if (r.status === 401 || r.status === 403) return onAuthError();
      if (r.status === 422) return setErrors((r.data as { fields?: Record<string, string> }).fields ?? {});
      if (r.status !== 200 || !Array.isArray(r.data)) throw 0;
      const list = r.data;
      setData((d) => ({ ...d, cabinTypes: list }));
      toast(current ? "Cambios guardados" : "Cabaña creada. Ahora puedes agregarle fotos.");
      if (!current) {
        const created = list.find((c) => !data.cabinTypes.some((x) => x.id === c.id));
        if (created) go(paths.cabana(created.id));
      }
    } catch {
      toast("No se pudo guardar la cabaña. Inténtalo de nuevo.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={current ? current.nombre : "Nueva cabaña"}
        description={current ? "Los cambios se publican en el sitio al guardar." : "Completa la información básica. Después de crearla podrás agregar fotos."}
        actions={
          <Link href={paths.cabanas} className={buttonClass("ghost")}>
            <ArrowLeftIcon size={15} />
            Volver a Cabañas
          </Link>
        }
      />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card aria-labelledby="cb-info" className="flex flex-col gap-4 p-4 sm:p-5">
            <CardHeader id="cb-info" icon={<HomeIcon size={18} />} title="Información" subtitle="Nombre, etiqueta y descripción que ven los huéspedes." />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_220px]">
              <Field label="Nombre" error={errors.nombre}>
                {(p) => (
                  <input
                    {...p}
                    type="text"
                    maxLength={60}
                    value={v.nombre}
                    onChange={(e) => set({ nombre: e.target.value })}
                    placeholder="Cabaña Familiar"
                    className={adminInput}
                  />
                )}
              </Field>
              <Field label="Etiqueta (opcional)" hint="Se muestra sobre la foto." error={errors.badge}>
                {(p) => (
                  <input
                    {...p}
                    type="text"
                    maxLength={30}
                    value={v.badge}
                    onChange={(e) => set({ badge: e.target.value })}
                    placeholder="Desayuno incluido"
                    className={adminInput}
                  />
                )}
              </Field>
            </div>
            <Field label="Descripción" hint={`${v.descripcion.length}/1200`} error={errors.descripcion}>
              {(p) => (
                <textarea
                  {...p}
                  rows={4}
                  maxLength={1200}
                  value={v.descripcion}
                  onChange={(e) => set({ descripcion: e.target.value })}
                  placeholder="Cabaña con cama doble, baño privado con agua caliente y balcón con vista a la montaña."
                  className={`${adminInput} resize-y leading-relaxed`}
                />
              )}
            </Field>
          </Card>

          <Card aria-labelledby="cb-cap" className="flex flex-col gap-4 p-4 sm:p-5">
            <CardHeader
              id="cb-cap"
              icon={<UsersIcon size={18} />}
              title="Capacidad y precio base"
              subtitle="Las temporadas con precio especial se configuran en Tarifas."
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Capacidad máxima" hint="Personas por cabaña, incluidos niños." error={errors.maxPersonas}>
                {(p) => (
                  <Stepper
                    id={p.id}
                    describedBy={p["aria-describedby"]}
                    value={v.maxPersonas}
                    onChange={(n) => set({ maxPersonas: n })}
                    min={1}
                    max={12}
                    unit="personas"
                  />
                )}
              </Field>
              <Field label="Unidades" hint="Cuántas cabañas iguales de este tipo hay." error={errors.units}>
                {(p) => (
                  <Stepper id={p.id} describedBy={p["aria-describedby"]} value={v.units} onChange={(n) => set({ units: n })} min={0} max={20} unit="cabañas" />
                )}
              </Field>
              <Field label="Noche para 2" error={errors.precioPareja}>
                {(p) => (
                  <MoneyInput
                    id={p.id}
                    describedBy={p["aria-describedby"]}
                    invalid={!!p["aria-invalid"]}
                    value={v.precioPareja}
                    onChange={(n) => set({ precioPareja: n })}
                  />
                )}
              </Field>
              <Field label="Persona adicional por noche" hint="Desde la 3.ª persona." error={errors.personaAdicional}>
                {(p) => <MoneyInput id={p.id} describedBy={p["aria-describedby"]} value={v.personaAdicional} onChange={(n) => set({ personaAdicional: n })} />}
              </Field>
            </div>
          </Card>

          <Card aria-labelledby="cb-feat" className="flex flex-col gap-4 p-4 sm:p-5">
            <CardHeader id="cb-feat" icon={<TagIcon size={18} />} title="Características" subtitle="Aparecen como etiquetas en la tarjeta de la cabaña." />
            {v.caracteristicas.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {v.caracteristicas.map((f) => (
                  <li key={f} className="inline-flex items-center gap-1 rounded-full bg-canvas py-1 pr-1 pl-3 text-[13px] font-semibold text-ink">
                    {f}
                    <button
                      type="button"
                      aria-label={`Quitar ${f}`}
                      onClick={() => set({ caracteristicas: v.caracteristicas.filter((x) => x !== f) })}
                      className="btn-icon size-6 text-ink-muted transition-colors hover:bg-ink/8 hover:text-ink"
                    >
                      <CloseIcon size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                aria-label="Nueva característica"
                maxLength={60}
                value={feature}
                onChange={(e) => setFeature(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addFeature(feature);
                  }
                }}
                placeholder="Escribe una característica y pulsa Enter"
                className={`${adminInput} min-w-0 flex-1`}
              />
              <Button icon={<PlusIcon size={14} />} disabled={!feature.trim()} onClick={() => addFeature(feature)}>
                Agregar
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] text-ink-muted">Sugerencias:</span>
              {SUGGESTED.filter((s) => !v.caracteristicas.some((x) => x.toLowerCase() === s.toLowerCase())).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addFeature(s)}
                  className="rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-[12.5px] text-ink-muted transition-colors hover:border-ink hover:text-ink"
                >
                  + {s}
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <Switch
              checked={v.activa}
              onChange={(a) => set({ activa: a })}
              label="Activo"
              description="Se muestra en el sitio y se puede reservar. Si lo desactivas, las reservas existentes no cambian."
            />
          </Card>

          <SaveBar
            dirty={dirty || !current}
            onDiscard={() => (current ? setV(base) : go(paths.cabanas))}
            onSave={save}
            saveLabel={busy ? "Guardando…" : current ? "Guardar cambios" : "Crear cabaña"}
          />
        </div>

        <div className="flex flex-col gap-4 xl:sticky xl:top-20">
          {current ? <PhotoManager c={current} /> : <Callout>Guarda la cabaña para agregar fotos.</Callout>}
          {current && <CabinBathrooms cabinTypeId={current.id} />}
          <Preview v={v} photo={current?.fotos[0]} />
        </div>
      </div>
    </>
  );
}

/* ───────────── Fotos de la cabaña ───────────── */

function PhotoManager({ c }: { c: CabinType }) {
  const { setData, ask, toast, onAuthError } = useAdmin();
  const input = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState(0);
  const [over, setOver] = useState(false);
  const full = c.fotos.length >= 12;

  async function upload(files: File[]) {
    const list = files.filter((f) => f.type.startsWith("image/")).slice(0, 12 - c.fotos.length);
    if (!list.length) return;
    setQueue(list.length);
    let low = 0;
    let done = 0;
    for (const f of list) {
      try {
        const size = await imageSize(f);
        if (size.width < CABIN_PHOTO.min[0] || size.height < CABIN_PHOTO.min[1]) low++;
        const blob = await resizeImage(f, { min: CABIN_PHOTO.min });
        const r = await api.admin.uploadCabinPhoto(c.id, blob, `${c.id}.${blob.type === "image/webp" ? "webp" : "jpg"}`);
        if (r.status === 401 || r.status === 403) return onAuthError();
        if (r.status === 501) {
          toast("La subida de fotos no está disponible en modo simulado.", "error");
          break;
        }
        if (r.status !== 200 || !r.data) throw 0;
        const types = r.data;
        setData((d) => ({ ...d, cabinTypes: types }));
        done++;
      } catch {
        toast(`No se pudo subir ${f.name}.`, "error");
      }
      setQueue((q) => q - 1);
    }
    setQueue(0);
    if (done)
      toast(
        low
          ? `${plural(done, "foto publicada", "fotos publicadas")}. ${plural(low, "tiene", "tienen")} poca resolución y puede verse borrosa.`
          : plural(done, "foto publicada", "fotos publicadas"),
        low ? "error" : "ok",
      );
  }

  const reorder = async (fotos: string[]) => {
    setData((d) => ({ ...d, cabinTypes: d.cabinTypes.map((x) => (x.id === c.id ? { ...x, fotos } : x)) }));
    const r = await api.admin.reorderCabinPhotos(c.id, fotos).catch(() => null);
    if (!r || r.status !== 200 || !r.data) return toast("No se pudo cambiar el orden de las fotos", "error");
    const types = r.data;
    setData((d) => ({ ...d, cabinTypes: types }));
  };
  const move = (i: number, d: number) => {
    const f = [...c.fotos];
    [f[i], f[i + d]] = [f[i + d], f[i]];
    reorder(f);
  };

  const drop = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      upload([...e.dataTransfer.files]);
    },
  };

  return (
    <Card aria-labelledby="cb-photos" className="flex flex-col gap-3 p-4 sm:p-5" {...drop}>
      <CardHeader
        id="cb-photos"
        icon={<ImageIcon size={18} />}
        title="Fotos"
        subtitle={`${plural(c.fotos.length, "foto", "fotos")} de 12 · la primera es la portada`}
        actions={
          <Button
            size="sm"
            variant="primary"
            icon={queue ? <Spinner size={13} /> : <UploadIcon size={14} />}
            disabled={full || queue > 0}
            onClick={() => input.current?.click()}
          >
            {queue ? `Subiendo ${queue}…` : "Subir"}
          </Button>
        }
      />
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          upload([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {c.fotos.length ? (
        <ul className={`grid grid-cols-2 gap-2 rounded-[16px] transition-shadow ${over ? "ring-4 ring-focus/15" : ""}`}>
          {c.fotos.map((url, i) => (
            <li key={url} className="group relative aspect-4/3 overflow-hidden rounded-[16px] bg-canvas">
              <Image src={url} alt={`Foto ${i + 1} de ${c.nombre}`} fill sizes="200px" className="object-cover" />
              {i === 0 && (
                <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-panel px-2 py-0.5 text-[12px] leading-[1.5] font-semibold whitespace-nowrap text-ink shadow-panel">
                  <StarOutlineIcon size={11} />
                  Portada
                </span>
              )}
              <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                <span className="flex gap-1 rounded-full bg-paper/95 p-0.5 shadow-panel">
                  <IconButton label="Mover a la izquierda" size="sm" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowLeftIcon size={14} />
                  </IconButton>
                  <IconButton label="Mover a la derecha" size="sm" disabled={i === c.fotos.length - 1} onClick={() => move(i, 1)}>
                    <ArrowRightIcon size={14} />
                  </IconButton>
                  {i > 0 && (
                    <IconButton label="Usar como portada" size="sm" onClick={() => reorder([url, ...c.fotos.filter((x) => x !== url)])}>
                      <StarOutlineIcon size={14} />
                    </IconButton>
                  )}
                </span>
                <span className="rounded-full bg-paper/95 p-0.5 shadow-panel">
                  <IconButton
                    label={`Quitar foto ${i + 1}`}
                    size="sm"
                    variant="danger-ghost"
                    onClick={() =>
                      ask({
                        title: "Quitar foto",
                        text: `Se quita de ${c.nombre} y del sitio.`,
                        okLabel: "Quitar",
                        danger: true,
                        done: "Foto quitada",
                        run: () => api.admin.deleteCabinPhoto(c.id, url),
                      })
                    }
                  >
                    <TrashIcon size={14} />
                  </IconButton>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={`flex flex-col items-center gap-2 rounded-[18px] border-2 border-dashed px-4 py-8 text-center transition-colors ${over ? "border-focus bg-green-soft" : "border-line-strong hover:bg-canvas/60"}`}
        >
          <UploadIcon size={22} className="text-ink-muted" />
          <span className="text-[14px] font-semibold text-ink">Arrastra fotos aquí o haz clic para elegirlas</span>
          <span className="text-[12.5px] text-ink-muted">{`${CABIN_PHOTO.hint}, mínimo ${CABIN_PHOTO.min[0]} × ${CABIN_PHOTO.min[1]} px. Puedes subir varias a la vez.`}</span>
        </button>
      )}
      {isMockApi && <p className="text-[12.5px] text-ink-muted">En modo simulado la subida de fotos no está disponible.</p>}
    </Card>
  );
}

/* ───────────── Vista previa ───────────── */

// Réplica de la tarjeta de la portada (mismos estilos del sitio) para ver el resultado antes de guardar.
function Preview({ v, photo }: { v: CabinInput; photo?: string }) {
  const { data } = useAdmin();
  return (
    <section aria-labelledby="cb-prev" className="flex flex-col gap-2">
      <h2 id="cb-prev" className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted">
        <CheckIcon size={14} />
        Así se verá en el sitio
      </h2>
      <article
        aria-hidden="true"
        style={themeStyle(data.site.theme)}
        className="pointer-events-none flex flex-col gap-3 rounded-lg bg-card p-2.5 text-on-light"
      >
        <div className="relative aspect-4/3 overflow-hidden rounded-md bg-card-muted">
          {photo ? (
            <Image src={photo} alt="" fill sizes="400px" className="object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-[12px] opacity-60">Sin foto de portada</div>
          )}
          {v.badge && <span className="absolute top-2.5 left-2.5 rounded-full bg-highlight px-3 py-1 text-[.72rem] font-extrabold">{v.badge}</span>}
        </div>
        <div className="flex flex-col gap-2 px-1.5 pb-1.5">
          <h3 className="display text-[1.9rem] leading-none">{v.nombre || "Nombre de la cabaña"}</h3>
          {v.descripcion && <p className="line-clamp-3 text-[.82rem]">{v.descripcion}</p>}
          {v.caracteristicas.length > 0 && (
            <ul className="flex flex-wrap gap-1">
              {v.caracteristicas.slice(0, 6).map((f) => (
                <li key={f} className="rounded-full bg-card-muted px-2.5 py-0.5 text-[.72rem] font-semibold">
                  {f}
                </li>
              ))}
            </ul>
          )}
          <dl className="grid grid-cols-[auto_auto] justify-start gap-x-4 gap-y-0.5 text-[.8rem]">
            <dt>Noche para 2</dt>
            <dd className="font-extrabold">{cop(v.precioPareja)}</dd>
            <dt>Persona adicional</dt>
            <dd className="font-bold">{cop(v.personaAdicional)}</dd>
            <dt>Capacidad</dt>
            <dd className="font-bold">Máximo {v.maxPersonas} personas</dd>
          </dl>
        </div>
      </article>
    </section>
  );
}
