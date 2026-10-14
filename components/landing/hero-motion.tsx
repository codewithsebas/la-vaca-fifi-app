"use client";

import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Sección de la portada que sigue al mouse: publica --hx y --hy (de -1 a 1) para que las capas del paisaje se desplacen
// un poco, más las cercanas (profundidad). Solo con mouse y sin movimiento reducido; en táctil no hace nada.
export function HeroParallax({ children, ...rest }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let frame = 0;
    const set = (x: number, y: number) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty("--hx", x.toFixed(3));
        el.style.setProperty("--hy", y.toFixed(3));
      });
    };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
    };
    const onLeave = () => set(0, 0);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);
  return (
    <section ref={ref} {...rest}>
      {children}
    </section>
  );
}

// Una frase letra por letra (las letras de cada palabra no se separan al hacer salto de línea).
// ghost: invisible, solo reserva el espacio de la frase.
function Letters({ text, mode, delay = 0 }: { text: string; mode: "in" | "out" | "ghost"; delay?: number }) {
  let n = 0;
  return (
    <span className={`col-start-1 row-start-1 ${mode === "ghost" ? "invisible" : mode === "out" ? "pointer-events-none" : ""}`}>
      {text.split(" ").map((word, w) => (
        <span key={w} className="inline-block whitespace-nowrap">
          {w > 0 && <span className="inline-block w-[.25em]" />}
          {Array.from(word).map((ch, k) => (
            <span
              key={k}
              className={`inline-block ${mode === "in" ? "motion-safe:animate-letter-in" : mode === "out" ? "motion-safe:animate-letter-out" : ""}`}
              style={{ animationDelay: `${delay + n++ * (mode === "in" ? 38 : 18)}ms` }}
            >
              {ch}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

// Frases que se alternan (la primera es la del panel: «en Murillo, Tolima»). Las demás frases también ocupan su lugar,
// invisibles, para que el titular no salte de tamaño al cambiar. Se pausa fuera de pantalla o en otra pestaña.
// center: cada frase va centrada en el espacio de la más larga (titular centrado).
export function RotatingWords({ phrases, interval = 3600, delay = 0, center = false }: { phrases: string[]; interval?: number; delay?: number; center?: boolean }) {
  const [s, setS] = useState<{ cur: number; prev: number | null }>({ cur: 0, prev: null });
  const ref = useRef<HTMLSpanElement>(null);
  const n = phrases.length;

  useEffect(() => {
    const el = ref.current;
    if (!el || n < 2 || reducedMotion()) return;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);
    const t = setInterval(() => {
      if (visible && !document.hidden) setS((x) => ({ cur: (x.cur + 1) % n, prev: x.cur }));
    }, interval);
    return () => {
      clearInterval(t);
      io.disconnect();
    };
  }, [n, interval]);

  return (
    <span ref={ref} className={`inline-grid ${center ? "justify-items-center" : ""}`}>
      {phrases.map((p, i) => (
        <Letters key={`r${i}`} text={p} mode="ghost" />
      ))}
      {s.prev !== null && <Letters key={`out-${s.prev}`} text={phrases[s.prev]} mode="out" />}
      <Letters key={`in-${s.cur}`} text={phrases[s.cur]} mode="in" delay={s.prev === null ? delay : 120} />
    </span>
  );
}
