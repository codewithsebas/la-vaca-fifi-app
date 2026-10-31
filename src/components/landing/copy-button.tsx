"use client";

import { useState } from "react";
import { CheckIcon } from "@/components/ui/icons";

// Copia un texto (la dirección) y lo confirma con un ✓ por unos segundos.
export function CopyButton({ text, label, className = "" }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2200);
    } catch {}
  };
  return (
    <button type="button" onClick={copy} className={className}>
      {done ? <CheckIcon size={16} /> : <CopyIcon />}
      <span aria-live="polite">{done ? "¡Copiada!" : label}</span>
    </button>
  );
}

const CopyIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="9" y="9" width="12" height="12" rx="2.5" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </svg>
);
