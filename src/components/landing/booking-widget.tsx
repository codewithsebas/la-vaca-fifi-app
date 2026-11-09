"use client";

import { personRatesText } from "@/lib/booking";
import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/client/api";
import { touches, useAvailabilitySync } from "@/lib/client/availability-sync";
import { type Cabin, type CabinTypeId } from "@/lib/config";
import { addDays, cop, fmtDate, monthStart, nightsBetween, plural, todayISO } from "@/lib/format";
import type { Availability } from "@/lib/types";
import { RangeCalendar } from "@/components/booking/range-calendar";
import { onOpenBooking, publishBookingSummary } from "@/components/landing/booking-bus";
import { SwitchTrack } from "@/components/ui/choice";
import { useSite } from "@/components/site/site-provider";
import { MinusIcon, PlusIcon } from "@/components/ui/icons";

type Popover = "dates" | "type" | "guests" | null;

type BookingState = {
  open: Popover;
  pick: "in" | "out";
  checkIn: string | null;
  checkOut: string | null;
  view: string | null;
  type: CabinTypeId;
  guests: number;
  pet: boolean;
  deco: boolean;
  notice: string;
  error: string;
};

type Ctx = {
  s: BookingState;
  cabins: Cabin[];
  cabinOf: (id: CabinTypeId) => Cabin;
  set: (p: Partial<BookingState>) => void;
  selectCabin: (k: CabinTypeId) => void;
};

const BookingCtx = createContext<Ctx | null>(null);
const useBooking = () => useContext(BookingCtx)!;

// Estado compartido entre el formulario de reserva y los botones "Reservar" de las cabañas.
// `cabins` llega del servidor con las tarifas vigentes.
export function BookingProvider({ cabins, children }: { cabins: Cabin[]; children: ReactNode }) {
  const [s, setS] = useState<BookingState>({
    open: null,
    pick: "in",
    checkIn: null,
    checkOut: null,
    view: null,
    type: cabins[0]?.id ?? "",
    guests: 2,
    pet: false,
    deco: false,
    notice: "",
    error: "",
  });
  const cabinOf = (id: CabinTypeId) => cabins.find((c) => c.id === id) ?? cabins[0];
  const set = (p: Partial<BookingState>) => setS((prev) => ({ ...prev, ...p }));
  const selectCabin = (k: CabinTypeId) => {
    const c = cabinOf(k);
    setS((prev) =>
      prev.guests > c.max
        ? { ...prev, type: k, guests: c.max, open: null, notice: `El ${c.full} admite máximo ${c.max} personas. Ajustamos a ${c.max} huéspedes.` }
        : { ...prev, type: k, open: null, notice: "" },
    );
  };
  return <BookingCtx.Provider value={{ s, cabins, cabinOf, set, selectCabin }}>{children}</BookingCtx.Provider>;
}

export function CabinReserveButton({ cabin }: { cabin: CabinTypeId }) {
  const { cabinOf, selectCabin } = useBooking();
  return (
    <button
      type="button"
      aria-label={`Reservar ${cabinOf(cabin).full}`}
      onClick={() => {
        selectCabin(cabin);
        const el = document.getElementById("reserva");
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 16, behavior: "smooth" });
      }}
      className="btn btn-card min-h-10 px-4 text-[.9rem]"
    >
      Reservar
    </button>
  );
}

// Una celda del cuadro de la tarjeta de reserva: la etiqueta en mayúsculas pequeñas y el valor debajo. Abierta, la
// celda queda enmarcada en tinta.
function PillField({
  label,
  value,
  focused,
  filled,
  popup,
  onClick,
}: {
  label: string;
  value: string;
  focused: boolean;
  filled: boolean;
  popup: "dialog" | "listbox";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-haspopup={popup}
      aria-expanded={focused}
      onClick={onClick}
      className={`flex min-h-[52px] w-full min-w-0 flex-col justify-center rounded-[inherit] px-3.5 py-1.5 text-left text-on-light ${focused ? "relative z-1 bg-card ring-2 ring-on-dark" : "hover:bg-bg/70"}`}
    >
      <span className="text-[.66rem] font-black tracking-[.04em] uppercase">{label}</span>
      <span className={`truncate text-[.92rem] ${filled ? "text-on-light" : "text-on-light-muted"}`}>{value}</span>
    </button>
  );
}

