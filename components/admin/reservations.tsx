"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRightIcon, CloseIcon, FileTextIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { StatusPill } from "@/components/status-pill";
import { paymentState } from "@/lib/admin-metrics";
import { STATUS, isISO, plural } from "@/lib/format";
import type { Reservation } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin, useParam } from "./context";
import { DateRangePicker } from "./date-picker";
import { NewReservationDialog } from "./new-reservation";
import { MODULES, paths } from "./routes";
import { adminInput, norm, rowOf } from "./shared";
import { Badge, Button, Card, EmptyState, Field, PageHeader, Segmented } from "./ui";

type Quick = "todas" | "pendientes" | "comprobantes" | "proximas" | "en-estadia";
type Sort = "llegada-desc" | "llegada-asc" | "creada-desc" | "valor-desc";
const PAGE = 40;

// Lista de reservas. Los filtros viven en la URL: al abrir una reserva y volver, la lista sigue igual.
export function ReservationsView() {
  const { data, today, openReservation, cabinLabel } = useAdmin();
  const [q, setQ] = useParam("q", "");
  const [quick, setQuick] = useParam<Quick>("vista", "todas");
  const [status, setStatus] = useParam("estado", "");
  const [cabin, setCabin] = useParam("domo", "");
  const [fromP, setFrom] = useParam("desde", "");
  const [toP, setTo] = useParam("hasta", "");
  const [sort, setSort] = useParam<Sort>("orden", "llegada-desc");
  const [limit, setLimit] = useState(PAGE);
  const [creating, setCreating] = useState(false);
  const from = isISO(fromP) ? fromP : null;
  const to = isISO(toP) ? toP : null;

  const proofCodes = useMemo(() => new Set(data.proofs.filter((p) => p.status === "pending").map((p) => p.reservationCode)), [data.proofs]);
  const quickTest: Record<Quick, (r: Reservation) => boolean> = {
    todas: () => true,
    pendientes: (r) => r.status === "pending_deposit",
    comprobantes: (r) => proofCodes.has(r.code),
    proximas: (r) => ["pending_deposit", "confirmed", "rescheduled"].includes(r.status) && r.checkIn >= today,
    "en-estadia": (r) => r.status === "checked_in",
  };
  const test = quickTest[quick] ?? quickTest.todas;
  const counts = { pendientes: data.reservations.filter(quickTest.pendientes).length, comprobantes: data.reservations.filter(quickTest.comprobantes).length, estadia: data.reservations.filter(quickTest["en-estadia"]).length };

  const nq = norm(q.trim());
  const list = data.reservations
    .filter(
      (r) =>
        test(r) &&
        (!status || r.status === status) &&
        (!cabin || r.cabinTypeId === cabin) &&
        (!from || r.checkIn >= from) &&
        (!to || r.checkIn <= to) &&
        (!nq || [r.code, r.guest.fullName, r.guest.email, r.guest.phone, r.guest.docNumber].some((v) => norm(v || "").includes(nq))),
    )
    .sort((a, b) =>
      sort === "llegada-asc" ? (a.checkIn < b.checkIn ? -1 : 1) : sort === "creada-desc" ? (a.createdAt < b.createdAt ? 1 : -1) : sort === "valor-desc" ? b.quote.total - a.quote.total : a.checkIn < b.checkIn ? 1 : -1,
    );
  const active = !!(q || status || cabin || from || quick !== "todas");
  const clear = () => {
    setQ("");
    setQuick("todas");
    setStatus("");
    setCabin("");
    setFrom("");
    setTo("");
  };

  return (
    <>
      <PageHeader
        title={MODULES.reservas.label}
        description={MODULES.reservas.description}
        actions={
          <Button variant="primary" icon={<PlusIcon size={14} />} onClick={() => setCreating(true)}>
            Nueva reserva
          </Button>
        }
      />
      {creating && <NewReservationDialog draft={{}} onClose={() => setCreating(false)} />}
      <Segmented
        label="Filtro rápido"
        value={quick}
        onChange={(v) => {
          setQuick(v);
          setLimit(PAGE);
        }}
        options={[
          { value: "todas", label: "Todas" },
          { value: "pendientes", label: "Pendientes de abono", count: counts.pendientes },
          { value: "comprobantes", label: "Comprobantes por revisar", count: counts.comprobantes },
          { value: "proximas", label: "Próximas llegadas" },
          { value: "en-estadia", label: "En estadía", count: counts.estadia },
        ]}
      />
      <Card className="p-4">
        <form role="search" aria-label="Filtrar reservas" onSubmit={(e) => e.preventDefault()} className="grid grid-cols-2 items-end gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
          <Field label="Buscar" className="col-span-2 xl:col-span-1">
            {(p) => (
              <div className="relative">
                <SearchIcon size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle" />
                <input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, código, correo, celular o documento" className={`${adminInput} pl-9`} />
              </div>
            )}
          </Field>
          <Field label="Estado">
            {(p) => (
              <Combobox
                id={p.id}
                value={status}
                onChange={setStatus}
                options={[{ value: "", label: "Todos los estados" }, ...Object.entries(STATUS).map(([v, s]) => ({ value: v, label: s.label, color: s.bg }))]}
              />
            )}
          </Field>
          <Field label="Domo">
            {(p) => <Combobox id={p.id} value={cabin} onChange={setCabin} options={[{ value: "", label: "Todos los domos" }, ...data.cabinTypes.map((c) => ({ value: c.id, label: c.nombre, description: c.activa ? undefined : "Inactivo" }))]} />}
          </Field>
          <Field label="Llegada entre">
            {(p) => (
              <DateRangePicker
                id={p.id}
                from={from}
                to={to}
                onChange={(a, b) => {
                  setFrom(a ?? "");
                  setTo(b ?? "");
                }}
                placeholder="Cualquier fecha"
              />
            )}
          </Field>
          <Field label="Ordenar por">
            {(p) => (
              <Combobox
                id={p.id}
                value={sort}
                onChange={(v) => setSort(v as Sort)}
                options={[
                  { value: "llegada-desc", label: "Llegada más reciente" },
                  { value: "llegada-asc", label: "Llegada más antigua" },
                  { value: "creada-desc", label: "Creada más reciente" },
                  { value: "valor-desc", label: "Mayor valor" },
                ]}
              />
            )}
          </Field>
        </form>
      </Card>

      <div className="-mb-1 flex flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="text-[13px] font-medium text-ink-muted">
          {plural(list.length, "reserva", "reservas")}
          {active ? " con estos filtros" : ""}
        </p>
        {active && (
          <Button size="sm" variant="ghost" icon={<CloseIcon size={14} />} onClick={clear}>
            Limpiar filtros
          </Button>
        )}
      </div>

      {list.length > 0 ? (
        <>
          <Card className="hidden overflow-hidden lg:block">
            <table className="w-full text-[14px]">
              <thead className="border-b border-line bg-canvas/70 text-left text-[12px] font-semibold text-ink-muted">
                <tr>
                  {["Reserva", "Huésped", "Domo", "Fechas", "Total", "Pago", "Estado"].map((h) => (
                    <th key={h} scope="col" className={`px-4 py-2.5 font-semibold ${h === "Total" ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                  <th scope="col" className="w-10">
                    <span className="sr-only">Abrir</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.slice(0, limit).map((r) => {
                  const x = rowOf(r, cabinLabel);
                  const pay = paymentState(r);
                  return (
                    <tr key={r.code} onClick={() => openReservation(r.code)} className="group cursor-pointer transition-colors hover:bg-canvas/70">
                      <td className="px-4 py-3">
                        <Link href={paths.reserva(r.code)} onClick={(e) => e.stopPropagation()} className="rounded-sm font-bold whitespace-nowrap text-ink underline-offset-2 hover:underline">
                          {x.code}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block font-semibold text-ink">{x.name}</span>
                        <span className="block text-[12.5px] text-ink-muted tabular-nums">{x.doc}</span>
                      </td>
                      <td className="px-4 py-3 text-ink">{x.cabin}</td>
                      <td className="px-4 py-3">
                        <span className="block whitespace-nowrap text-ink">{x.dates}</span>
                        <span className="block text-[12.5px] text-ink-muted">{`${x.nights} · ${r.checkIn.slice(0, 4)}`}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-ink tabular-nums">{x.total}</td>
                      <td className="px-4 py-3">
                        {proofCodes.has(r.code) ? (
                          <Badge tone="info" icon={<FileTextIcon size={12} />}>
                            Comprobante por revisar
                          </Badge>
                        ) : (
                          <Badge tone={pay.tone}>{pay.label}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={r.status} size="sm" />
                      </td>
                      <td className="pr-3 text-ink-subtle">
                        <ChevronRightIcon size={16} className="transition-transform duration-150 motion-safe:group-hover:translate-x-0.5" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <ul className="flex flex-col gap-2.5 lg:hidden">
            {list.slice(0, limit).map((r) => {
              const x = rowOf(r, cabinLabel);
              const pay = paymentState(r);
              return (
                <li key={r.code}>
                  <Link href={paths.reserva(r.code)} className="flex w-full flex-col gap-1.5 rounded-2xl border border-line bg-panel p-4 text-left shadow-panel transition-colors hover:bg-canvas/60">
                    <span className="flex w-full items-center justify-between gap-2">
                      <strong className="text-[13px] font-bold text-ink-muted">{x.code}</strong>
                      <StatusPill status={r.status} size="sm" />
                    </span>
                    <span className="text-[15px] font-semibold text-ink">{x.name}</span>
                    <span className="text-[13px] text-ink-muted">{`${x.cabin} · ${x.dates}`}</span>
                    <span className="flex w-full flex-wrap items-center justify-between gap-2 text-[13px]">
                      {proofCodes.has(r.code) ? <Badge tone="info">Comprobante por revisar</Badge> : <Badge tone={pay.tone}>{pay.label}</Badge>}
                      <strong className="font-semibold text-ink tabular-nums">{x.total}</strong>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {list.length > limit && (
            <Button className="self-center" onClick={() => setLimit(limit + PAGE)}>
              Mostrar {Math.min(PAGE, list.length - limit)} más
            </Button>
          )}
        </>
      ) : (
        <Card className="p-4">
          <EmptyState
            icon={<SearchIcon size={18} />}
            title={active ? "No hay reservas con esos filtros" : "Aún no hay reservas"}
            text={active ? "Prueba con otro estado, otras fechas u otro término de búsqueda." : "Las reservas que lleguen desde el sitio aparecerán aquí."}
            action={active ? <Button onClick={clear}>Limpiar filtros</Button> : undefined}
          />
        </Card>
      )}
    </>
  );
}
