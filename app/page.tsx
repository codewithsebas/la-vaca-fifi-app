import type { Metadata } from "next";
import { Logo } from "@/components/brand";
import { BookingProvider, BookingWidget, CabinReserveButton } from "@/components/landing/booking";
import { CenteredAnchors } from "@/components/landing/centered-anchors";
import { CopyButton } from "@/components/landing/copy-button";
import { HeroParallax, RotatingWords } from "@/components/landing/hero-motion";
import { LandingHeader } from "@/components/landing/landing-header";
import { HeroScene } from "@/components/landing/hero-scene";
import { ShootingStar, StarCow, Stars } from "@/components/landing/night-sky";
import { Section, SectionHeader } from "@/components/landing/section";
import { PhotoLightbox } from "@/components/landing/photo-lightbox";
import { PhotoSlot } from "@/components/photo-slot";
import { ServiceCard } from "@/components/service-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteTheme, siteViewport } from "@/components/site-theme";
import { ArrowRightIcon, CalendarIcon, LoginIcon, LogoutIcon, MountainIcon, PhoneIcon, PinIcon, SparkleIcon, WhatsAppFabIcon, WhatsAppIcon } from "@/components/icons";
import { config, type Cabin } from "@/lib/config";
import { getSiteCabins } from "@/lib/server/cabins";
import { getSite } from "@/lib/server/site";
import { rotatingPhrases, type SiteConfig } from "@/lib/site";
import { EXPERIENCES } from "@/lib/content";
import { cop, dirHref, tel, wa } from "@/lib/format";

export const metadata: Metadata = {
  title: { absolute: `${config.name} · Cabañas y restaurante en Murillo, Tolima` },
  description: "Cabañas de colores con baño privado, balcón con vista a la montaña y desayuno americano incluido, a 5 minutos de Murillo, Tolima. Restaurante, fogata, parque infantil y pet friendly. Reserva en línea.",
  openGraph: {
    title: `${config.name} · Murillo, Tolima`,
    description: "Cabañas y restaurante de finca a 5 minutos de Murillo, Tolima. Desayuno incluido y pet friendly.",
  },
  twitter: { card: "summary_large_image" },
};

// Página estática que se regenera cada hora o al guardar tarifas en el panel.
export const revalidate = 3600;

export function generateViewport() {
  return siteViewport();
}

// Todas las fotos del sitio para la galería, en el orden en que aparecen en la portada (sin repetir ni marcadores vacíos).
function galleryOf(photos: Record<string, string>, cabins: Cabin[]): string[] {
  const all = [
    ...["hero-main", "hero-thumb-1", "hero-thumb-2", "hero-thumb-3", "hero-thumb-4"].map((id) => photos[id]),
    ...cabins.flatMap((c) => c.photos),
    ...EXPERIENCES.map((e) => photos[`exp-${e.id}`]),
    photos.contact,
  ];
  return [...new Set(all.filter(Boolean))];
}

function jsonLd(cabins: Cabin[], site: SiteConfig) {
  const prices = cabins.length ? cabins.map((c) => c.couple) : [0];
  return {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: config.name,
    description: config.tagline,
    telephone: "+57 " + site.phones[0],
    address: { "@type": "PostalAddress", streetAddress: config.street, addressLocality: config.city, addressRegion: config.region, addressCountry: config.country },
    geo: { "@type": "GeoCoordinates", latitude: config.lat, longitude: config.lng },
    priceRange: `${cop(Math.min(...prices))} - ${cop(Math.max(...prices))} COP por noche`,
    checkinTime: site.checkInStart,
    checkoutTime: site.checkOutTime,
    petsAllowed: true,
    currenciesAccepted: "COP",
  };
}

// Waze (trazo simple, mismo estilo de los demás íconos).
function WazeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17.2c-1.8-.2-3.4-.9-4.4-2.2 1.4-.7 2-1.9 2-3.5a7.5 7.5 0 0 1 15 0c0 3.4-3 5.5-6 6h-3.4" />
      <circle cx="8.6" cy="19" r="1.6" />
      <circle cx="15.6" cy="19" r="1.6" />
      <path d="M9.5 10h.01M14.5 10h.01M10 13c1 .8 3 .8 4 0" />
    </svg>
  );
}

