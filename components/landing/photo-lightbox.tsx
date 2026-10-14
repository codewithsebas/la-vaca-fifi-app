"use client";

// Galería de fotos de la portada: al tocar cualquier foto (PhotoSlot con `zoom`) se abre a pantalla completa con todas
// las fotos del sitio, empezando por la tocada. Flechas, teclado (← →, Esc), deslizar en el celular y una tira de
// miniaturas. Al cambiar, la foto nueva entra por el lado hacia el que se avanza y la anterior sale por el otro; al
// cerrar, todo se desvanece. Un solo oyente de clics para toda la página: las fotos solo llevan data-gallery con su URL.
import Image from "next/image";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { config } from "@/lib/config";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "../icons";
import { Bean } from "../fifi/decor";

const TITLE = `Galería de ${config.name}`;
const CLOSE_MS = 320;
const pad = (n: number) => String(n).padStart(2, "0");
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// i: foto visible · from: la que está saliendo (mientras dura su animación) · dir: 1 hacia adelante, -1 hacia atrás.
type View = { i: number; from: number | null; dir: 1 | -1; step: number };

export function PhotoLightbox({ photos }: { photos: string[] }) {
  const [view, setView] = useState<View | null>(null);
  const [closing, setClosing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const swipe = useRef<number | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const n = photos.length;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>("[data-gallery]");
      const i = el ? photos.indexOf(el.dataset.gallery ?? "") : -1;
      if (!el || i < 0) return;
      e.preventDefault();
      opener.current = el;
      setClosing(false);
      setView({ i, from: null, dir: 1, step: 0 });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [photos]);

  // <dialog> nativo: atrapa el foco y la página de fondo no se desplaza (globals.css). Al cerrarse, el foco vuelve a la
  // foto que lo abrió.
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (view && !d.open) d.showModal();
    if (!view && d.open) {
      d.close();
      opener.current?.focus({ preventScroll: true });
    }
  }, [view]);
  useEffect(() => () => void (closeTimer.current && clearTimeout(closeTimer.current)), []);

  // La miniatura activa siempre a la vista.
  const current = view?.i;
  useEffect(() => {
    if (current === undefined) return;
    strip.current?.querySelector(`[data-i="${current}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: reduced() ? "instant" : "smooth" });
  }, [current]);

  const show = (i: number, dir: 1 | -1) => setView((v) => (v && i !== v.i ? { i, from: v.i, dir, step: v.step + 1 } : v));
  const go = (d: 1 | -1) => view && show((view.i + d + n) % n, d);
  // Cierre animado: primero se desvanece (data-closing) y después se cierra el diálogo.
  const close = () => {
    if (!view || closing) return;
    if (reduced()) return setView(null);
    setClosing(true);
    closeTimer.current = setTimeout(() => {
      setClosing(false);
      setView(null);
    }, CLOSE_MS);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") swipe.current = e.clientX;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (swipe.current === null) return;
    const dx = e.clientX - swipe.current;
    swipe.current = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  };

  // La animación de entrada depende solo del cambio que la originó (step 0 = al abrir), no de si la foto anterior sigue
  // saliendo: si dependiera de `from`, al terminar la salida la foto visible cambiaría de animación y se volvería a animar.
  const enter = !view ? "" : view.step === 0 ? "motion-safe:animate-photo-open" : view.dir === 1 ? "motion-safe:animate-photo-in-next" : "motion-safe:animate-photo-in-prev";

  // Respaldo: si el navegador no avisa el fin de la animación de salida (pestaña en segundo plano), se retira igual.
  const leaving = view?.from !== null && view?.from !== undefined ? view.step : null;
  useEffect(() => {
    if (leaving === null) return;
    const t = setTimeout(() => setView((v) => (v && v.step === leaving ? { ...v, from: null } : v)), 700);
    return () => clearTimeout(t);
  }, [leaving]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="lb-title"
      aria-describedby="lb-count"
      data-closing={closing || undefined}
      // Esc: mismo cierre animado (se evita el cierre inmediato del navegador).
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClose={() => setView(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
      className="group/lb m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-transparent p-0 text-on-dark transition-opacity duration-300 ease-out backdrop:bg-night/90 backdrop:backdrop-blur-md backdrop:transition-opacity backdrop:duration-300 open:flex data-closing:opacity-0 data-closing:backdrop:opacity-0 motion-safe:open:animate-[ec-fade-in_.3s_ease-out] motion-safe:backdrop:animate-[ec-fade-in_.3s_ease-out]"
    >
      {view && (
        <div className="flex size-full flex-col gap-[clamp(10px,2svh,20px)] bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--color-surface)_55%,transparent),transparent_70%)] py-[clamp(12px,2.5svh,24px)]">
          <header className="gutter-1360 flex items-center justify-between gap-4">
            <h2 id="lb-title" className="display flex min-w-0 items-center gap-2.5 text-[clamp(1.6rem,3.6svh,2.4rem)] leading-none">
              <Bean size={18} light />
              <span className="truncate">{TITLE}</span>
            </h2>
            <div className="flex flex-none items-center gap-3">
              <p id="lb-count" className="display text-[1.5rem] leading-none tabular-nums">
                <span className="sr-only">Foto </span>
                <span className="text-accent">{pad(view.i + 1)}</span>
                <span className="text-on-dark/45"> / {pad(n)}</span>
              </p>
              <button type="button" autoFocus aria-label="Cerrar la galería" onClick={close} className="btn-icon btn-card size-11 border-0 transition-transform duration-300 motion-safe:hover:rotate-90">
                <CloseIcon />
              </button>
            </div>
          </header>

          {/* Foto entera (sin recortar). Al cerrar, se encoge un poco mientras todo se desvanece. */}
          <div className="gutter-1360 relative min-h-0 flex-1" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => (swipe.current = null)}>
            <div className="relative size-full transition-transform duration-300 ease-out group-data-closing/lb:scale-[.96]">
              {view.from !== null && (
                <div
                  key={`out-${view.step}`}
                  aria-hidden="true"
                  onAnimationEnd={() => setView((v) => (v && v.step === view.step ? { ...v, from: null } : v))}
                  className={`absolute inset-0 motion-reduce:hidden ${view.dir === 1 ? "motion-safe:animate-photo-out-next" : "motion-safe:animate-photo-out-prev"}`}
                >
                  <Image src={photos[view.from]} alt="" fill sizes="100vw" quality={90} className="object-contain" />
                </div>
              )}
              <div key={`in-${view.step}`} className={`absolute inset-0 ${enter}`}>
                <Image src={photos[view.i]} alt={`Foto ${view.i + 1} de ${n} de ${config.name}`} fill sizes="100vw" quality={90} className="object-contain" />
              </div>
              {/* La anterior y la siguiente se cargan de antemano (invisibles, mismo tamaño): al cambiar ya están listas y no
                  entra un cuadro vacío que aparece de golpe al final de la animación. */}
              {n > 1 &&
                [...new Set([(view.i + 1) % n, (view.i - 1 + n) % n])].map((j) => (
                  <div key={`pre-${j}`} aria-hidden="true" className="pointer-events-none invisible absolute inset-0">
                    <Image src={photos[j]} alt="" fill sizes="100vw" quality={90} loading="eager" className="object-contain" />
                  </div>
                ))}
            </div>
            {n > 1 && (
              <>
                <button type="button" aria-label="Foto anterior" onClick={() => go(-1)} className="btn-icon btn-card absolute top-1/2 left-[max(16px,calc((100%-1360px)/2))] z-1 size-10 -translate-y-1/2 border-0 shadow-card transition-transform duration-200 motion-safe:hover:-translate-x-0.5 sm:size-11">
                  <ChevronLeftIcon size={18} />
                </button>
                <button type="button" aria-label="Foto siguiente" onClick={() => go(1)} className="btn-icon btn-card absolute top-1/2 right-[max(16px,calc((100%-1360px)/2))] z-1 size-10 -translate-y-1/2 border-0 shadow-card transition-transform duration-200 motion-safe:hover:translate-x-0.5 sm:size-11">
                  <ChevronRightIcon size={18} />
                </button>
              </>
            )}
          </div>

          {/* Todas las fotos, centradas (si no caben, se desplazan desde el inicio); la activa resaltada. */}
          {n > 1 && (
            <div ref={strip} className="gutter-1360 no-scrollbar flex-none overflow-x-auto py-1">
              <ul aria-label="Todas las fotos" className="mx-auto flex w-max gap-2">
                {photos.map((src, i) => (
                  <li key={src} className="flex-none">
                    <button
                      type="button"
                      data-i={i}
                      aria-label={`Ver foto ${i + 1} de ${n}`}
                      aria-current={i === view.i ? "true" : undefined}
                      onClick={() => show(i, i > view.i ? 1 : -1)}
                      className={`relative block h-[clamp(48px,8svh,72px)] w-[clamp(64px,11svh,96px)] overflow-hidden rounded-sm transition-[opacity,box-shadow,transform] duration-300 ${
                        i === view.i ? "opacity-100 shadow-[0_0_0_2px_var(--color-highlight)]" : "opacity-50 hover:opacity-85 motion-safe:hover:-translate-y-0.5"
                      }`}
                    >
                      <Image src={src} alt="" fill sizes="96px" className="object-cover" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
