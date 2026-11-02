"use client";

// Piezas reutilizables del panel: el sistema de diseño del panel (fondo crema, tarjetas arena, negro para las acciones
// principales y pasteles para destacar). Todas las páginas del panel se arman con ellas.
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon, WarningIcon } from "@/components/ui/icons";
import { useLabelTip } from "@/components/ui/floating";

/* ───────────── Acentos ───────────── */

// Los cuatro pasteles del panel: fondo pleno (tarjetas destacadas, iconos), suave (etiquetas) y profundo (decoración).
export type Accent = "pink" | "yellow" | "green" | "blue";
export const ACCENT: Record<Accent, { bg: string; soft: string; deep: string }> = {
  pink: { bg: "bg-pink", soft: "bg-pink-soft", deep: "fill-pink-deep" },
  yellow: { bg: "bg-yellow", soft: "bg-yellow-soft", deep: "fill-yellow-deep" },
  green: { bg: "bg-green", soft: "bg-green-soft", deep: "fill-green-deep" },
  blue: { bg: "bg-blue", soft: "bg-blue-soft", deep: "fill-blue-deep" },
};

// Formas grandes y suaves en la esquina de las tarjetas destacadas (decoración: no llevan información).
const BURST = Array.from({ length: 16 }, (_, i) => {
  const r = i % 2 ? 6.4 : 11.6;
  const a = (Math.PI / 8) * i - Math.PI / 2;
  return `${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`;
}).join(" ");
const SHAPE: Record<Accent, ReactNode> = {
  yellow: (
    <path d="M9 2h6a1 1 0 0 1 1 1v5h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-5v5a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-5H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h5V3a1 1 0 0 1 1-1z" />
  ),
  pink: <path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2.3 4 6.4 4c2.3 0 3.9 1.3 5.6 3.4C13.7 5.3 15.3 4 17.6 4 21.7 4 23.6 8.4 22 11.7 19.5 16.4 12 21 12 21z" />,
  green: <path d="M12 3.5c.6 0 1.1.3 1.4.8l8.4 14.6c.6 1.1-.2 2.4-1.4 2.4H3.6c-1.2 0-2-1.3-1.4-2.4L10.6 4.3c.3-.5.8-.8 1.4-.8z" />,
  blue: <polygon points={BURST} />,
};

export function Deco({ accent, className = "" }: { accent: Accent; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`pointer-events-none absolute -z-10 ${ACCENT[accent].deep} opacity-70 ${className}`}>
      {SHAPE[accent]}
    </svg>
  );
}

/* ───────────── Botones ───────────── */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost" | "accent";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:not-disabled:bg-ink/85",
  secondary: "bg-paper/55 text-ink ring-1 ring-line-strong ring-inset hover:not-disabled:bg-paper hover:not-disabled:ring-ink-subtle",
  ghost: "bg-transparent text-ink hover:not-disabled:bg-ink/6",
  danger: "bg-error text-paper hover:not-disabled:bg-[color-mix(in_srgb,var(--color-error)_86%,#000)]",
  "danger-ghost": "bg-transparent text-error hover:not-disabled:bg-error-soft",
  accent: "bg-pink text-ink hover:not-disabled:bg-pink-deep",
};
const SIZE: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3.5 text-[13px] pointer-coarse:h-10",
  md: "h-10 gap-2 px-5 text-[14px] pointer-coarse:h-11",
  lg: "h-12 gap-2.5 px-6 text-[15px]",
};
const ICON_SIZE: Record<Size, string> = { sm: "size-8 pointer-coarse:size-10", md: "size-10 pointer-coarse:size-11", lg: "size-12" };
const PRESS = "transition-[background-color,color,box-shadow,transform] duration-150 motion-safe:active:not-disabled:scale-[.97]";

// Clases de botón para usar también en enlaces (<a>): píldora, sin borde salvo la variante secundaria.
export const buttonClass = (variant: Variant = "secondary", size: Size = "md", extra = "") =>
  `inline-flex items-center justify-center rounded-full ${VARIANT[variant]} ${SIZE[size]} font-semibold whitespace-nowrap select-none ${PRESS} disabled:cursor-not-allowed disabled:opacity-45 ${extra}`;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode };

