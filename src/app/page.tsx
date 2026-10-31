import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { BookingProvider, BookingWidget, CabinReserveButton } from "@/components/landing/booking-widget";
import { CenteredAnchors } from "@/components/landing/centered-anchors";
import { CopyButton } from "@/components/landing/copy-button";
import { PhotoLightbox } from "@/components/landing/photo-lightbox";
import { CoffeeCup, Fifi } from "@/components/brand/fifi";
import { Bean, CowHide, Flower, FlowerBorder, Lick, Pin, Tag, WoodBoard } from "@/components/brand/decor";
import { FifiHeader } from "@/components/landing/header";
import { SpeechBubble } from "@/components/brand/speech-bubble";
import { PhotoSlot } from "@/components/site/photo-slot";
import { ServiceCard } from "@/components/site/service-card";
import { SiteFooter } from "@/components/site/footer";
import { SiteTheme, siteViewport } from "@/components/site/site-theme";
import { ArrowRightIcon, LoginIcon, LogoutIcon, PhoneIcon, PinIcon, WhatsAppFabIcon, WhatsAppIcon } from "@/components/ui/icons";
import { config, type Cabin } from "@/lib/config";
import { getSiteCabins } from "@/lib/server/cabins";
import { getSite } from "@/lib/server/site";
import type { SiteConfig } from "@/lib/site";
import { EXPERIENCES, HIGHLIGHTS, RATING } from "@/lib/content";
import { cop, dirHref, tel, wa } from "@/lib/format";

export const metadata: Metadata = {
  title: { absolute: `${config.name} · Cabañas, restaurante y café en Murillo, Tolima` },
  description:
    "Cabañas de colores con baño privado, balcón con vista a la montaña y desayuno americano incluido, a 5 minutos de Murillo, Tolima. Restaurante y café de comida casera, parque infantil y pet friendly. Reserva en línea.",
  openGraph: {
    title: `${config.name} · Murillo, Tolima`,
    description: "Duerme rico y come mejor donde Fifí: cabañas, restaurante y café a 5 minutos de Murillo.",
  },
  twitter: { card: "summary_large_image" },
};

// Página estática que se regenera cada hora o al guardar tarifas en el panel.
export const revalidate = 3600;

export function generateViewport() {
  return siteViewport();
}

// Todas las fotos del sitio para la galería (sin repetir ni vacías).
function galleryOf(photos: Record<string, string>, cabins: Cabin[]): string[] {
  const all = [
    photos["hero-main"],
    ...cabins.flatMap((c) => c.photos),
    photos["exp-restaurante"],
    photos["restaurante-2"],
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
    address: {
      "@type": "PostalAddress",
      streetAddress: config.street,
      addressLocality: config.city,
      addressRegion: config.region,
      addressCountry: config.country,
    },
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
      <path d="M7 17.2c-1.8-.2-3.4-.9-4.4-2.2 1.4-.7 2-1.9 2-3.5a7.5 7.5 0 0 1 15 0c0 3.4-3 5.5-6 6h-3.4" />
      <circle cx="8.6" cy="19" r="1.6" />
      <circle cx="15.6" cy="19" r="1.6" />
      <path d="M9.5 10h.01M14.5 10h.01M10 13c1 .8 3 .8 4 0" />
    </svg>
  );
}

// Encabezado de sección: el arete con la etiqueta, el título en letras redondas con su parte subrayada por la lengua de
// Fifí y una entrada. `light`: sobre el café del restaurante.
function Heading({
  id,
  eyebrow,
  title,
  lick,
  intro,
  center = false,
  light = false,
  className = "",
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  lick?: string;
  intro?: ReactNode;
  center?: boolean;
  light?: boolean;
  className?: string;
}) {
  return (
    <header className={`flex max-w-[780px] flex-col gap-4 ${center ? "mx-auto items-center text-center" : "items-start"} ${className}`}>
      <Tag>{eyebrow}</Tag>
      <h2 id={id} className="display text-[clamp(2.4rem,5.4cqi,4.4rem)] leading-[1] text-balance">
        {title} {lick && <Lick>{lick}</Lick>}
      </h2>
      {intro && <p className={`max-w-[60ch] text-[1.06rem] font-semibold text-pretty ${light ? "text-card/85" : "text-on-dark-muted"}`}>{intro}</p>}
    </header>
  );
}

