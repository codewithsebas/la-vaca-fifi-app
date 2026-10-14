import Image from "next/image";
import logo from "@/public/logo-la-vaca-fifi.png";

// Logo del cliente: un sello redondo con los colores del letrero de la entrada (aro terracota con filete dorado y fondo
// verde), la vaca Holstein con pestañas y su corona de flores. Decorativo: junto a él siempre va el nombre, o el enlace
// que lo envuelve lo nombra. El original, en vector, es public/logo-la-vaca-fifi.svg.
// eager: visible al cargar (encabezado), sin esperar a que entre en pantalla.
export function Logo({ size, eager = false, className = "" }: { size: number; eager?: boolean; className?: string }) {
  return <Image src={logo} alt="" width={size} height={size} loading={eager ? "eager" : undefined} className={`flex-none rounded-full ${className}`} />;
}

// «La Vaca Fifí» con la letra del letrero: romana gruesa en versalitas (Alegreya SC). El tamaño es el de la letra heredada.
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-wordmark font-extrabold tracking-[.02em] whitespace-nowrap ${className}`}>La Vaca Fifí</span>;
}

// «La Vaca Fifí / cabañas · restaurante»: el segundo renglón, como la franja de arriba del letrero.
export function BrandName({ wordSize, eyebrowSize = ".44em", className = "" }: { wordSize: string; eyebrowSize?: string; className?: string }) {
  return (
    <span className={`flex min-w-0 flex-col gap-[.2em] leading-none ${className}`} style={{ fontSize: wordSize }}>
      <Wordmark />
      <span className="font-wordmark font-extrabold tracking-[.14em] whitespace-nowrap opacity-75" style={{ fontSize: eyebrowSize }}>
        cabañas · restaurante
      </span>
    </span>
  );
}

// Logo + «La Vaca Fifí / cabañas · restaurante».
export function Brand({ size = 46, wordSize = "1.4rem", eyebrowSize = ".64rem", eager = false }) {
  return (
    <>
      <Logo size={size} eager={eager} />
      <BrandName wordSize={wordSize} eyebrowSize={eyebrowSize} />
    </>
  );
}
