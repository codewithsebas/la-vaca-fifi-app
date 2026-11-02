"use client";

// Búsqueda global del encabezado: mientras se escribe sugiere reservas y clientes (por nombre, código, documento o
// celular) y al elegir uno abre su ficha. Enter sin elegir abre la lista de reservas filtrada. «/» la enfoca.
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ListIcon, SearchIcon, UserIcon, UsersIcon } from "@/components/ui/icons";
import { Popover } from "@/components/ui/floating";
import { StatusPill } from "@/components/ui/status-pill";
import { fmtDate } from "@/lib/format";
import type { Reservation } from "@/lib/types";
import { useAdmin } from "@/components/admin/context";
import { paths } from "@/components/admin/routes";
import { norm } from "@/components/admin/shared";

const MAX_RESERVATIONS = 6;
const MAX_CLIENTS = 4;

type Hit = { key: string; href: string; group: "Reservas" | "Clientes" | "Buscar"; render: (q: string) => ReactNode };

const digits = (s: string) => s.replace(/\D/g, "");

// Coincidencia de una reserva con la búsqueda: 0 = código exacto, 1 = el código empieza así, 2 = otro campo; null = no.
function rank(r: Reservation, nq: string, dq: string): number | null {
  const code = norm(r.code);
  if (code === nq || code.replace(/-/g, "") === nq.replace(/-/g, "")) return 0;
  if (code.startsWith(nq) || code.replace(/-/g, "").startsWith(nq.replace(/-/g, ""))) return 1;
  if ([r.guest.fullName, r.guest.docNumber, r.guest.email, r.externalRef ?? ""].some((v) => norm(v || "").includes(nq))) return 2;
  // Celular y documento también por sus dígitos: «300 123 4567» encuentra «3001234567».
  if (dq.length >= 3 && [r.guest.phone, r.guest.docNumber].some((v) => digits(v || "").includes(dq))) return 2;
  return null;
}

