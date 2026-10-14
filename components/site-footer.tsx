import Link from "next/link";
import { dirHref, tel, wa } from "@/lib/format";
import { getSite } from "@/lib/server/site";
import { Logo } from "./brand";
import { ArrowUpIcon, CalendarIcon, PhoneIcon, PinIcon, WhatsAppIcon } from "./icons";
import { FAUNA } from "./landing/fauna";
import { ForestScene, SCENE_TONES } from "./landing/forest-scene";
import { ShootingStar, Stars } from "./landing/night-sky";

// Pie de página: el bosque andino al caer la tarde, el cierre de la portada. Arriba, el cielo con estrellas y la
// invitación a reservar; en el medio, el paisaje en capas (cordillera con el nevado, laderas de pinos entre la niebla,
// lomas, frailejones) donde viven el oso de anteojos, el venado, el tapir, el colibrí chivito, las águilas, la cotinga,
// la candelita y el cóndor, con el nombre gigante que se hunde detrás de las montañas; abajo, sobre el suelo del bosque,
// los datos de contacto. Todo lo que se mueve respeta «reducir movimiento».

const heading = "mb-2 flex items-center gap-2 font-body text-[.78rem] font-extrabold uppercase tracking-[.12em] text-accent";
const row = "flex min-h-11 items-center";
// Subrayado que crece desde la izquierda al pasar el mouse o al enfocar.
const link = "w-fit bg-linear-to-r from-accent to-accent bg-[length:0%_2px] bg-left-bottom bg-no-repeat pb-0.5 transition-[background-size,color] duration-300 hover:bg-[length:100%_2px] hover:text-card focus-visible:bg-[length:100%_2px]";

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
    // Continuación de la página: empieza exactamente en el color general (sin corte con la sección anterior), el cielo
    // se aclara hacia el horizonte detrás de las montañas y el bosque baja hasta el suelo oscuro de los datos.
    <footer className="relative isolate overflow-hidden bg-bg text-on-dark" style={SCENE_TONES}>
      <Stars count={44} height={92} className="-z-10 h-[clamp(300px,34vw,520px)] [mask-image:linear-gradient(to_bottom,transparent,black_30%,black_60%,transparent)]" />
      <ShootingStar className="absolute top-[clamp(40px,6vw,90px)] right-[14%] -z-10" every={11} delay={4} />

      {/* Invitación final */}
      <div className="gutter-1360 relative z-1 pt-[clamp(56px,8vw,128px)]">
        <div className="reveal-on-scroll flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
          <p className="display max-w-[16ch] text-[clamp(2.6rem,6vw,5.2rem)] leading-[.9]">
            ¿Listo para dormir <span className="text-accent">bajo las estrellas?</span>
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/reservar" className="btn btn-highlight min-h-14 px-7 font-bold transition-transform hover:-translate-y-0.5">
              Reservar ahora
            </Link>
            <a href={wa(c.whatsapp, "Hola, quiero reservar un domo.")} target="_blank" rel="noopener" className="btn btn-outline-dark min-h-14 gap-2 px-6 font-bold transition-colors hover:bg-on-dark hover:text-on-light">
              <WhatsAppIcon size={18} />
              Escríbenos
            </a>
          </div>
        </div>
      </div>

      {/* El bosque, con el nombre escrito sobre la cordillera. */}
      <ForestScene title className="-mt-[clamp(8px,3vw,48px)] -mb-px" />

      {/* Suelo del bosque: la fauna de la ilustración y los datos de contacto. */}
      <div className="bg-(--fs-ground)">
        <div className="gutter-1360">
          <p className="flex flex-wrap items-baseline justify-center gap-x-2.5 gap-y-1 border-b-2 border-dotted border-on-dark/15 pt-1 pb-6 text-center text-[.82rem] text-on-dark-muted">
            <span className="font-extrabold tracking-[.14em] text-accent uppercase">Vecinos de la montaña</span>
            {FAUNA.map((name) => (
              <span key={name} className="before:mr-2.5 before:text-on-dark/30 before:content-['·']">
                {name}
              </span>
            ))}
          </p>

          <div className="grid grid-cols-2 gap-x-6 gap-y-8 py-[clamp(32px,5vw,56px)] lg:grid-cols-4 lg:gap-x-10">
            <div className="col-span-2 flex flex-col items-start gap-4 sm:col-span-1">
              <Logo size={68} />
              <p className="max-w-[28ch] text-on-dark-muted">{c.tagline}</p>
              {c.rnt && <p className="text-[.85rem] font-bold">RNT {c.rnt}</p>}
              {social.length > 0 && (
                <ul aria-label="Redes sociales" className="flex flex-wrap gap-2">
                  {social.map(([name, url]) => (
                    <li key={name}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener"
                        aria-label={name}
                        title={name}
                        className="grid size-11 place-items-center rounded-full border-2 border-on-dark/30 transition-[background-color,border-color,color,transform] duration-300 hover:-translate-y-0.5 hover:border-card hover:bg-card hover:text-on-light"
                      >
                        {SOCIAL_ICONS[name]}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
              <h2 className={heading}>
                <PinIcon size={15} />
                Dirección y horarios
              </h2>
              <span>{c.address}</span>
              <span className="text-on-dark-muted">Check-in: {c.checkIn}</span>
              <span className="text-on-dark-muted">Check-out: {c.checkOut}</span>
              <a href={dirHref()} target="_blank" rel="noopener" className={`${row} font-bold`}>
                <span className={link}>Cómo llegar →</span>
              </a>
            </div>
            <div className="flex flex-col gap-0.5">
              <h2 className={heading}>
                <PhoneIcon size={15} />
                Teléfonos
              </h2>
              {c.phones.map((p) => (
                <a key={p} href={tel(p)} className={`${row} font-semibold tabular-nums`}>
                  <span className={link}>{p}</span>
                </a>
              ))}
              <a href={wa(c.whatsapp)} target="_blank" rel="noopener" className={`${row} gap-2 font-bold`}>
                <WhatsAppIcon size={16} />
                <span className={link}>WhatsApp</span>
              </a>
            </div>
            <nav aria-label="Enlaces de reservas" className="flex flex-col gap-0.5">
              <h2 className={heading}>
                <CalendarIcon size={15} />
                Reservas
              </h2>
              {[
                ["/reservar", "Reservar"],
                ["/mi-reserva", "Consultar mi reserva"],
                ["/politicas", "Políticas de reserva"],
                ["/privacidad", "Política de privacidad"],
              ].map(([href, label]) => (
                <Link key={href} href={href} className={`${row} font-semibold`}>
                  <span className={link}>{label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>

       <div className="gutter-1360 flex flex-wrap items-end justify-between gap-x-10 gap-y-4 pb-5 text-[.82rem] text-on-dark-muted">
          <div className="flex max-w-[90ch] flex-col gap-2.5">
            <p>
              © {new Date().getFullYear()} {c.name}
              {c.rnt && ` · RNT ${c.rnt}`}
            </p>
          </div>
          <a href="#" className="group flex min-h-11 items-center gap-2 font-bold text-on-dark transition-colors hover:text-accent">
            Volver arriba
            <span className="grid size-9 place-items-center rounded-full border-2 border-current transition-transform duration-300 group-hover:-translate-y-1">
              <ArrowUpIcon size={15} />
            </span>
          </a>
        </div>
      </div>
    </footer>
  );
}
