"use client";

// Piezas de las listas del panel, con el formato de Reservas: buscador suelto, tabla en tarjeta de papel y encabezado.
// Teléfono y tablet: cada página muestra su lista de tarjetas (la tabla, con sus acciones, necesita el ancho de xl). Si aun
// así no cabe, por ejemplo con el menú lateral abierto, la tabla se desplaza dentro de su tarjeta.
import { SearchIcon } from "@/components/ui/icons";
import { adminInput } from "@/components/admin/shared";

export const LIST_CARD_BASE = "overflow-x-auto bg-paper! shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-line";
export const LIST_CARD = `hidden xl:block ${LIST_CARD_BASE}`;
export const LIST_ROW = "group cursor-pointer transition-colors";
export const LIST_ROW_HOVER = "hover:bg-canvas/70";
export const LIST_ROW_LATEST = "bg-yellow-soft/70 hover:bg-yellow-soft";
export const LIST_MOBILE_ROW = "flex w-full flex-col gap-1.5 rounded-[20px] p-4 text-left ring-1 ring-line transition-colors";

export function ListTableHead({ columns, right = [] }: { columns: string[]; right?: string[] }) {
  return (
    <thead className="border-b border-line bg-canvas/70 text-left text-[12px] font-semibold text-ink-muted">
      <tr>
        {columns.map((h) => (
          <th key={h} scope="col" className={`px-4 py-2.5 font-semibold ${right.includes(h) ? "text-right" : ""}`}>
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function ListSearch({
  id,
  label,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <SearchIcon size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
      <input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${adminInput} pl-8!`} />
    </div>
  );
}
