"use client";

// Enlace de pago de una reserva pendiente: copiarlo o enviarlo por WhatsApp con un mensaje listo, y cuánto le queda.
import { useState } from "react";
import { CheckIcon, ClockIcon, ExternalLinkIcon, WhatsAppIcon } from "@/components/icons";
import { config } from "@/lib/config";
import { cop, countdown, dateOf, fmtClock, fmtDate, nightsBetween, plural, waTo } from "@/lib/format";
import { payPath } from "@/lib/payments";
import type { Reservation } from "@/lib/types";
import { useAdmin } from "./context";
import { adminInput } from "./shared";
import { Button, buttonClass } from "./ui";

// URL pública del enlace (el dominio del sitio; en desarrollo, el de esta pestaña).
export const payUrlOf = (token: string) => ((process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() || window.location.origin).replace(/\/$/, "") + payPath(token);

// "sáb 13 oct, 3:45 p. m."
export const fmtDeadline = (iso: string) => `${fmtDate(dateOf(iso))}, ${fmtClock(iso)}`;

// Mensaje para el huésped: la reserva, cuánto pagar y hasta cuándo.
function payMessage(r: Reservation, url: string, cabin: string) {
  const nights = nightsBetween(r.checkIn, r.checkOut);
  const guests = r.adults + r.children;
  return [
    `Hola ${r.guest.fullName.split(" ")[0]}, te escribimos de ${config.name}.`,
    `Tu reserva ${r.code} quedó apartada:`,
    `${cabin} · ${fmtDate(r.checkIn)} → ${fmtDate(r.checkOut)} (${plural(nights, "noche", "noches")}, ${plural(guests, "persona", "personas")})`,
    `Total ${cop(r.quote.total)} · abono para confirmar ${cop(r.quote.deposit)}`,
    "",
    `Para confirmarla, paga el abono o el total aquí: ${url}`,
    `Tienes hasta el ${fmtDeadline(r.depositDueAt)} para pagar; si no se paga a tiempo, las fechas se liberan.`,
  ].join("\n");
}

export function PayLinkShare({ r, url, compact = false }: { r: Reservation; url: string; compact?: boolean }) {
  const { cabinLabel, now } = useAdmin();
  const [copied, setCopied] = useState<"link" | "text" | null>(null);
  const message = payMessage(r, url, cabinLabel(r.cabinTypeId, r.unit));
  const copy = (what: "link" | "text") =>
    navigator.clipboard?.writeText(what === "link" ? url : message).then(
      () => {
        setCopied(what);
        setTimeout(() => setCopied(null), 2000);
      },
      () => {},
    );
  const left = Date.parse(r.depositDueAt) - now;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input readOnly value={url} aria-label="Enlace de pago" onFocus={(e) => e.currentTarget.select()} className={`${adminInput} min-w-0 flex-1 font-mono text-[12.5px]`} />
        <Button onClick={() => copy("link")} icon={copied === "link" ? <CheckIcon size={14} /> : undefined}>
          {copied === "link" ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <p className={`flex items-center gap-1.5 text-[13px] font-semibold ${left > 0 ? "text-warning" : "text-error"}`}>
        <ClockIcon size={14} />
        {left > 0 ? `Vence el ${fmtDeadline(r.depositDueAt)} · quedan ${countdown(r.depositDueAt)}` : "El plazo para pagar ya venció"}
      </p>
      <div className={`flex flex-wrap gap-2 ${compact ? "" : "pt-1"}`}>
        <a href={waTo(r.guest.phone, message)} target="_blank" rel="noopener" className={buttonClass("primary", "md", "gap-2")}>
          <WhatsAppIcon size={16} />
          Enviar por WhatsApp
        </a>
        <Button onClick={() => copy("text")} icon={copied === "text" ? <CheckIcon size={14} /> : undefined}>
          {copied === "text" ? "Mensaje copiado" : "Copiar mensaje"}
        </Button>
        <a href={url} target="_blank" rel="noopener" className={buttonClass("ghost", "md", "gap-1.5")}>
          <ExternalLinkIcon size={14} />
          Ver como el huésped
        </a>
      </div>
    </div>
  );
}
