"use client";

import { useEffect, useState } from "react";

// Lo que dice Fifí en la portada: un globo de historieta que cambia de frase cada tanto (las frases salen del panel,
// Contenido del sitio → Portada). Decorativo: el mensaje principal ya está en el título. Con movimiento reducido se
// queda en la primera frase.
export function SpeechBubble({ phrases, className = "" }: { phrases: string[]; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (phrases.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % phrases.length), 3800);
    return () => clearInterval(t);
  }, [phrases.length]);
  if (!phrases.length) return null;
  return (
    <div aria-hidden="true" className={`pointer-events-none relative ${className}`}>
      <p
        key={i}
        className="relative rounded-[22px] border-[3px] border-on-dark bg-card px-5 py-3 text-center font-display text-[clamp(1.05rem,1.6vw,1.35rem)] leading-tight text-on-light shadow-[4px_4px_0_var(--color-on-dark)] motion-safe:animate-bubble-pop"
      >
        {phrases[i]}
      </p>
      {/* Colita del globo, hacia Fifí (abajo a la derecha). */}
      <svg viewBox="0 0 40 30" className="absolute -bottom-[25px] right-[22%] h-[30px] w-[40px]">
        <path d="M2 0H30L36 28L12 2" className="fill-card" />
        <path d="M2 1.5L36 28L28 1.5" fill="none" stroke="var(--color-on-dark)" strokeWidth={3} strokeLinejoin="round" />
      </svg>
    </div>
  );
}