// En carga no se usa `disabled` (el botón perdería el foco): se marca aria-disabled y se ignoran los clics.
export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  className = "",
  children,
  onClick,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      className={buttonClass(variant, size, `${loading ? "cursor-progress" : ""} ${className}`)}
      {...rest}
    >
      {loading ? <Spinner size={size === "sm" ? 14 : 16} /> : icon}
      {children}
    </button>
  );
}

// Clases de un botón redondo solo con icono (también para enlaces).
export const iconButtonClass = (variant: Variant = "ghost", size: Size = "md", extra = "") =>
  `inline-grid flex-none place-items-center rounded-full ${VARIANT[variant]} ${ICON_SIZE[size]} ${PRESS} disabled:cursor-not-allowed disabled:opacity-40 ${extra}`;

// Botón solo con icono: siempre con nombre accesible y, al pasar el ratón o con el teclado, el tooltip del panel.
export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  className = "",
  children,
  type = "button",
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  onFocus,
  onBlur,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: Variant; size?: Size }) {
  const tip = useLabelTip(label, { onPointerEnter, onPointerLeave, onPointerDown, onFocus, onBlur } as Parameters<typeof useLabelTip>[1]);
  return (
    <button type={type} aria-label={label} className={iconButtonClass(variant, size, className)} {...tip} {...rest}>
      {children}
    </button>
  );
}

export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block flex-none animate-spin-fast rounded-full border-2 border-current border-r-transparent ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/* ───────────── Formularios ───────────── */

type FieldProps = { id: string; "aria-describedby"?: string; "aria-invalid"?: true };

// Etiqueta + control + ayuda + error, enlazados por id. El control se recibe como función.
export function Field({
  label,
  hint,
  error,
  className = "",
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: (p: FieldProps) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className="text-[12.5px] leading-snug text-ink-muted">
          {hint}
        </p>
      )}
      {error && <FieldError id={errId}>{error}</FieldError>}
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-[13px] font-semibold text-error">
      <AlertIcon size={15} className="mt-px" />
      {children}
    </p>
  );
}

/* ───────────── Contenedores ───────────── */

// Tarjeta del panel: arena sobre el fondo crema, sin borde ni sombra.
export function Card({ className = "", children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={`rounded-[22px] bg-panel ${className}`} {...rest}>
      {children}
    </section>
  );
}

// Cabecera de tarjeta: icono opcional (en un círculo; de color con `accent`), título, subtítulo y acciones a la derecha.
export function CardHeader({
  id,
  title,
  subtitle,
  icon,
  accent,
  actions,
  className = "",
}: {
  id?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  accent?: Accent;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-2 ${className}`}>
      <div className={`flex min-w-0 gap-3 ${subtitle ? "items-start" : "items-center"}`}>
        {icon && (
          <span aria-hidden="true" className={`grid size-10 flex-none place-items-center rounded-full text-ink ${accent ? ACCENT[accent].bg : "bg-paper"}`}>
            {icon}
          </span>
        )}
        <div className={`min-w-0 ${icon && subtitle ? "pt-0.5" : ""}`}>
          <h2 id={id} className="text-[16px] leading-tight font-bold tracking-[-0.01em] text-ink">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
  compact = false,
}: {
  icon: ReactNode;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-line-strong text-center ${compact ? "px-4 py-6" : "px-6 py-12"}`}
    >
      <span aria-hidden="true" className="mb-1 grid size-11 place-items-center rounded-full bg-paper text-ink-muted">
        {icon}
      </span>
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      {text && <p className="max-w-[44ch] text-[13px] text-ink-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// Fallo al mostrar una página o al cargar datos: explica qué pasó y ofrece reintentar.
export function ErrorState({
  title = "Algo salió mal",
  text = "No pudimos mostrar esta sección. Tus datos no se perdieron.",
  onRetry,
  action,
}: {
  title?: string;
  text?: ReactNode;
  onRetry?: () => void;
  action?: ReactNode;
}) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 rounded-[22px] bg-error-soft/55 px-6 py-12 text-center">
      <span aria-hidden="true" className="mb-1 grid size-11 place-items-center rounded-full bg-paper text-error">
        <AlertIcon size={19} />
      </span>
      <p className="text-[15px] font-bold text-ink">{title}</p>
      <p className="max-w-[46ch] text-[13.5px] text-ink-muted">{text}</p>
      {(onRetry || action) && (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {onRetry && (
            <Button variant="primary" onClick={onRetry}>
              Reintentar
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}

// Esqueleto de una página del panel mientras se prepara (título, indicadores y bloque principal).
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Cargando la página" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[120px] rounded-[22px]" />
        ))}
      </div>
      <Skeleton className="h-[320px] rounded-[22px]" />
    </div>
  );
}

