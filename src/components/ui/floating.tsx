"use client";

// Capas flotantes (popover nativo en la capa superior): menús, selectores y tooltips. Las usan el panel y el sitio.
// Al vivir en la top layer no los recorta ningún contenedor con scroll y, dentro de un <dialog> modal, siguen siendo interactivos.
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

type Placement = "bottom-start" | "bottom-end" | "top" | "right";

const MOBILE = 640;

type FloatOpts = { placement?: Placement; offset?: number; matchWidth?: boolean; sheet?: boolean };

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(min, v), Math.max(min, max));

// Posiciona `f` junto a `anchor` (fixed): voltea al lado contrario si no cabe y se corre para no salirse de la pantalla.
// En móvil, hoja inferior. Deja en data-side el lado donde quedó y en --arrow dónde apunta la flecha (tooltips).
// Devuelve la función que deja de seguir los cambios de tamaño y desplazamiento.
function track(anchor: HTMLElement | null, f: HTMLElement | null, { placement = "bottom-start", offset = 6, matchWidth = false, sheet = true }: FloatOpts) {
  if (!anchor || !f) return;
  const update = () => {
    const a = anchor.getBoundingClientRect();
    if (sheet && innerWidth < MOBILE) {
      f.dataset.sheet = "";
      f.style.left = f.style.top = f.style.minWidth = "";
      return;
    }
    delete f.dataset.sheet;
    if (matchWidth) f.style.minWidth = `${a.width}px`;
    const fw = f.offsetWidth;
    const fh = f.offsetHeight;
    let left: number;
    let top: number;
    let side: "top" | "bottom" | "left" | "right";
    if (placement === "right") {
      // A la derecha del ancla (barra lateral contraída); a la izquierda si no cabe. Dentro de un contenedor con
      // data-tip-edge (la barra lateral) sale desde su borde, no encima de él.
      const edge = Math.max(a.right, anchor.closest<HTMLElement>("[data-tip-edge]")?.getBoundingClientRect().right ?? 0);
      side = edge + offset + fw <= innerWidth - 8 || a.left - offset - fw < 8 ? "right" : "left";
      left = side === "right" ? edge + offset : a.left - offset - fw;
      top = clamp(a.top + a.height / 2 - fh / 2, 8, innerHeight - fh - 8);
      f.style.setProperty("--arrow", `${Math.round(clamp(a.top + a.height / 2 - top, 12, fh - 12))}px`);
    } else {
      // Encima o debajo; si el ancla es más ancha que la pantalla visible (una barra larga del calendario), se centra en
      // la parte que se ve.
      const vl = Math.max(a.left, 8);
      const vr = Math.min(a.right, innerWidth - 8);
      const mid = vr > vl ? (vl + vr) / 2 : a.left + a.width / 2;
      left = placement === "bottom-end" ? a.right - fw : placement === "top" ? mid - fw / 2 : a.left;
      left = clamp(left, 8, innerWidth - fw - 8);
      const below = a.bottom + offset;
      const above = a.top - offset - fh;
      const fitsAbove = above >= 8;
      const fitsBelow = below + fh <= innerHeight - 8;
      side = placement === "top" ? (fitsAbove || !fitsBelow ? "top" : "bottom") : fitsBelow || !fitsAbove ? "bottom" : "top";
      top = side === "top" ? above : below;
      f.style.setProperty("--arrow", `${Math.round(clamp(mid - left, 12, fw - 12))}px`);
    }
    f.dataset.side = side;
    f.style.left = `${Math.round(left)}px`;
    f.style.top = `${Math.round(clamp(top, 8, innerHeight - fh - 8))}px`;
  };
  update();
  const ro = new ResizeObserver(update);
  ro.observe(f);
  addEventListener("resize", update);
  addEventListener("scroll", update, true);
  return () => {
    ro.disconnect();
    removeEventListener("resize", update);
    removeEventListener("scroll", update, true);
  };
}

const sheetCls =
  "data-[sheet]:inset-x-0 data-[sheet]:top-auto data-[sheet]:bottom-0 data-[sheet]:w-full data-[sheet]:max-w-none data-[sheet]:rounded-t-2xl data-[sheet]:rounded-b-none data-[sheet]:pb-[max(12px,env(safe-area-inset-bottom))]";

// Aspecto según dónde se usa: el panel (superficie blanca) o el sitio (tarjeta crema de la marca).
const TONE = {
  panel: "admin-surface rounded-[18px] border border-line bg-paper text-ink shadow-overlay",
  site: "rounded-md border-2 border-card-muted bg-card text-on-light shadow-pop",
};
export type Tone = keyof typeof TONE;

type PopoverProps = {
  open: boolean;
  tone?: Tone;
  onClose: () => void;
  anchor: RefObject<HTMLElement | null>;
  placement?: Placement;
  matchWidth?: boolean;
  label?: string;
  role?: "dialog" | "listbox" | "menu";
  id?: string;
  className?: string;
  children: ReactNode;
};

// Panel flotante anclado. Se cierra con Escape (devuelve el foco al ancla) o al hacer clic fuera.
export function Popover({ open, onClose, anchor, placement, matchWidth, label, role = "dialog", id, tone = "panel", className = "", children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useLayoutEffect(() => (open ? track(anchor.current, ref.current, { placement, matchWidth }) : undefined), [open, anchor, placement, matchWidth]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.matches(":popover-open")) el.showPopover();
    if (!open && el.matches(":popover-open")) el.hidePopover();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.current?.contains(t)) close.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      close.current();
      anchor.current?.focus();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, anchor]);

  return (
    <div
      ref={ref}
      id={id}
      popover="manual"
      role={role === "dialog" ? "dialog" : undefined}
      aria-label={label}
      className={`fixed inset-auto m-0 overflow-visible p-0 motion-safe:open:animate-pop-in ${TONE[tone]} ${sheetCls} ${className}`}
    >
      {open && children}
    </div>
  );
}

