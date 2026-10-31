import Image from "next/image";
import { photoSlot } from "@/lib/site";

type Props = {
  id?: string; // hueco de lib/site.ts (PHOTO_SLOTS); sin hueco, alt y placeholder llegan por props
  src?: string; // URL subida desde el panel
  sizes: string;
  preload?: boolean; // solo la foto que suele ser el LCP (banner grande)
  eager?: boolean; // visible al cargar, pero sin competir con el LCP
  alt?: string;
  placeholder?: string;
  zoom?: boolean; // al tocarla abre la galería de fotos de la portada (components/landing/photo-lightbox.tsx)
};

// Foto que llena su contenedor (posicionado). Sin foto cargada muestra un marcador con la indicación.
export function PhotoSlot({ id, src, sizes, preload, eager, alt, placeholder, zoom }: Props) {
  const slot = id ? photoSlot(id) : undefined;
  const label = alt ?? slot?.alt ?? "";
  if (src)
    return (
      <>
        <Image src={src} alt={label} fill sizes={sizes} quality={90} preload={preload} loading={eager ? "eager" : undefined} className="object-cover" />
        {/* La galería escucha los clics en [data-gallery] (un solo oyente para toda la página). */}
        {zoom && (
          <button
            type="button"
            data-gallery={src}
            aria-label="Abrir la galería de fotos"
            aria-haspopup="dialog"
            className="absolute inset-0 z-1 cursor-zoom-in rounded-[inherit] outline-offset-[-4px]"
          />
        )}
      </>
    );
  return (
    <div
      role="img"
      aria-label={label}
      className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-[rgb(127_127_127/0.08)] p-3 text-center font-sans text-[13px] leading-[1.3]"
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="opacity-45"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
      <span className="max-w-[90%] font-medium tracking-[.01em] opacity-75">{placeholder ?? slot?.placeholder}</span>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 border-[1.5px] border-dashed border-current opacity-35" />
    </div>
  );
}
