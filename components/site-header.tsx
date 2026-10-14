import Link from "next/link";
import { config } from "@/lib/config";
import { wa } from "@/lib/format";
import { getSite } from "@/lib/server/site";
import { Brand } from "./brand";
import { WhatsAppIcon } from "./icons";

export async function SiteHeader() {
  const { c } = await getSite();
  return (
    <header className="gutter-1360 flex flex-wrap items-center gap-4 py-3.5 text-on-dark">
      <Link href="/" aria-label={`${config.name}, inicio`} className="flex min-h-11 items-center gap-3 no-underline">
        <Brand eager />
      </Link>
      <nav aria-label="Secundaria" className="ml-auto flex flex-wrap gap-1.5">
        <Link href="/" className="inline-flex min-h-11 items-center rounded-full px-4 text-[.92rem] font-semibold no-underline hover:bg-surface">
          Inicio
        </Link>
        <Link href="/mi-reserva" className="inline-flex min-h-11 items-center rounded-full px-4 text-[.92rem] font-semibold no-underline hover:bg-surface">
          Mi reserva
        </Link>
        <a href={wa(c.whatsapp)} target="_blank" rel="noopener" className="btn btn-card min-h-11 gap-2 px-[18px] text-[.92rem] font-bold">
          <WhatsAppIcon size={16} />
          WhatsApp
        </a>
      </nav>
    </header>
  );
}