// Resalta la parte del texto que coincide con la búsqueda.
function Mark({ text, q }: { text: string; q: string }) {
  const i = q ? norm(text).indexOf(norm(q)) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[3px] bg-yellow-soft text-inherit">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function GlobalSearch({ autoFocus = false, onDone, className = "" }: { autoFocus?: boolean; onDone?: () => void; className?: string }) {
  const router = useRouter();
  const { data, cabinLabel } = useAdmin();
  const uid = useId();
  const listId = `${uid}-list`;
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const text = q.trim();

  useEffect(() => {
    if (autoFocus) input.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!input.current?.offsetParent) return; // la del encabezado que no se ve (móvil o escritorio) no responde
      e.preventDefault();
      input.current.focus();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [autoFocus]);

  const hits = useMemo<Hit[]>(() => {
    if (!text) return [];
    const nq = norm(text);
    const dq = digits(text);
    const found = data.reservations
      .map((r) => ({ r, k: rank(r, nq, dq) }))
      .filter((x): x is { r: Reservation; k: number } => x.k !== null)
      .sort((a, b) => a.k - b.k || (a.r.checkIn < b.r.checkIn ? 1 : -1));

    // Clientes: una fila por documento, con su nombre más reciente y cuántas reservas tiene.
    const clients = new Map<string, { r: Reservation; n: number }>();
    for (const { r } of found) {
      if (rank(r, nq, dq) === 0) continue; // por código se busca la reserva, no el cliente
      const c = clients.get(r.clientKey);
      if (c) c.n++;
      else clients.set(r.clientKey, { r, n: 1 });
    }

    const res: Hit[] = found.slice(0, MAX_RESERVATIONS).map(({ r }) => ({
      key: `r-${r.code}`,
      href: paths.reserva(r.code),
      group: "Reservas",
      render: (s) => (
        <>
          <span aria-hidden="true" className="grid size-8 flex-none place-items-center rounded-full bg-blue-soft text-ink">
            <ListIcon size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold">
              <Mark text={r.code} q={s} /> · <Mark text={r.guest.fullName} q={s} />
            </span>
            <span className="block truncate text-[12px] text-ink-muted">
              {fmtDate(r.checkIn)} → {fmtDate(r.checkOut)} · {cabinLabel(r.cabinTypeId, r.unit)}
            </span>
          </span>
          <StatusPill status={r.status} size="sm" className="flex-none self-center!" />
        </>
      ),
    }));
    const cli: Hit[] = [...clients.values()].slice(0, MAX_CLIENTS).map(({ r, n }) => ({
      key: `c-${r.clientKey}`,
      href: paths.cliente(r.clientKey),
      group: "Clientes",
      render: (s) => (
        <>
          <span aria-hidden="true" className="grid size-8 flex-none place-items-center rounded-full bg-pink-soft text-ink">
            <UserIcon size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold">
              <Mark text={r.guest.fullName} q={s} />
            </span>
            <span className="block truncate text-[12px] text-ink-muted">
              {r.guest.docType} <Mark text={r.guest.docNumber} q={s} />
              {r.guest.phone && (
                <>
                  {" · "}
                  <Mark text={r.guest.phone} q={s} />
                </>
              )}
            </span>
          </span>
          <span className="flex-none text-[12px] text-ink-muted">{n === 1 ? "1 reserva" : `${n} reservas`}</span>
        </>
      ),
    }));
    // Siempre, al final: buscar el texto en la lista de reservas o en la de clientes.
    const more: Hit[] = [
      {
        key: "q-reservas",
        href: paths.reservas({ q: text }),
        group: "Buscar",
        render: () => <SearchIn icon={<ListIcon size={15} />} q={text} where="reservas" />,
      },
      {
        key: "q-clientes",
        href: paths.clientes({ q: text }),
        group: "Buscar",
        render: () => <SearchIn icon={<UsersIcon size={15} />} q={text} where="clientes" />,
      },
    ];
    return [...res, ...cli, ...more];
  }, [text, data.reservations, cabinLabel]);

  const go = (href: string) => {
    router.push(href);
    setOpen(false);
    setQ("");
    input.current?.blur();
    onDone?.();
  };

  // Enter: la opción marcada; sin marcar, la reserva si el código es exacto, o la lista de reservas filtrada.
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text) return;
    const exact = data.reservations.find((r) => norm(r.code) === norm(text));
    go(hits[activeIdx]?.href ?? (exact ? paths.reserva(exact.code) : paths.reservas({ q: text })));
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!hits.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      // Recorre -1 (ninguna, el texto escrito) → 0 … última → -1.
      const d = e.key === "ArrowDown" ? 1 : -1;
      const n = hits.length + 1;
      setActive((a) => ((a + 1 + d + n) % n) - 1);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  const activeIdx = active < hits.length ? active : -1;
  const activeId = activeIdx >= 0 ? `${uid}-o${activeIdx}` : undefined;
  const showList = open && !!text;

  return (
    <form
      ref={form}
      role="search"
      onSubmit={submit}
      className={`flex h-12 min-w-0 items-center gap-2 rounded-full border border-line-strong bg-paper/70 py-1 pr-4 pl-1 transition-[border-color,background-color,box-shadow] duration-150 focus-within:border-ink focus-within:bg-paper focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-ink)_10%,transparent)] ${className}`}
    >
      <button
        type="submit"
        aria-label="Buscar"
        className="grid size-10 flex-none place-items-center rounded-full bg-ink text-paper transition-colors hover:bg-ink/85"
      >
        <SearchIcon size={18} />
      </button>
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-label="Buscar reservas y clientes"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={showList ? activeId : undefined}
        autoComplete="off"
        spellCheck={false}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => text && setOpen(true)}
        onKeyDown={onKey}
        placeholder="Buscar por huésped, código, documento o celular"
        className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none [--ring-width:0px] placeholder:text-ink-subtle [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd
        aria-hidden="true"
        className="hidden h-6 flex-none place-items-center rounded-md border border-line-strong px-1.5 font-body text-[11.5px] text-ink-subtle lg:grid"
      >
        /
      </kbd>

      <Popover open={showList} onClose={() => setOpen(false)} anchor={form} matchWidth sheet={false} role="listbox" className="w-[min(620px,calc(100vw-16px))]">
        <ul id={listId} role="listbox" aria-label="Resultados de la búsqueda" className="max-h-[min(440px,60vh)] overflow-y-auto p-1.5">
          {hits.length <= 2 && (
            <li role="presentation" className="px-3 pt-2 pb-1 text-[13px] text-ink-muted">
              Ninguna reserva ni cliente coincide con «{text}».
            </li>
          )}
          {hits.map((h, i) => (
            <li key={h.key} role="presentation">
              {h.group !== hits[i - 1]?.group && (
                <p
                  role="presentation"
                  className={`px-3 pt-2.5 pb-1 text-[11px] font-bold tracking-[.08em] text-ink-subtle uppercase ${i > 0 ? "mt-1 border-t border-line" : ""}`}
                >
                  {h.group === "Buscar" ? "Ver todos los resultados" : h.group}
                </p>
              )}
              <div
                id={`${uid}-o${i}`}
                role="option"
                aria-selected={i === activeIdx}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(h.href)}
                className={`flex cursor-pointer items-center gap-3 rounded-[12px] px-2.5 py-2 text-ink ${i === activeIdx ? "bg-ink/6" : ""}`}
              >
                {h.render(text)}
              </div>
            </li>
          ))}
        </ul>
      </Popover>
    </form>
  );
}

function SearchIn({ icon, q, where }: { icon: ReactNode; q: string; where: string }) {
  return (
    <>
      <span aria-hidden="true" className="grid size-8 flex-none place-items-center rounded-full bg-panel text-ink-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13.5px]">
        Buscar «<span className="font-semibold">{q}</span>» en {where}
      </span>
    </>
  );
}
