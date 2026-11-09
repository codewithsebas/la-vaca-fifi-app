"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSite } from "@/components/site/site-provider";
import { tel, wa } from "@/lib/format";
import { Brand, Logo } from "@/components/brand/logo";
import { MenuIcon, PhoneIcon, SearchIcon, WhatsAppIcon } from "@/components/ui/icons";
import { onBookingSummary, openBooking, type BookingSummary } from "@/components/landing/booking-bus";

const SECTIONS = [
  ["cabanas", "Cabañas"],
  ["servicios", "Lo que ofrecemos"],
  ["restaurante", "Restaurante y café"],
  ["finca", "La finca"],
  ["ubicacion", "Cómo llegar"],
  ["antes-de-venir", "Antes de venir"],
  ["contacto", "Contacto"],
] as const;

// Encabezado de la portada, al estilo de los sitios de alojamiento: barra blanca fija con un filo fino. Marca a la
// izquierda; al centro, el buscador en píldora (lleva a la tarjeta de reserva); a la derecha, WhatsApp y el menú en
// píldora, que abre la lista de secciones y los contactos (Esc, un clic afuera o el mismo botón lo cierran). Se esconde
// al bajar y vuelve al subir. Publica su alto en --header-offset para que los enlaces a una sección no la dejen debajo
// (components/landing/centered-anchors.tsx).
export function FifiHeader() {
  const { c } = useSite();
  const [open, setOpen] = useState(false);
  const bar = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  // Lo elegido en la tarjeta de reserva, para mostrarlo en el buscador (lo publica components/landing/booking-widget.tsx).
  const [summary, setSummary] = useState<BookingSummary>({});

  useEffect(() => onBookingSummary(setSummary), []);

  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--header-offset", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Al bajar, la barra se esconde; al subir (o cerca del inicio) vuelve. No se esconde con el menú abierto ni con el
  // foco del teclado dentro. Publica en --header-visible lo que ocupa a la vista (su alto o 0), para la tarjeta fija.
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    // Directo en el evento (es poco trabajo y React no vuelve a pintar si el valor no cambia).
    const onScroll = () => {
      const el = bar.current;
      if (!el) return;
      const y = window.scrollY;
      const dy = y - lastY;
      if (Math.abs(dy) < 6) return;
      lastY = y;
      const keep = y < el.offsetHeight * 2 || el.querySelector(":focus-visible") || menu.current?.querySelector("#menu-fifi");
      setHidden(!keep && dy > 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const el = bar.current;
    if (el) document.documentElement.style.setProperty("--header-visible", hidden ? "0px" : `${el.offsetHeight}px`);
  }, [hidden]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const item = "flex min-h-11 items-center gap-2.5 px-4 text-[.95rem] text-on-light no-underline hover:bg-bg";
  const pillPart = "flex min-h-9 max-w-[200px] items-center truncate rounded-full px-4 hover:bg-bg";

  return (
    <header
      ref={bar}
      onFocus={() => setHidden(false)}
      className={`sticky top-0 z-50 border-b border-(--line) bg-card transition-transform duration-300 ease-out motion-reduce:transition-none ${hidden ? "-translate-y-full" : ""}`}
    >
      <div aria-hidden="true" className="railing h-1" />
      <div className="flex min-h-[76px] items-center gap-4 gutter-1280 py-3">
        <a
          href="#top"
          aria-label={`${c.name}, inicio`}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-on-dark no-underline md:flex-none lg:flex-1 max-[440px]:[&_.brand-eyebrow]:hidden"
        >
          <Brand size={44} wordSize="clamp(1.15rem,calc(4vw + .2rem),1.45rem)" eyebrowSize=".5em" eager />
        </a>

        {/* Buscador en píldora: cada tramo abre su parte de la tarjeta de reserva (llegada, tipo de cabaña o huéspedes) y
            muestra lo ya elegido; la lupa lleva a la tarjeta. */}
        <div
          role="group"
          aria-label="Buscar disponibilidad"
          className="mx-auto hidden min-h-12 items-center rounded-full border border-(--line-strong) bg-card p-1.5 text-[.9rem] text-on-light shadow-[0_1px_2px_rgb(0_0_0/0.08),0_4px_12px_rgb(0_0_0/0.05)] transition-shadow hover:shadow-[0_2px_4px_rgb(0_0_0/0.18)] md:flex"
        >
          <button type="button" onClick={() => openBooking("dates")} className={pillPart}>
            <span className="font-bold">{summary.dates ?? "Elige tus fechas"}</span>
          </button>
          <span aria-hidden="true" className="h-6 w-px bg-(--line-strong)" />
          <button type="button" onClick={() => openBooking("type")} className={pillPart}>
            <span className="font-bold">{summary.cabin ?? "Tipo de cabaña"}</span>
          </button>
          <span aria-hidden="true" className="h-6 w-px bg-(--line-strong)" />
          <button type="button" onClick={() => openBooking("guests")} className={pillPart}>
            <span className={summary.guests ? "font-bold" : "text-on-light-muted"}>{summary.guests ?? "Huéspedes"}</span>
          </button>
          <button
            type="button"
            aria-label="Ir a la reserva"
            onClick={() => openBooking(null)}
            className="ml-1 grid size-9 flex-none place-items-center rounded-full bg-cta text-cta-text transition-colors hover:bg-[color-mix(in_srgb,var(--color-cta)_88%,#000)]"
          >
            <SearchIcon size={16} />
          </button>
        </div>

        <div className="flex flex-none items-center justify-end gap-1 lg:flex-1">
          <a
            href={wa(c.whatsapp, "Hola, quiero información.")}
            target="_blank"
            rel="noopener"
            className="hidden min-h-11 items-center gap-2 rounded-full px-4 text-[.92rem] font-bold text-on-light no-underline hover:bg-bg lg:inline-flex"
          >
            <WhatsAppIcon size={17} />
            Escríbenos
          </a>
          <div ref={menu} className="relative">
            <button
              ref={toggle}
              type="button"
              aria-expanded={open}
              aria-controls="menu-fifi"
              aria-label={open ? "Cerrar menú" : "Abrir menú"}
              onClick={() => setOpen((v) => !v)}
              className="flex min-h-12 items-center gap-2.5 rounded-full border border-(--line-strong) bg-card py-1.5 pr-1.5 pl-3.5 text-on-light transition-shadow hover:shadow-[0_2px_4px_rgb(0_0_0/0.18)]"
            >
              <MenuIcon size={18} />
              <Logo size={32} />
            </button>
            {open && (
              <div
                id="menu-fifi"
                className="absolute top-[calc(100%+8px)] right-0 z-50 flex w-[260px] flex-col overflow-hidden rounded-xl border border-(--line) bg-card py-2 shadow-[0_2px_16px_rgb(0_0_0/0.14)] motion-safe:animate-pop-in"
              >
                <a href="#reserva" onClick={() => setOpen(false)} className={`${item} font-extrabold`}>
                  Reservar cabaña
                </a>
                <Link href="/mi-reserva" onClick={() => setOpen(false)} className={item}>
                  Consultar mi reserva
                </Link>
                <span aria-hidden="true" className="my-2 h-px bg-(--line)" />
                <nav aria-label="Secciones" className="flex flex-col">
                  {SECTIONS.map(([id, label]) => (
                    <a key={id} href={`#${id}`} onClick={() => setOpen(false)} className={item}>
                      {label}
                    </a>
                  ))}
                </nav>
                <span aria-hidden="true" className="my-2 h-px bg-(--line)" />
                <a href={wa(c.whatsapp, "Hola, quiero información.")} target="_blank" rel="noopener" className={item}>
                  <WhatsAppIcon size={17} />
                  Escribir por WhatsApp
                </a>
                <a href={tel(c.phones[0])} className={`${item} tabular-nums`}>
                  <PhoneIcon size={16} />
                  {c.phones[0]}
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
