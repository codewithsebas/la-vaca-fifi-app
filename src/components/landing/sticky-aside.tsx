"use client";

import { useEffect, useRef, type ReactNode } from "react";

const GAP = 32;

// Columna fija al bajar (tarjeta de reserva de la portada). Se pega bajo la barra mientras se ve (--header-visible, que
// publica components/landing/header.tsx: su alto, o 0 cuando se esconde) y sube con ella. Si es más alta que lo que
// queda de pantalla, se pega más arriba (top negativo) para que siempre se vea su parte de abajo, con el botón.
export function StickyAside({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-offset")) || 80;
      const fit = window.innerHeight - el.offsetHeight - GAP;
      el.style.top = `min(calc(var(--header-visible, ${bar}px) + ${GAP}px), ${fit}px)`;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div ref={ref} className={`transition-[top] duration-300 ease-out motion-reduce:transition-none lg:sticky ${className}`}>
      {children}
    </div>
  );
}
