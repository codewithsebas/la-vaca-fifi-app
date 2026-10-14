import Link from "next/link";
import { config } from "@/lib/config";
import { wa } from "@/lib/format";
import { getSite } from "@/lib/server/site";
import { Brand } from "./brand";
import { WhatsAppIcon } from "./icons";

// Encabezado de las páginas internas (reservar, mi reserva, políticas…): la misma barra color leche con filo de tinta
// de la portada, con la marca y los accesos principales.
export async function SiteHeader() {
  const { c } = await getSite();
  return (
    <header className="sticky top-0 z-50 border-b-[3px] border-on-dark bg-bg/95 text-on-dark backdrop-blur-md">
      <div className="gutter-1360 flex min-h-[72px] flex-wrap items-center gap-3 py-2">
        <Link href="/" aria-label={`${config.name}, inicio`} className="flex min-h-11 items-center gap-2.5 no-underline">
          <Brand size={46} wordSize="clamp(1.1rem,calc(4vw + .2rem),1.45rem)" eager />
        </Link>
        <nav aria-label="Secundaria" className="ml-auto flex flex-wrap items-center gap-1.5">
          <Link href="/" className="inline-flex min-h-11 items-center rounded-full px-3.5 text-[.95rem] font-extrabold no-underline hover:bg-highlight hover:text-on-light max-sm:hidden">
            Inicio
          </Link>
          <Link href="/mi-reserva" className="inline-flex min-h-11 items-center rounded-full px-3.5 text-[.95rem] font-extrabold no-underline hover:bg-highlight hover:text-on-light">
            Mi reserva
          </Link>
          <a href={wa(c.whatsapp)} target="_blank" rel="noopener" className="btn btn-card min-h-11 gap-2 px-4 text-[.95rem]">
            <WhatsAppIcon size={16} />
            <span className="max-sm:sr-only">WhatsApp</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