function Switch({ label, on, note, onToggle }: { label: string; on: boolean; note: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex min-h-11 items-center justify-between gap-3 py-1 text-left text-on-light"
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-[.92rem] font-bold">{label}</span>
        <span className="text-[.8rem] text-on-light-muted">{note}</span>
      </span>
      <SwitchTrack on={on} />
    </button>
  );
}

const popover = "absolute top-[calc(100%+8px)] left-0 z-40 rounded-2xl border border-(--line) bg-card text-on-light shadow-[0_6px_24px_rgb(0_0_0/0.18)]";

export function BookingWidget() {
  const { s, cabins, cabinOf, set, selectCabin } = useBooking();
  const { c } = useSite();
  const ref = useRef<HTMLDivElement>(null);
  const [quote, setQuote] = useState<{ key: string; avail: Availability | null } | null>(null);
  // Contadores que fuerzan una nueva consulta cuando llega un aviso de disponibilidad en tiempo real.
  const [quoteRev, setQuoteRev] = useState(0);
  const [marksRev, setMarksRev] = useState(0);
  const [marks, setMarks] = useState<{ key: string; days: Record<string, boolean> } | null>(null);

  const cab = cabinOf(s.type);
  const nights = s.checkIn && s.checkOut ? nightsBetween(s.checkIn, s.checkOut) : 0;
  const quoteKey = s.checkIn && s.checkOut ? `${s.checkIn}|${s.checkOut}|${s.guests}` : null;

  useEffect(() => {
    if (!quoteKey || !s.checkIn || !s.checkOut) return;
    let live = true;
    api
      .availability({ checkIn: s.checkIn, checkOut: s.checkOut, adults: s.guests, children: 0 })
      .then((r) => live && setQuote({ key: quoteKey, avail: r.status === 200 ? r.data : null }))
      .catch(() => live && setQuote({ key: quoteKey, avail: null }));
    return () => {
      live = false;
    };
  }, [quoteKey, s.checkIn, s.checkOut, s.guests, quoteRev]);

  // Noches sin cupo de la cabaña elegida en el mes visible del calendario (al abrirlo, al cambiar de mes o de cabaña).
  const monthEnd = (v: string) => addDays(monthStart(addDays(v, 32)), -1);
  const marksKey = s.open === "dates" && s.view ? `${s.type}|${s.view}` : null;
  useEffect(() => {
    if (!marksKey || !s.view) return;
    let live = true;
    api
      .calendar({ cabinTypeId: s.type, from: s.view, to: monthEnd(s.view) })
      .then(
        (r) => live && setMarks({ key: marksKey, days: Object.fromEntries((r.status === 200 ? (r.data?.unavailableDates ?? []) : []).map((d) => [d, true])) }),
      )
      .catch(() => live && setMarks({ key: marksKey, days: {} }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marksKey, marksRev]);
  const unavailable = marks && marks.key === marksKey ? marks.days : null;

  // Tiempo real: solo mientras el visitante elige fechas o ya las eligió (así no se abre una conexión por cada visita).
  useAvailabilitySync(
    (changes) => {
      if (marksKey && s.view && touches(changes, s.view, monthEnd(s.view), s.type)) setMarksRev((n) => n + 1);
      if (s.checkIn && s.checkOut && touches(changes, s.checkIn, addDays(s.checkOut, -1))) setQuoteRev((n) => n + 1);
    },
    s.open === "dates" || !!(s.checkIn && s.checkOut),
  );

  useEffect(() => {
    if (!s.open) return;
    // Un toque o clic en cualquier parte fuera del desplegable abierto y de su campo lo cierra (también dentro de la
    // tarjeta). Llegada y Salida comparten el calendario: tocar la otra fecha no lo cierra, cambia de fecha.
    const onDoc = (e: PointerEvent) => {
      const root = (e.target as Element | null)?.closest?.("[data-popover-root]");
      if (root?.getAttribute("data-popover-root") !== s.open) set({ open: null });
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && set({ open: null });
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.open]);

  // El buscador del encabezado abre una parte de la tarjeta: primero la trae a la vista (si no se ve entera) y luego
  // abre la llegada en el calendario, el tipo de cabaña o los huéspedes.
  useEffect(
    () =>
      onOpenBooking((part) => {
        const el = document.getElementById("reserva");
        if (!el) return;
        const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-offset")) || 80;
        const r = el.getBoundingClientRect();
        const hidden = r.top < bar || r.bottom > window.innerHeight;
        if (hidden) {
          const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
          window.scrollTo({ top: Math.max(0, window.scrollY + r.top - bar - 16), behavior: reduce ? "instant" : "smooth" });
        }
        const open = () => {
          if (part === "dates") set({ open: "dates", pick: "in", view: s.checkIn ? monthStart(s.checkIn) : (s.view ?? monthStart(todayISO())), error: "" });
          else if (part) set({ open: part });
        };
        if (hidden) setTimeout(open, 450);
        else open();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.checkIn, s.view],
  );

  // Lo elegido, para el buscador del encabezado.
  useEffect(() => {
    if (!cab) return;
    publishBookingSummary({
      dates: s.checkIn && s.checkOut ? `${fmtDate(s.checkIn)} – ${fmtDate(s.checkOut)}` : s.checkIn ? `Desde ${fmtDate(s.checkIn)}` : undefined,
      cabin: cab.name,
      guests: `${s.guests} huésped${s.guests > 1 ? "es" : ""}`,
    });
  }, [s.checkIn, s.checkOut, s.guests, cab]);

  if (!cab) return null; // sin cabañas activas no hay nada que cotizar

  const today = todayISO();
  const openDates = (pick: "in" | "out") => set({ open: "dates", pick, view: s.checkIn ? monthStart(s.checkIn) : (s.view ?? monthStart(today)) });
  // No se puede elegir un rango con noches sin cupo para la cabaña elegida (el servidor lo vuelve a validar al reservar).
  const pickDate = (iso: string) => {
    if (s.pick === "in" || !s.checkIn || iso <= s.checkIn) {
      if (unavailable?.[iso]) return;
      set({ checkIn: iso, checkOut: null, pick: "out", error: "" });
      return;
    }
    for (let x = s.checkIn; x < iso; x = addDays(x, 1))
      if (unavailable?.[x]) {
        set({ error: `La noche del ${fmtDate(x)} no tiene cupo en el ${cab.full}. Elige otra fecha de salida o cambia de cabaña.` });
        return;
      }
    set({ checkOut: iso, open: null, error: "" });
  };

  // Mientras la cotización no corresponda a las fechas actuales, está en curso.
  const live = quote && quote.key === quoteKey ? quote : null;
  const qOpt = nights && live?.avail ? live.avail.options.find((o) => o.cabinTypeId === s.type) : undefined;
  const qq = qOpt?.available ? qOpt.quote : null;
  const nightsTxt = nights ? plural(nights, "noche", "noches") : "";
  const guestsTxt = `${s.guests} huésped${s.guests > 1 ? "es" : ""}`;

  const totalLabel = !nights ? "—" : !live ? "Calculando…" : qq ? cop(qq.total) : qOpt ? "Sin cupo" : "—";
  const summary = !nights
    ? "Elige llegada y salida para calcular el total."
    : !live
      ? "Consultando disponibilidad…"
      : qq
        ? `${cab.full} · ${guestsTxt} · ${nightsTxt}: ${cop(qq.base)}${qq.extraGuests ? ` + ${plural(qq.extraGuests, "persona adicional", "personas adicionales")} (${cop(qq.extraAmount)})` : ""}`
        : qOpt
          ? "Sin disponibilidad en estas fechas para esta cabaña. Prueba otra cabaña o cambia las fechas."
          : "No pudimos calcular el total en este momento.";

  const rq = new URLSearchParams();
  if (s.checkIn) rq.set("checkIn", s.checkIn);
  if (s.checkOut) rq.set("checkOut", s.checkOut);
  rq.set("adults", String(s.guests));
  rq.set("children", "0");
  rq.set("type", s.type);
  if (s.pet) rq.set("pet", "1");
  if (s.deco) rq.set("deco", "1");

  // Sin fechas no se puede seguir: se abre el calendario y se explica por qué.
  const needDates = (e: { preventDefault: () => void }) => {
    if (s.checkIn && s.checkOut) return;
    e.preventDefault();
    openDates(s.checkIn ? "out" : "in");
    set({ error: "Elige las fechas de llegada y salida para continuar." });
  };

  const datesFocused = s.open === "dates";

  return (
    // Tarjeta de reserva lateral: el precio arriba, el cuadro de fechas, cabaña y huéspedes, los extras, el botón y el
    // desglose del total. En escritorio queda fija junto al contenido (app/page.tsx). scroll-mt: al llegar con
    // «Reservar» (#reserva) queda con aire bajo la barra fija.
    <section id="reserva" aria-labelledby="reserva-title" className="scroll-mt-[calc(var(--header-offset,80px)+24px)]">
      <div
        ref={ref}
        className="relative flex flex-col gap-3.5 rounded-2xl border border-(--line) bg-card p-5 pt-6 text-on-light shadow-[0_6px_16px_rgb(0_0_0/0.12)]"
      >
        <span aria-hidden="true" className="railing absolute inset-x-0 top-0 h-1.5 rounded-t-2xl" />
        <h2 id="reserva-title" className="sr-only">
          Reserva tu cabaña
        </h2>
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          {qq ? (
            <>
              <strong className="text-[1.4rem] font-extrabold tabular-nums">{cop(qq.total)}</strong>
              <span className="text-on-light-muted">{`por ${nightsTxt}`}</span>
            </>
          ) : (
            <>
              <strong className="text-[1.4rem] font-extrabold tabular-nums">{cop(cab.couple)}</strong>
              <span className="text-on-light-muted">{`noche para ${cab.fromGuests ?? 2}`}</span>
            </>
          )}
        </p>

        <div className="grid grid-cols-2 rounded-xl border border-on-dark/35">
          <div data-popover-root="dates" className="relative flex rounded-tl-xl border-r border-on-dark/35">
            <PillField
              label="Llegada"
              value={s.checkIn ? fmtDate(s.checkIn) : "Elegir fecha"}
              focused={datesFocused && s.pick === "in"}
              filled={!!s.checkIn}
              popup="dialog"
              onClick={() => (datesFocused && s.pick === "in" ? set({ open: null }) : openDates("in"))}
            />
            {datesFocused && s.view && (
              <div
                role="dialog"
                aria-label="Elegir fechas"
                className={`${popover} flex w-[316px] max-w-[calc(100cqi-32px)] flex-col gap-2 p-3.5 max-sm:right-0 max-sm:w-auto`}
              >
                <RangeCalendar
                  view={s.view}
                  today={today}
                  checkIn={s.checkIn}
                  checkOut={s.checkOut}
                  pick={s.pick}
                  unavailable={unavailable ?? {}}
                  loading={!unavailable}
                  hint={s.pick === "in" ? "Elige el día de llegada" : "Ahora elige el día de salida"}
                  onPick={pickDate}
                  onMonth={(view) => set({ view })}
                  compact
                />
                <p className="flex items-center gap-1.5 text-[.74rem] font-medium">
                  <span aria-hidden="true" className="font-extrabold line-through opacity-50">
                    12
                  </span>
                  {`Sin cupo en el ${cab.full}`}
                </p>
                {s.error && (
                  <p role="alert" className="text-[.86rem] font-bold text-error">
                    {s.error}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-(--line) pt-2.5">
                  <span className="text-[.76rem] font-medium">
                    {nights && s.checkIn && s.checkOut
                      ? `${nightsTxt} · ${fmtDate(s.checkIn)} → ${fmtDate(s.checkOut)}`
                      : s.checkIn
                        ? `Llegada: ${fmtDate(s.checkIn)}`
                        : `Check-in ${c.checkIn}`}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => set({ checkIn: null, checkOut: null, pick: "in" })}
                      className="min-h-9 rounded-full px-3 text-[.86rem] font-semibold underline"
                    >
                      Limpiar
                    </button>
                    <button type="button" onClick={() => set({ open: null })} className="btn btn-cta min-h-9 px-4 text-[.86rem] font-bold">
                      Listo
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div data-popover-root="dates" className="relative flex rounded-tr-xl">
            <PillField
              label="Salida"
              value={s.checkOut ? fmtDate(s.checkOut) : "Elegir fecha"}
              focused={datesFocused && s.pick === "out"}
              filled={!!s.checkOut}
              popup="dialog"
              onClick={() => (datesFocused && s.pick === "out" ? set({ open: null }) : openDates(s.checkIn ? "out" : "in"))}
            />
          </div>

          <div data-popover-root="type" className="relative col-span-2 flex border-t border-on-dark/35">
            <PillField
              label="Tipo de cabaña"
              value={cab.name}
              focused={s.open === "type"}
              filled
              popup="listbox"
              onClick={() => set({ open: s.open === "type" ? null : "type" })}
            />
            {s.open === "type" && (
              <div role="listbox" aria-label="Tipo de cabaña" className={`${popover} right-0 flex flex-col gap-1.5 p-2.5`}>
                {cabins.map((c) => {
                  const sel = s.type === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={sel}
                      onClick={() => selectCabin(c.id)}
                      className={`flex min-h-[60px] items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left text-on-light hover:bg-bg ${sel ? "border-cta/50 bg-cta/5" : "border-transparent"}`}
                    >
                      <span className="flex flex-col">
                        <strong className="text-[.95rem]">{c.full}</strong>
                        <span className="text-[.8rem]">{`${cop(c.couple)} la noche para ${c.fromGuests ?? 2} personas · máx. ${c.max} personas`}</span>
                      </span>
                      <span aria-hidden="true" className={`font-extrabold ${sel ? "" : "opacity-0"}`}>
                        ✓
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div data-popover-root="guests" className="relative col-span-2 flex rounded-b-xl border-t border-on-dark/35">
            <PillField
              label="Huéspedes"
              value={guestsTxt}
              focused={s.open === "guests"}
              filled
              popup="dialog"
              onClick={() => set({ open: s.open === "guests" ? null : "guests" })}
            />
            {s.open === "guests" && (
              <div role="dialog" aria-label="Número de huéspedes" className={`${popover} right-0 flex flex-col gap-3 p-4`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <strong className="text-[.95rem]">Huéspedes</strong>
                    <span className="text-[.8rem]">{`Máximo ${cab.max} en ${cab.full}`}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      aria-label="Quitar un huésped"
                      disabled={s.guests <= 1}
                      onClick={() => set({ guests: Math.max(1, s.guests - 1), notice: "" })}
                      className="btn-icon size-11 border border-(--line-strong) hover:border-on-light disabled:opacity-35"
                    >
                      <MinusIcon />
                    </button>
                    <span aria-live="polite" className="min-w-5 text-center text-[1.1rem] font-extrabold">
                      {s.guests}
                    </span>
                    <button
                      type="button"
                      aria-label="Añadir un huésped"
                      disabled={s.guests >= cab.max}
                      onClick={() => set({ guests: Math.min(cab.max, s.guests + 1), notice: "" })}
                      className="btn-icon size-11 border border-(--line-strong) hover:border-on-light disabled:opacity-35"
                    >
                      <PlusIcon />
                    </button>
                  </div>
                </div>
                <p className="rounded-xl bg-bg px-3 py-2.5 text-[.8rem]">
                  {cab.tiers
                    ? `Precio por noche: ${personRatesText(cab.tiers)}.`
                    : `La tarifa incluye 2 personas. Desde la 3.ª persona se suman ${cop(cab.extra)} por persona, por noche.`}
                </p>
                <button type="button" onClick={() => set({ open: null })} className="btn btn-cta min-h-12 font-bold">
                  Listo
                </button>
              </div>
            )}
          </div>
        </div>

        {s.notice && (
          <p role="status" className="rounded-xl bg-highlight/25 px-4 py-3 text-[.88rem] font-semibold">
            {s.notice}
          </p>
        )}

        <div className="flex flex-col divide-y divide-(--line)">
          <Switch label="Mascota" note="Sin costo" on={s.pet} onToggle={() => set({ pet: !s.pet, open: null })} />
          <Switch
            label="Decoración especial"
            note="Para una ocasión especial · valor adicional"
            on={s.deco}
            onToggle={() => set({ deco: !s.deco, open: null })}
          />
        </div>

        {/* «Continuar» lleva directo a «Tus datos» si la cabaña tiene cupo; «Ver disponibilidad» compara todas las cabañas en esas fechas. */}
        <Link href={`/reservar?${rq}&paso=datos`} onClick={needDates} className="btn btn-cta min-h-12 w-full px-6 text-[1rem]">
          {nights ? "Continuar con la reserva" : "Elegir fechas"}
        </Link>
        {s.error && s.open !== "dates" && (
          <p role="alert" className="text-[.88rem] font-bold text-error">
            {s.error}
          </p>
        )}
        <p className="text-center text-[.82rem] text-on-light-muted">La reserva se confirma con un abono del {c.depositPct} % (no reembolsable).</p>

        {/* Desglose del total */}
        {nights > 0 && (
          <div className="flex flex-col gap-2.5 text-[.94rem]">
            {qq ? (
              <>
                <p className="flex justify-between gap-4">
                  <span className="underline decoration-on-light/30 underline-offset-2">{`${cab.full} · ${nightsTxt}`}</span>
                  <span className="tabular-nums">{cop(qq.base)}</span>
                </p>
                {qq.extraGuests > 0 && (
                  <p className="flex justify-between gap-4">
                    <span className="underline decoration-on-light/30 underline-offset-2">
                      {plural(qq.extraGuests, "persona adicional", "personas adicionales")}
                    </span>
                    <span className="tabular-nums">{cop(qq.extraAmount)}</span>
                  </p>
                )}
                {s.deco && <p className="text-[.84rem] text-on-light-muted">Decoración especial: valor adicional, se cotiza por WhatsApp.</p>}
                <p className="flex justify-between gap-4 border-t border-(--line) pt-3 font-extrabold">
                  <span>Total estimado</span>
                  <span className="tabular-nums">{totalLabel}</span>
                </p>
              </>
            ) : (
              <p className="text-on-light-muted">{summary}</p>
            )}
          </div>
        )}
        <Link
          href={`/reservar?${rq}${s.checkIn && s.checkOut ? "&paso=cabana" : ""}`}
          className="self-center text-[.9rem] font-bold text-on-light underline underline-offset-2 hover:text-cta"
        >
          Ver disponibilidad de todas las cabañas
        </Link>
      </div>
    </section>
  );
}
