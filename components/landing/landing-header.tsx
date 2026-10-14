"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { useSite } from "../site-provider";
import { dirHref, tel } from "@/lib/format";
import { Brand, Logo, Wordmark } from "../brand";
import { scrollToSection } from "./centered-anchors";
import { CloseIcon, LoginIcon, MenuIcon, PhoneIcon, PinIcon, SparkleIcon } from "../icons";

const SECTIONS = [
  ["domos", "Domos"],
  ["servicios", "Servicios"],
  ["experiencias", "Experiencias"],
  ["ubicacion", "Ubicación"],
  ["contacto", "Contacto"],
] as const;

// "closing": la animación de cierre corre antes de desmontar el menú.
type Menu = "closed" | "open" | "closing";

// Entrada en cascada de cada elemento del menú (después de que el círculo empieza a cubrir la pantalla).
const item = (i: number): CSSProperties => ({ animationDelay: `${180 + i * 55}ms` });

export function LandingHeader() {
  const [menu, setMenu] = useState<Menu>("closed");
  const [origin, setOrigin] = useState<CSSProperties>({});
  const opener = useRef<HTMLButtonElement>(null);
  const shown = menu !== "closed";

  const open = () => {
    // El círculo nace en el centro del botón que abrió el menú.
    const r = opener.current?.getBoundingClientRect();
    if (r) setOrigin({ "--menu-x": `${r.left + r.width / 2}px`, "--menu-y": `${r.top + r.height / 2}px` } as CSSProperties);
    setMenu("open");
  };
  const finish = () => {
    setMenu("closed");
    opener.current?.focus({ preventScroll: true });
  };
  // Con movimiento reducido no hay animación de cierre que esperar.
  const close = () => (matchMedia("(prefers-reduced-motion: reduce)").matches ? finish() : setMenu("closing"));
  // Enlace a una sección: se libera el desplazamiento de inmediato (flushSync) y la página baja a la sección mientras
  // el círculo se cierra. Sin esto el navegador seguiría el enlace con la página todavía bloqueada.
  const goTo = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    flushSync(close);
    const el = document.getElementById(id);
    if (el) scrollToSection(el);
    history.pushState(null, "", `#${id}`);
  };
  const closeRef = useRef(close);
  const finishRef = useRef(finish);
  useEffect(() => {
    closeRef.current = close;
    finishRef.current = finish;
  });
  // Respaldo: si el navegador no avisa el fin de la animación (pestaña en segundo plano), el menú se desmonta igual
  // y la página vuelve a desplazarse.
  useEffect(() => {
    if (menu !== "closing") return;
    const t = setTimeout(() => finishRef.current(), 700);
    return () => clearTimeout(t);
  }, [menu]);

  // Mientras el menú está abierto, la página de fondo no se desplaza. Se libera apenas empieza a cerrarse (antes de
  // que el navegador siga el enlace a la sección), para que la página llegue a la sección mientras el círculo se cierra.
  const isOpen = menu === "open";
  useLayoutEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      html.style.overflow = prev;
    };
  }, [isOpen]);

  const { c } = useSite();
  const phone1 = c.phones[0];

  return (
    <>
      {/* Va encima del cielo de la portada (que reserva su alto con --header-h): marca a la izquierda, secciones al
          centro y acciones a la derecha. Las tres columnas de los lados miden lo mismo, así el menú queda centrado. */}
      <header className="gutter-1360 absolute inset-x-0 top-0 z-30 grid h-(--header-h,82px) grid-cols-[1fr_auto_1fr] items-center gap-4">
        <a href="#top" aria-label={`${c.name}, inicio`} className="flex min-h-11 min-w-0 items-center gap-3 justify-self-start text-on-dark no-underline">
          <Brand size={50} wordSize="clamp(1.05rem,calc(10vw - 15px),1.5rem)" eyebrowSize=".44em" eager />
        </a>
        <nav aria-label="Principal" className="hidden items-center gap-1 rounded-full bg-on-dark/6 p-1 ring-1 ring-on-dark/12 backdrop-blur-md min-[1180px]:flex">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="inline-flex min-h-10 items-center rounded-full px-4 text-[.9rem] font-semibold no-underline transition-colors duration-200 hover:bg-card hover:text-on-light">
              {label}
            </a>
          ))}
        </nav>
        <div className="col-start-3 flex items-center gap-2 justify-self-end">
          <a href={dirHref()} target="_blank" rel="noopener" className="hidden min-h-11 flex-none items-center gap-2 rounded-full px-3.5 text-[.9rem] font-bold whitespace-nowrap no-underline transition-colors hover:bg-on-dark/10 min-[860px]:inline-flex">
            <PinIcon />
            Cómo llegar
          </a>
          <a href="#reserva" className="btn btn-outline-dark hidden min-h-11 flex-none px-5 text-[.9rem] whitespace-nowrap transition-colors hover:bg-on-dark hover:text-on-light min-[560px]:inline-flex">
            Reservar
          </a>
          <a href={tel(phone1)} aria-label={`Llamar al ${phone1}`} className="btn-icon size-12 bg-on-dark/10 text-on-dark ring-1 ring-on-dark/15 backdrop-blur-md min-[860px]:hidden">
            <PhoneIcon />
          </a>
          <button ref={opener} type="button" aria-label="Abrir menú" aria-expanded={menu === "open"} onClick={open} className="btn-icon btn-card size-12 border-0">
            <MenuIcon />
          </button>
        </div>
      </header>

      {shown && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menú"
          style={origin}
          onAnimationEnd={(e) => e.target === e.currentTarget && menu === "closing" && finish()}
          className={`fixed inset-0 z-100 flex flex-col gap-8 overflow-auto bg-bg px-6 pt-4 pb-8 text-on-dark ${menu === "closing" ? "pointer-events-none motion-safe:animate-menu-close" : "motion-safe:animate-menu-open"}`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5 motion-safe:animate-menu-item" style={item(0)}>
              <Logo size={40} />
              <Wordmark className="text-[1.5rem]" />
            </span>
            <button type="button" aria-label="Cerrar menú" onClick={close} autoFocus className="btn-icon btn-card size-12 border-0 transition-transform duration-300 motion-safe:hover:rotate-90">
              <CloseIcon />
            </button>
          </div>
          <nav aria-label="Menú principal" className="flex flex-col">
            {SECTIONS.map(([id, label], i) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={(e) => goTo(e, id)}
                style={item(i + 1)}
                className={`display flex min-h-16 items-center text-[3.4rem] leading-none no-underline transition-[color,padding] duration-200 hover:pl-2 hover:text-highlight motion-safe:animate-menu-item ${i < SECTIONS.length - 1 ? "border-b-2 border-dotted border-on-dark/30" : ""}`}
              >
                {label}
              </a>
            ))}
          </nav>
          <p className="kicker motion-safe:animate-menu-item" style={item(SECTIONS.length + 1)}>
            <SparkleIcon />
            {c.tagline}
          </p>
          <div className="mt-auto flex flex-col gap-2.5 motion-safe:animate-menu-item" style={item(SECTIONS.length + 2)}>
            <a href="#reserva" onClick={(e) => goTo(e, "reserva")} className="btn btn-card min-h-14">
              Reservar ahora
            </a>
            {/* Acceso del equipo: el panel pide iniciar sesión. */}
            <Link href="/admin" className="btn min-h-14 gap-2 border-2 border-on-dark/35 font-bold text-on-dark transition-colors hover:border-on-dark">
              <LoginIcon size={18} />
              Acceso al panel
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
