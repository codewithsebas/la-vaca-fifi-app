// Reservas con varias cabañas: cada cabaña es una reserva y comparten `groupCode` (el código de la principal).
// El huésped, el plazo del abono y los pagos son del grupo; cada cabaña conserva su tarifa, su unidad y sus personas.
import type { Quote, Reservation } from "@/lib/types";

// Cabañas del grupo de `r`, la principal primero. Las canceladas se omiten, salvo que lo esté todo el grupo.
// Una reserva sola devuelve [r].
export function groupOf<R extends Pick<Reservation, "code" | "groupCode" | "status">>(all: R[], r: R): R[] {
  if (!r.groupCode) return [r];
  const members = all.filter((x) => x.groupCode === r.groupCode);
  const live = members.filter((x) => x.status !== "cancelled");
  const rows = live.length ? live : members;
  if (!rows.some((x) => x.code === r.code)) rows.push(r);
  return [...rows.filter((x) => x.code === r.groupCode), ...rows.filter((x) => x.code !== r.groupCode).sort((a, b) => (a.code < b.code ? -1 : 1))];
}

// La reserva con los valores del grupo: total, abono, saldo y lo pagado suman todas las cabañas; queda pagada cuando
// todas lo están. Con una sola cabaña es la misma reserva.
export function groupMoney(rows: Reservation[]): Reservation {
  const [lead] = rows;
  if (rows.length < 2) return lead;
  const add = (f: (q: Quote) => number) => rows.reduce((s, x) => s + f(x.quote), 0);
  return {
    ...lead,
    quote: {
      ...lead.quote,
      base: add((q) => q.base),
      extraAmount: add((q) => q.extraAmount),
      total: add((q) => q.total),
      deposit: add((q) => q.deposit),
      balance: add((q) => q.balance),
    },
    paid: rows.reduce((s, x) => s + x.paid, 0),
    depositPaidAt: rows.every((x) => x.depositPaidAt) ? lead.depositPaidAt : null,
    balancePaidAt: rows.every((x) => x.balancePaidAt) ? lead.balancePaidAt : null,
    adults: rows.reduce((s, x) => s + x.adults, 0),
    children: rows.reduce((s, x) => s + x.children, 0),
  };
}
