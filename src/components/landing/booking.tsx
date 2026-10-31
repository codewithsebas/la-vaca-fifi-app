"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { touches, useAvailabilitySync } from "@/lib/availability-sync";
import { config, type Cabin, type CabinTypeId } from "@/lib/config";
import { addDays, cop, fmtDate, monthStart, nightsBetween, plural, todayISO } from "@/lib/format";
import type { Availability } from "@/lib/types";
import { RangeCalendar } from "@/components/range-calendar";
import { SwitchTrack } from "@/components/ui/choice";
import { useSite } from "@/components/site-provider";
import { ArrowRightIcon, CalendarIcon, HomeIcon, MinusIcon, PlusIcon, UsersIcon } from "@/components/icons";

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
      className="btn btn-highlight min-h-[52px] px-7"
    >
      Reservar
    </button>
  );
}

function fieldStyle(focused: boolean, filled: boolean) {
  return {
    border: focused ? "border-on-light" : filled ? "border-on-light/40" : "border-on-light/15",
    bg: filled || focused ? "bg-card" : "bg-card-muted",
    ring: focused ? "shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-highlight)_50%,transparent)]" : "",
    value: filled ? "font-extrabold text-on-light" : "font-medium text-on-light-muted",
    icon: filled ? "border-2 border-on-light bg-highlight text-on-light" : "bg-transparent text-on-light",
  };
}

function PillField({
  label,
  value,
  focused,
  filled,
  icon,
  popup,
  onClick,
}: {
  label: string;
  value: string;
  focused: boolean;
  filled: boolean;
  icon: ReactNode;
  popup: "dialog" | "listbox";
  onClick: () => void;
}) {
  const f = fieldStyle(focused, filled);
  return (
    <button
      type="button"
      aria-haspopup={popup}
      aria-expanded={focused}
      onClick={onClick}
      className={`flex min-h-16 min-w-0 flex-1 items-center justify-between gap-3 rounded-full border-2 py-2 pr-2.5 pl-[22px] text-left text-on-light transition-[box-shadow,background-color] duration-200 ${f.border} ${f.bg} ${f.ring}`}
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-[.74rem] font-bold tracking-[.06em] uppercase">{label}</span>
        <span className={`truncate ${f.value}`}>{value}</span>
      </span>
      <span aria-hidden="true" className={`grid size-10 flex-none place-items-center rounded-full ${f.icon}`}>
        {icon}
      </span>
    </button>
  );
}

function Switch({ label, on, note, onToggle }: { label: string; on: boolean; note: string; onToggle: () => void }) {
  const f = fieldStyle(false, on);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`flex min-h-16 items-center justify-between gap-3 rounded-full border-2 py-2 pr-3.5 pl-[22px] text-left text-on-light ${f.border} ${f.bg}`}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[.74rem] font-bold tracking-[.06em] uppercase">{label}</span>
        <span className={f.value}>
          {on ? "Sí" : "No"} <span className="text-[.82rem] font-medium">· {note}</span>
        </span>
      </span>
      <SwitchTrack on={on} />
    </button>
  );
}

