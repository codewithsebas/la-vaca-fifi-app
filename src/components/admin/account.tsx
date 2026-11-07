"use client";

// Cuenta de quien usa el panel: avatar, menú de la cuenta (encabezado), página «Mi perfil» y el aviso de «sin acceso»
// para las páginas que su rol no incluye.
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  ImageIcon,
  LockIcon,
  LogoutIcon,
  ShieldIcon,
  TrashIcon,
  UserIcon,
} from "@/components/ui/icons";
import { api } from "@/lib/client/api";
import { resizeImage, type Crop } from "@/lib/client/image-resize";
import { isMockApi } from "@/lib/config";
import { CAPABILITIES, ROLE_HINT, ROLE_LABEL, can } from "@/lib/permissions";
import type { PanelRole, PanelUser } from "@/lib/types";
import { Popover, useLabelTip } from "@/components/ui/floating";
import { useAdmin } from "@/components/admin/context";
import { PhotoCropper } from "@/components/admin/photo-cropper";
import { MODULES, paths, type ModuleId } from "@/components/admin/routes";
import { adminInput } from "@/components/admin/shared";
import { ACCENT, Badge, Button, Card, CardHeader, Deco, EmptyState, Field, ModalPresence, PageHeader, buttonClass, type Accent } from "@/components/admin/ui";

/* ───────────── Avatar ───────────── */

const ACCENTS: Accent[] = ["pink", "yellow", "green", "blue"];

// Nombre para mostrar: el de la cuenta o, si no tiene, la parte del correo antes de la @.
export const displayName = (u: Pick<PanelUser, "name" | "email">) => u.name.trim() || u.email.split("@")[0];

export function initialsOf(u: Pick<PanelUser, "name" | "email">) {
  const words = displayName(u)
    .split(/[\s._-]+/)
    .filter(Boolean);
  const s = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
  return s.toUpperCase();
}

// Cada persona conserva su color (sale de su id).
function accentOf(id: string): Accent {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

// `accent`: un color fijo en lugar del de la persona (la cuenta propia va en dorado).
export function Avatar({
  user,
  size = 40,
  accent,
  className = "",
}: {
  user: Pick<PanelUser, "id" | "name" | "email"> & { photo?: string | null };
  size?: number;
  accent?: Accent;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`relative grid flex-none place-items-center overflow-hidden rounded-full font-bold tracking-[-0.02em] text-ink select-none ${ACCENT[accent ?? accentOf(user.id)].bg} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {/* Con foto, la foto encima; sin ella (o mientras carga), las iniciales sobre el color de la persona. */}
      {initialsOf(user)}
      {user.photo && <Image src={user.photo} alt="" fill sizes={`${size}px`} className="object-cover" />}
    </span>
  );
}

export function RoleBadge({ role }: { role: PanelRole }) {
  return (
    <Badge tone={role === "admin" ? "accent" : "info"} icon={role === "admin" ? <ShieldIcon size={11} /> : undefined}>
      {ROLE_LABEL[role]}
    </Badge>
  );
}

/* ───────────── Menú de la cuenta ───────────── */

// En el encabezado: avatar (y, en pantallas anchas, nombre y rol). Abre el perfil, el sitio y el cierre de sesión.
export function AccountMenu({ onLogout, compact = false }: { onLogout: () => void; compact?: boolean }) {
  const { data } = useAdmin();
  const me = data.me;
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const item = "flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[14px] font-medium text-ink transition-colors hover:bg-panel";
  const close = () => setOpen(false);
  const nameTip = useLabelTip(displayName(me));
  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Cuenta de ${displayName(me)}`}
        {...(compact ? nameTip : {})}
        onClick={() => setOpen(!open)}
        className={
          compact
            ? "grid size-10 flex-none place-items-center rounded-full transition-transform duration-150 motion-safe:active:scale-[.97] pointer-coarse:size-11"
            : "flex h-12 flex-none items-center gap-2.5 rounded-full border border-line-strong bg-paper/70 py-1 pr-1 pl-1 transition-[border-color,background-color] duration-150 hover:border-ink-subtle hover:bg-paper xl:pr-3.5"
        }
      >
        <Avatar user={me} size={compact ? 40 : 38} accent="yellow" />
        {!compact && (
          <>
            <span className="hidden min-w-0 flex-col text-left leading-tight xl:flex">
              <span className="max-w-[150px] truncate text-[13.5px] font-semibold text-ink">{displayName(me)}</span>
              <span className="text-[12px] text-ink-muted">{ROLE_LABEL[me.role]}</span>
            </span>
            <ChevronDownIcon size={15} className="hidden text-ink-muted xl:block" />
          </>
        )}
      </button>
      <Popover open={open} onClose={close} anchor={anchor} placement="bottom-end" label="Cuenta" role="menu" className="w-[280px] p-1.5">
        <div className="flex items-center gap-3 px-3 pt-2.5 pb-3">
          <Avatar user={me} size={46} accent="yellow" />
          <div className="min-w-0">
            <p className="truncate text-[14.5px] leading-tight font-bold text-ink">{displayName(me)}</p>
            <p className="truncate text-[12.5px] text-ink-muted">{me.email}</p>
            <div className="mt-1.5">
              <RoleBadge role={me.role} />
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="mx-2 mb-1 h-px bg-line" />
        <Link role="menuitem" href={paths.perfil} onClick={close} className={item}>
          <UserIcon size={17} className="text-ink-muted" />
          Mi perfil
        </Link>
        <a role="menuitem" href="/" target="_blank" rel="noopener" onClick={close} className={item}>
          <ExternalLinkIcon size={17} className="text-ink-muted" />
          Ver sitio web
        </a>
        <div aria-hidden="true" className="mx-2 my-1 h-px bg-line" />
        <button
          role="menuitem"
          type="button"
          onClick={() => {
            close();
            onLogout();
          }}
          className={item}
        >
          <LogoutIcon size={17} className="text-ink-muted" />
          Cerrar sesión
        </button>
      </Popover>
    </>
  );
}

