"use client";

// Paginación de tablas y listas del panel: cuántas filas por página (10 a 100, o un número propio) y en qué página se
// está. El tamaño elegido se guarda por tabla en este navegador.
import { useId, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { Combobox } from "@/components/ui/combobox";
import { PREF, usePref, writePref } from "@/components/admin/prefs";
import { IconButton } from "@/components/admin/ui";

export const PAGE_SIZES = [10, 20, 30, 40, 50, 100];
const MAX_SIZE = 500;

export type Paged<T> = {
  rows: T[];
  page: number;
  pages: number;
  size: number;
  total: number;
  setPage: (n: number) => void;
  setSize: (n: number) => void;
};

// `id`: nombre de la tabla (guarda su tamaño). `reset`: cuando cambia (filtros, búsqueda, orden), vuelve a la página 1.
export function usePaged<T>(items: T[], id: string, reset: string | number = "", fallback = 10): Paged<T> {
  const key = `${PREF.pageSize}:${id}`;
  const stored = Math.round(Number(usePref(key, String(fallback))));
  const size = stored >= 1 && stored <= MAX_SIZE ? stored : fallback;
  const [page, setPage] = useState(1);
  const [seen, setSeen] = useState(reset);
  if (seen !== reset) {
    setSeen(reset);
    setPage(1);
  }
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, pages);
  return {
    rows: items.slice((current - 1) * size, current * size),
    page: current,
    pages,
    size,
    total: items.length,
    setPage: (n) => setPage(Math.min(Math.max(1, n), pages)),
    // Al cambiar el tamaño, la primera fila que se veía sigue a la vista.
    setSize: (n) => {
      writePref(key, String(n));
      setPage(Math.floor(((current - 1) * size) / n) + 1);
    },
  };
}

// Páginas a mostrar: la primera, la última y las vecinas de la actual; "gap" donde se saltan páginas.
function pageList(page: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const show = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => show.add(n));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((n) => show.add(n));
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const n of [...show].filter((x) => x >= 1 && x <= pages).sort((a, b) => a - b)) {
    if (n - prev > 1) out.push("gap");
    out.push(n);
    prev = n;
  }
  return out;
}

// Pie de una tabla: «1–10 de 153», filas por página y botones de página. Sin filas, no se muestra.
export function Paginator<T>({ p, noun = "registros", className = "" }: { p: Paged<T>; noun?: string; className?: string }) {
  const id = useId();
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState("");
  if (!p.total) return null;
  const preset = PAGE_SIZES.includes(p.size);
  const from = (p.page - 1) * p.size + 1;
  const to = Math.min(p.total, p.page * p.size);
  const apply = () => {
    const n = Math.round(Number(draft));
    if (n >= 1 && n <= MAX_SIZE) p.setSize(n);
    setCustom(false);
  };
  const pageBtn =
    "h-8 min-w-8 rounded-full px-2 text-[13px] font-semibold tabular-nums transition-colors duration-150 pointer-coarse:h-10 pointer-coarse:min-w-10";

  return (
    <nav aria-label={`Páginas de ${noun}`} className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-3 text-[13px] text-ink-muted ${className}`}>
      <p aria-live="polite">
        <span className="font-semibold text-ink tabular-nums">
          {from}–{to}
        </span>{" "}
        de <span className="font-semibold text-ink tabular-nums">{p.total}</span> {noun}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <label htmlFor={id} className="whitespace-nowrap">
            Filas por página
          </label>
          {custom ? (
            <input
              id={id}
              autoFocus
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_SIZE}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={apply}
              onKeyDown={(e) => {
                if (e.key === "Enter") apply();
                if (e.key === "Escape") setCustom(false);
              }}
              placeholder={`1–${MAX_SIZE}`}
              className="field-input field-compact w-[88px] tabular-nums"
            />
          ) : (
            <Combobox
              id={id}
              value={preset ? String(p.size) : "actual"}
              onChange={(v) => {
                if (v === "otro") {
                  setDraft(String(p.size));
                  setCustom(true);
                } else if (v !== "actual") p.setSize(Number(v));
              }}
              searchable={false}
              className="w-[92px]"
              options={[
                ...PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) })),
                ...(preset ? [] : [{ value: "actual", label: String(p.size) }]),
                { value: "otro", label: "Otro número…", description: `De 1 a ${MAX_SIZE}` },
              ]}
            />
          )}
        </div>
        {p.pages > 1 && (
          <div className="flex items-center gap-0.5">
            <IconButton label="Página anterior" size="sm" disabled={p.page === 1} onClick={() => p.setPage(p.page - 1)}>
              <ChevronLeftIcon size={15} />
            </IconButton>
            {pageList(p.page, p.pages).map((n, i) =>
              n === "gap" ? (
                <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-ink-subtle">
                  …
                </span>
              ) : (
                <button
                  key={n}
                  type="button"
                  aria-label={`Página ${n}`}
                  aria-current={n === p.page ? "page" : undefined}
                  onClick={() => p.setPage(n)}
                  className={`${pageBtn} ${n === p.page ? "bg-ink text-paper" : "text-ink-muted hover:bg-ink/6 hover:text-ink"}`}
                >
                  {n}
                </button>
              ),
            )}
            <IconButton label="Página siguiente" size="sm" disabled={p.page === p.pages} onClick={() => p.setPage(p.page + 1)}>
              <ChevronRightIcon size={15} />
            </IconButton>
          </div>
        )}
      </div>
    </nav>
  );
}