const CALLOUT = {
  info: { cls: "bg-paper/70 text-ink ring-1 ring-line ring-inset", icon: <InfoIcon size={17} /> },
  warning: { cls: "bg-warning-soft text-warning", icon: <WarningIcon size={17} /> },
  error: { cls: "bg-error-soft text-error", icon: <AlertIcon size={17} /> },
  success: { cls: "bg-success-soft text-success", icon: <CheckIcon size={17} /> },
};

export function Callout({
  tone = "info",
  children,
  className = "",
  role,
}: {
  tone?: keyof typeof CALLOUT;
  children: ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  return (
    <div role={role} className={`flex items-start gap-2.5 rounded-[16px] px-4 py-3 text-[13.5px] leading-snug ${CALLOUT[tone].cls} ${className}`}>
      <span aria-hidden="true" className="mt-px flex-none">
        {CALLOUT[tone].icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// Cuenta pequeña junto a un título o en la navegación.
// `label`: texto solo para lectores de pantalla que sigue al número ("2 pendientes de abono").
export function CountBadge({ n, tone = "muted", label }: { n: number; tone?: "muted" | "attention"; label?: string }) {
  return (
    <span
      className={`inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11.5px] font-bold tabular-nums ${tone === "attention" ? "bg-pink text-ink" : "bg-ink/8 text-ink-muted"}`}
    >
      <span>
        {n}
        {label && <span className="sr-only"> {label}</span>}
      </span>
    </span>
  );
}

/* ───────────── Barra de guardado ───────────── */

// Barra fija al pie para formularios: indica si hay cambios y concentra Descartar / Guardar.
// Va pegada al borde inferior de la ventana y ocupa todo el ancho del área de contenido (de la barra lateral al borde
// derecho), aunque el formulario sea corto. Publica su alto en --savebar-h: el panel deja ese espacio libre al final
// de la página (shell.tsx) y los avisos flotantes aparecen por encima de ella.
export function SaveBar({ dirty, onDiscard, onSave, saveLabel }: { dirty: boolean; onDiscard: () => void; onSave: () => void; saveLabel: string }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const html = document.documentElement;
    const ro = new ResizeObserver(() => html.style.setProperty("--savebar-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      html.style.removeProperty("--savebar-h");
    };
  }, []);
  return (
    // --admin-sidebar: lo que ocupa la barra lateral del panel en escritorio (shell.tsx).
    <div
      ref={bar}
      data-savebar
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/92 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-canvas/80 lg:left-[var(--admin-sidebar,264px)]"
    >
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-8">
        <p aria-live="polite" className="flex items-center gap-2 text-[13.5px] font-medium text-ink-muted">
          <span aria-hidden="true" className={`size-2 rounded-full transition-colors ${dirty ? "bg-pink-deep" : "bg-line-strong"}`} />
          {dirty ? "Tienes cambios sin guardar" : "Sin cambios pendientes"}
        </p>
        <div className="flex gap-2">
          {dirty && (
            <Button variant="ghost" onClick={onDiscard}>
              Descartar
            </Button>
          )}
          <Button variant="primary" disabled={!dirty} onClick={onSave}>
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Ventanas modales ───────────── */

// Entrada y salida: cada ventana se cierra con la misma animación con la que se abrió, al revés (globals.css).
const MOTION = {
  pop: "motion-safe:open:not-data-closing:animate-pop-in motion-safe:data-closing:animate-pop-out",
  drawer: "motion-safe:open:not-data-closing:animate-slide-in-left motion-safe:data-closing:animate-slide-out-left",
};
// Respaldo por si el navegador no avisa el fin de la salida (pestaña en segundo plano).
const EXIT_FALLBACK_MS = 420;

const Presence = createContext<{ leaving: boolean; done: () => void } | null>(null);

// Envuelve una ventana que se muestra y se quita ({abierta && <Editor />}): al quitarla la deja montada mientras sale y
// después la retira. Así sale animada con cualquier cierre: Escape, clic en el fondo, Cancelar o después de guardar.
export function ModalPresence({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(children);
  if (children && children !== shown) setShown(children);
  const leaving = !children && !!shown;
  const done = useCallback(() => setShown(null), []);
  const value = useMemo(() => ({ leaving, done }), [leaving, done]);
  return <Presence value={value}>{children || shown}</Presence>;
}

type ModalProps = {
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  role?: "dialog" | "alertdialog";
  initialFocus?: string; // selector del elemento que recibe el foco al abrir
  dismissOnBackdrop?: boolean;
  motion?: keyof typeof MOTION; // pop: ventana centrada · drawer: cajón desde la izquierda
  className?: string;
  children: ReactNode;
};

// <dialog> nativo: atrapa el foco, Escape lo cierra y deja inerte el fondo. Al cerrarse devuelve el foco a quien lo abrió.
// Dentro de <ModalPresence> sale animada antes de desmontarse.
export function Modal({
  onClose,
  labelledBy,
  describedBy,
  role = "dialog",
  initialFocus,
  dismissOnBackdrop,
  motion = "pop",
  className = "",
  children,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  const presence = useContext(Presence);
  const leaving = !!presence?.leaving;
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!d.open) d.showModal();
    if (initialFocus) d.querySelector<HTMLElement>(initialFocus)?.focus();
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [initialFocus]);
  // Al salir se retira cuando termina la animación (onAnimationEnd); sin animación (ya cerrada o movimiento reducido), enseguida.
  useEffect(() => {
    if (!leaving || !presence) return;
    const still = !ref.current?.open || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(presence.done, still ? 0 : EXIT_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [leaving, presence]);
  return (
    <dialog
      ref={ref}
      role={role === "alertdialog" ? "alertdialog" : undefined}
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      data-closing={leaving || undefined}
      // Escape: el mismo cierre animado (se evita el cierre inmediato del navegador, cuando lo permite).
      onCancel={(e) => {
        if (!e.cancelable) return;
        e.preventDefault();
        close.current();
      }}
      onClose={() => close.current()}
      onClick={(e) => dismissOnBackdrop && e.target === e.currentTarget && close.current()}
      onAnimationEnd={(e) => leaving && e.target === e.currentTarget && !e.pseudoElement && presence?.done()}
      className={`admin-surface bg-paper text-ink shadow-overlay backdrop:bg-[rgb(23_22_20/0.42)] backdrop:backdrop-blur-[2px] data-closing:pointer-events-none motion-safe:backdrop:animate-fade-in motion-safe:data-closing:backdrop:animate-fade-out ${MOTION[motion]} ${className}`}
    >
      {children}
    </dialog>
  );
}

/* ───────────── Avisos ───────────── */

export type ToastMsg = { id: number; text: string; kind: "ok" | "error"; action?: { label: string; onClick: () => void } };

export function Toasts({ toast, onDismiss }: { toast: ToastMsg | null; onDismiss: () => void }) {
  return (
    <div
      aria-live="polite"
      className="admin-surface pointer-events-none fixed inset-x-0 bottom-4 z-90 flex justify-center px-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:justify-end [html:has([data-savebar])_&]:bottom-[calc(var(--savebar-h,64px)+16px)] sm:[html:has([data-savebar])_&]:bottom-[calc(var(--savebar-h,64px)+24px)]"
    >
      {toast && (
        <div
          key={toast.id}
          role={toast.kind === "error" ? "alert" : "status"}
          className="pointer-events-auto flex max-w-[420px] items-center gap-3 rounded-[18px] bg-ink py-2.5 pr-2 pl-3 text-[14px] font-medium text-paper shadow-overlay motion-safe:animate-slide-up"
        >
          <span
            aria-hidden="true"
            className={`grid size-7 flex-none place-items-center rounded-full text-ink ${toast.kind === "error" ? "bg-status-cancelled" : "bg-pink"}`}
          >
            {toast.kind === "error" ? <AlertIcon size={15} /> : <CheckIcon size={14} />}
          </span>
          <span className="min-w-0 flex-1">{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action!.onClick();
                onDismiss();
              }}
              className="rounded-full px-3 py-1 text-[13px] font-bold text-pink transition-colors [--ring:var(--color-pink)] hover:bg-paper/12"
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Cerrar aviso"
            className="grid size-8 flex-none place-items-center rounded-full text-paper/70 transition-colors [--ring:var(--color-pink)] hover:bg-paper/12 hover:text-paper"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────────── Navegación y estructura ───────────── */

export type Crumb = { label: string; href?: string };

// Migas de pan: en móvil solo el nivel anterior (como "volver") y el actual.
export function Breadcrumbs({ items, className = "" }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Ruta de navegación" className={`min-w-0 ${className}`}>
      <ol className="flex min-w-0 items-center gap-1 text-[13px] text-ink-muted">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          const early = items.length > 2 && i < items.length - 2;
          return (
            <li key={`${i}-${c.label}`} className={`flex min-w-0 items-center gap-1 ${early ? "max-sm:hidden" : ""}`}>
              {i > 0 && (
                <span aria-hidden="true" className={`text-ink-subtle ${items.length > 2 && i === items.length - 2 ? "max-sm:hidden" : ""}`}>
                  /
                </span>
              )}
              {last || !c.href ? (
                <span aria-current={last ? "page" : undefined} className={`truncate ${last ? "font-semibold text-ink" : ""}`}>
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className="truncate rounded-full px-1.5 py-0.5 transition-colors hover:bg-ink/6 hover:text-ink">
                  <span aria-hidden="true" className="mr-0.5 sm:hidden">
                    ‹
                  </span>
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageHeader({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 id="ad-title" tabIndex={-1} className="text-[clamp(1.6rem,2.5vw,2.1rem)] leading-[1.12] font-bold tracking-[-0.03em] text-ink focus:outline-none">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-[72ch] text-[14.5px] leading-relaxed text-ink-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

type Opt<T extends string> = { value: T; label: ReactNode; icon?: ReactNode; count?: number };

// Opción única entre pocas alternativas (vista del calendario, filtros rápidos): píldoras, la elegida en negro y las
// demás con borde punteado. Flechas para moverse.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  className = "",
}: {
  options: Opt<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const move = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const j = (i + d + options.length) % options.length;
    onChange(options[j].value);
    (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={`no-scrollbar inline-flex max-w-full items-center gap-1.5 overflow-x-auto p-0.5 ${className}`}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => move(e, i)}
            className={`inline-flex flex-none items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap transition-[background-color,color,border-color] duration-150 ${
              size === "sm" ? "h-7 px-3 text-[12.5px]" : "h-8 px-3.5 text-[13px] pointer-coarse:h-9"
            } ${on ? "border-ink bg-ink text-paper" : "border-dashed border-line-strong text-ink-muted hover:border-ink-subtle hover:text-ink"}`}
          >
            {o.icon}
            {o.label}
            {o.count !== undefined && <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${on ? "bg-paper/20" : "bg-ink/7"}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Pestañas de sub-secciones: píldoras (la actual en negro). Se desplazan en horizontal en móvil.
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: Opt<T>[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="-mx-4 no-scrollbar flex gap-1.5 overflow-x-auto px-4 py-0.5 lg:mx-0 lg:px-0">
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.value)}
            className={`inline-flex h-9 flex-none items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold whitespace-nowrap transition-colors duration-150 ${on ? "bg-ink text-paper" : "text-ink-muted hover:bg-panel hover:text-ink"}`}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className="rounded-full bg-pink px-1.5 text-[11px] text-ink tabular-nums">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Secciones de un módulo agrupadas por tema: cada grupo, con su rótulo, es un bloque de pestañas (rutas). En pantallas
// anchas los grupos van uno al lado del otro y bajan de línea si no caben; en el celular, en una fila que se desplaza
// con la pestaña actual a la vista.
export function GroupedNavTabs({
  groups,
  current,
  label,
}: {
  groups: { label: string; tabs: { href: string; id: string; label: ReactNode; icon?: ReactNode; count?: number }[] }[];
  current: string;
  label: string;
}) {
  const uid = useId();
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = nav.current;
    const on = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !on) return;
    const [a, b] = [el.getBoundingClientRect(), on.getBoundingClientRect()];
    el.scrollLeft += b.left - a.left - (a.width - b.width) / 2;
  }, [current]);
  return (
    <nav ref={nav} aria-label={label} className="-mx-4 no-scrollbar flex gap-x-4 gap-y-3 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
      {groups.map((g, i) => (
        <div key={g.label} role="group" aria-labelledby={`${uid}-${i}`} className="flex flex-none flex-col gap-1.5">
          <p id={`${uid}-${i}`} className="px-1 text-[12px] font-semibold text-ink-muted">
            {g.label}
          </p>
          <div className="flex gap-1 rounded-full bg-panel p-1">
            {g.tabs.map((t) => {
              const on = t.id === current;
              return (
                <Link
                  key={t.id}
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  className={`inline-flex h-8 flex-none items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold whitespace-nowrap transition-[background-color,color] duration-150 pointer-coarse:h-9 ${on ? "bg-ink text-paper" : "text-ink-muted hover:bg-paper/70 hover:text-ink"}`}
                >
                  {t.icon}
                  {t.label}
                  {t.count !== undefined && t.count > 0 && <span className="rounded-full bg-pink px-1.5 text-[11px] text-ink tabular-nums">{t.count}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[14px] font-semibold text-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[12.5px] text-ink-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 flex-none rounded-full transition-colors duration-150 disabled:opacity-50 ${checked ? "bg-ink" : "bg-line-strong"}`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 left-0.5 size-5 rounded-full shadow-panel transition-[transform,background-color] duration-150 ${checked ? "translate-x-5 bg-pink" : "bg-paper"}`}
        />
      </button>
    </div>
  );
}

export const Skeleton = ({ className = "" }: { className?: string }) => (
  <span aria-hidden="true" className={`block animate-pulse-soft rounded-[14px] bg-ink/7 ${className}`} />
);

const TONE = {
  neutral: "bg-ink/7 text-ink",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-error-soft text-error",
  info: "bg-info-soft text-info",
  accent: "bg-pink-soft text-ink",
};
export type Tone = keyof typeof TONE;

export function Badge({ tone = "neutral", children, icon, className = "" }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] leading-[1.5] font-semibold whitespace-nowrap ${TONE[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}

// Indicador clave: valor grande, etiqueta y, si aplica, variación contra el periodo anterior (en %, o en puntos
// porcentuales con `deltaUnit="pp"` cuando el valor ya es un porcentaje, como la ocupación).
// `accent`: tarjeta pastel con su forma decorativa (indicadores principales); sin él, tarjeta arena.
export function StatCard({
  label,
  value,
  hint,
  delta,
  deltaUnit = "%",
  icon,
  tone,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: number | null;
  deltaUnit?: "%" | "pp";
  icon?: ReactNode;
  tone?: Tone;
  accent?: Accent;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className={`relative isolate flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-[22px] p-4 sm:p-5 ${accent ? ACCENT[accent].bg : "bg-panel"}`}>
      {accent && <Deco accent={accent} className="-top-5 -right-5 size-[104px] rotate-12" />}
      <div className="flex items-center justify-between gap-2">
        <p className={`truncate text-[13.5px] font-semibold ${accent ? "text-ink" : "text-ink-muted"}`}>{label}</p>
        {icon && (
          <span
            aria-hidden="true"
            className={`grid size-8 flex-none place-items-center rounded-full ${accent ? "bg-paper/70 text-ink" : tone ? TONE[tone] : "bg-paper text-ink-muted"}`}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="text-[clamp(1.45rem,2.1vw,1.85rem)] leading-tight font-bold tracking-[-0.025em] text-ink tabular-nums">{value}</p>
      {(delta !== undefined || hint) && (
        <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] ${accent ? "text-ink/75" : "text-ink-muted"}`}>
          {delta !== undefined && delta !== null && (
            <span className={`inline-flex items-center rounded-full bg-paper/75 px-1.5 font-semibold tabular-nums ${up ? "text-success" : "text-error"}`}>
              <span aria-hidden="true">{up ? "▲" : "▼"}</span>
              <span className="sr-only">{up ? "Sube" : "Baja"}</span>&nbsp;
              {Math.abs(delta).toLocaleString("es-CO", { maximumFractionDigits: deltaUnit === "pp" || Math.abs(delta) >= 10 ? 0 : 1 })}
              {deltaUnit === "pp" ? " p. p." : " %"}
            </span>
          )}
          {delta === null && <span className="font-semibold">Sin datos previos</span>}
          {hint}
        </p>
      )}
    </div>
  );
}

const STAR = "M12 2l3 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.8 20.6l1.4-6.8L2.1 9.1 9 8.3z";

// Valoración de 1 a 5. Con onChange es un grupo de radios (flechas para cambiar; clic en la actual la quita).
export function Stars({ value, onChange, size = 16 }: { value: number | null; onChange?: (v: number | null) => void; size?: number }) {
  const v = value ?? 0;
  if (!onChange)
    return (
      <span role="img" aria-label={value ? `${value} de 5` : "Sin valoración"} className="inline-flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <svg key={n} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={n <= v ? "fill-[#e9bf38]" : "fill-line-strong"}>
            <path d={STAR} />
          </svg>
        ))}
      </span>
    );
  return (
    <div role="radiogroup" aria-label="Valoración interna" className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={v === n}
          aria-label={`${n} de 5`}
          tabIndex={v === n || (!v && n === 1) ? 0 : -1}
          onClick={() => onChange(v === n ? null : n)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(Math.min(5, v + 1));
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(Math.max(1, v - 1));
          }}
          className="rounded-md p-0.5 transition-transform duration-150 motion-safe:hover:scale-110"
        >
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`transition-colors ${n <= v ? "fill-[#e9bf38]" : "fill-line-strong"}`}
          >
            <path d={STAR} />
          </svg>
        </button>
      ))}
    </div>
  );
}

/* ───────────── Campos numéricos ───────────── */

type NumProps = { id?: string; value: number; onChange: (v: number) => void; invalid?: boolean; describedBy?: string; className?: string };

// Pesos colombianos con separador de miles mientras se escribe ("290.000").
export function MoneyInput({ id, value, onChange, invalid, describedBy, className = "" }: NumProps) {
  return (
    <div className={`relative ${className}`}>
      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[15px] text-ink-muted">
        $
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={value ? value.toLocaleString("es-CO") : ""}
        placeholder="0"
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
          onChange(digits ? parseInt(digits, 10) : 0);
        }}
        className={`field-input field-compact pr-14 pl-8 tabular-nums`}
      />
      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[12px] font-semibold text-ink-subtle">
        COP
      </span>
    </div>
  );
}

// Número pequeño con botones − / + (capacidad, unidades, huéspedes).
export function Stepper({ id, value, onChange, min = 0, max = 99, unit, describedBy }: NumProps & { min?: number; max?: number; unit?: string }) {
  return (
    <div className="flex h-[42px] items-center rounded-[14px] border border-line-strong bg-paper px-0.5 transition-[border-color,box-shadow] focus-within:border-focus focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-focus)_12%,transparent)] pointer-coarse:h-11">
      <button
        type="button"
        aria-label="Restar"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="grid size-9 flex-none place-items-center rounded-full text-ink-muted transition-colors hover:bg-ink/6 hover:text-ink disabled:opacity-35"
      >
        −
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        aria-describedby={describedBy}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, "") || "0", 10);
          onChange(Math.min(max, Math.max(min, n)));
        }}
        className="h-full w-12 min-w-0 flex-1 bg-transparent text-center text-[15px] font-semibold text-ink tabular-nums outline-none"
      />
      {unit && <span className="pr-1 text-[12.5px] text-ink-muted">{unit}</span>}
      <button
        type="button"
        aria-label="Sumar"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="grid size-9 flex-none place-items-center rounded-full text-ink-muted transition-colors hover:bg-ink/6 hover:text-ink disabled:opacity-35"
      >
        +
      </button>
    </div>
  );
}
