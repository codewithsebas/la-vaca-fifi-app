import Image from "next/image";
import logo from "@/public/logo-stellarium.png";

// Logo del cliente: un círculo ilustrado (la montaña al atardecer, el domo y la «S» de estrellas) con las esquinas
// transparentes. Decorativo: junto a él siempre va el nombre, o el enlace que lo envuelve lo nombra.
// eager: visible al cargar (encabezado), sin esperar a que entre en pantalla.
export function Logo({ size, eager = false, className = "" }: { size: number; eager?: boolean; className?: string }) {
  return <Image src={logo} alt="" width={size} height={size} loading={eager ? "eager" : undefined} className={`flex-none rounded-full ${className}`} />;
}

// La «S» de estrellas del logo, calcada sobre él (1 unidad = 1 px del PNG de 768): la línea de la constelación y sus
// catorce estrellas. En el logo la letra mide 64,7 px, la «t» arranca en x = 88 y la línea de base está en y = 175.
const S_LINE = "M85.1 48.3C84.1 50.1 80.8 55.5 79.2 59.3C77.6 63 76.5 64.8 75.4 70.8C74.3 76.8 72.7 88.3 72.8 95.2C72.9 102.2 74.8 106.8 76.1 112.5C77.4 118.2 79.2 123.8 80.6 129.6C82 135.4 83.8 141.4 84.6 147.4C85.4 153.4 85.8 159.7 85.4 165.7C85 171.7 84.2 178.5 82.2 183.6C80.2 188.7 77.3 193.1 73.6 196.5C69.9 199.9 65.2 202.6 59.9 203.8C54.7 205 47.6 205.2 42.1 203.5C36.6 201.8 31.6 197.7 27.2 193.6C22.8 189.5 18.3 184.4 15.4 178.9C12.5 173.4 10.8 166.4 9.8 160.9C8.8 155.4 8.7 150.5 9.4 146.1C10.1 141.7 11.5 137.7 13.9 134.4C16.3 131.1 19.9 129 23.7 126.5C27.5 124 34.5 120.6 36.7 119.4M85.1 48.3C86.1 46.1 88.9 38.6 91 35.2C93.1 31.8 95.1 30.1 97.5 28C99.9 25.9 102.5 24.2 105.2 22.5C107.9 20.8 111 19.5 113.8 18C116.7 16.5 118.7 14.9 122.3 13.5C125.9 12.1 133.1 10.3 135.3 9.6M85.1 48.3C87.3 47 94.7 41.9 98.4 40.5C102.1 39.1 104.5 39.6 107.4 39.9C110.3 40.1 113.1 40.9 115.9 42C118.6 43.1 121.2 45.1 123.9 46.6C126.6 48.1 128.9 48.8 132 50.9C135.1 53 140.6 57.7 142.3 59.1M85.1 48.3C86.9 50.1 92.9 56 95.9 59C98.9 62 100.9 63.6 103 66.2C105.1 68.8 106.4 71 108.5 74.6C110.6 78.3 114.5 85.9 115.7 88.1";
const S_STARS = "M141.5 15.2L136.3 14.1L131.9 17.2L131.3 11.9L127 8.7L131.9 6.5L133.6 1.5L137.2 5.4L142.5 5.5L139.9 10.1ZM92 52.9L86.7 52.6L82.8 56.3L81.5 51.1L76.8 48.6L81.3 45.7L82.3 40.5L86.4 43.9L91.6 43.2L89.7 48.1ZM149.3 63.5L144 63.4L140.3 67.2L138.8 62.1L134 59.7L138.4 56.7L139.2 51.4L143.4 54.6L148.7 53.8L146.9 58.8ZM120.6 94.8L115.7 92.7L110.8 94.8L111.3 89.5L107.8 85.5L113 84.4L115.7 79.8L118.4 84.4L123.6 85.5L120.1 89.5ZM75.6 103L71.5 99.6L66.3 100.3L68.2 95.4L65.9 90.6L71.2 90.9L75.1 87.2L76.4 92.4L81.1 94.9L76.6 97.8ZM87.5 134.2L82.2 133.9L78.3 137.6L77 132.4L72.3 129.9L76.8 127L77.8 121.8L81.9 125.2L87.1 124.5L85.2 129.4ZM93.7 166.6L88.8 168.8L87.1 173.8L83.5 169.9L78.2 169.9L80.8 165.2L79.2 160.1L84.4 161.2L88.8 158.1L89.4 163.4ZM88.2 189.4L83 188.1L78.6 191.1L78.1 185.8L74 182.4L78.9 180.4L80.8 175.4L84.2 179.5L89.5 179.7L86.8 184.2ZM67.2 207.7L61.9 207.9L58.5 212L56.6 207L51.7 205L55.8 201.6L56.3 196.3L60.7 199.3L65.9 198L64.5 203.2ZM33 199.6L27.8 198.2L23.3 200.9L23.1 195.6L19 192.2L24 190.3L26 185.4L29.4 189.5L34.7 190L31.7 194.4ZM12.9 168.6L8.7 165.4L3.4 166.2L5.2 161.2L2.8 156.5L8.1 156.6L11.8 152.8L13.3 157.9L18.1 160.3L13.7 163.3ZM17.5 147.8L12.5 149.5L10.3 154.4L7.1 150.1L1.8 149.5L4.9 145.1L3.8 139.9L8.9 141.5L13.6 138.9L13.6 144.2ZM31.2 130.1L25.9 130.6L22.5 134.7L20.5 129.8L15.5 127.9L19.6 124.5L19.8 119.2L24.3 121.9L29.5 120.5L28.2 125.7ZM39.5 127.2L35.4 123.8L30.2 124.5L32.1 119.6L29.8 114.8L35.1 115.1L39 111.4L40.3 116.6L45 119.1L40.5 122Z";

