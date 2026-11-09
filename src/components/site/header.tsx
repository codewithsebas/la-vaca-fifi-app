import Link from "next/link";
import { config } from "@/lib/config";
import { wa } from "@/lib/format";
import { getSite } from "@/lib/server/site";
import { Brand } from "@/components/brand/logo";
import { WhatsAppIcon } from "@/components/ui/icons";

const link = "inline-flex min-h-11 items-center rounded-full px-4 text-[.92rem] font-semibold text-on-light no-underline hover:bg-bg";

// Encabezado de las páginas internas (reservar, mi reserva, políticas…), como el de la portada: barra blanca con la
// franja de colores de las barandas arriba y un filo fino abajo; la marca a la izquierda y los accesos principales a la
// derecha.
export async function SiteHeader() {
  const { c } = await getSite();
  return (
    <header className="sticky top-0 z-50 border-b border-(--line) bg-card text-on-light">
      <div aria-hidden="true" className="railing h-1" />
      <div className="flex min-h-[72px] items-center gap-3 gutter-1280 py-2">
        <Link
          href="/"
          aria-label={`${config.name}, inicio`}
          className="flex min-h-11 min-w-0 items-center gap-2.5 no-underline max-[440px]:[&_.brand-eyebrow]:hidden"
        >
          <Brand size={44} wordSize="clamp(1.1rem,calc(4vw + .2rem),1.4rem)" eager />
        </Link>
        <nav aria-label="Secundaria" className="ml-auto flex items-center gap-1">
          <Link href="/" className={`${link} max-md:hidden`}>
            Inicio
          </Link>
          <Link href="/mi-reserva" className={`${link} max-sm:hidden`}>
            Mi reserva
          </Link>
          <a href={wa(c.whatsapp)} target="_blank" rel="noopener" aria-label="Escribir por WhatsApp" className="btn btn-card btn-icon ml-1 size-11">
            <WhatsAppIcon size={18} />
          </a>
          <Link href="/reservar" className="btn btn-cta ml-1 min-h-11 px-5 text-[.92rem]">
            Reservar
          </Link>
        </nav>
      </div>
    </header>
  );
}
