"use client";

import { useEffect, useState } from "react";

// Parte resaltada del título de la portada que va cambiando de frase (cada `every` ms) con una entrada desde abajo.
// La primera frase es la del panel (Contenido del sitio → Portada). Para los lectores de pantalla queda fija en la
// primera; con movimiento reducido no cambia.
export function RotatingWords({ words, every = 2800, className = "" }: { words: string[]; every?: number; className?: string }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (words.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % words.length), every);
    return () => clearInterval(t);
  }, [words.length, every]);

  return (
    <span className={className}>
      <span className="sr-only">{words[0]}</span>
      <span key={i} aria-hidden="true" className="inline-block motion-safe:animate-word-in">
        {words[i % words.length]}
      </span>
    </span>
  );
}
