import Image from "next/image";
import logo from "@/public/logo-la-vaca-fifi.png";

// Logo: Fifí, la vaca del letrero del restaurante, relamiéndose dentro de un sello azul de borde oscuro. Decorativo:
// junto a él siempre va el nombre, o el enlace que lo envuelve lo nombra. El vector es public/logo-la-vaca-fifi.svg
// (lo genera scripts/fifi-logo.ts con los trazos de components/fifi/fifi-paths.ts).
// eager: visible al cargar (encabezado), sin esperar a que entre en pantalla.
export function Logo({ size, eager = false, className = "" }: { size: number; eager?: boolean; className?: string }) {
  return <Image src={logo} alt="" width={size} height={size} loading={eager ? "eager" : undefined} className={`flex-none rounded-full ${className}`} />;
}

// «La Vaca Fifí» en la letra de los títulos (Lilita One, redonda y gruesa como las letras del letrero).
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-wordmark whitespace-nowrap ${className}`}>La Vaca Fifí</span>;
}

// «La Vaca Fifí / cabañas · restaurante · café».
export function BrandName({ wordSize, eyebrowSize = ".5em", className = "" }: { wordSize: string; eyebrowSize?: string; className?: string }) {
  return (
    <span className={`flex min-w-0 flex-col gap-[.14em] leading-none ${className}`} style={{ fontSize: wordSize }}>
      <Wordmark />
      <span className="brand-eyebrow font-body font-extrabold tracking-[.12em] whitespace-nowrap uppercase opacity-80" style={{ fontSize: eyebrowSize }}>
        cabañas · restaurante · café
      </span>
    </span>
  );
}

// Logo + nombre.
export function Brand({ size = 46, wordSize = "1.4rem", eyebrowSize = ".5em", eager = false }) {
  return (
    <>
      <Logo size={size} eager={eager} />
      <BrandName wordSize={wordSize} eyebrowSize={eyebrowSize} />
    </>
  );
}
