"use client";

// Selectores de fecha del panel (una fecha o un rango), con el mismo lenguaje visual del calendario principal.
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "@/components/ui/icons";
import { MONTHS, WD_MIN, addDays, fmtDate, monthStart, nightsBetween, parseISO, plural, todayISO } from "@/lib/format";
import { Popover, useTip } from "@/components/ui/floating";
import { adminInput } from "@/components/admin/shared";

// Marcas por día: "busy" = ocupado, "blocked" = bloqueado, "partial" = queda poca disponibilidad.
export type DayMark = "busy" | "blocked" | "partial";

const WD = [1, 2, 3, 4, 5, 6, 0].map((i) => WD_MIN[i]); // semana desde el lunes
const addMonths = (m: string, n: number) => {
  const d = parseISO(m);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)).toISOString().slice(0, 10);
};
const MARK_LABEL: Record<DayMark, string> = { busy: "ocupado", blocked: "bloqueado", partial: "poca disponibilidad" };
// Lo que dice el tooltip de cada día marcado.
const MARK_TIP: Record<DayMark, string> = {
  busy: "Ocupado: no hay cabaña libre esa noche",
  blocked: "Bloqueado: esa noche está cerrada",
  partial: "Poca disponibilidad: queda 1 cabaña",
};

type GridProps = {
  month: string;
  from: string | null;
  to: string | null;
  preview: string | null;
  focus: string;
  today: string;
  isDisabled: (iso: string) => boolean;
  marks?: Record<string, DayMark>;
  // Días que no se pueden elegir ahora (con el motivo, que sale en el tooltip). Siguen enfocables con el teclado.
  blockedReason?: (iso: string) => string | null;
  onPick: (iso: string) => void;
  onHover: (iso: string | null) => void;
  onKey: (e: KeyboardEvent<HTMLButtonElement>, iso: string) => void;
};

