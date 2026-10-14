"use client";

// Capas flotantes (popover nativo en la capa superior): menús, selectores y tooltips. Las usan el panel y el sitio.
// Al vivir en la top layer no los recorta ningún contenedor con scroll y, dentro de un <dialog> modal, siguen siendo interactivos.
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";

type Placement = "bottom-start" | "bottom-end" | "top";

const MOBILE = 640;

type FloatOpts = { placement?: Placement; offset?: number; matchWidth?: boolean; sheet?: boolean };

// Posiciona `f` junto a `anchor` (fixed), volteando hacia arriba si no cabe. En móvil, hoja inferior.
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
      let left = placement === "bottom-end" ? a.right - fw : placement === "top" ? a.left + a.width / 2 - fw / 2 : a.left;
      left = Math.min(Math.max(8, left), innerWidth - fw - 8);
      const below = a.bottom + offset;
      const above = a.top - offset - fh;
      let top = placement === "top" ? above : below;
      if (placement === "top" && top < 8) top = below;
      if (placement !== "top" && below + fh > innerHeight - 8 && above > 8) top = above;
      f.style.left = `${Math.round(left)}px`;
      f.style.top = `${Math.round(Math.max(8, top))}px`;
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
  panel: "admin-surface rounded-2xl border border-line bg-panel text-ink shadow-overlay",
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

type Tip = { anchor: HTMLElement; content: ReactNode; path: string } | null;
type TipApi = { show: (anchor: HTMLElement, content: ReactNode, delay?: number) => void; hide: () => void };

const TipCtx = createContext<TipApi | null>(null);

// Una sola capa de tooltip para todo el panel (el calendario tiene cientos de elementos con información).
export function TipProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setTip] = useState<Tip>(null);
  // Al cambiar de página el elemento de origen desaparece: el tooltip de la página anterior no se muestra.
  const tip = state?.path === pathname ? state : null;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => (tip ? track(tip.anchor, ref.current, { placement: "top", offset: 8, sheet: false }) : undefined), [tip]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (tip && !el.matches(":popover-open")) el.showPopover();
    if (!tip && el.matches(":popover-open")) el.hidePopover();
  }, [tip]);

  const api = useMemo<TipApi>(
    () => ({
      show: (a, content, delay = 250) => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setTip({ anchor: a, content, path: location.pathname }), delay);
      },
      hide: () => {
        clearTimeout(timer.current);
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
        className="admin-surface pointer-events-none fixed inset-auto m-0 max-w-[300px] rounded-xl border-0 bg-ink p-0 text-white shadow-overlay motion-safe:open:animate-fade-in"
      >
        {tip && <div className="px-3 py-2.5 text-[12.5px] leading-snug">{tip.content}</div>}
      </div>
    </TipCtx.Provider>
  );
}

// Props para que un elemento muestre un tooltip al pasar el ratón o al recibir el foco del teclado.
// En pantallas táctiles no aparece (tocar ya abre el detalle o las acciones) y se oculta al pulsar.
export function useTip() {
  const api = useContext(TipCtx);
  return useCallback(
    (content: () => ReactNode) =>
      api
        ? {
            onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => e.pointerType === "mouse" && api.show(e.currentTarget, content()),
            onPointerLeave: api.hide,
            onPointerDown: api.hide,
            onFocus: (e: FocusEvent<HTMLElement>) => e.currentTarget.matches(":focus-visible") && api.show(e.currentTarget, content(), 0),
            onBlur: api.hide,
          }
        : {},
    [api],
  );
}