const popover =
  "absolute top-[calc(100%+10px)] left-0 z-40 rounded-[22px] border-[2.5px] border-on-dark bg-card text-on-light shadow-[4px_4px_0_var(--color-on-dark)]";

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
    // Una calcomanía grande, separada del cartel de la portada (no se monta sobre las flores). scroll-mt: al llegar
    // con «Reservar» (#reserva), el módulo queda con aire bajo la barra fija en vez de pegado a ella.
    <section
      id="reserva"
      aria-labelledby="reserva-title"
      className="relative z-5 mt-[clamp(20px,3vw,40px)] scroll-mt-[calc(var(--header-offset,76px)+16px)] gutter-1360"
    >
      <div ref={ref} className="sticker flex flex-col gap-5 rounded-[30px] bg-card p-[calc(16px_+_1cqi)] text-on-light">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-1">
          <h2 id="reserva-title" className="display text-[clamp(1.9rem,3vw,2.4rem)] leading-none">
            Reserva tu cabaña
          </h2>
          <p className="max-w-[48ch] text-[.9rem] font-semibold">
            Elige fechas, cabaña y huéspedes: ves el total al instante y reservas en línea con un abono del {config.depositPct} %.
          </p>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,330px),1fr))] gap-3">
          <div data-popover-root="dates" className="relative flex">
            <PillField
              label="Llegada"
              value={s.checkIn ? fmtDate(s.checkIn) : "Elegir fecha"}
              focused={datesFocused && s.pick === "in"}
              filled={!!s.checkIn}
              popup="dialog"
              icon={<CalendarIcon />}
              onClick={() => (datesFocused && s.pick === "in" ? set({ open: null }) : openDates("in"))}
            />
            {datesFocused && s.view && (
              <div
                role="dialog"
                aria-label="Elegir fechas"
                className={`${popover} flex w-[372px] max-w-[calc(100cqi-32px)] flex-col gap-2.5 p-4 max-sm:right-0 max-sm:w-auto`}
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
                />
                <p className="flex items-center gap-1.5 text-[.78rem] font-semibold">
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
                <div className="dotted-top flex flex-wrap items-center justify-between gap-2 pt-2.5">
                  <span className="text-[.82rem] font-semibold">
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
                      className="min-h-11 rounded-full px-4 font-bold underline"
                    >
                      Limpiar
                    </button>
                    <button type="button" onClick={() => set({ open: null })} className="btn btn-cta min-h-11 px-5 font-bold">
                      Listo
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div data-popover-root="dates" className="relative flex">
            <PillField
              label="Salida"
              value={s.checkOut ? fmtDate(s.checkOut) : "Elegir fecha"}
              focused={datesFocused && s.pick === "out"}
              filled={!!s.checkOut}
              popup="dialog"
              icon={<CalendarIcon variant="check" />}
              onClick={() => (datesFocused && s.pick === "out" ? set({ open: null }) : openDates(s.checkIn ? "out" : "in"))}
            />
          </div>

          <div data-popover-root="type" className="relative flex">
            <PillField
              label="Tipo de cabaña"
              value={cab.name}
              focused={s.open === "type"}
              filled
              popup="listbox"
              icon={<HomeIcon />}
              onClick={() => set({ open: s.open === "type" ? null : "type" })}
            />
            {s.open === "type" && (
              <div role="listbox" aria-label="Tipo de cabaña" className={`${popover} right-0 flex min-w-[min(320px,calc(100cqi-32px))] flex-col gap-1.5 p-2.5`}>
                {cabins.map((c) => {
                  const sel = s.type === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={sel}
                      onClick={() => selectCabin(c.id)}
                      className={`flex min-h-[60px] items-center justify-between gap-3 rounded-sm border-2 px-4 py-2.5 text-left text-on-light hover:bg-card-muted ${sel ? "border-on-light bg-card-muted" : "border-transparent"}`}
                    >
                      <span className="flex flex-col">
                        <strong className="text-[.95rem]">{c.full}</strong>
                        <span className="text-[.8rem]">{`${cop(c.couple)} la noche para 2 personas · máx. ${c.max} personas`}</span>
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

          <div data-popover-root="guests" className="relative flex">
            <PillField
              label="Huéspedes"
              value={guestsTxt}
              focused={s.open === "guests"}
              filled
              popup="dialog"
              icon={<UsersIcon />}
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
                      className="btn-icon size-11 border-2 border-on-light disabled:opacity-35"
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
                      className="btn-icon size-11 border-2 border-on-light disabled:opacity-35"
                    >
                      <PlusIcon />
                    </button>
                  </div>
                </div>
                <p className="rounded-sm bg-card-muted px-3 py-2.5 text-[.8rem]">{`La tarifa incluye 2 personas. Desde la 3.ª persona se suman ${cop(cab.extra)} por persona, por noche.`}</p>
                <button type="button" onClick={() => set({ open: null })} className="btn btn-cta min-h-12 font-bold">
                  Listo
                </button>
              </div>
            )}
          </div>

          <Switch label="Mascota" note="sin costo" on={s.pet} onToggle={() => set({ pet: !s.pet, open: null })} />
          <Switch label="Decoración para ocasión especial" note="valor adicional" on={s.deco} onToggle={() => set({ deco: !s.deco, open: null })} />
        </div>

        {s.notice && (
          <p
            role="status"
            className="rounded-[18px] border-2 border-on-light bg-[color-mix(in_srgb,var(--color-highlight)_45%,var(--color-card))] px-[18px] py-3 text-[.9rem] font-bold"
          >
            {s.notice}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] border-[2.5px] border-dashed border-on-light/30 bg-bg px-5 py-4">
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
            <span className="text-[.74rem] font-bold tracking-[.06em] uppercase">Total estimado</span>
            <strong className="display text-[2.6rem] leading-none">{totalLabel}</strong>
            <span className="text-[.86rem] font-semibold">{summary}</span>
            {s.deco && <span className="text-[.84rem]">Decoración especial: valor adicional, se cotiza por WhatsApp.</span>}
            <span className="mt-1.5 text-[.8rem]">Precio estimado. La reserva se confirma con un abono del {config.depositPct} % (no reembolsable).</span>
          </div>
          {/* «Continuar» lleva directo a «Tus datos» si la cabaña tiene cupo; «Ver disponibilidad» compara todas las cabañas en esas fechas. */}
          <div className="flex w-full flex-[0_1_auto] flex-col items-stretch gap-2 sm:w-auto sm:min-w-[280px]">
            <Link href={`/reservar?${rq}&paso=datos`} onClick={needDates} className="btn btn-cta min-h-16 px-7 text-center">
              Continuar con la reserva
              <ArrowRightIcon />
            </Link>
            <Link
              href={`/reservar?${rq}${s.checkIn && s.checkOut ? "&paso=cabana" : ""}`}
              className="btn btn-outline-light min-h-12 px-6 text-center text-[.95rem] hover:bg-card"
            >
              Ver disponibilidad
            </Link>
          </div>
        </div>
        {s.error && s.open !== "dates" && (
          <p role="alert" className="px-2 font-bold">
            {s.error}
          </p>
        )}
      </div>
    </section>
  );
}
