import Link from "next/link";
import { dirHref, tel, wa } from "@/lib/format";
import { getSite } from "@/lib/server/site";
import { BrandName, Logo } from "./brand";
import { CowHide, SpotEdge } from "./fifi/decor";
import { Fifi } from "./fifi/fifi";
import { ArrowUpIcon, CalendarIcon, PhoneIcon, PinIcon, WhatsAppIcon } from "./icons";

// Pie de página: la tinta de las manchas de Fifí. Arriba, el borde ondulado del amarillo del arete; Fifí asoma por el
// filo; luego la marca con sus redes, la dirección y los horarios, los teléfonos y los enlaces de reservas; abajo, el
// año, el RNT y «Volver arriba». En todas las páginas públicas.

const heading = "mb-2 flex items-center gap-2 font-display text-[1.25rem] text-highlight";
const row = "flex min-h-11 items-center";
const link = "underline decoration-2 underline-offset-4 decoration-transparent transition-colors hover:text-highlight hover:decoration-highlight";

const SOCIAL_ICONS = {
  Instagram: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  ),
  Facebook: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h-2.5A4.5 4.5 0 0 0 8 7.5V10H5.5v4H8v7h4v-7h3l1-4h-4V7.5a1 1 0 0 1 1-1h2z" />
    </svg>
  ),
  TikTok: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.4 2.6 2.4 4.5 5 4.8" />
    </svg>
  ),
} as const;

export async function SiteFooter() {
  const { c, texts } = await getSite();
  const social = (
    [
      ["Instagram", texts.social.instagram],
      ["Facebook", texts.social.facebook],
      ["TikTok", texts.social.tiktok],
    ] as const
  ).filter(([, url]) => url);

  return (
    <footer className="relative isolate overflow-hidden bg-on-dark text-bg">
      <SpotEdge className="relative z-1 h-[clamp(26px,3.4vw,48px)] text-highlight" />
      <CowHide id="footer-hide" className="-z-1 text-bg opacity-[.035]" />

      <div className="gutter-1360 relative">
        {/* Fifí asoma por el borde, a la derecha. */}
        <div aria-hidden="true" className="pointer-events-none absolute top-[-12px] right-[max(16px,calc((100%-1360px)/2))] w-[clamp(92px,12vw,150px)] rotate-[-8deg] max-sm:hidden">
          <Fifi />
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-9 pt-[clamp(28px,4vw,48px)] pb-[clamp(32px,5vw,56px)] lg:grid-cols-[1.3fr_1fr_1fr_1fr] lg:gap-x-10">
          <div className="col-span-2 flex flex-col items-start gap-4 lg:col-span-1">
            <span className="flex items-center gap-3">
              <Logo size={64} />
              <BrandName wordSize="1.7rem" />
            </span>
            <p className="max-w-[34ch] text-bg/80">{c.tagline}</p>
            {social.length > 0 && (
              <ul aria-label="Redes sociales" className="flex flex-wrap gap-2.5">
                {social.map(([name, url]) => (
                  <li key={name}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener"
                      aria-label={name}
                      title={name}
                      className="grid size-11 place-items-center rounded-full border-[2.5px] border-bg/40 transition-[background-color,border-color,color,transform] duration-200 hover:-translate-y-0.5 hover:border-highlight hover:bg-highlight hover:text-on-dark"
                    >
                      {SOCIAL_ICONS[name]}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
            <h2 className={heading}>
              <PinIcon size={18} />
              Visítanos
            </h2>
            <span>{c.address}</span>
            <span className="text-bg/75">Check-in: {c.checkIn}</span>
            <span className="text-bg/75">Check-out: {c.checkOut}</span>
            <a href={dirHref()} target="_blank" rel="noopener" className={`${row} font-extrabold`}>
              <span className={link}>Cómo llegar →</span>
            </a>
          </div>
          <div className="col-span-2 flex flex-col gap-0.5 sm:col-span-1">
            <h2 className={heading}>
              <PhoneIcon size={18} />
              Escríbenos
            </h2>
            {c.phones.map((p) => (
              <a key={p} href={tel(p)} className={`${row} font-bold tabular-nums`}>
                <span className={link}>{p}</span>
              </a>
            ))}
            <a href={wa(c.whatsapp)} target="_blank" rel="noopener" className={`${row} gap-2 font-extrabold`}>
              <WhatsAppIcon size={17} />
              <span className={link}>WhatsApp</span>
            </a>
          </div>
          <nav aria-label="Enlaces de reservas" className="col-span-2 flex flex-col gap-0.5 sm:col-span-1">
            <h2 className={heading}>
              <CalendarIcon size={18} />
              Reservas
            </h2>
            {[
              ["/reservar", "Reservar"],
              ["/mi-reserva", "Consultar mi reserva"],
              ["/politicas", "Políticas de reserva"],
              ["/privacidad", "Política de privacidad"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className={`${row} font-bold`}>
                <span className={link}>{label}</span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-3 border-t-2 border-dashed border-bg/20 py-5 text-[.86rem] text-bg/75">
          <p>
            © {new Date().getFullYear()} {c.name}
            {c.rnt && ` · RNT ${c.rnt}`} · Vereda Pajonales, Murillo, Tolima
          </p>
          <a href="#" className="group flex min-h-11 items-center gap-2 font-extrabold text-bg transition-colors hover:text-highlight">
            Volver arriba
            <span className="grid size-9 place-items-center rounded-full border-[2.5px] border-current transition-transform duration-200 group-hover:-translate-y-1">
              <ArrowUpIcon size={15} />
            </span>
          </a>
        </div>
      </div>
    </footer>
  );
}
