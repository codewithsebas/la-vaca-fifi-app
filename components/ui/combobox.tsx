"use client";

// Selector con búsqueda (patrón combobox + listbox de WAI-ARIA). Sustituye a los <select> nativos del panel y del sitio.
// `tone`: "panel" (densidad de herramienta, superficie blanca) o "site" (campo del formulario de reserva, tarjeta crema).
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "@/components/icons";
import { Popover, type Tone } from "./floating";

export type ComboOption = {
  value: string;
  label: string;
  description?: string;
  color?: string; // punto de color (estado, domo)
  disabled?: boolean;
  keywords?: string; // texto extra para la búsqueda
};

type Props = {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  searchable?: boolean; // por defecto, cuando hay más de 6 opciones
  loading?: boolean;
  emptyText?: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
  icon?: ReactNode;
  tone?: Tone;
};

const STYLE = {
  panel: {
    trigger: "field-input field-compact",
    placeholder: "text-ink-subtle",
    search: "h-9 rounded-lg bg-canvas text-[14px] text-ink placeholder:text-ink-subtle focus-visible:ring-2 focus-visible:ring-focus/30",
    searchBox: "border-b border-line p-2",
    option: "rounded-lg px-2.5 py-2 text-[14px]",
    active: "bg-ink/6",
    muted: "text-ink-muted",
    check: "text-success",
    popover: "w-[260px] max-w-[min(440px,calc(100vw-16px))]",
  },
  site: {
    trigger: "field-input",
    placeholder: "text-on-light-muted",
    search: "h-11 rounded-sm bg-card-muted text-[1rem] text-on-light placeholder:text-on-light-muted",
    searchBox: "border-b-2 border-dotted border-card-muted p-2.5",
    option: "min-h-11 rounded-sm px-3 py-2.5 text-[1rem]",
    active: "bg-card-muted",
    muted: "text-on-light-muted",
    check: "text-cta",
    popover: "w-[280px] max-w-[min(460px,calc(100vw-16px))]",
  },
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Resalta la parte del texto que coincide con la búsqueda.
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = norm(text).indexOf(norm(q));
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[3px] bg-highlight/35 text-inherit">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function Combobox({ id, value, onChange, options, placeholder = "Seleccionar", searchPlaceholder = "Buscar…", searchable, loading, emptyText = "No hay opciones", invalid, describedBy, className = "", icon, tone = "panel" }: Props) {
  const st = STYLE[tone];
  const uid = useId();
  const listId = `${uid}-list`;
  const anchor = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const canSearch = searchable ?? options.length > 6;
  const selected = options.find((o) => o.value === value);

  const shown = useMemo(() => {
    const n = norm(q.trim());
    return n ? options.filter((o) => norm(`${o.label} ${o.description ?? ""} ${o.keywords ?? ""}`).includes(n)) : options;
  }, [options, q]);

  const openList = () => {
    setQ("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const choose = (o: ComboOption | undefined) => {
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
    anchor.current?.focus();
  };

  // Al abrir: foco en la búsqueda (o en la lista) y la opción activa a la vista.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => (canSearch ? search.current : list.current)?.focus({ preventScroll: true }), 10);
    return () => clearTimeout(t);
  }, [open, canSearch]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onKey = (e: KeyboardEvent) => {
    const last = shown.length - 1;
    const step = (from: number, d: number) => {
      let i = from;
      for (let n = 0; n <= last; n++) {
        i = (i + d + shown.length) % shown.length;
        if (!shown[i]?.disabled) return i;
      }
      return from;
    };
    if (e.key === "ArrowDown") setActive((a) => step(a, 1));
    else if (e.key === "ArrowUp") setActive((a) => step(a, -1));
    else if (e.key === "Home") setActive(step(-1, 1));
    else if (e.key === "End") setActive(step(shown.length, -1));
    else if (e.key === "Enter" || (!canSearch && e.key === " ")) choose(shown[active]);
    else if (e.key === "Tab") setOpen(false);
    else if (!canSearch && e.key.length === 1) {
      // Sin buscador: saltar a la primera opción que empieza por la letra.
      const i = shown.findIndex((o) => norm(o.label).startsWith(norm(e.key)));
      if (i >= 0) setActive(i);
      return;
    } else return;
    e.preventDefault();
  };

  const activeId = shown[active] ? `${uid}-o${active}` : undefined;

  return (
    <>
      <button
        ref={anchor}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        data-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            openList();
          }
        }}
        className={`${st.trigger} flex items-center justify-between gap-2 text-left ${className}`}
      >
        <span className={`flex min-w-0 items-center gap-2 ${selected ? "" : st.placeholder}`}>
          {icon}
          {selected?.color && <span aria-hidden="true" className="size-2.5 flex-none rounded-full" style={{ background: selected.color }} />}
          <span className="truncate">{selected?.label ?? placeholder}</span>
        </span>
        <ChevronDownIcon size={16} className={`flex-none opacity-70 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} matchWidth role="listbox" tone={tone} className={st.popover}>
        <div className="flex flex-col">
          {canSearch && (
            <div className={`relative ${st.searchBox}`}>
              <SearchIcon size={16} className="pointer-events-none absolute top-1/2 left-4.5 -translate-y-1/2 opacity-60" />
              <input
                ref={search}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={activeId}
                aria-label={searchPlaceholder}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKey}
                placeholder={searchPlaceholder}
                className={`w-full pr-3 pl-8 outline-none ${st.search}`}
              />
            </div>
          )}
          <ul
            ref={list}
            id={listId}
            role="listbox"
            tabIndex={canSearch ? -1 : 0}
            aria-activedescendant={canSearch ? undefined : activeId}
            onKeyDown={canSearch ? undefined : onKey}
            className="max-h-[min(320px,50vh)] overflow-y-auto p-1 outline-none"
          >
            {loading ? (
              <li role="presentation" className={`flex items-center gap-2 px-3 py-3 text-[13px] ${st.muted}`}>
                <span aria-hidden="true" className="inline-block size-3.5 flex-none animate-spin-fast rounded-full border-2 border-current border-r-transparent" />
                Cargando opciones…
              </li>
            ) : !options.length ? (
              <li role="presentation" className={`px-3 py-3 text-[13px] ${st.muted}`}>
                {emptyText}
              </li>
            ) : !shown.length ? (
              <li role="presentation" className={`px-3 py-3 text-[13px] ${st.muted}`}>
                Sin resultados para «{q}»
              </li>
            ) : (
              shown.map((o, i) => {
                const sel = o.value === value;
                return (
                  <li
                    key={o.value}
                    id={`${uid}-o${i}`}
                    data-i={i}
                    role="option"
                    aria-selected={sel}
                    aria-disabled={o.disabled || undefined}
                    onMouseEnter={() => !o.disabled && setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o)}
                    className={`flex cursor-pointer items-center gap-2.5 ${st.option} ${i === active ? st.active : ""} ${o.disabled ? "cursor-not-allowed opacity-45" : ""}`}
                  >
                    {o.color !== undefined && <span aria-hidden="true" className="size-2.5 flex-none rounded-full" style={{ background: o.color }} />}
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate ${sel ? "font-bold" : ""}`}>
                        <Highlight text={o.label} q={q} />
                      </span>
                      {o.description && <span className={`block truncate text-[12px] ${st.muted}`}>{o.description}</span>}
                    </span>
                    {sel && <CheckIcon size={15} className={`flex-none ${st.check}`} />}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </Popover>
    </>
  );
}
