import { config } from "@/lib/config";
import { todayISO } from "@/lib/format";

// Pie del panel: derechos de autor a nombre del titular legal y quién lo desarrolló. Va en todas las pantallas del panel,
// también en el ingreso (abajo del todo si la página es corta). Mientras la razón social no esté en la configuración,
// solo el nombre comercial.
export function PanelFooter({ className = "" }: { className?: string }) {
  const holder = config.razonSocial.startsWith("{") ? config.name : `${config.razonSocial} — ${config.name}`;
  return (
    <footer
      className={`mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line pt-4 text-[12.5px] text-ink-subtle ${className}`}
    >
      <p>{`© ${todayISO().slice(0, 4)} ${holder}. Todos los derechos reservados.`}</p>
      <p>
        Desarrollado por <span className="font-semibold text-ink-muted">Joab Giraldo</span>
      </p>
    </footer>
  );
}
