"use client";

import { useEffect, useRef, useState } from "react";
import { useSite } from "../site-provider";
import { tel, wa } from "@/lib/format";
import { Brand } from "../brand";
import { CloseIcon, MenuIcon, PhoneIcon, WhatsAppIcon } from "../icons";

const SECTIONS = [
  ["cabanas", "Cabañas"],
  ["restaurante", "Restaurante"],
  ["finca", "La finca"],
  ["ubicacion", "Cómo llegar"],
  ["contacto", "Contacto"],
] as const;

// Encabezado de la portada: barra fija color leche con su filo de tinta. Marca a la izquierda, secciones y «Reservar» a
// la derecha. En pantallas angostas las secciones van en un panel que baja bajo la barra, con enlaces grandes y los
// contactos a la mano (Esc o el mismo botón lo cierran). Publica su alto en --header-offset para que los enlaces a una
// sección no la dejen debajo de la barra (components/landing/centered-anchors.tsx).
export function FifiHeader() {
  const { c } = useSite();
  const [open, setOpen] = useState(false);
  const bar = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--header-offset", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.documentElement.classList.add("overflow-hidden");
    document.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.classList.remove("overflow-hidden");
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header ref={bar} className="sticky top-0 z-50 border-b-[3px] border-on-dark">
      {/* El fondo esmerilado va en su propia capa: un backdrop-filter en el <header> lo volvería el bloque contenedor del
          panel fijo del menú, que quedaría con alto 0 (top y bottom medidos contra la barra, no contra la pantalla). */}
      <div aria-hidden="true" className="absolute inset-0 -z-1 bg-bg/95 backdrop-blur-md" />
      <div className="flex min-h-[72px] items-center gap-3 gutter-1360 py-2">
        <a
          href="#top"
          aria-label={`${c.name}, inicio`}
          className="flex min-h-11 min-w-0 items-center gap-2.5 text-on-dark no-underline max-[440px]:[&_.brand-eyebrow]:hidden"
        >
          <Brand size={48} wordSize="clamp(1.15rem,calc(4vw + .2rem),1.55rem)" eyebrowSize=".52em" eager />
        </a>
        <nav aria-label="Secciones" className="ml-auto hidden items-center gap-0.5 lg:flex">
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="inline-flex min-h-11 items-center rounded-full px-3.5 text-[.95rem] font-extrabold text-on-dark no-underline transition-colors hover:bg-highlight hover:text-on-light"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex flex-none items-center gap-2 lg:ml-3">
          <a href="#reserva" className="btn btn-cta hidden min-h-11 px-5 text-[.95rem] min-[480px]:inline-flex">
            Reservar
          </a>
          <button
            ref={toggle}
            type="button"
            aria-expanded={open}
            aria-controls="menu-fifi"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setOpen((v) => !v)}
            className="btn btn-highlight btn-icon size-11 lg:hidden"
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {open && (
        <div
          id="menu-fifi"
          className="fixed inset-x-0 top-(--header-offset,75px) bottom-0 z-50 overflow-auto bg-bg text-on-dark motion-safe:animate-menu-drop lg:hidden"
        >
          <nav aria-label="Secciones" className="flex flex-col gap-1 gutter-1360 py-6">
            {SECTIONS.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={() => setOpen(false)}
                className="flex min-h-14 items-center rounded-2xl px-3 font-display text-[2rem] leading-none text-on-dark no-underline hover:bg-highlight hover:text-on-light"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex flex-col gap-3 gutter-1360 pb-8">
            <a href="#reserva" onClick={() => setOpen(false)} className="btn btn-cta min-h-14 text-[1.05rem]">
              Reservar cabaña
            </a>
            <a href={wa(c.whatsapp, "Hola, quiero información.")} target="_blank" rel="noopener" className="btn btn-card min-h-14 gap-2.5">
              <WhatsAppIcon size={20} />
              Escribir por WhatsApp
            </a>
            <a href={tel(c.phones[0])} className="btn btn-card min-h-14 gap-2.5 tabular-nums">
              <PhoneIcon size={18} />
              {c.phones[0]}
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
