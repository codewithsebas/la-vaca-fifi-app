import { personRatesText } from "@/lib/booking";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BookingProvider, BookingWidget, CabinReserveButton } from "@/components/landing/booking-widget";
import { CenteredAnchors } from "@/components/landing/centered-anchors";
import { CopyButton } from "@/components/landing/copy-button";
import { PhotoLightbox } from "@/components/landing/photo-lightbox";
import { FifiHeader } from "@/components/landing/header";
import { RotatingWords } from "@/components/landing/rotating-words";
import { StickyAside } from "@/components/landing/sticky-aside";
import { Logo } from "@/components/brand/logo";
import { PhotoSlot } from "@/components/site/photo-slot";
import { SiteFooter } from "@/components/site/footer";
import { SiteTheme, siteViewport } from "@/components/site/site-theme";
import { CheckIcon, ChevronDownIcon, GridIcon, LoginIcon, LogoutIcon, PhoneIcon, PinIcon, WhatsAppFabIcon, WhatsAppIcon } from "@/components/ui/icons";
import { serviceIconPath } from "@/lib/service-icons";
import { config, type Cabin } from "@/lib/config";
import { getSiteCabins } from "@/lib/server/cabins";
import { getSite } from "@/lib/server/site";
import { lines, type SiteConfig, type SiteTexts } from "@/lib/site";
import { EXPERIENCES } from "@/lib/content";
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

// Todas las fotos del sitio para la galería (sin repetir ni vacías): primero las del mosaico de la portada.
function galleryOf(photos: Record<string, string>, cabins: Cabin[]): string[] {
  const all = [
    ...[1, 2, 3, 4, 5].map((n) => photos[`portada-${n}`]),
    ...cabins.flatMap((c) => c.photos),
    photos["exp-restaurante"],
    photos["restaurante-2"],
    ...EXPERIENCES.map((e) => photos[`exp-${e.id}`]),
    photos.contact,
  ];
  return [...new Set(all.filter(Boolean))];
}

// Las cinco fotos del mosaico de arriba (huecos portada-1…5 del panel) con su etiqueta (Contenido del sitio → Portada).
// Sin foto subida, la grande usa la del diseño y cada pequeña otra foto del sitio (lib/site.ts MOSAIC_FALLBACK). Si aun así falta alguna, se completa con las demás de la galería (sin etiqueta).
type Tile = { src: string; label?: string };
function mosaicOf(photos: Record<string, string>, cabins: Cabin[], gallery: string[], labels: string[]): Tile[] {
  const pick: Tile[] = [
    { src: photos["portada-1"] },
    { src: photos["portada-2"] ?? cabins[0]?.photos[0], label: labels[0] },
    { src: photos["portada-3"] ?? photos["exp-restaurante"], label: labels[1] },
    { src: photos["portada-4"] ?? photos["exp-desayuno"], label: labels[2] },
    { src: photos["portada-5"] ?? photos["exp-jardines"], label: labels[3] },
  ].filter((t) => t.src);
  const seen = new Set(pick.map((t) => t.src));
  return [...pick, ...gallery.filter((g) => !seen.has(g)).map((src) => ({ src }))].slice(0, 5);
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

// Ícono de servicio (lib/service-icons.ts) a trazo.
function ServiceGlyph({ icon, size = 24 }: { icon: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={serviceIconPath(icon)} />
    </svg>
  );
}

// Ícono de cada cosa de «Lo que incluye tu estadía» (se escribe en el panel): por la primera palabra clave que aparezca.
const HIGHLIGHT_ICONS: [RegExp, string][] = [
  [/desayun|comida|almuerz|cena/i, "desayuno"],
  [/mascota|perr|gat|pet/i, "mascota"],
  [/parqueadero|parqueo|carro|estacionamiento/i, "parqueadero"],
  [/wifi|internet/i, "wifi"],
  [/parque|niñ|juego/i, "parque"],
  [/fogata|fuego/i, "fogata"],
  [/vista|montaña|balc/i, "montana"],
  [/baño|ducha|agua caliente/i, "ducha"],
  [/restaurante|café/i, "restaurante"],
  [/jard|flor/i, "flores"],
  [/tv|televis/i, "tv"],
];
const highlightIcon = (text: string) => HIGHLIGHT_ICONS.find(([re]) => re.test(text))?.[1] ?? "check";

// Calificación tal como se escribe en el panel.
const ratingOf = (t: SiteTexts) => t.rating;

// Bloque de la columna de contenido: separado del siguiente por una línea fina, como en una ficha de alojamiento.
function Block({ id, labelledBy, children, last = false }: { id?: string; labelledBy?: string; children: ReactNode; last?: boolean }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`scroll-mt-20 py-10 ${last ? "" : "border-b border-(--line)"}`}>
      {children}
    </section>
  );
}

