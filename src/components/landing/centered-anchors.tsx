"use client";

// Navegación a secciones de la portada (#cabanas, #reserva…): la sección queda centrada en la parte visible de la
// pantalla (bajo la barra fija, que publica su alto en --header-offset) si cabe en ella; si es más alta, se muestra
// desde el inicio de su contenido (sin el margen superior de la sección), con un poco de aire.
import { useEffect } from "react";

const AIR = 24;

function scrollToSection(el: HTMLElement, smooth = true) {
  const r = el.getBoundingClientRect();
  const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-offset")) || 0;
  const vh = window.innerHeight - bar;
  const top = r.top + window.scrollY - bar;
  // +2: las secciones de pantalla completa miden el alto de la ventana con decimales.
  const target = r.height <= vh + 2 ? top - Math.max(0, vh - r.height) / 2 : top + Math.max(0, parseFloat(getComputedStyle(el).paddingTop) - AIR);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: Math.max(0, Math.round(target)), behavior: smooth && !reduce ? "smooth" : "instant" });
  // Como un enlace normal: el foco (y el punto de partida del teclado y del lector de pantalla) pasa a la sección.
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

export function CenteredAnchors() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
      const id = a?.getAttribute("href")?.slice(1);
      const el = id && id !== "top" ? document.getElementById(id) : null;
      if (!el) return;
      e.preventDefault();
      history.pushState(null, "", `#${id}`);
      scrollToSection(el);
    };
    document.addEventListener("click", onClick);
    // Al abrir la página con #seccion en la dirección, la misma posición (sin animación).
    const initial = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
    if (initial && initial.id !== "top") requestAnimationFrame(() => scrollToSection(initial, false));
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
