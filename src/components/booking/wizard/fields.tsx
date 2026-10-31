"use client";

import { type ReactNode } from "react";
import { MinusIcon, PlusIcon } from "@/components/ui/icons";

export function Field({
  id,
  label,
  error,
  errId,
  wide,
  children,
}: {
  id: string;
  label: ReactNode;
  error?: string;
  errId: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${wide ? "col-span-full" : ""}`}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
      <p id={errId} aria-live="polite" className="field-error">
        {error}
      </p>
    </div>
  );
}

export function Counter({
  label,
  sub,
  count,
  decDisabled,
  incDisabled,
  onDec,
  onInc,
}: {
  label: string;
  sub: string;
  count: number;
  decDisabled: boolean;
  incDisabled: boolean;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="clear-both flex items-center justify-between gap-3 border-b-2 border-dotted border-card-muted py-2.5">
      <div className="flex flex-col">
        <strong className="text-[.95rem]">{label}</strong>
        <span className="text-[.8rem]">{sub}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          aria-label={`Quitar ${label.toLowerCase()}`}
          disabled={decDisabled}
          onClick={onDec}
          className="btn-icon size-11 border-2 border-on-light disabled:opacity-35"
        >
          <MinusIcon />
        </button>
        <span aria-live="polite" className="min-w-[22px] text-center text-[1.1rem] font-extrabold">
          {count}
        </span>
        <button
          type="button"
          aria-label={`Añadir ${label.toLowerCase()}`}
          disabled={incDisabled}
          onClick={onInc}
          className="btn-icon size-11 border-2 border-on-light disabled:opacity-35"
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}