function H2({ id, children, className = "" }: { id: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={`h-pro text-[clamp(1.35rem,2vw,1.6rem)] leading-tight ${className}`}>
      <span aria-hidden="true" className="railing mb-3 block h-1.5 w-14 rounded-full" />
      {children}
    </h2>
  );
}

const muted = "text-on-light-muted";

// Los colores de las cabañas (globals.css, .site-ui), en orden; se reparten entre íconos, etiquetas y viñetas.
const TONES = ["var(--c-red)", "var(--c-green)", "var(--c-yellow-ink)", "var(--c-blue)", "var(--c-orange)"];
const tone = (i: number) => TONES[i % TONES.length];
// Fondo suave del mismo color, para los círculos de los íconos.
const tint = (i: number) => `color-mix(in srgb, ${tone(i)} 13%, var(--color-card))`;

// Una cabaña, como las tarjetas de los sitios de alojamiento: la foto cuadrada con su etiqueta, el nombre, el cupo y lo
// que incluye, y el precio por noche.
function CabinCard({ c, i }: { c: Cabin; i: number }) {
  return (
    <article className="flex h-full flex-col gap-3 text-on-light">
      <div className="relative aspect-[20/19] overflow-hidden rounded-xl bg-card-muted">
        <PhotoSlot
          src={c.photos[0]}
          alt={c.full}
          placeholder={`Foto real: ${c.full.toLowerCase()}`}
          sizes="(min-width: 1024px) 340px, (min-width: 640px) 50vw, 100vw"
          zoom
        />
        {c.badge && (
          <span
            className="pointer-events-none absolute top-3 left-3 z-2 rounded-full px-3 py-1 text-[.8rem] font-extrabold text-white shadow-[0_2px_8px_rgb(0_0_0/0.25)]"
            style={{ background: tone(i) }}
          >
            {c.badge}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[1.02rem] leading-snug font-extrabold">{c.full}</h3>
          <span className="flex-none text-[.9rem] font-semibold">{`Hasta ${c.max}`}</span>
        </div>
        {c.description && <p className={`text-[.92rem] leading-snug ${muted}`}>{c.description}</p>}
        {c.features.length > 0 && (
          <p className={`text-[.86rem] ${muted}`}>
            <span className="sr-only">{`Lo que incluye la ${c.full}: `}</span>
            {c.features.join(" · ")}
          </p>
        )}
        <p className="mt-1.5">
          <strong className="font-extrabold tabular-nums">{cop(c.couple)}</strong> <span>{`noche para ${c.fromGuests ?? 2}`}</span>
        </p>
        {(c.tiers || c.max > 2) && <p className={`text-[.82rem] ${muted}`}>{c.tiers ? personRatesText(c.tiers) : `${cop(c.extra)} por persona adicional`}</p>}
        <div className="mt-auto pt-2">
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
  const fromGuests = cabins.find((c) => c.couple === fromPrice)?.fromGuests ?? 2;
  const maxGuests = cabins.length ? Math.max(...cabins.map((c) => c.max)) : 0;
  const gallery = galleryOf(photos, cabins);
  const rating = ratingOf(texts);
  const mosaic = mosaicOf(photos, cabins, gallery, lines(texts.mosaic.labels));
  const highlights = lines(texts.stay.highlights);
  const half = Math.ceil(site.policies.length / 2);

  return (
    <div id="top" className="site-ui @container relative overflow-x-clip text-on-light max-lg:pb-[76px]">
      <SiteTheme />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(cabins, site)).replace(/</g, "\\u003c") }} />
      <FifiHeader />
      <CenteredAnchors />

      <main className="gutter-1280">
        {/* Portada: el título de la ficha y el mosaico de fotos, que juntos ocupan justo la pantalla bajo el encabezado
            (svh: sin saltos cuando el navegador del celular muestra u oculta su barra). Una foto grande y cuatro pequeñas;
            en el celular, solo la grande. Cada foto abre la galería. */}
        <section
          aria-labelledby="hero-title"
          className="flex h-[calc(100svh-var(--header-offset,80px))] min-h-[520px] flex-col gap-[clamp(14px,2vw,22px)] pt-[clamp(18px,2.6vw,28px)] pb-[clamp(16px,2.4vw,28px)] max-lg:h-[calc(100svh-var(--header-offset,72px)-76px)]"
        >
          {/* Título: a la izquierda el nombre, la calificación y el lugar; a la derecha (escritorio) el precio y las
              acciones. */}
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div className="flex min-w-0 flex-col gap-2">
              <h1 id="hero-title" className="h-pro text-[clamp(1.75rem,3.2vw,2.6rem)] leading-[1.1] text-balance">
                {texts.hero.title}{" "}
                <RotatingWords words={[texts.hero.highlight, ...lines(texts.hero.words)].filter(Boolean)} className="text-[#1f6fc4] max-sm:block" />
              </h1>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[.94rem]">
                <span className="inline-flex items-center gap-1 font-bold">
                  <span aria-hidden="true" className="text-[#e0a800]">
                    ★
                  </span>
                  {rating.score}
                </span>
                <span aria-hidden="true" className="text-on-light-muted">
                  ·
                </span>
                <span className="font-semibold">{`${rating.reviews} reseñas en ${rating.source}`}</span>
                {texts.hero.badge && (
                  <>
                    <span aria-hidden="true" className="text-on-light-muted max-sm:hidden">
                      ·
                    </span>
                    <a href="#ubicacion" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
                      <PinIcon size={14} />
                      {texts.hero.badge}
                    </a>
                  </>
                )}
              </p>
            </div>
            <div className="hidden items-center gap-4 lg:flex">
              {fromPrice > 0 && (
                <p className="flex flex-col items-end leading-tight">
                  <span className="text-[.8rem] text-on-light-muted">Desde</span>
                  <span>
                    <strong className="text-[1.2rem] font-extrabold tabular-nums">{cop(fromPrice)}</strong>
                    <span className="text-on-light-muted"> / noche</span>
                  </span>
                </p>
              )}
              <a href="#reserva" className="btn btn-cta min-h-12 px-6">
                Reservar
              </a>
              <a
                href={wa(site.whatsapp, "Hola, quiero información.")}
                target="_blank"
                rel="noopener"
                aria-label="Escribir por WhatsApp"
                className="btn btn-card btn-icon size-12"
              >
                <WhatsAppIcon size={19} />
              </a>
            </div>
          </div>

          {/* Mosaico. La grande lleva la calificación; las pequeñas, su etiqueta sobre un degradado. */}
          <div className="relative min-h-0 flex-1">
            <div className="grid h-full grid-cols-1 gap-2 overflow-hidden rounded-[24px] md:grid-cols-4 md:grid-rows-2">
              {mosaic.map((t, i) => (
                <figure
                  key={t.src}
                  className={`group relative overflow-hidden bg-card-muted ${i === 0 ? "md:col-span-2 md:row-span-2 [&_img]:object-[82%_50%]" : "max-md:hidden"}`}
                >
                  <div className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.05]">
                    <PhotoSlot
                      src={t.src}
                      alt={i === 0 ? `Portada de ${config.name}` : t.label ? `${t.label} de ${config.name}` : `Foto ${i + 1} de ${config.name}`}
                      sizes={i === 0 ? "(min-width: 1360px) 640px, (min-width: 768px) 50vw, 100vw" : "(min-width: 1360px) 320px, 25vw"}
                      preload={i === 0}
                      eager={i > 0}
                      zoom
                    />
                  </div>
                  {i === 0 ? (
                    <span className="pointer-events-none absolute top-4 left-4 z-2 inline-flex items-center gap-1.5 rounded-full bg-card/95 px-3.5 py-1.5 text-[.84rem] font-bold text-on-light shadow-[0_4px_14px_-4px_rgb(0_0_0/0.35)]">
                      <span aria-hidden="true" className="text-[#e0a800]">
                        ★
                      </span>
                      {`${rating.score} · Calificación de los huéspedes`}
                    </span>
                  ) : (
                    t.label && (
                      <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 z-2 bg-[linear-gradient(transparent,rgb(18_12_8/0.6))] px-4 pt-10 pb-3 text-[.9rem] font-bold text-white">
                        <span aria-hidden="true" className="mr-2 inline-block size-2.5 rounded-full align-[1px]" style={{ background: tone(i) }} />
                        {t.label}
                      </figcaption>
                    )
                  )}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-1 bg-black/0 transition-colors duration-300 group-hover:bg-black/10"
                  />
                </figure>
              ))}
            </div>
            <button
              type="button"
              data-gallery={mosaic[0]?.src}
              aria-haspopup="dialog"
              className="absolute bottom-[clamp(12px,1.6vw,18px)] z-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-card px-4 text-[.88rem] font-bold text-on-light shadow-[0_6px_18px_-6px_rgb(0_0_0/0.45)] transition-colors hover:bg-bg max-md:left-[clamp(12px,1.6vw,18px)] md:right-[clamp(12px,1.6vw,18px)]"
            >
              <GridIcon size={15} />
              <span>
                <span className="max-sm:hidden">Mostrar las </span>
                {`${gallery.length} fotos`}
              </span>
            </button>
          </div>
        </section>

        <BookingProvider cabins={cabins}>
          {/* Dos columnas: el contenido a la izquierda y la tarjeta de reserva fija a la derecha. En el celular la tarjeta va
              justo después de la presentación. */}
          <div className="grid gap-x-[clamp(40px,7vw,96px)] lg:grid-cols-[minmax(0,1fr)_minmax(340px,380px)]">
            <div className="lg:col-start-1">
              {/* Presentación, con Fifí como anfitriona. */}
              <div className="flex items-center justify-between gap-6 border-b border-(--line) py-8">
                <div>
                  <h2 className="text-[clamp(1.2rem,1.8vw,1.4rem)] leading-snug font-extrabold">Cabañas, restaurante y café en Murillo, Tolima</h2>
                  <p className={`mt-1 ${muted}`}>
                    {[
                      cabins.length ? `${cabins.length} tipos de cabaña` : "",
                      maxGuests ? `hasta ${maxGuests} personas` : "",
                      "desayuno incluido",
                      "pet friendly",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Logo size={56} className="shadow-[0_2px_8px_rgb(0_0_0/0.15)]" />
              </div>

              {/* Calificación destacada. */}
              <div className="mt-8 flex items-center gap-5 rounded-2xl border border-[color-mix(in_srgb,var(--c-yellow)_45%,transparent)] bg-[color-mix(in_srgb,var(--c-yellow)_12%,var(--color-card))] px-6 py-5">
                <p className="flex flex-col items-center">
                  <strong className="h-pro text-[2rem] leading-none">{rating.score}</strong>
                  <span aria-hidden="true" className="mt-1 text-[.8rem] tracking-[.1em] text-highlight [text-shadow:0_0_1px_var(--color-on-dark)]">
                    ★★★★★
                  </span>
                </p>
                <p className="flex-1 border-l border-(--line) pl-5">
                  <strong className="block font-extrabold">Calificación de los huéspedes</strong>
                  <span className={`text-[.92rem] ${muted}`}>{`${rating.reviews} reseñas en ${rating.source}`}</span>
                </p>
              </div>

              {/* Lo que distingue a la casa. */}
              <ul aria-label="Lo que incluye tu estadía" className="grid gap-x-8 gap-y-5 border-b border-(--line) py-8 sm:grid-cols-2">
                {highlights.map((h, i) => (
                  <li key={h} className="flex items-center gap-4 font-bold">
                    <span aria-hidden="true" className="grid size-11 flex-none place-items-center rounded-full" style={{ background: tint(i), color: tone(i) }}>
                      <ServiceGlyph icon={highlightIcon(h)} size={22} />
                    </span>
                    {h}
                  </li>
                ))}
              </ul>

              {/* Descripción. */}
              <div className="border-b border-(--line) py-8 max-lg:border-b-0">
                <p className="text-[1.02rem] leading-relaxed text-pretty">{texts.hero.description}</p>
                {fromPrice > 0 && <p className={`mt-3 ${muted}`}>{`Desde ${cop(fromPrice)} la noche para ${fromGuests}, con desayuno.`}</p>}
              </div>
            </div>

            {/* Tarjeta de reserva: ocupa toda la altura de la columna derecha y se queda fija al bajar; en pantallas bajas se
                pega más arriba para que siempre se vea el botón (components/landing/sticky-aside.tsx). */}
            <aside aria-label="Reserva" className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-8 lg:pb-12">
              <StickyAside className="flex flex-col gap-3">
                <BookingWidget />
                <p className={`text-center text-[.9rem] ${muted}`}>
                  ¿Tienes dudas?{" "}
                  <a
                    href={wa(site.whatsapp, "Hola, quiero información para reservar.")}
                    target="_blank"
                    rel="noopener"
                    className="font-bold text-on-light underline"
                  >
                    Escríbenos por WhatsApp
                  </a>
                </p>
              </StickyAside>
            </aside>

            <div className="lg:col-start-1">
              {/* Cabañas. */}
              <Block id="cabanas" labelledBy="cabanas-title">
                <H2 id="cabanas-title">Elige tu cabaña</H2>
                <p className={`mt-1.5 ${muted}`}>
                  Cada una con baño privado y agua caliente, TV, wifi y el desayuno americano incluido. El precio se calcula al instante con tus fechas.
                </p>
                {cabins.length ? (
                  <ul className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2">
                    {cabins.map((c, i) => (
                      <li key={c.id} className="reveal-on-scroll">
                        <CabinCard c={c} i={i} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-6 font-bold">Muy pronto publicaremos las cabañas. Escríbenos por WhatsApp para reservar.</p>
                )}
              </Block>

              {/* Servicios incluidos (los del panel). */}
              <Block id="servicios" labelledBy="servicios-title">
                <H2 id="servicios-title">Lo que ofrecemos</H2>
                <p className={`mt-1.5 ${muted}`}>Lo que encuentras al llegar. Lo marcado aparte se cotiza por WhatsApp.</p>
                <ul className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                  {services.map((s, i) => (
                    <li key={s.id} className="flex items-start gap-4">
                      <span
                        aria-hidden="true"
                        className="grid size-10 flex-none place-items-center rounded-full"
                        style={{ background: tint(i), color: tone(i) }}
                      >
                        <ServiceGlyph icon={s.icon} size={21} />
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span>{s.title}</span>
                        {s.description && <span className={`text-[.86rem] ${muted}`}>{s.description}</span>}
                        {s.note && (
                          <span className="self-start rounded-full bg-accent/10 px-2.5 py-0.5 text-[.74rem] font-extrabold text-accent">{s.note}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </Block>

              {/* Restaurante y café. */}
              <Block id="restaurante" labelledBy="restaurante-title" last>
                <H2 id="restaurante-title">
                  {texts.restaurant.title} {texts.restaurant.highlight && <span className="text-cta">{texts.restaurant.highlight}</span>}
                </H2>
                <div className="mt-6 grid grid-cols-2 gap-2 overflow-hidden rounded-2xl">
                  <figure className="relative aspect-[4/3] bg-card-muted">
                    <PhotoSlot id="exp-restaurante" src={photos["exp-restaurante"]} sizes="(min-width: 1024px) 340px, 50vw" zoom />
                  </figure>
                  <figure className="relative aspect-[4/3] bg-card-muted">
                    <PhotoSlot id="restaurante-2" src={photos["restaurante-2"]} sizes="(min-width: 1024px) 340px, 50vw" zoom />
                  </figure>
                </div>
                {texts.restaurant.description && <p className="mt-6 leading-relaxed">{texts.restaurant.description}</p>}
                <ul className="mt-5 grid gap-3">
                  {lines(texts.restaurant.items).map((x, i) => (
                    <li key={x} className="flex items-start gap-3">
                      <CheckIcon size={18} className="mt-0.5" style={{ color: tone(i) }} />
                      {x}
                    </li>
                  ))}
                </ul>
                <a
                  href={wa(site.whatsapp, "Hola, quiero información del restaurante.")}
                  target="_blank"
                  rel="noopener"
                  className="btn btn-card mt-6 min-h-12 px-6 text-[.95rem]"
                >
                  <WhatsAppIcon size={17} />
                  Pregunta por el menú del día
                </a>
              </Block>
            </div>
          </div>
        </BookingProvider>

        {/* La finca: fotos cuadradas con su pie debajo, en fila (deslizables en el celular). */}
        <section id="finca" aria-labelledby="finca-title" className="scroll-mt-20 border-t border-(--line) py-12">
          <H2 id="finca-title">Aquí se descansa en familia</H2>
          <p className={`mt-1.5 max-w-[70ch] ${muted}`}>
            Desayunos con vista a la montaña, un parque para que los niños jueguen, jardines llenos de flores y el ambiente de una finca de Murillo.
          </p>
          <ul className="-mx-4 mt-6 no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
            {EXPERIENCES.map((e) => (
              <li key={e.id} className="w-[72%] flex-none snap-start sm:w-[44%] md:w-auto">
                <figure className="flex flex-col gap-2.5">
                  <div className="relative aspect-square overflow-hidden rounded-xl bg-card-muted">
                    <PhotoSlot id={`exp-${e.id}`} src={photos[`exp-${e.id}`]} sizes="(min-width: 768px) 270px, 72vw" zoom />
                  </div>
                  <figcaption className="font-bold">{e.label}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>

        {/* Dónde vas a estar: el mapa a lo ancho; debajo, la dirección con sus botones y la foto de la entrada. */}
        <section id="ubicacion" aria-labelledby="ubicacion-title" className="scroll-mt-20 border-t border-(--line) py-12">
          <H2 id="ubicacion-title">Dónde vas a estar</H2>
          <p className={`mt-1.5 ${muted}`}>Vereda Pajonales · Murillo, Tolima</p>
          <div className="relative mt-6 aspect-[4/3] overflow-hidden rounded-2xl bg-card-muted md:aspect-[16/7]">
            <iframe
              title={`Mapa de ubicación de ${config.name}`}
              src={`https://maps.google.com/maps?q=${config.lat},${config.lng}&z=14&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="absolute inset-0 size-full border-0"
            />
          </div>
          <div className="mt-6 grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
            <div className="flex flex-col gap-3">
              <p className="font-extrabold">{config.address}</p>
              {texts.location.note && <p className={`leading-relaxed ${muted}`}>{texts.location.note}</p>}
              <p className={`text-[.86rem] tabular-nums ${muted}`}>
                {Math.abs(config.lat).toFixed(4)}° {config.lat >= 0 ? "N" : "S"} · {Math.abs(config.lng).toFixed(4)}° {config.lng >= 0 ? "E" : "O"}
              </p>
              <div className="mt-1 flex flex-wrap gap-2.5">
                <a href={dirHref()} target="_blank" rel="noopener" className="btn btn-card min-h-11 px-4 text-[.92rem]">
                  <PinIcon size={17} />
                  Google Maps
                </a>
                <a
                  href={`https://waze.com/ul?ll=${config.lat},${config.lng}&navigate=yes`}
                  target="_blank"
                  rel="noopener"
                  className="btn btn-card min-h-11 px-4 text-[.92rem]"
                >
                  <WazeIcon />
                  Waze
                </a>
                <CopyButton text={config.address} label="Copiar dirección" className="btn btn-card min-h-11 gap-2 px-4 text-[.92rem]" />
              </div>
            </div>
            {photos.contact && (
              <figure className="flex flex-col gap-2">
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-card-muted">
                  <PhotoSlot id="contact" src={photos.contact} sizes="280px" zoom />
                </div>
                <figcaption className={`text-[.88rem] ${muted}`}>Busca este letrero en la entrada</figcaption>
              </figure>
            )}
          </div>
        </section>

        {/* Conoce a tus anfitriones: la tarjeta con Fifí y los números; al lado, la atención directa. */}
        <section id="contacto" aria-labelledby="contact-title" className="scroll-mt-20 border-t border-(--line) py-12">
          <H2 id="contact-title" className="mb-6">
            Conoce a tus anfitriones
          </H2>
          <div className="grid items-start gap-x-16 gap-y-8 md:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
            <div className="relative grid grid-cols-[1fr_auto] items-center gap-6 overflow-hidden rounded-3xl bg-card p-7 pt-8 shadow-[0_6px_20px_rgb(0_0_0/0.18)]">
              <span aria-hidden="true" className="railing absolute inset-x-0 top-0 h-1.5" />
              <div className="flex flex-col items-center text-center">
                <Logo size={104} />
                <p className="h-pro mt-3 text-[1.6rem] leading-none">{config.name}</p>
                <p className={`mt-1 text-[.88rem] font-semibold ${muted}`}>Atención familiar</p>
              </div>
              <dl className="flex flex-col divide-y divide-(--line) pl-2">
                <div className="flex flex-col-reverse pb-3">
                  <dt className={`text-[.74rem] font-semibold ${muted}`}>Reseñas</dt>
                  <dd className="h-pro text-[1.4rem] leading-none">{rating.reviews}</dd>
                </div>
                <div className="flex flex-col-reverse py-3">
                  <dt className={`text-[.74rem] font-semibold ${muted}`}>Calificación</dt>
                  <dd className="h-pro text-[1.4rem] leading-none">{rating.score} ★</dd>
                </div>
                <div className="flex flex-col-reverse pt-3">
                  <dt className={`text-[.74rem] font-semibold ${muted}`}>Desayuno</dt>
                  <dd className="h-pro text-[1.1rem] leading-none">Incluido</dd>
                </div>
              </dl>
            </div>
            <div className="flex flex-col items-start gap-5">
              <p className="max-w-[56ch] leading-relaxed">
                Resolvemos contigo fechas, cabañas, mascotas, el restaurante o una celebración. Escríbenos y te respondemos en un ratico.
              </p>
              <a
                href={wa(site.whatsapp, "Hola, quiero información para reservar.")}
                target="_blank"
                rel="noopener"
                className="btn min-h-12 bg-on-dark px-6 text-card hover:bg-[color-mix(in_srgb,var(--color-on-dark)_85%,#fff)]"
              >
                <WhatsAppIcon size={18} />
                Escríbenos por WhatsApp
              </a>
              <ul aria-label="Teléfonos" className="flex flex-wrap gap-x-5 gap-y-2">
                {site.phones.map((p) => (
                  <li key={p}>
                    <a href={tel(p)} className="inline-flex min-h-10 items-center gap-2 font-bold tabular-nums underline underline-offset-2">
                      <PhoneIcon size={16} />
                      {p}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Cosas que debes saber: los horarios y las reglas de la casa en columnas. */}
        <section id="antes-de-venir" aria-labelledby="pol-title" className="scroll-mt-20 border-t border-(--line) py-12">
          <H2 id="pol-title" className="mb-6">
            Cosas que debes saber
          </H2>
          <div className="grid gap-x-12 gap-y-8 md:grid-cols-3">
            <div className="flex flex-col gap-4">
              <h3 className="font-extrabold">Horarios</h3>
              <p className="flex items-center gap-3">
                <LoginIcon size={20} style={{ color: tone(1) }} />
                <span>{`Check-in: ${site.checkIn}`}</span>
              </p>
              <p className="flex items-center gap-3">
                <LogoutIcon size={20} style={{ color: tone(3) }} />
                <span>{`Check-out: ${site.checkOut}`}</span>
              </p>
            </div>
            {[site.policies.slice(0, half), site.policies.slice(half)].map((list, i) => (
              <div key={i} className="flex flex-col">
                <h3 className="mb-2 font-extrabold">{i ? "Más reglas" : "Reglas de la casa"}</h3>
                <ul className="flex flex-col divide-y divide-(--line)">
                  {list.map((p) => (
                    <li key={p.id}>
                      <details className="group">
                        <summary className="flex min-h-12 list-none items-center justify-between gap-3 py-2 hover:underline [&::-webkit-details-marker]:hidden">
                          {p.q}
                          <ChevronDownIcon size={16} className="flex-none transition-transform duration-200 group-open:rotate-180" />
                        </summary>
                        <p className={`pb-3 text-[.94rem] leading-relaxed ${muted}`}>{p.a}</p>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </main>
      <PhotoLightbox photos={gallery} />

      <SiteFooter tall />

      {/* Celular: barra fija abajo con el precio y «Reservar». */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-4 border-t border-(--line) bg-card px-4 py-3 lg:hidden">
        <p className="flex flex-col leading-tight">
          {fromPrice > 0 && (
            <span>
              <strong className="font-extrabold tabular-nums">{cop(fromPrice)}</strong> noche
            </span>
          )}
          <span className={`text-[.8rem] ${muted}`}>{`★ ${rating.score} · desayuno incluido`}</span>
        </p>
        <a href="#reserva" className="btn btn-cta min-h-12 px-7">
          Reservar
        </a>
      </div>

      <a
        href={wa(site.whatsapp)}
        target="_blank"
        rel="noopener"
        aria-label="Escribir por WhatsApp"
        className="fixed right-4 bottom-[88px] z-60 grid size-[56px] place-items-center rounded-full bg-[#25d366] text-white shadow-(--shadow-lift) transition-transform hover:-translate-y-0.5 lg:bottom-6"
      >
        <WhatsAppFabIcon size={27} />
      </a>
    </div>
  );
}