// Una cabaña: la foto con su etiqueta y el precio colgado como arete; debajo, lo que incluye y el botón de reservar.
function CabinCard({ c }: { c: Cabin }) {
  return (
    <article className="sticker flex h-full flex-col overflow-hidden rounded-[30px] bg-card text-on-light">
      <div className="relative aspect-[4/3] border-b-[3px] border-on-dark bg-card-muted">
        <PhotoSlot src={c.photos[0]} alt={c.full} placeholder={`Foto real: ${c.full.toLowerCase()}`} sizes="(min-width: 768px) 640px, 100vw" zoom />
        {c.badge && (
          <span className="pointer-events-none absolute top-3.5 left-3.5 z-2 text-[.85rem]">
            <Tag tone="card">{c.badge}</Tag>
          </span>
        )}
        <span className="pointer-events-none absolute right-4 -bottom-[22px] z-2 -rotate-3 text-[1.05rem]">
          <Tag>
            {cop(c.couple)}
            <span className="text-[.8rem] font-bold">/ noche para 2</span>
          </Tag>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-4 px-[clamp(18px,2.4vw,30px)] pt-9 pb-[clamp(18px,2.4vw,28px)]">
        <h3 className="display text-[clamp(1.8rem,2.8vw,2.3rem)] leading-none">{c.full}</h3>
        {c.description && <p className="text-pretty text-on-light-muted">{c.description}</p>}
        {c.features.length > 0 && (
          <ul aria-label={`Lo que incluye la ${c.full}`} className="flex flex-wrap gap-2">
            {c.features.map((f) => (
              <li key={f} className="inline-flex items-center gap-1.5 rounded-full border-2 border-on-light/15 bg-bg px-3 py-1 text-[.86rem] font-bold">
                <Bean size={14} />
                {f}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t-[2.5px] border-dashed border-on-light/20 pt-4">
          <p className="text-[.94rem] font-bold">
            Hasta {c.max} personas
            {c.max > 2 && <span className="block text-[.84rem] font-semibold text-on-light-muted">{`${cop(c.extra)} por persona adicional`}</span>}
          </p>
          <CabinReserveButton cabin={c.id} />
        </div>
      </div>
    </article>
  );
}

// Fotos de la finca: pegadas con su pie, con una leve inclinación y una flor en la esquina.
const TILTS = ["-rotate-2", "rotate-[1.5deg]", "-rotate-1", "rotate-2"];
const FLOWER_TONES = ["#ff6fae", "#ffc83d", "#3d6fe0", "#ff8a2b"];

export default async function HomePage() {
  const [cabins, { c: site, photos, texts, services: allServices }] = await Promise.all([getSiteCabins(), getSite()]);
  const services = allServices.filter((s) => s.visible);
  const fromPrice = cabins.length ? Math.min(...cabins.map((c) => c.couple)) : 0;
  return (
    <div id="top" className="@container relative overflow-x-clip">
      <SiteTheme />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(cabins, site)).replace(/</g, "\\u003c") }} />
      <FifiHeader />
      <CenteredAnchors />

      <main>
        <BookingProvider cabins={cabins}>
          {/* Portada: la foto de la entrada con la guirnalda de flores al pie, como el letrero del restaurante. A la
              izquierda el título en letras de cartel (lo resaltado, subrayado con la lengua) y las acciones; a la
              derecha el letrero de la foto y la insignia de la calificación. En el celular el texto va primero. */}
          <section aria-labelledby="hero-title" className="gutter-1360 pt-[clamp(14px,2.4vw,30px)]">
            <div className="sticker relative isolate overflow-hidden rounded-[clamp(28px,4vw,48px)] bg-accent">
              {/* Foto real de la entrada (letrero, parque y portón) de fondo. Un velo azul cielo cubre la mitad izquierda
                  hasta el portón de la foto (deja leer el título) y deja ver el letrero de la derecha. */}
              <Image
                src="/fotos/entrada-letrero.jpg"
                alt=""
                fill
                priority
                quality={90}
                sizes="(min-width: 1400px) 1360px, 100vw"
                className="-z-3 object-cover object-[70%_55%]"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 -z-2 bg-[linear-gradient(90deg,color-mix(in_srgb,color-mix(in_srgb,var(--color-accent)_55%,white)_94%,transparent)_0%,color-mix(in_srgb,color-mix(in_srgb,var(--color-accent)_55%,white)_86%,transparent)_47%,color-mix(in_srgb,var(--color-accent)_35%,transparent)_51%,transparent_56%)] max-lg:bg-[linear-gradient(180deg,color-mix(in_srgb,color-mix(in_srgb,var(--color-accent)_55%,white)_92%,transparent)_0%,color-mix(in_srgb,color-mix(in_srgb,var(--color-accent)_55%,white)_86%,transparent)_68%,transparent_86%)]"
              />
              <div className="grid items-center gap-x-6 gap-y-2 px-[clamp(20px,4.5vw,72px)] pt-[clamp(26px,4.5vw,64px)] pb-[clamp(84px,10vw,140px)] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,.92fr)] lg:pb-[min(calc(10cqi+28px),164px)]">
                <div className="flex flex-col items-start gap-[clamp(14px,2vw,22px)]">
                  {texts.hero.badge && (
                    <Tag className="text-[.92rem]">
                      <PinIcon size={16} />
                      {texts.hero.badge}
                    </Tag>
                  )}
                  <h1 id="hero-title" className="display text-[clamp(3rem,7.6cqi,6.6rem)] leading-[.98]">
                    <span className="poster-text block text-card">{texts.hero.title}</span>
                    {texts.hero.highlight && <Lick className="poster-text text-highlight">{texts.hero.highlight}</Lick>}
                  </h1>
                  <p className="max-w-[46ch] text-[clamp(1rem,1.3vw,1.14rem)] leading-relaxed font-bold text-pretty">{texts.hero.description}</p>
                  <div className="flex w-full flex-wrap gap-3 max-sm:flex-col">
                    <a href="#reserva" className="btn btn-cta min-h-14 px-7 text-[1.05rem]">
                      Reservar cabaña
                      <ArrowRightIcon />
                    </a>
                    <a href="#restaurante" className="btn btn-card min-h-14 px-6 text-[1.02rem]">
                      Conoce el restaurante
                    </a>
                  </div>
                  {fromPrice > 0 && <p className="text-[.95rem] font-extrabold">{`Desde ${cop(fromPrice)} la noche para 2, con desayuno.`}</p>}
                </div>

                {/* Lado derecho libre para que se vea el letrero de la foto; solo la insignia de la calificación. En el
                    celular deja una ventana de foto bajo el texto. */}
                <div className="relative min-h-[clamp(150px,42vw,240px)] lg:min-h-0 lg:self-stretch">
                  <p className="sticker-sm absolute top-0 right-0 grid size-[clamp(86px,9vw,112px)] rotate-[9deg] place-items-center rounded-full bg-highlight text-center text-on-light">
                    <span className="flex flex-col items-center leading-none">
                      <span className="font-display text-[clamp(1.7rem,2.6vw,2.3rem)]">{RATING.score}</span>
                      <span className="mt-0.5 text-[.58rem] font-extrabold uppercase">en Booking</span>
                    </span>
                  </p>
                </div>
              </div>
              {/* Cantero de flores: en el celular de lado a lado; en escritorio solo abajo a la izquierda, hasta donde
                  termina el velo azul (56 %). */}
              <FlowerBorder className="absolute inset-x-0 bottom-0 h-[clamp(72px,9vw,120px)] w-full lg:hidden" />
              <FlowerBorder side="left" className="absolute bottom-0 left-0 hidden aspect-[600/130] w-[56%] lg:block" />
            </div>
          </section>

          <BookingWidget />

          {/* Lo que distingue a la casa, en aretes colgados. */}
          <section aria-label="Lo que incluye tu estadía" className="gutter-1360 py-[clamp(30px,4.5vw,56px)]">
            <ul className="flex flex-wrap justify-center gap-x-5 gap-y-4">
              {HIGHLIGHTS.map((h, i) => (
                <li key={h} className={["-rotate-2", "rotate-[1.5deg]", "-rotate-1", "rotate-2", "-rotate-[1.5deg]"][i % 5]}>
                  <Tag tone={i % 2 ? "card" : "tag"} className="text-[1rem]">
                    <Bean size={18} />
                    {h}
                  </Tag>
                </li>
              ))}
            </ul>
          </section>

          {/* Cabañas: tarjetas de calcomanía en dos columnas (una en el celular). */}
          <section id="cabanas" aria-labelledby="cabanas-title" className="scroll-mt-20 bg-surface py-[clamp(56px,8vw,112px)]">
            <div className="gutter-1360">
              <div className="mb-[clamp(30px,4.5vw,56px)] flex flex-wrap items-end justify-between gap-6">
                <Heading
                  id="cabanas-title"
                  eyebrow="Dónde vas a dormir"
                  title="Cabañas"
                  lick="de colores"
                  intro="Cada una con baño privado y agua caliente, TV, wifi y el desayuno americano incluido. El precio se calcula al instante con tus fechas."
                />
                <Flower color="#ff6fae" size={64} className="motion-safe:animate-sway max-md:hidden" />
              </div>
              {cabins.length ? (
                <ul className="grid gap-[clamp(26px,3.4vw,44px)] md:grid-cols-2">
                  {cabins.map((c) => (
                    <li key={c.id} className="reveal-on-scroll">
                      <CabinCard c={c} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-bold">Muy pronto publicaremos las cabañas. Escríbenos por WhatsApp para reservar.</p>
              )}
            </div>
          </section>
        </BookingProvider>

        {/* Restaurante y café: el café oscuro de la taza de Fifí. A la izquierda la tabla de madera del letrero y lo que se
            come; a la derecha dos fotos pegadas una sobre otra y la taza. */}
        <section
          id="restaurante"
          aria-labelledby="restaurante-title"
          className="relative isolate scroll-mt-20 overflow-hidden bg-night py-[clamp(64px,9vw,128px)] text-card"
        >
          <div className="grid items-center gap-x-[clamp(32px,5vw,80px)] gap-y-14 gutter-1360 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <div className="flex flex-col items-start gap-6">
              <h2 id="restaurante-title" className="display text-[clamp(1.9rem,3.6cqi,2.8rem)] leading-none text-[#3b2416]">
                <WoodBoard>Restaurante · Café</WoodBoard>
              </h2>
              <p className="display text-[clamp(2.2rem,4.6cqi,3.8rem)] leading-[1.02] text-balance">
                Comida casera y café <Lick className="text-highlight">de la casa</Lick>
              </p>
              <p className="max-w-[54ch] text-[1.06rem] text-card/85">
                El restaurante de Fifí queda al lado de las cabañas y está abierto también para quienes pasan por la vía a Murillo. Con vista a la montaña,
                música de vez en cuando y la atención de la familia.
              </p>
              <ul className="grid gap-3">
                {[
                  "Desayuno americano incluido para los huéspedes",
                  "Desayunos, almuerzos y cenas de comida casera",
                  "Café caliente para las tardes frías de Murillo",
                  "Celebraciones y eventos, con reserva",
                ].map((x) => (
                  <li key={x} className="flex items-start gap-3 text-[1.02rem] font-bold">
                    <Bean size={22} light className="mt-0.5" />
                    {x}
                  </li>
                ))}
              </ul>
              <a
                href={wa(site.whatsapp, "Hola, quiero información del restaurante.")}
                target="_blank"
                rel="noopener"
                className="btn btn-highlight min-h-14 gap-2.5 px-6"
              >
                <WhatsAppIcon size={20} />
                Pregunta por el menú del día
              </a>
            </div>
            <div className="relative pb-[clamp(40px,7vw,90px)]">
              <figure className="relative aspect-[4/3] -rotate-2 overflow-hidden rounded-[26px] border-[3px] border-card bg-card-muted text-on-light shadow-[6px_6px_0_var(--color-highlight)]">
                <PhotoSlot id="exp-restaurante" src={photos["exp-restaurante"]} sizes="(min-width: 1024px) 600px, 100vw" zoom />
              </figure>
              <figure className="absolute right-[2%] bottom-0 aspect-[4/3] w-[52%] rotate-3 overflow-hidden rounded-[20px] border-[3px] border-card bg-card-muted text-on-light shadow-[5px_5px_0_var(--color-highlight)]">
                <PhotoSlot id="restaurante-2" src={photos["restaurante-2"]} sizes="(min-width: 1024px) 320px, 54vw" zoom />
              </figure>
              <div className="pointer-events-none absolute bottom-[-4%] left-[-3%] w-[clamp(90px,16%,130px)] -rotate-6">
                <CoffeeCup />
              </div>
            </div>
          </div>
        </section>

        {/* La finca: fotos pegadas con su pie, en fila (deslizables en el celular). */}
        <section id="finca" aria-labelledby="finca-title" className="scroll-mt-20 py-[clamp(56px,8vw,112px)]">
          <div className="gutter-1360">
            <Heading
              id="finca-title"
              eyebrow="La finca"
              title="Aquí se descansa"
              lick="en familia"
              intro="Desayunos con vista a la montaña, un parque para que los niños jueguen, jardines llenos de flores y el ambiente de una finca de Murillo."
              className="mb-[clamp(30px,4.5vw,56px)]"
            />
          </div>
          <ul className="no-scrollbar flex snap-x snap-mandatory gap-[clamp(16px,2.4vw,30px)] overflow-x-auto gutter-1360 pt-3 pb-6 md:grid md:grid-cols-2 md:items-start md:overflow-visible lg:grid-cols-4">
            {EXPERIENCES.map((e, i) => (
              <li key={e.id} className={`relative w-[74%] flex-none snap-center sm:w-[46%] md:w-auto ${TILTS[i % TILTS.length]}`}>
                <figure className="sticker flex flex-col gap-3 rounded-[20px] bg-card p-2.5 pb-4 text-on-light">
                  <div className={`relative overflow-hidden rounded-[13px] border-2 border-on-dark bg-card-muted ${i % 2 ? "aspect-[4/3]" : "aspect-[4/5]"}`}>
                    <PhotoSlot id={`exp-${e.id}`} src={photos[`exp-${e.id}`]} sizes="(min-width: 768px) 25vw, 74vw" zoom />
                  </div>
                  <figcaption className="flex items-start gap-2 px-1.5 font-display text-[1.2rem] leading-tight">
                    <Bean size={18} className="mt-0.5" />
                    {e.label}
                  </figcaption>
                </figure>
                <Flower color={FLOWER_TONES[i % FLOWER_TONES.length]} size={40} className="absolute -top-4 -right-3" />
              </li>
            ))}
          </ul>
        </section>

        {/* Servicios incluidos (los del panel), como calcomanías sobre el cielo claro. */}
        <section id="servicios" aria-labelledby="servicios-title" className="scroll-mt-20 bg-deep py-[clamp(56px,8vw,112px)]">
          <div className="gutter-1360">
            <Heading
              id="servicios-title"
              eyebrow="Incluido en tu estadía"
              title="Todo lo que"
              lick="te espera"
              intro="Lo que encuentras al llegar. Lo marcado aparte se cotiza por WhatsApp."
              center
              className="mb-[clamp(30px,4.5vw,56px)]"
            />
            <ul className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {services.map((s) => (
                <li key={s.id} className="reveal-on-scroll">
                  <ServiceCard s={s} />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Cómo llegar: «¡Aquí es!» como en el letrero, la dirección y la foto de la entrada; al lado, el mapa. */}
        <section id="ubicacion" aria-labelledby="ubicacion-title" className="scroll-mt-20 py-[clamp(56px,8vw,112px)]">
          <div className="grid items-start gap-x-[clamp(28px,5vw,72px)] gap-y-10 gutter-1360 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
            <div className="flex flex-col gap-6">
              <Heading
                id="ubicacion-title"
                eyebrow="Cómo llegar"
                title={
                  <span className="inline-flex items-end gap-3">
                    <Pin size={44} />
                    ¡Aquí
                  </span>
                }
                lick="es!"
                intro={texts.location.note || undefined}
              />
              <div className="sticker-sm flex flex-col gap-4 rounded-[24px] bg-card p-5 text-on-light">
                <div>
                  <h3 className="eyebrow text-on-light-muted">Dirección</h3>
                  <p className="mt-1 text-[1.12rem] leading-snug font-extrabold">{config.address}</p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <a href={dirHref()} target="_blank" rel="noopener" className="btn btn-cta min-h-12 gap-2 px-5">
                    <PinIcon size={18} />
                    Google Maps
                  </a>
                  <a
                    href={`https://waze.com/ul?ll=${config.lat},${config.lng}&navigate=yes`}
                    target="_blank"
                    rel="noopener"
                    className="btn btn-card min-h-12 gap-2 px-5"
                  >
                    <WazeIcon />
                    Waze
                  </a>
                  <CopyButton text={config.address} label="Copiar dirección" className="btn btn-card min-h-12 gap-2 px-4" />
                </div>
              </div>
              {photos.contact && (
                <figure className="sticker-sm relative w-[min(100%,340px)] rotate-2 self-start overflow-hidden rounded-[20px] bg-card text-on-light">
                  <div className="relative aspect-[4/3]">
                    <PhotoSlot id="contact" src={photos.contact} sizes="340px" zoom />
                  </div>
                  <figcaption className="border-t-[2.5px] border-on-dark px-4 py-2.5 font-display text-[1.1rem]">Busca este letrero en la entrada</figcaption>
                </figure>
              )}
            </div>
            <div className="sticker relative overflow-hidden rounded-[32px] bg-card-muted">
              <div className="relative aspect-[4/3.4] max-lg:aspect-[4/3.6]">
                <iframe
                  title={`Mapa de ubicación de ${config.name}`}
                  src={`https://maps.google.com/maps?q=${config.lat},${config.lng}&z=15&output=embed`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="absolute inset-0 size-full border-0"
                />
              </div>
              <p className="flex flex-wrap items-center justify-between gap-2 border-t-[3px] border-on-dark bg-highlight px-5 py-3 text-[.95rem] font-extrabold text-on-light">
                <span>Vereda Pajonales · Murillo, Tolima</span>
                <span className="tabular-nums">
                  {Math.abs(config.lat).toFixed(4)}° {config.lat >= 0 ? "N" : "S"} · {Math.abs(config.lng).toFixed(4)}° {config.lng >= 0 ? "E" : "O"}
                </span>
              </p>
            </div>
          </div>
        </section>

        {/* Antes de venir: los horarios en dos aretes grandes y las reglas de la casa en un acordeón. */}
        <section id="antes-de-venir" aria-labelledby="pol-title" className="scroll-mt-20 bg-surface py-[clamp(56px,8vw,112px)]">
          <div className="gutter-1360">
            <Heading id="pol-title" eyebrow="Antes de venir" title="Horarios y" lick="reglas de la casa" className="mb-[clamp(30px,4.5vw,56px)]" />
            <div className="grid items-start gap-[clamp(20px,3vw,40px)] lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                {[
                  ["Check-in", site.checkIn, <LoginIcon key="i" size={22} />, "bg-highlight"],
                  ["Check-out", site.checkOut, <LogoutIcon key="o" size={22} />, "bg-card"],
                ].map(([label, value, icon, bg], i) => (
                  <div
                    key={label as string}
                    className={`sticker flex items-center gap-4 rounded-[24px] p-5 text-on-light ${bg} ${i ? "rotate-1" : "-rotate-1"}`}
                  >
                    <span aria-hidden="true" className="grid size-12 flex-none place-items-center rounded-full border-[2.5px] border-on-dark bg-card">
                      {icon}
                    </span>
                    <div>
                      <h3 className="eyebrow">{label}</h3>
                      <p className="display mt-0.5 text-[clamp(1.6rem,2.6vw,2.1rem)] leading-none">{value}</p>
                    </div>
                  </div>
                ))}
                <a href={wa(site.whatsapp)} target="_blank" rel="noopener" className="btn btn-card min-h-14 gap-2.5 px-5 sm:col-span-2 lg:col-span-1">
                  <WhatsAppIcon />
                  ¿Otra duda? Escríbenos
                </a>
              </div>
              <ul className="flex flex-col gap-3">
                {site.policies.map((p) => (
                  <li key={p.id}>
                    <details className="sticker-sm group rounded-[20px] bg-card text-on-light">
                      <summary className="flex min-h-14 list-none items-center justify-between gap-4 px-5 py-3 font-display text-[1.18rem] leading-tight [&::-webkit-details-marker]:hidden">
                        {p.q}
                        <span
                          aria-hidden="true"
                          className="grid size-9 flex-none place-items-center rounded-full border-[2.5px] border-on-dark bg-highlight text-[1.3rem] leading-none transition-transform duration-200 group-open:rotate-45"
                        >
                          +
                        </span>
                      </summary>
                      <p className="px-5 pb-5 leading-relaxed text-on-light-muted">{p.a}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Cierre: el amarillo del arete con manchas de Holstein; Fifí asoma con su globo y, al lado, los contactos. */}
        <section
          id="contacto"
          aria-labelledby="contact-title"
          className="relative isolate scroll-mt-20 overflow-hidden bg-highlight py-[clamp(56px,8vw,104px)] text-on-light"
        >
          <CowHide id="cta-hide" className="-z-1 text-on-dark opacity-[.07]" />
          <div className="grid items-center gap-x-[clamp(28px,5vw,72px)] gap-y-10 gutter-1360 md:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
            <div className="relative mx-auto w-full max-w-[420px] pt-16">
              <SpeechBubble phrases={["¿Te antojaste?", "¡Te espero!"]} className="absolute top-0 left-[4%] z-1 max-w-[70%]" />
              <div className="motion-safe:animate-fifi-bob">
                <Fifi />
              </div>
            </div>
            <div className="flex flex-col items-start gap-6">
              <Heading
                id="contact-title"
                eyebrow="Atención familiar"
                title="Contacto"
                lick="directo"
                intro="Resolvemos contigo fechas, cabañas, mascotas, el restaurante o una celebración. Escríbenos y te respondemos en un ratico."
              />
              <a
                href={wa(site.whatsapp, "Hola, quiero información para reservar.")}
                target="_blank"
                rel="noopener"
                className="btn btn-cta min-h-16 gap-3 px-7 text-[1.08rem]"
              >
                <WhatsAppIcon size={22} />
                Escríbenos por WhatsApp
                <ArrowRightIcon />
              </a>
              <ul aria-label="Teléfonos" className="flex flex-wrap gap-2.5">
                {site.phones.map((p) => (
                  <li key={p}>
                    <a href={tel(p)} className="btn btn-card min-h-12 gap-2.5 px-5 tabular-nums">
                      <PhoneIcon size={17} />
                      {p}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
      <PhotoLightbox photos={galleryOf(photos, cabins)} />

      <SiteFooter />

      <a
        href={wa(site.whatsapp)}
        target="_blank"
        rel="noopener"
        aria-label="Escribir por WhatsApp"
        className="sticker-sm fixed right-4 bottom-4 z-60 grid size-[60px] place-items-center rounded-full bg-[#25d366] text-white transition-transform hover:-translate-y-0.5"
      >
        <WhatsAppFabIcon size={28} />
      </a>
    </div>
  );
}