// Una cabaña: su foto en un arco (como una ventana) y, al lado, lo que incluye y el precio; alterna de lado. La foto,
// los títulos y los espacios se ajustan también al alto de la pantalla (svh), para que la cabaña (con el encabezado, en
// el primero) quepa entero en ella aunque la ventana sea baja o tenga zoom.
function CabinRow({ c, i, total }: { c: Cabin; i: number; total: number }) {
  return (
    <article className={`reveal-on-scroll reveal-tall grid items-center gap-x-[clamp(28px,6cqi,92px)] gap-y-9 md:grid-cols-2 ${i % 2 ? "md:[&>figure]:order-2" : ""}`}>
      <figure className="group relative mx-auto w-full max-w-[clamp(260px,52svh,500px)]">
        {/* Aro punteado alrededor del arco, como la órbita de la foto. */}
        <span aria-hidden="true" className="pointer-events-none absolute -inset-3 rounded-t-[999px] rounded-b-[44px] border-2 border-dotted border-on-dark/25" />
        <div className="relative aspect-[4/4.5] overflow-hidden rounded-t-[999px] rounded-b-[32px] bg-surface">
          <div className="absolute inset-0 transition-transform duration-[1.4s] ease-out group-hover:scale-[1.05]">
            <PhotoSlot src={c.photos[0]} alt={c.full} placeholder={`Foto real: ${c.full.toLowerCase()}`} sizes="(min-width: 768px) 500px, 100vw" zoom />
          </div>
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-black/45 to-transparent" />
        </div>
        {c.badge && <figcaption className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-highlight px-4 py-1.5 text-[.82rem] font-extrabold whitespace-nowrap text-on-light shadow-card">{c.badge}</figcaption>}
      </figure>
      <div className="flex flex-col gap-[clamp(8px,1.8svh,20px)]">
        <p aria-hidden="true" className="display text-[1.5rem] leading-none text-highlight">
          {String(i + 1).padStart(2, "0")}
          <span className="text-on-dark/30"> / {String(total).padStart(2, "0")}</span>
        </p>
        <h3 className="display text-[clamp(2.5rem,min(5cqi,7svh),4.2rem)] leading-[.92]">{c.full}</h3>
        {c.description && <p className="max-w-[54ch] text-pretty text-on-dark-muted">{c.description}</p>}
        {c.features.length > 0 && (
          <ul aria-label={`Características de ${c.full}`} className="grid gap-x-6 gap-y-[clamp(4px,1.2svh,10px)] sm:grid-cols-2">
            {c.features.map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-[.96rem] font-semibold">
                <SparkleIcon size={11} className="flex-none" />
                {f}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-5 border-t-2 border-dotted border-on-dark/20 pt-[clamp(8px,1.8svh,20px)]">
          <dl className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <dt className="eyebrow text-on-dark-muted">Noche para 2</dt>
              <dd className="display mt-1 text-[clamp(2rem,6svh,2.6rem)] leading-none">{cop(c.couple)}</dd>
            </div>
            {c.max > 2 && (
              <div>
                <dt className="eyebrow text-on-dark-muted">Persona adicional</dt>
                <dd className="mt-1 text-[1.15rem] leading-tight font-extrabold tabular-nums">{cop(c.extra)}</dd>
              </div>
            )}
            <div>
              <dt className="eyebrow text-on-dark-muted">Capacidad</dt>
              <dd className="mt-1 text-[1.15rem] leading-tight font-extrabold">Hasta {c.max} personas</dd>
            </div>
          </dl>
          <CabinReserveButton cabin={c.id} />
        </div>
      </div>
    </article>
  );
}

export default async function HomePage() {
  const [cabins, { c: site, photos, texts, services: allServices }] = await Promise.all([getSiteCabins(), getSite()]);
  const services = allServices.filter((s) => s.visible);
  const fromPrice = cabins.length ? Math.min(...cabins.map((c) => c.couple)) : 0;
  return (
    // --header-h: alto del encabezado de la portada; la portada ocupa el resto de la primera pantalla.
    <div id="top" className="@container relative overflow-x-clip [--header-h:82px]">
      <SiteTheme />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(cabins, site)).replace(/</g, "\\u003c") }} />
      <LandingHeader />
      <CenteredAnchors />

      <main>
        <BookingProvider cabins={cabins}>
          {/* Portada */}
          {/* Portada ilustrada a pantalla completa: el cielo es el fondo (de la noche, arriba, al resplandor del
              horizonte), con estrellas, La Vaca Fifí hecha constelación que lo cruza despacio y estrellas fugaces; el
              título va centrado y, debajo, el paisaje con el nevado, la cabaña de colores y la vaca
              (components/landing/hero-scene.tsx). El
              encabezado va encima del cielo. El título sube palabra por palabra y su segunda línea alterna frases; con
              mouse, las capas se desplazan un poco en profundidad. Ocupa al menos toda la primera pantalla. */}
          <HeroParallax
            aria-label="Presentación"
            className="relative isolate flex min-h-svh flex-col overflow-hidden bg-[linear-gradient(to_bottom,var(--color-deep)_0%,var(--color-bg)_28%,color-mix(in_srgb,var(--color-accent)_24%,var(--color-surface))_56%,color-mix(in_srgb,var(--color-highlight)_34%,var(--color-surface))_74%)] pt-(--header-h)"
          >
            <Stars count={72} height={56} className="-z-1 [mask-image:linear-gradient(to_bottom,black_52%,transparent_76%)]" />
            <StarCow className="absolute top-[clamp(96px,16svh,160px)] left-[3%] -z-1 w-[clamp(170px,21cqi,320px)]" />
            <ShootingStar className="absolute top-[11%] right-[9%] -z-1" every={8} delay={3} />
            <ShootingStar className="absolute top-[26%] left-[34%] -z-1" angle={162} travel={190} every={13} delay={8} />

            <div className="gutter-1360 relative z-2 flex flex-none flex-col items-center gap-[clamp(10px,2svh,22px)] pt-[clamp(8px,3svh,36px)] text-center">
              {texts.hero.badge && (
                <p className="inline-flex items-center gap-2 rounded-full bg-on-dark/10 px-4 py-1.5 text-[.8rem] font-bold ring-1 ring-on-dark/20 backdrop-blur-sm motion-safe:animate-rise">
                  <SparkleIcon size={13} className="motion-safe:animate-twinkle" />
                  {texts.hero.badge}
                </p>
              )}
              <h1 className="display text-[clamp(3.2rem,min(8.2cqi,13svh),7.6rem)] leading-[.88] tracking-[.01em]">
                <span className="block">
                  {texts.hero.title.split(" ").map((w, i, all) => (
                    <span key={i} className="inline-block motion-safe:animate-rise" style={{ animationDelay: `${120 + i * 110}ms` }}>
                      {w}
                      {i < all.length - 1 && "\u00a0"}
                    </span>
                  ))}
                </span>
                {texts.hero.highlight && (
                  <span className="block text-accent">
                    {/* Los lectores de pantalla leen siempre la frase del panel; las que se alternan son decorativas. */}
                    <span className="sr-only">{texts.hero.highlight}</span>
                    <span aria-hidden="true">
                      <RotatingWords phrases={rotatingPhrases(texts.hero)} delay={420} center />
                    </span>
                  </span>
                )}
              </h1>
              <p className="max-w-[62ch] text-pretty text-on-dark-muted motion-safe:animate-rise [animation-delay:650ms]">{texts.hero.description}</p>
              {/* Lleva al cotizador, que queda justo debajo de la portada. */}
              <a
                href="#reserva"
                className="group flex w-full max-w-[520px] items-center gap-3.5 rounded-full bg-card py-1.5 pr-1.5 pl-5 text-left text-on-light no-underline shadow-card transition-transform duration-300 hover:-translate-y-0.5 motion-safe:animate-rise [animation-delay:780ms]"
              >
                <CalendarIcon size={20} className="flex-none" />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="text-[.68rem] font-extrabold tracking-[.1em] text-on-light-muted uppercase">{fromPrice ? "Noche para 2" : "Reserva en línea"}</span>
                  <span className="truncate text-[1.05rem] font-extrabold tabular-nums">{fromPrice ? `Desde ${cop(fromPrice)}` : "Elige tus fechas"}</span>
                </span>
                <span className="btn btn-cta ml-auto min-h-12 flex-none gap-2.5 px-5 whitespace-nowrap sm:px-6">
                  Reservar
                  <ArrowRightIcon className="motion-safe:animate-nudge" />
                </span>
              </a>
            </div>

            {/* Nunca menos del 24,5 % de su ancho: si no, el paisaje recorta las cumbres (ver hero-scene.tsx). */}
            <HeroScene photos={photos} className="z-1 min-h-[max(clamp(300px,min(27cqi,44svh),400px),24.5cqi)] flex-1" />
          </HeroParallax>

          <BookingWidget />

          {/* Recorrido de la página, como un descenso por la montaña: Portada → Reserva → Cabañas (cumbres nevadas) →
              Servicios (páramo) → La finca (bosque) → Ubicación (valle) → Antes de venir (monte) → Contacto →
              pie de página (el bosque al atardecer, con su fauna). Cada sección cierra con su tramo de paisaje. */}

          {/* Cabañas, bajo un cielo nocturno con la Vía Láctea: cada una ocupa una pantalla completa; la primera lleva
              además el encabezado de la sección. */}
          <Section id="cabanas" labelledBy="cabanas-title" ridge="peaks" light="right" night screens>
            {(cabins.length ? cabins : [null]).map((c, i) => (
              <div key={c?.id ?? "cabanas"} className="flex min-h-svh flex-col justify-center py-[clamp(16px,3.5svh,64px)]">
                {i === 0 && (
                  <SectionHeader
                    id="cabanas-title"
                    eyebrow="Dónde vas a dormir"
                    title="Cabañas"
                    accent="de colores"
                    subtitle="Compara y elige el que mejor se ajusta a tu plan: el precio se calcula al instante con tus fechas."
                    className="mb-[clamp(14px,3svh,48px)]"
                    fit
                  />
                )}
                {c && <CabinRow c={c} i={i} total={cabins.length} />}
              </div>
            ))}
          </Section>
        </BookingProvider>

        {/* Servicios: lista aireada dentro de un panel elevado, sin tarjetas. */}
        <Section id="servicios" labelledBy="servicios-title" ridge="paramo" next="deep">
          <div className="panel-raised rounded-[36px] px-[clamp(18px,4cqi,56px)] py-[clamp(36px,5cqi,68px)]">
            <SectionHeader id="servicios-title" eyebrow="Incluido en tu estadía" title="Servicios" accent="incluidos" subtitle="Lo que encuentras al llegar. Lo marcado como adicional se cotiza aparte." />
            {/* Servicios del panel (Contenido del sitio → Servicios). */}
            <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {services.map((s) => (
                <li key={s.id} className="reveal-on-scroll">
                  <ServiceCard s={s} />
                </li>
              ))}
            </ul>
          </div>
        </Section>

        {/* Experiencias: aparte, con el «Fondo profundo» del panel y cielo estrellado; mosaico en el que la primera foto
            ocupa dos columnas y dos filas. */}
        <Section id="experiencias" labelledBy="experiencias-title" tone="deep" starry ridge="forest" light="right">
          <SectionHeader
            id="experiencias-title"
            eyebrow="Lo que te espera"
            title="La finca"
            accent="para toda la familia"
            subtitle="Lo que vas a vivir alrededor de tu cabaña: el restaurante y su café, el desayuno con vista a la montaña, los jardines y el parque para los niños."
          />
          <ul className="grid auto-rows-[clamp(150px,19cqi,270px)] grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {EXPERIENCES.map((e, i) => (
              <li key={e.id} className={`reveal-on-scroll group relative overflow-hidden rounded-[28px] bg-surface ${i === 0 ? "col-span-2 row-span-2" : ""}`}>
                <div className="absolute inset-0 transition-transform duration-[1.4s] ease-out group-hover:scale-[1.06]">
                  <PhotoSlot id={`exp-${e.id}`} src={photos[`exp-${e.id}`]} sizes={i === 0 ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 50vw"} zoom />
                </div>
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black/75 via-black/20 to-transparent" />
                <p className="pointer-events-none absolute inset-x-4 bottom-4 z-2 flex items-end gap-3 text-card sm:inset-x-5 sm:bottom-5">
                  <span aria-hidden="true" className="display text-[1.5rem] leading-none text-highlight">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className={i === 0 ? "display text-[clamp(1.7rem,3.4cqi,3rem)] leading-[.95]" : "text-[.98rem] leading-tight font-bold"}>{e.label}</span>
                </p>
              </li>
            ))}
          </ul>
        </Section>

        {/* Ubicación: el mapa ocupa todo el panel y la tarjeta con la dirección flota encima (debajo, en el celular). */}
        <Section id="ubicacion" labelledBy="ubicacion-title" ridge="valley">
          <SectionHeader id="ubicacion-title" eyebrow="Así se llega" title="A 5 minutos" accent="de Murillo, Tolima" subtitle="Abre la ruta en Google Maps o Waze desde donde estés, o copia la dirección para compartirla." />
          <div className="reveal-on-scroll relative overflow-hidden rounded-[36px] bg-surface ring-1 ring-on-dark/12 lg:min-h-[clamp(440px,60svh,580px)]">
            <div className="relative h-[300px] lg:absolute lg:inset-0 lg:h-auto">
              <iframe
                title={`Mapa de ubicación de ${config.name}`}
                src={`https://maps.google.com/maps?q=${config.lat},${config.lng}&z=15&output=embed`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="absolute inset-0 size-full border-0"
              />
              <span className="pointer-events-none absolute right-4 bottom-4 rounded-full bg-bg/85 px-3 py-1.5 text-[.75rem] font-bold tracking-wide text-card tabular-nums backdrop-blur">
                {Math.abs(config.lat).toFixed(4)}° {config.lat >= 0 ? "N" : "S"} · {Math.abs(config.lng).toFixed(4)}° {config.lng >= 0 ? "E" : "O"}
              </span>
            </div>
            <div className="relative flex flex-col gap-5 p-6 lg:m-6 lg:max-w-[420px] lg:rounded-[28px] lg:bg-bg/92 lg:p-7 lg:shadow-card lg:ring-1 lg:ring-on-dark/15 lg:backdrop-blur-md">
              <p className="flex items-center gap-2.5 text-[.76rem] font-extrabold tracking-[.2em] text-accent uppercase">
                <span aria-hidden="true" className="relative grid size-2.5 place-items-center">
                  <span className="absolute inset-0 rounded-full bg-highlight motion-safe:animate-ping" />
                  <span className="size-2.5 rounded-full bg-highlight" />
                </span>
                Murillo, Tolima
              </p>
              <div>
                <h3 className="eyebrow text-on-dark-muted">Dirección</h3>
                <p className="mt-1.5 text-[1.15rem] leading-snug font-bold">{config.address}</p>
              </div>
              {texts.location.note && (
                <p className="flex items-start gap-3 rounded-2xl bg-on-dark/8 px-4 py-3.5 text-[.95rem] font-semibold">
                  <MountainIcon size={20} className="mt-0.5 flex-none text-highlight" />
                  {texts.location.note}
                </p>
              )}
              <div className="flex flex-wrap gap-2.5">
                <a href={dirHref()} target="_blank" rel="noopener" className="group btn btn-highlight min-h-[52px] gap-2.5 px-6">
                  <PinIcon size={18} />
                  Google Maps
                  <ArrowRightIcon className="transition-transform group-hover:translate-x-1" />
                </a>
                <a href={`https://waze.com/ul?ll=${config.lat},${config.lng}&navigate=yes`} target="_blank" rel="noopener" className="btn btn-outline-dark min-h-[52px] gap-2 px-5 font-bold transition-colors hover:bg-on-dark hover:text-on-light">
                  <WazeIcon />
                  Waze
                </a>
                <CopyButton text={config.address} label="Copiar dirección" className="btn min-h-[52px] gap-2 px-3 font-bold text-on-dark underline-offset-4 hover:underline" />
              </div>
            </div>
          </div>
        </Section>

        {/* Antes de venir: los horarios en un pase (como un tiquete, con su línea de corte) y las políticas a la vista. */}
        <Section id="antes-de-venir" labelledBy="pol-title" ridge="woods" light="right">
          <SectionHeader id="pol-title" eyebrow="Antes de venir" title="Horarios" accent="y políticas" subtitle="Lo que conviene saber para que tu llegada sea tranquila." />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,.82fr)_minmax(0,1.7fr)]">
            <div className="reveal-on-scroll relative flex flex-col rounded-[32px] bg-card text-on-light shadow-card">
              {[
                ["Check-in", site.checkIn, <LoginIcon key="i" size={20} />],
                ["Check-out", site.checkOut, <LogoutIcon key="o" size={20} />],
              ].map(([label, value, icon], i) => (
                <div key={label as string} className={`flex flex-1 flex-col gap-3 p-7 ${i ? "border-t-2 border-dashed border-on-light/25" : ""}`}>
                  <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-cta text-cta-text">
                    {icon}
                  </span>
                  <div>
                    <h3 className="eyebrow">{label}</h3>
                    <p className="display mt-1 text-[clamp(1.7rem,3cqi,2.3rem)] leading-none normal-case">{value}</p>
                  </div>
                </div>
              ))}
              {/* Muescas del tiquete, a la altura de la línea de corte. */}
              <span aria-hidden="true" className="absolute top-1/2 -left-3.5 size-7 -translate-y-[calc(50%+34px)] rounded-full bg-bg" />
              <span aria-hidden="true" className="absolute top-1/2 -right-3.5 size-7 -translate-y-[calc(50%+34px)] rounded-full bg-bg" />
              <a href={wa(site.whatsapp)} target="_blank" rel="noopener" className="btn btn-cta m-3 mt-0 min-h-14 gap-2.5 px-5">
                <WhatsAppIcon />
                ¿Otra duda? Escríbenos
              </a>
            </div>
            <dl className="reveal-on-scroll panel-raised grid content-start gap-x-10 gap-y-7 rounded-[32px] p-[clamp(22px,3.6cqi,48px)] sm:grid-cols-2">
              {site.policies.map((p) => (
                <div key={p.id} className="flex flex-col gap-1.5">
                  <dt className="flex items-center gap-2.5 text-[1.03rem] font-bold">
                    <SparkleIcon size={12} className="flex-none" />
                    {p.q}
                  </dt>
                  <dd className="pl-[22px] text-[.95rem] leading-relaxed text-on-dark-muted">{p.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Section>

        {/* Contacto: la foto en un arco y, al lado, WhatsApp como acción principal y los teléfonos. */}
        <Section id="contacto" labelledBy="contact-title" className="grid items-center gap-x-[clamp(28px,6cqi,92px)] gap-y-10 md:grid-cols-[minmax(0,.8fr)_minmax(0,1fr)]">
          <figure className="reveal-on-scroll group relative mx-auto w-full max-w-[430px]">
            <span aria-hidden="true" className="pointer-events-none absolute -inset-3 rounded-t-[999px] rounded-b-[44px] border-2 border-dotted border-on-dark/25" />
            <div className="relative aspect-[4/4.6] overflow-hidden rounded-t-[999px] rounded-b-[32px] bg-surface">
              <div className="absolute inset-0 transition-transform duration-[1.6s] ease-out group-hover:scale-[1.04]">
                <PhotoSlot id="contact" src={photos.contact} sizes="(min-width: 768px) 430px, 100vw" zoom />
              </div>
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/55 via-black/5 to-transparent" />
            </div>
            <figcaption className="pointer-events-none absolute inset-x-5 bottom-5 flex items-center gap-3 rounded-2xl bg-bg/70 px-4 py-3 ring-1 ring-card/15 backdrop-blur-md">
              <Logo size={40} />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="font-bold text-card">Te esperamos en la finca</span>
                <span className="text-[.8rem] font-semibold text-on-dark-muted">Vereda Pajonales · a 5 min de Murillo</span>
              </span>
            </figcaption>
          </figure>
          <div className="flex flex-col gap-7">
            <SectionHeader id="contact-title" align="left" className="" eyebrow="Atención familiar" title="Contacto" accent="directo" subtitle="Será un placer atenderte. Resolvemos contigo fechas, cabañas, mascotas, el restaurante o una celebración." />
            <a href={wa(site.whatsapp, "Hola, quiero información para reservar.")} target="_blank" rel="noopener" className="reveal-on-scroll group btn btn-highlight min-h-16 gap-3 self-start px-7 text-[1.05rem]">
              <WhatsAppIcon size={22} />
              Escríbenos por WhatsApp
              <ArrowRightIcon className="transition-transform group-hover:translate-x-1" />
            </a>
            <ul aria-label="Teléfonos" className="reveal-on-scroll flex flex-wrap gap-2.5">
              {site.phones.map((p) => (
                <li key={p}>
                  <a href={tel(p)} className="inline-flex min-h-12 items-center gap-2.5 rounded-full px-5 font-bold tabular-nums no-underline ring-1 ring-on-dark/25 transition-colors hover:bg-on-dark/10">
                    <PhoneIcon size={17} className="text-highlight" />
                    {p}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      </main>
      <PhotoLightbox photos={galleryOf(photos, cabins)} />

      <SiteFooter />

      <a
        href={wa(site.whatsapp)}
        target="_blank"
        rel="noopener"
        aria-label="Escribir por WhatsApp"
        className="fixed right-5 bottom-5 z-60 grid size-[60px] place-items-center rounded-full bg-highlight text-on-light shadow-card transition-transform hover:scale-106"
      >
        <WhatsAppFabIcon size={26} />
      </a>
    </div>
  );
}