// «Stellarium» como en el logo: la S de estrellas y el resto en Source Code Pro. El tamaño es el de la letra heredada.
// La S va al 56 % de la proporción del logo y algo más gruesa, para que se lea en un encabezado. Se ancla a la línea
// de base sin ocupar alto: su parte baja queda a la izquierda de la «t» (.78em) y sus ramas, por encima del renglón.
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-wordmark font-normal whitespace-nowrap ${className}`}>
      <span className="sr-only">Stellarium</span>
      <span aria-hidden="true">
        <span className="relative inline-block h-0 w-[.78em]">
          <svg viewBox="0 0 152 213" fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="absolute -bottom-[.329em] left-0 h-[1.844em] w-[1.316em]">
            <path d={S_LINE} fill="none" strokeWidth="5.5" />
            <path d={S_STARS} strokeWidth="2" />
          </svg>
        </span>
        tellarium
      </span>
    </span>
  );
}

// «Stellarium / glamping»: el segundo renglón empieza bajo la «t», como en el logo. El margen de arriba compensa las
// ramas de la S, para que el conjunto quede centrado con lo que tenga al lado.
export function BrandName({ wordSize, eyebrowSize = ".44em", className = "" }: { wordSize: string; eyebrowSize?: string; className?: string }) {
  return (
    <span className={`flex min-w-0 flex-col gap-[.12em] pt-[.25em] pl-[.78em] leading-none ${className}`} style={{ fontSize: wordSize }}>
      <Wordmark className="-ml-[.78em]" />
      <span className="font-wordmark font-normal opacity-75" style={{ fontSize: eyebrowSize }}>
        glamping
      </span>
    </span>
  );
}

// Logo + «Stellarium / glamping».
export function Brand({ size = 46, wordSize = "1.4rem", eyebrowSize = ".64rem", eager = false }) {
  return (
    <>
      <Logo size={size} eager={eager} />
      <BrandName wordSize={wordSize} eyebrowSize={eyebrowSize} />
    </>
  );
}
