"use client";

// Valores que se mueven: al llegar los datos, las cifras cuentan desde cero y las gráficas crecen desde la base; si un
// dato cambia después (tiempo real, actualizar), pasan suavemente del valor que muestran al nuevo. Con movimiento
// reducido van directo al valor.
import { useEffect, useRef, useState } from "react";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// Lleva una lista de números a sus valores con una curva suave. `delay` solo cuenta la primera vez (para esperar a que
// la tarjeta termine de entrar) y `stagger` desfasa cada elemento (barras una tras otra).
export function useTweened(target: readonly number[], { duration = 900, delay = 0, stagger = 0 } = {}) {
  const key = target.join("|");
  const [shown, setShown] = useState<number[]>(() => target.map(() => 0));
  const current = useRef<number[]>([]);
  const started = useRef(false);

  useEffect(() => {
    const to = key ? key.split("|").map(Number) : [];
    const from = to.map((_, i) => current.current[i] ?? 0);
    const wait = started.current ? 0 : delay;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t0 = 0;
    const step = (now: number) => {
      t0 ||= now;
      const elapsed = now - t0 - wait;
      if (elapsed > 0) started.current = true;
      let done = true;
      const next = to.map((v, i) => {
        if (still) return v;
        const t = Math.min(1, Math.max(0, (elapsed - i * stagger) / duration));
        if (t < 1) done = false;
        return from[i] + (v - from[i]) * easeOut(t);
      });
      current.current = next;
      setShown(next);
      if (!done) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key, delay, duration, stagger]);

  return target.map((_, i) => shown[i] ?? 0);
}

// Cifra que cuenta hasta su valor. `format` recibe el número ya redondeado.
export function Count({ value, format = String, delay = 0 }: { value: number; format?: (n: number) => string; delay?: number }) {
  const [v] = useTweened([value], { delay, duration: 1000 });
  return <>{format(Math.round(v))}</>;
}