/* ───────────── Tooltips ───────────── */

// "top": encima (o debajo si no cabe). "right": a un lado, para la barra lateral contraída.
type TipPlacement = "top" | "right";
// anchor: el elemento al que apunta (por defecto, el que recibe el ratón; p. ej. la barra dentro de una columna alta).
type TipOpts = { placement?: TipPlacement; delay?: number; anchor?: (el: HTMLElement) => HTMLElement | null };
type Tip = { anchor: HTMLElement; content: ReactNode; path: string; placement: TipPlacement } | null;
type TipApi = { show: (anchor: HTMLElement, content: ReactNode, opts?: TipOpts) => void; hide: () => void };

const TipCtx = createContext<TipApi | null>(null);

// Una sola capa de tooltip para todo el panel (el calendario tiene cientos de elementos con información).
export function TipProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setTip] = useState<Tip>(null);
  // Al cambiar de página el elemento de origen desaparece: el tooltip de la página anterior no se muestra.
  const tip = state?.path === pathname ? state : null;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const open = useRef(false);
  const closedAt = useRef(0);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(
    () => (tip ? track(tip.anchor, ref.current, { placement: tip.placement, offset: tip.placement === "right" ? 12 : 9, sheet: false }) : undefined),
    [tip],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (tip && !el.matches(":popover-open")) el.showPopover();
    if (!tip && el.matches(":popover-open")) el.hidePopover();
    open.current = !!tip;
  }, [tip]);

  const api = useMemo<TipApi>(
    () => ({
      // Recorriendo elementos seguidos (los iconos del menú), el siguiente tooltip sale sin esperar.
      show: (a, content, { placement = "top", delay = 250 } = {}) => {
        clearTimeout(timer.current);
        const warm = Date.now() - closedAt.current < 400;
        timer.current = setTimeout(() => setTip({ anchor: a, content, path: location.pathname, placement }), warm ? 0 : delay);
      },
      hide: () => {
        clearTimeout(timer.current);
        if (open.current) closedAt.current = Date.now();
        setTip(null);
      },
    }),
    [],
  );

  return (
    <TipCtx.Provider value={api}>
      {children}
      <div
        ref={ref}
        popover="manual"
        role="tooltip"
        className="admin-surface group/tip pointer-events-none fixed inset-auto m-0 w-max max-w-[300px] overflow-visible rounded-[12px] border-0 bg-ink p-0 text-paper shadow-overlay motion-safe:open:animate-fade-in"
      >
        {tip && (
          <>
            {/* Flecha hacia el elemento: --arrow y data-side los pone track(). */}
            <span
              aria-hidden="true"
              className="absolute size-2.5 rotate-45 rounded-[2px] bg-ink group-data-[side=bottom]/tip:-top-1 group-data-[side=bottom]/tip:left-(--arrow) group-data-[side=bottom]/tip:-translate-x-1/2 group-data-[side=left]/tip:top-(--arrow) group-data-[side=left]/tip:-right-1 group-data-[side=left]/tip:-translate-y-1/2 group-data-[side=right]/tip:top-(--arrow) group-data-[side=right]/tip:-left-1 group-data-[side=right]/tip:-translate-y-1/2 group-data-[side=top]/tip:-bottom-1 group-data-[side=top]/tip:left-(--arrow) group-data-[side=top]/tip:-translate-x-1/2"
            />
            <div className="relative px-3 py-2.5 text-[12.5px] leading-snug">{tip.content}</div>
          </>
        )}
      </div>
    </TipCtx.Provider>
  );
}

// Props para que un elemento muestre un tooltip al pasar el ratón o al recibir el foco del teclado.
// En pantallas táctiles no aparece (tocar ya abre el detalle o las acciones) y se oculta al pulsar.
export function useTip() {
  const api = useContext(TipCtx);
  return useCallback(
    (content: () => ReactNode, opts?: TipOpts) =>
      api
        ? {
            onPointerEnter: (e: ReactPointerEvent<HTMLElement>) =>
              e.pointerType === "mouse" && api.show(opts?.anchor?.(e.currentTarget) ?? e.currentTarget, content(), opts),
            onPointerLeave: api.hide,
            onPointerDown: api.hide,
            onFocus: (e: FocusEvent<HTMLElement>) =>
              e.currentTarget.matches(":focus-visible") && api.show(opts?.anchor?.(e.currentTarget) ?? e.currentTarget, content(), { ...opts, delay: 0 }),
            onBlur: api.hide,
          }
        : {},
    [api],
  );
}

// Tooltip de un botón o enlace de solo icono: el tooltip del panel si hay uno; si no (pantalla de ingreso), el title nativo.
// Sus manejadores se combinan con los que ya traiga el elemento.
type TipHandlers = {
  onPointerEnter?: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave?: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
  onFocus?: (e: FocusEvent<HTMLElement>) => void;
  onBlur?: (e: FocusEvent<HTMLElement>) => void;
};
export function useLabelTip(label: string, own: TipHandlers = {}, opts?: TipOpts): TipHandlers & { title?: string } {
  const tip = useTip()(() => label, opts) as TipHandlers;
  if (!tip.onPointerEnter) return { ...own, title: label };
  const out: TipHandlers = {};
  for (const k of ["onPointerEnter", "onPointerLeave", "onPointerDown", "onFocus", "onBlur"] as const) {
    const a = tip[k] as ((e: never) => void) | undefined;
    const b = own[k] as ((e: never) => void) | undefined;
    (out as Record<string, unknown>)[k] = (e: never) => {
      a?.(e);
      b?.(e);
    };
  }
  return out;
}