/* ───────────── Lo que incluye un rol ───────────── */

export function RoleCapabilities({ role, className = "" }: { role: PanelRole; className?: string }) {
  return (
    <ul className={`flex flex-col gap-2 ${className}`}>
      {CAPABILITIES.map((c) => {
        const yes = !c.perm || can(role, c.perm);
        return (
          <li key={c.label} className={`flex items-start gap-2.5 text-[13.5px] ${yes ? "text-ink" : "text-ink-subtle"}`}>
            <span
              aria-hidden="true"
              className={`mt-px grid size-5 flex-none place-items-center rounded-full ${yes ? "bg-success-soft text-success" : "bg-ink/6 text-ink-subtle"}`}
            >
              {yes ? <CheckIcon size={11} /> : <LockIcon size={10} />}
            </span>
            <span>
              {c.label}
              <span className="sr-only">{yes ? " (incluido)" : " (no incluido)"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ───────────── Sin acceso ───────────── */

// Página que el rol no incluye (se llegó por un enlace o escribiendo la dirección).
export function AccessDenied({ module }: { module: ModuleId }) {
  const { data } = useAdmin();
  const off = MODULES[module].off;
  return (
    <>
      <PageHeader title={MODULES[module].label} />
      <Card className="p-4 sm:p-5">
        <EmptyState
          icon={<LockIcon size={18} />}
          title={off ? "Esta sección está desactivada por ahora" : "Tu rol no incluye esta sección"}
          text={
            off
              ? module === "contenido"
                ? "Se volverá a activar más adelante. Mientras tanto, el sitio muestra el contenido que ya estaba guardado."
                : "Se volverá a activar más adelante."
              : `Entraste como ${ROLE_LABEL[data.me.role]}. Si necesitas acceso, pídeselo a un administrador del panel.`
          }
          action={
            <Link href={paths.dashboard} className={buttonClass("secondary", "sm")}>
              Ir al dashboard
            </Link>
          }
        />
      </Card>
    </>
  );
}

/* ───────────── Mi perfil ───────────── */

const PHOTO_SIDE = 512; // la foto de perfil se guarda cuadrada a este tamaño: alcanza para el avatar más grande en pantallas densas
const PHOTO_ERRORS: Record<number, string> = {
  413: "La imagen pesa demasiado (máximo 5 MB).",
  415: "Formato no compatible. Usa JPG, PNG o WebP.",
  501: "La foto de perfil no está disponible en modo simulado.",
};

// Foto de perfil: se elige, se encuadra en un marco cuadrado y se sube. Con foto, se puede cambiar o quitar.
function ProfilePhoto() {
  const { data, setData, toast, onAuthError } = useAdmin();
  const me = data.me;
  const input = useRef<HTMLInputElement>(null);
  const [cropping, setCropping] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(req: () => ReturnType<typeof api.admin.deleteProfilePhoto>, done: string) {
    setBusy(true);
    setError("");
    try {
      const r = await req();
      if (r.status === 401 || r.status === 403) return onAuthError();
      if (r.status !== 200 || !r.data) return setError(PHOTO_ERRORS[r.status] ?? "No se pudo guardar la foto. Inténtalo de nuevo.");
      const updated = r.data.me;
      setData((d) => ({ ...d, me: updated }));
      toast(done);
    } catch {
      setError("No se pudo leer la imagen. Prueba con otra en JPG, PNG o WebP.");
    } finally {
      setBusy(false);
    }
  }

  // Solo la región encuadrada, cuadrada y a lo sumo de PHOTO_SIDE px (no se amplía una foto más pequeña).
  const upload = (file: File, crop: Crop, size: { width: number; height: number }) => {
    const side = Math.min(PHOTO_SIDE, size.width);
    return run(async () => {
      const blob = await resizeImage(file, { crop, size: { width: side, height: side } });
      return api.admin.uploadProfilePhoto(blob, `perfil.${blob.type === "image/webp" ? "webp" : "jpg"}`);
    }, "Foto de perfil actualizada");
  };

  return (
    <div className="flex flex-col items-start gap-3">
      <Avatar user={me} size={88} className="bg-paper! ring-4 ring-paper/70" />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<ImageIcon size={14} />} loading={busy} onClick={() => input.current?.click()}>
          {me.photo ? "Cambiar foto" : "Subir foto"}
        </Button>
        {me.photo && (
          <Button
            size="sm"
            variant="ghost"
            icon={<TrashIcon size={14} />}
            disabled={busy}
            onClick={() => run(api.admin.deleteProfilePhoto, "Foto de perfil quitada")}
          >
            Quitar
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-error">
          {error}
        </p>
      )}
      {isMockApi && <p className="text-[12.5px] text-ink/70">En modo simulado no se pueden subir fotos.</p>}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (!file.type.startsWith("image/")) return setError("Elige una imagen JPG, PNG o WebP.");
          setError("");
          setCropping(file);
        }}
      />
      <ModalPresence>
        {cropping && (
          <PhotoCropper
            key={`${cropping.name}:${cropping.lastModified}`}
            file={cropping}
            title="Foto de perfil"
            aspect="1/1"
            hint="Encuadra tu cara en el centro: se verá en un círculo."
            min={[160, 160]}
            onCancel={() => setCropping(null)}
            onChooseOther={() => {
              setCropping(null);
              input.current?.click();
            }}
            onConfirm={(crop, size) => {
              const file = cropping;
              setCropping(null);
              upload(file, crop, size);
            }}
          />
        )}
      </ModalPresence>
    </div>
  );
}

type Fields = Record<string, string>;

export function ProfileView() {
  const { data, setData, toast, onAuthError } = useAdmin();
  const me = data.me;
  const [name, setName] = useState(me.name);
  const [pwd, setPwd] = useState({ next: "", again: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<"name" | "password" | null>(null);
  const [errors, setErrors] = useState<Fields>({});
  const [tried, setTried] = useState(false);

  const nameErr = name.trim().length < 2 ? "Escribe tu nombre (2 a 80 caracteres)." : "";
  const pwdErrs: Fields = {
    next: pwd.next.length < 8 ? "Mínimo 8 caracteres." : "",
    again: pwd.again !== pwd.next ? "Las contraseñas no coinciden." : "",
  };

  async function send(kind: "name" | "password") {
    if (busy) return;
    if (kind === "name" && (nameErr || name.trim() === me.name)) return;
    if (kind === "password") {
      setTried(true);
      if (pwdErrs.next || pwdErrs.again) return;
    }
    setBusy(kind);
    setErrors({});
    try {
      const r = await api.admin.profile(kind === "name" ? { name: name.trim() } : { password: pwd.next });
      if (r.status === 401 || r.status === 403) return onAuthError();
      if (r.status !== 200 || !r.data || !("me" in r.data)) {
        const fields = (r.data as { fields?: Fields } | null)?.fields;
        setErrors(fields ?? { [kind]: "No se pudo guardar. Inténtalo de nuevo." });
        return;
      }
      const updated = r.data.me;
      setData((d) => ({ ...d, me: updated }));
      if (kind === "password") {
        setPwd({ next: "", again: "" });
        setTried(false);
      }
      toast(kind === "name" ? "Nombre actualizado" : "Contraseña actualizada");
    } catch {
      setErrors({ [kind]: "Error de conexión. Inténtalo de nuevo." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title={MODULES.perfil.label} description="Tu cuenta del panel: cómo te ve el equipo, tu contraseña y lo que incluye tu rol." />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-4">
          <section aria-label="Tu cuenta" className="relative isolate flex flex-col items-start gap-4 overflow-hidden rounded-[22px] bg-blue p-5 sm:p-6">
            <Deco accent="blue" className="-top-8 -right-6 size-[150px] rotate-12" />
            <ProfilePhoto />
            <div className="min-w-0">
              <p className="truncate text-[22px] leading-tight font-bold tracking-[-0.02em] text-ink">{displayName(me)}</p>
              <p className="truncate text-[14px] text-ink/75">{me.email}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-paper/75 px-3 py-1 text-[12.5px] font-semibold text-ink">
              <ShieldIcon size={13} />
              {ROLE_LABEL[me.role]}
            </span>
          </section>

          <Card aria-labelledby="pf-role" className="flex flex-col gap-4 p-4 sm:p-5">
            <CardHeader id="pf-role" icon={<ShieldIcon size={18} />} title="Lo que incluye tu rol" subtitle={ROLE_HINT[me.role]} />
            <RoleCapabilities role={me.role} />
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card aria-labelledby="pf-data" className="flex flex-col gap-4 p-4 sm:p-5">
            <CardHeader
              id="pf-data"
              icon={<UserIcon size={18} />}
              accent="yellow"
              title="Datos personales"
              subtitle="Tu nombre aparece en el menú de la cuenta."
            />
            <form
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                send("name");
              }}
            >
              <Field label="Nombre" error={errors.name || (name && nameErr) || undefined}>
                {(p) => <input {...p} value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} className={adminInput} />}
              </Field>
              <Field label="Correo" hint="Con él entras al panel. Para cambiarlo, pídeselo a un administrador.">
                {(p) => <input {...p} value={me.email} readOnly className={`${adminInput} text-ink-muted`} />}
              </Field>
              <div className="flex justify-end sm:col-span-2">
                <Button
                  type="submit"
                  variant="primary"
                  loading={busy === "name"}
                  disabled={!!nameErr || name.trim() === me.name}
                  icon={<CheckIcon size={14} />}
                >
                  Guardar nombre
                </Button>
              </div>
            </form>
          </Card>

          <Card aria-labelledby="pf-pwd" className="flex flex-col gap-4 p-4 sm:p-5">
            <CardHeader
              id="pf-pwd"
              icon={<LockIcon size={18} />}
              accent="blue"
              title="Contraseña"
              subtitle="Al cambiarla, tu sesión en este navegador sigue abierta."
              actions={
                <Button size="sm" variant="ghost" icon={show ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />} onClick={() => setShow(!show)}>
                  {show ? "Ocultar" : "Mostrar"}
                </Button>
              }
            />
            <form
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                send("password");
              }}
            >
              <Field label="Contraseña nueva" hint="Mínimo 8 caracteres." error={errors.password || (tried ? pwdErrs.next : "") || undefined}>
                {(p) => (
                  <input
                    {...p}
                    type={show ? "text" : "password"}
                    value={pwd.next}
                    autoComplete="new-password"
                    onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
                    className={adminInput}
                  />
                )}
              </Field>
              <Field label="Repite la contraseña" error={(tried ? pwdErrs.again : "") || undefined}>
                {(p) => (
                  <input
                    {...p}
                    type={show ? "text" : "password"}
                    value={pwd.again}
                    autoComplete="new-password"
                    onChange={(e) => setPwd({ ...pwd, again: e.target.value })}
                    className={adminInput}
                  />
                )}
              </Field>
              <div className="flex justify-end sm:col-span-2">
                <Button type="submit" variant="primary" loading={busy === "password"} disabled={!pwd.next} icon={<LockIcon size={14} />}>
                  Cambiar contraseña
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