function MonthGrid({ month, from, to, preview, focus, today, isDisabled, marks = {}, blockedReason, onPick, onHover, onKey }: GridProps) {
  const tip = useTip();
  const d = parseISO(month);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const lead = (d.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const end = to ?? (from && preview && preview > from ? preview : null);

  return (
    <div className="flex w-[252px] flex-col gap-1.5">
      <p className="text-center text-[13.5px] font-bold text-ink capitalize">{`${MONTHS[m]} ${y}`}</p>
      <div aria-hidden="true" className="grid grid-cols-7 text-center text-[11px] font-semibold text-ink-subtle">
        {WD.map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div role="grid" aria-label={`${MONTHS[m]} ${y}`} className="grid grid-cols-7 gap-y-0.5" onMouseLeave={() => onHover(null)}>
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
          const dis = isDisabled(iso);
          const isStart = iso === from;
          const isEnd = !!end && iso === end;
          const inRange = !!(from && end && iso > from && iso < end);
          const mark = marks[iso];
          const col = (lead + i) % 7;
          const reason = dis ? null : (blockedReason?.(iso) ?? null);
          const note = reason ?? (mark ? MARK_TIP[mark] : null);
          return (
            <button
              key={iso}
              type="button"
              tabIndex={iso === focus ? 0 : -1}
              data-iso={iso}
              disabled={dis}
              aria-disabled={reason ? true : undefined}
              aria-pressed={isStart || isEnd}
              aria-label={`${fmtDate(iso, true)}${isStart ? ", inicio" : ""}${isEnd ? ", fin" : ""}${reason ? `, ${reason}` : mark ? `, ${MARK_LABEL[mark]}` : ""}${iso === today ? ", hoy" : ""}`}
              {...(note && !isStart && !isEnd ? tip(() => note, { delay: 80 }) : {})}
              onClick={() => !reason && onPick(iso)}
              onMouseEnter={() => onHover(reason ? null : iso)}
              onKeyDown={(e) => onKey(e, iso)}
              className={`relative grid h-9 place-items-center text-[13px] tabular-nums transition-colors duration-100 disabled:cursor-not-allowed disabled:text-ink-subtle/70 disabled:line-through aria-disabled:cursor-not-allowed ${
                isStart || isEnd
                  ? "z-1 rounded-full bg-ink font-bold text-paper"
                  : inRange
                    ? `bg-ink/8 font-semibold text-ink ${col === 0 ? "rounded-l-full" : ""} ${col === 6 ? "rounded-r-full" : ""}`
                    : `rounded-full ${mark ? MARK_CELL[mark] : reason ? "text-ink-subtle/70" : "text-ink enabled:hover:bg-ink/6"} ${iso === today ? "font-bold" : ""}`
              }`}
            >
              {i + 1}
              {iso === today && !isStart && !isEnd && <span aria-hidden="true" className="absolute bottom-1 h-0.5 w-3 rounded-full bg-ink/50" />}
              {/* Dentro del rango elegido el día ya no lleva su color: un punto recuerda cómo estaba. */}
              {mark && mark !== "blocked" && (isStart || isEnd || inRange) && (
                <span aria-hidden="true" className={`absolute top-1 right-1 size-1.5 rounded-full ring-1 ring-paper ${MARK_DOT[mark]}`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type PickerProps = {
  id?: string;
  min?: string;
  max?: string;
  disabled?: (iso: string) => boolean;
  marks?: Record<string, DayMark>;
  legend?: boolean; // muestra la leyenda de marcas
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
};

// Lógica común: mes visible, día con foco, navegación con teclado.
function usePicker(anchorDate: string | null, min?: string, max?: string, disabled?: (iso: string) => boolean) {
  const today = todayISO();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(monthStart(anchorDate ?? today));
  const [focus, setFocus] = useState(anchorDate ?? today);
  const [hover, setHover] = useState<string | null>(null);
  const isDisabled = (iso: string) => (!!min && iso < min) || (!!max && iso > max) || !!disabled?.(iso);

  const openAt = (iso: string | null) => {
    const f = iso ?? (min && today < min ? min : today);
    setMonth(monthStart(f));
    setFocus(f);
    setOpen(true);
  };

  // Mueve el foco y, si sale del mes visible, cambia de mes. El foco se aplica al renderizar.
  const moveTo = (iso: string, months = 1) => {
    setFocus(iso);
    const ms = monthStart(iso);
    if (ms < month || ms > addMonths(month, months - 1)) setMonth(ms < month ? ms : addMonths(ms, -(months - 1)));
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, iso: string, months = 1) => {
    const d = parseISO(iso);
    const wd = (d.getUTCDay() + 6) % 7;
    const step: Record<string, string> = {
      ArrowLeft: addDays(iso, -1),
      ArrowRight: addDays(iso, 1),
      ArrowUp: addDays(iso, -7),
      ArrowDown: addDays(iso, 7),
      Home: addDays(iso, -wd),
      End: addDays(iso, 6 - wd),
      PageUp: addDays(iso, -30),
      PageDown: addDays(iso, 30),
    };
    if (!step[e.key]) return;
    e.preventDefault();
    moveTo(step[e.key], months);
  };
  return { today, open, setOpen, month, setMonth, focus, hover, setHover, isDisabled, openAt, onKey };
}

// Lleva el foco del teclado al día activo cuando cambia.
function useFocusDay(open: boolean, focus: string, panel: RefObject<HTMLDivElement | null>) {
  const first = useRef(true);
  useEffect(() => {
    if (!open) {
      first.current = true;
      return;
    }
    const el = panel.current?.querySelector<HTMLElement>(`[data-iso="${focus}"]`);
    if (el && (first.current || panel.current?.contains(document.activeElement))) el.focus({ preventScroll: true });
    first.current = false;
  }, [open, focus, panel]);
}

// Color de cada día marcado: el día entero se tiñe (rojo ocupado, ámbar poca disponibilidad, rayado gris bloqueado),
// y la leyenda usa las mismas muestras para que se reconozcan de un vistazo.
const HATCH = "bg-[repeating-linear-gradient(135deg,rgb(110_114_106/0.38)_0_2px,transparent_2px_5px)]";
const MARK_CELL: Record<DayMark, string> = {
  busy: "bg-error-soft font-semibold text-error",
  partial: "bg-warning-soft font-semibold text-warning",
  blocked: `${HATCH} text-ink-muted`,
};
const MARK_DOT: Record<DayMark, string> = { busy: "bg-error", partial: "bg-warning", blocked: "bg-ink-muted" };

function Legend() {
  const items: [DayMark, string][] = [
    ["busy", "Ocupado"],
    ["partial", "Poca disponibilidad"],
    ["blocked", "Bloqueado"],
  ];
  return (
    <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] text-ink-muted">
      {items.map(([m, label]) => (
        <li key={m} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`size-3.5 rounded-full ${m === "blocked" ? `${HATCH} ring-1 ring-ink/15` : MARK_CELL[m]}`} />
          {label}
        </li>
      ))}
    </ul>
  );
}

const triggerCls = (className = "") => `${adminInput} flex items-center justify-between gap-2 text-left ${className}`;

function Nav({ month, setMonth, count }: { month: string; setMonth: (m: string) => void; count: number }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-between">
      <button
        type="button"
        aria-label="Mes anterior"
        onClick={() => setMonth(addMonths(month, -1))}
        className="btn-icon pointer-events-auto size-8 text-ink-muted transition-colors hover:bg-ink/6 hover:text-ink"
      >
        <ChevronLeftIcon size={16} />
      </button>
      <button
        type="button"
        aria-label={count > 1 ? "Meses siguientes" : "Mes siguiente"}
        onClick={() => setMonth(addMonths(month, 1))}
        className="btn-icon pointer-events-auto size-8 text-ink-muted transition-colors hover:bg-ink/6 hover:text-ink"
      >
        <ChevronRightIcon size={16} />
      </button>
    </div>
  );
}

/* ───────────── Una fecha ───────────── */

export function DatePicker({
  value,
  onChange,
  clearable = true,
  ...p
}: PickerProps & { value: string | null; onChange: (v: string | null) => void; clearable?: boolean }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const k = usePicker(value, p.min, p.max, p.disabled);
  useFocusDay(k.open, k.focus, panel);
  const pick = (iso: string | null) => {
    onChange(iso);
    k.setOpen(false);
    anchor.current?.focus();
  };

  return (
    <>
      <button
        ref={anchor}
        id={p.id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={k.open}
        data-invalid={p.invalid || undefined}
        aria-describedby={p.describedBy}
        onClick={() => (k.open ? k.setOpen(false) : k.openAt(value))}
        className={triggerCls(p.className)}
      >
        <span className={`truncate ${value ? "" : "text-ink-subtle"}`}>{value ? fmtDate(value, true) : (p.placeholder ?? "Elegir fecha")}</span>
        <CalendarIcon size={16} className="text-ink-muted" />
      </button>
      <Popover open={k.open} onClose={() => k.setOpen(false)} anchor={anchor} label="Elegir fecha">
        <div ref={panel} className="relative flex flex-col gap-3 p-3 max-sm:items-center">
          <Nav month={k.month} setMonth={k.setMonth} count={1} />
          <MonthGrid
            month={k.month}
            from={value}
            to={null}
            preview={null}
            focus={k.focus}
            today={k.today}
            isDisabled={k.isDisabled}
            marks={p.marks}
            onPick={pick}
            onHover={() => {}}
            onKey={k.onKey}
          />
          {p.legend && <Legend />}
          <div className="flex w-full justify-between gap-2 border-t border-line pt-2.5">
            <button
              type="button"
              disabled={k.isDisabled(k.today)}
              onClick={() => pick(k.today)}
              className="rounded-full px-2.5 py-1 text-[13px] font-semibold text-ink transition-colors hover:bg-ink/6 disabled:opacity-40"
            >
              Hoy
            </button>
            {clearable && value && (
              <button
                type="button"
                onClick={() => pick(null)}
                className="rounded-full px-2.5 py-1 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-ink/6 hover:text-ink"
              >
                Quitar fecha
              </button>
            )}
          </div>
        </div>
      </Popover>
    </>
  );
}

/* ───────────── Rango ───────────── */

type RangeProps = PickerProps & {
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
  // "nights": `to` es el día de salida (después de `from`). "days": rango de días incluidos (puede ser un solo día).
  mode?: "nights" | "days";
  clearable?: boolean;
};

export function DateRangePicker({ from, to, onChange, mode = "days", clearable = true, ...p }: RangeProps) {
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const k = usePicker(from, p.min, p.max, p.disabled);
  const [draft, setDraft] = useState<{ from: string | null; to: string | null }>({ from, to });
  const [wide, setWide] = useState(false);
  useFocusDay(k.open, k.focus, panel);
  const months = wide ? 2 : 1;

  const open = () => {
    const w = innerWidth >= 640;
    setDraft({ from, to });
    setWide(w);
    k.openAt(from);
    // Sin fechas y con tope (un periodo pasado): el último mes visible es el del tope, no uno ya deshabilitado.
    if (!from && p.max && w) k.setMonth(addMonths(monthStart(p.max), -1));
  };
  // Por noches, los días ocupados o bloqueados no se pueden elegir como noche de la estadía. La salida sí puede caer en
  // uno (esa noche no se usa), pero solo en el primero: la estadía no puede pasar por encima de una noche no disponible.
  const marks = p.marks ?? {};
  const closed = (iso: string) => mode === "nights" && (marks[iso] === "busy" || marks[iso] === "blocked");
  const choosingEnd = !!draft.from && !draft.to;
  const limit = (() => {
    if (!choosingEnd || mode !== "nights") return null;
    for (let d = addDays(draft.from!, 1), i = 0; i < 400; d = addDays(d, 1), i++) if (closed(d)) return d;
    return null;
  })();
  const blockedReason = (iso: string): string | null => {
    if (mode !== "nights") return null;
    if (choosingEnd && iso > draft.from!) {
      if (limit && iso > limit) return "No se puede: la estadía pasaría por noches ocupadas o bloqueadas";
      return null; // salida: puede caer en el primer día no disponible
    }
    const m = marks[iso];
    return m === "busy" || m === "blocked" ? MARK_TIP[m] : null;
  };
  const pick = (iso: string) => {
    const d = draft;
    if (!d.from || d.to || iso < d.from || (mode === "nights" && iso === d.from)) {
      setDraft({ from: iso, to: null });
      return;
    }
    onChange(d.from, iso);
    setDraft({ from: d.from, to: iso });
    k.setOpen(false);
    anchor.current?.focus();
  };

  const count = from && to ? (mode === "nights" ? plural(nightsBetween(from, to), "noche", "noches") : plural(nightsBetween(from, to) + 1, "día", "días")) : "";
  const label = from && to ? `${fmtDate(from)} → ${fmtDate(to)}` : from ? `Desde ${fmtDate(from)}` : (p.placeholder ?? "Elegir fechas");
  const hint =
    !draft.from || draft.to
      ? mode === "nights"
        ? "Elige la fecha de llegada"
        : "Elige el primer día"
      : mode === "nights"
        ? "Ahora elige la fecha de salida"
        : "Ahora elige el último día (incluido)";

  return (
    <>
      <button
        ref={anchor}
        id={p.id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={k.open}
        data-invalid={p.invalid || undefined}
        aria-describedby={p.describedBy}
        onClick={() => (k.open ? k.setOpen(false) : open())}
        className={triggerCls(p.className)}
      >
        <span className={`min-w-0 truncate ${from ? "" : "text-ink-subtle"}`}>
          {label}
          {count && <span className="text-ink-muted"> · {count}</span>}
        </span>
        <CalendarIcon size={16} className="flex-none text-ink-muted" />
      </button>
      <Popover open={k.open} onClose={() => k.setOpen(false)} anchor={anchor} label="Elegir rango de fechas">
        <div ref={panel} className="relative flex flex-col gap-3 p-3 max-sm:items-center">
          <Nav month={k.month} setMonth={k.setMonth} count={months} />
          <div className="flex gap-5">
            {Array.from({ length: months }, (_, i) => (
              <MonthGrid
                key={i}
                month={addMonths(k.month, i)}
                from={draft.from}
                to={draft.to}
                preview={k.hover}
                focus={k.focus}
                today={k.today}
                isDisabled={k.isDisabled}
                marks={p.marks}
                blockedReason={blockedReason}
                onPick={pick}
                onHover={k.setHover}
                onKey={(e, iso) => k.onKey(e, iso, months)}
              />
            ))}
          </div>
          {p.legend && <Legend />}
          <div className="flex w-full items-center justify-between gap-2 border-t border-line pt-2.5">
            <p aria-live="polite" className="text-[12.5px] text-ink-muted">
              {hint}
            </p>
            {clearable && (from || draft.from) && (
              <button
                type="button"
                onClick={() => {
                  setDraft({ from: null, to: null });
                  onChange(null, null);
                }}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-ink/6 hover:text-ink"
              >
                <CloseIcon size={13} />
                Limpiar
              </button>
            )}
          </div>
        </div>
      </Popover>
    </>
  );
}
