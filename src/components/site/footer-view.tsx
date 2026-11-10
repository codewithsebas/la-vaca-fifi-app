import Link from "next/link";
import { dirHref, tel, wa } from "@/lib/format";
import { BrandName, Logo } from "@/components/brand/logo";
import { CabinRow } from "@/components/brand/cabin-row";
import { ArrowRightIcon, ArrowUpIcon, WhatsAppIcon } from "@/components/ui/icons";
import type { SiteConfig, SiteTexts } from "@/lib/site";

// Pie de página claro. Arriba, la marca con su descripción y, a la derecha, el atajo para reservar por WhatsApp; luego
// cuatro columnas (reservas, visítanos, escríbenos y redes); el año, el RNT y «Volver arriba»; y al pie, la fila de
// cabañas de colores dibujada como las de la finca (components/brand/cabin-row.tsx). En todas las páginas públicas.

const heading = "mb-2 text-[1rem] font-black text-on-light";
const row = "flex min-h-8 items-center sm:min-h-9 [@media(max-height:760px)]:min-h-7";
const link = "text-on-light-muted transition-colors hover:text-cta";

const SOCIAL_ICONS = {
  Instagram: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  ),
  Facebook: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 3h-2.5A4.5 4.5 0 0 0 8 7.5V10H5.5v4H8v7h4v-7h3l1-4h-4V7.5a1 1 0 0 1 1-1h2z" />
    </svg>
  ),
  TikTok: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.4 2.6 2.4 4.5 5 4.8" />
    </svg>
  ),
} as const;

// tall: ocupa toda la pantalla (portada): el contenido arriba y las cabañas, más grandes, al pie (el espacio que sobra queda entre los dos).
export function SiteFooterView({ c, texts, tall = false }: { c: SiteConfig; texts: SiteTexts; tall?: boolean }) {
  const social = (
    [
      ["Instagram", texts.social.instagram],
      ["Facebook", texts.social.facebook],
      ["TikTok", texts.social.tiktok],
    ] as const
  ).filter(([, url]) => url);

  return (
    <footer className={`overflow-hidden bg-card text-on-light ${tall ? "flex min-h-svh flex-col max-lg:min-h-[calc(100svh-76px)]" : ""}`}>
      <div aria-hidden="true" className="railing h-1.5 flex-none" />
      <div className={`gutter-1280 ${tall ? "flex flex-1 flex-col" : ""}`}>
        <div className="grid gap-x-12 gap-y-5 border-b border-on-dark/10 pt-[clamp(18px,min(5vw,6svh),64px)] pb-[clamp(14px,min(3.5vw,4svh),40px)] sm:gap-y-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex flex-col items-start gap-3 sm:gap-4">
            <span className="flex items-center gap-3">
              <Logo size={60} className="max-sm:size-12" />
              <BrandName wordSize="1.6rem" />
            </span>
            <p className="max-w-[56ch] text-[.9rem] leading-relaxed text-on-light-muted sm:text-[.95rem]">{c.tagline}</p>
          </div>
          {/* En el celular de la portada no hace falta: ahí están la barra de «Reservar» y el botón de WhatsApp. */}
          <div className={`flex flex-col gap-3 ${tall ? "max-sm:hidden" : ""}`}>
            <h2 className={heading}>Reserva directo</h2>
            <a
              href={wa(c.whatsapp, "Hola, quiero información para reservar.")}
              target="_blank"
              rel="noopener"
              className="group flex min-h-12 items-stretch overflow-hidden rounded-xl border border-on-dark/15 bg-card no-underline"
            >
              <span className="flex flex-1 items-center gap-2 px-4 text-[.92rem] text-on-light-muted">
                <WhatsAppIcon size={17} />
                Escríbenos por WhatsApp
              </span>
              <span className="flex items-center gap-1.5 bg-cta px-5 text-[.92rem] font-extrabold text-cta-text transition-colors group-hover:bg-[color-mix(in_srgb,var(--color-cta)_88%,#000)]">
                Escribir
                <ArrowRightIcon size={16} />
              </span>
            </a>
            <p className="text-[.86rem] leading-relaxed text-on-light-muted max-sm:hidden [@media(max-height:760px)]:hidden">
              Te ayudamos con fechas, cabañas, mascotas, el restaurante o una celebración. También puedes{" "}
              <Link href="/reservar" className="font-bold text-cta hover:underline">
                reservar en línea
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-5 py-[clamp(14px,min(3.5vw,4svh),40px)] sm:gap-y-8 lg:grid-cols-4 [@media(max-height:760px)]:gap-y-4">
          <nav aria-label="Enlaces de reservas" className="flex flex-col text-[.86rem] sm:text-[.92rem]">
            <h2 className={heading}>Reservas</h2>
            {[
              ["/reservar", "Reservar"],
              ["/mi-reserva", "Consultar mi reserva"],
              ["/politicas", "Políticas de reserva"],
              ["/privacidad", "Política de privacidad"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className={`${row} ${link}`}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col text-[.86rem] sm:text-[.92rem]">
            <h2 className={heading}>Visítanos</h2>
            <span className="py-1 text-on-light-muted sm:py-1.5">{c.address}</span>
            <a href={dirHref()} target="_blank" rel="noopener" className={`${row} font-bold text-cta hover:underline`}>
              Cómo llegar →
            </a>
          </div>
          <div className="flex flex-col text-[.86rem] sm:text-[.92rem]">
            <h2 className={heading}>Horarios</h2>
            <span className={`${row} text-on-light-muted`}>Check-in: {c.checkIn}</span>
            <span className={`${row} text-on-light-muted`}>Check-out: {c.checkOut}</span>
          </div>
          <div className="flex flex-col text-[.86rem] sm:text-[.92rem]">
            <h2 className={heading}>Escríbenos</h2>
            {c.phones.map((p) => (
              <a key={p} href={tel(p)} className={`${row} tabular-nums ${link}`}>
                {p}
              </a>
            ))}
            {social.length > 0 && (
              <ul aria-label="Redes sociales" className="mt-2 flex flex-wrap gap-2.5">
                {social.map(([name, url]) => (
                  <li key={name}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener"
                      aria-label={name}
                      title={name}
                      className="grid size-11 place-items-center rounded-full bg-card text-cta shadow-[0_4px_14px_-6px_rgb(36_26_20/0.3)] transition-transform hover:-translate-y-0.5"
                    >
                      {SOCIAL_ICONS[name]}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-1 border-t border-on-dark/10 py-3 text-center text-[.8rem] text-on-light-muted sm:py-4 sm:text-[.84rem] [@media(max-height:760px)]:py-2">
          <p>
            © {new Date().getFullYear()} {c.name}
            {c.rnt && ` · RNT ${c.rnt}`} · Vereda Pajonales, Murillo, Tolima
          </p>
          <a href="#" className="group flex min-h-10 items-center gap-2 font-bold transition-colors hover:text-cta">
            Volver arriba
            <span className="grid size-7 place-items-center rounded-full border border-current transition-transform duration-200 group-hover:-translate-y-0.5">
              <ArrowUpIcon size={13} />
            </span>
          </a>
        </div>
      </div>
      <CabinRow className={tall ? "h-[clamp(80px,min(17vw,24svh),260px)] flex-none" : "h-[clamp(96px,13vw,190px)]"} />
    </footer>
  );
}
