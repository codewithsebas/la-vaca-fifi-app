"use client";

// Acciones de una reserva. Las del día a día (pagos, check-in, check-out) van a la vista; las que cambian la reserva
// (fechas, cabaña, personas y valor) y cancelar van juntas en un menú, cada una con una línea de lo que hace.
import { useRef, useState, type ReactNode } from "react";
import { BanIcon, CalendarIcon, DollarIcon, ChevronDownIcon, CloseIcon, LoginIcon, LogoutIcon, MoreIcon, PencilIcon, SwapIcon } from "@/components/ui/icons";
import { Popover, useLabelTip } from "@/components/ui/floating";
import { buttonClass, iconButtonClass } from "@/components/admin/ui";

export type ActionKind = "pay" | "checkin" | "checkout" | "reschedule" | "move" | "adjust" | "cancel" | "cancel-group";
export type Action = { id: ActionKind; label: string; hint?: string; primary: boolean; danger: boolean; disabled?: string; run: () => void };

// Icono y gesto (globals.css, [data-gesture]) de cada acción.
export const ACTION_ICON: Record<ActionKind, { icon: (size: number) => ReactNode; gesture: string }> = {
  pay: { icon: (s) => <DollarIcon size={s} />, gesture: "pay" },
  checkin: { icon: (s) => <LoginIcon size={s} />, gesture: "checkin" },
  checkout: { icon: (s) => <LogoutIcon size={s} />, gesture: "checkout" },
  reschedule: { icon: (s) => <CalendarIcon size={s} />, gesture: "calendar" },
  move: { icon: (s) => <SwapIcon size={s} />, gesture: "checkin" },
  adjust: { icon: (s) => <PencilIcon size={s} />, gesture: "checkin" },
  // Sin grupo, «Cancelar reserva»; en un grupo, la X es solo esta cabaña y el círculo tachado, todo el grupo.
  cancel: { icon: (s) => <CloseIcon size={s} />, gesture: "cancel" },
  "cancel-group": { icon: (s) => <BanIcon size={s} />, gesture: "cancel" },
};

const EDIT_ORDER: ActionKind[] = ["reschedule", "move", "adjust"];
export const inMenu = (a: Action) => a.danger || EDIT_ORDER.includes(a.id);

// `compact`: botón «⋯» para las filas de una lista; si no, «Editar reserva».
export function ActionMenu({ actions, compact = false }: { actions: Action[]; compact?: boolean }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const tip = useLabelTip("Editar reserva");
  const edits = actions.filter((a) => !a.danger).sort((a, b) => EDIT_ORDER.indexOf(a.id) - EDIT_ORDER.indexOf(b.id));
  const dangers = actions.filter((a) => a.danger);
  if (!actions.length) return null;

  const item = (a: Action) => (
    <button
      key={a.label}
      type="button"
      role="menuitem"
      disabled={!!a.disabled}
      onClick={() => {
        setOpen(false);
        a.run();
      }}
      className="flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-left transition-colors hover:bg-panel/70 disabled:opacity-45"
    >
      <span aria-hidden="true" className={`grid size-9 flex-none place-items-center rounded-full bg-panel ${a.danger ? "text-error" : "text-ink"}`}>
        {ACTION_ICON[a.id].icon(16)}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[14px] font-semibold ${a.danger ? "text-error" : "text-ink"}`}>{a.label}</span>
        {(a.disabled || a.hint) && <span className="block text-[12px] text-ink-muted">{a.disabled || a.hint}</span>}
      </span>
    </button>
  );

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={compact ? "Editar reserva" : undefined}
        {...(compact && !open ? tip : {})}
        onClick={() => setOpen(!open)}
        className={compact ? iconButtonClass("secondary", "sm", "text-ink") : buttonClass("secondary", "md", "gap-1.5")}
      >
        {compact ? (
          <MoreIcon size={15} />
        ) : (
          <>
            <PencilIcon size={15} />
            Editar reserva
            <ChevronDownIcon size={14} />
          </>
        )}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} placement="bottom-end" label="Editar reserva" role="menu" className="w-[290px] p-1.5">
        {edits.map(item)}
        {edits.length > 0 && dangers.length > 0 && <hr className="mx-2.5 my-1.5 border-line" />}
        {dangers.map(item)}
      </Popover>
    </>
  );
}
