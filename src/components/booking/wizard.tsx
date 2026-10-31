"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, resetIdem, type ApiError, type ValidationError } from "@/lib/client/api";
import { touches, useAvailabilitySync, type AvailabilityChanges } from "@/lib/client/availability-sync";
import { config, isMockApi, type CabinTypeId } from "@/lib/config";
import { addDays, cop, fmtDate, fmtLong, isISO, monthStart, nightsBetween, plural, todayISO, wa } from "@/lib/format";
import { saveLastReservation } from "@/lib/client/last-reservation";
import { HOLD_MINUTES } from "@/lib/payments";
import type { Availability, CabinType, DocType, FieldErrors, PaymentStart, PublicReservation, ReservationInput } from "@/lib/types";
import { GiftIcon, MinusIcon, PawIcon, PlusIcon, WhatsAppIcon } from "@/components/ui/icons";
import { PhotoSlot } from "@/components/site/photo-slot";
import { RangeCalendar } from "@/components/booking/range-calendar";
import { CheckOption, ToggleCard } from "@/components/ui/choice";
import { Combobox } from "@/components/ui/combobox";
import { PlanChoice, payLabel, type Plan } from "@/components/booking/reservation-payments";
import { useSite } from "@/components/site/site-provider";
import { arrivalOptions } from "@/lib/site";

const STEPS = ["Fechas y huéspedes", "Cabaña", "Tus datos", "Revisar y pagar"];
const OCCASIONS: Record<string, string> = { aniversario: "Aniversario", cumpleanos: "Cumpleaños", propuesta: "Propuesta", otra: "Otra" };
// Errores del servidor (rutas del contrato) → campos del formulario.
const SERVER_FIELD: Record<string, string> = {
  "guest.fullName": "fullName",
  "guest.docType": "docType",
  "guest.docNumber": "docNumber",
  "guest.email": "email",
  "guest.phone": "phone",
  "guest.city": "city",
  estimatedArrival: "arrival",
  "pet.smallBreedConfirmed": "smallBreed",
  "decoration.occasion": "occasion",
  "consents.policies": "policies",
  "consents.dataProcessing": "dataProcessing",
};
const LABEL: Record<string, string> = {
  fullName: "Nombre completo",
  docType: "Tipo de documento",
  docNumber: "Número de documento",
  email: "Correo electrónico",
  phone: "Celular",
  city: "Ciudad de procedencia",
  arrival: "Hora estimada de llegada",
  smallBreed: "Mascota",
  occasion: "Ocasión",
  policies: "Políticas de reserva",
  dataProcessing: "Tratamiento de datos",
  checkIn: "Fechas",
  adults: "Huéspedes",
  cabinTypeId: "Cabaña",
  specialRequests: "Solicitudes especiales",
  captchaToken: "Verificación antispam",
};
const FIELD_ID: Record<string, string> = {
  fullName: "f-name",
  docType: "f-doctype",
  docNumber: "f-docnum",
  email: "f-email",
  phone: "f-phone",
  city: "f-city",
  arrival: "f-arrival",
  smallBreed: "f-smallbreed",
  occasion: "f-occasion",
  policies: "f-policies",
  dataProcessing: "f-data",
};
const ORDER = Object.keys(FIELD_ID);

type Form = {
  fullName: string;
  docType: DocType;
  docNumber: string;
  email: string;
  phone: string;
  city: string;
  arrival: string;
  hasPet: "no" | "si";
  smallBreed: boolean;
  decoRequested: boolean;
  occasion: string;
  decoNotes: string;
  specialRequests: string;
  policies: boolean;
  dataProcessing: boolean;
  marketing: boolean;
  website: string;
};

const EMPTY_FORM: Form = {
  fullName: "",
  docType: "CC",
  docNumber: "",
  email: "",
  phone: "",
  city: "",
  arrival: "",
  hasPet: "no",
  smallBreed: false,
  decoRequested: false,
  occasion: "",
  decoNotes: "",
  specialRequests: "",
  policies: false,
  dataProcessing: false,
  marketing: false,
  website: "",
};

function validate(f: Form): FieldErrors {
  const e: FieldErrors = {};
  const digits = f.phone.replace(/\D/g, "");
  if (f.fullName.trim().length < 3 || f.fullName.trim().indexOf(" ") < 0) e.fullName = "Escribe tu nombre y apellido.";
  const dn = f.docNumber.trim();
  if (!dn) e.docNumber = "Escribe el número de documento.";
  else if (f.docType === "CC" && !/^\d{6,10}$/.test(dn)) e.docNumber = "La cédula debe tener entre 6 y 10 dígitos, sin puntos.";
  else if (f.docType !== "CC" && !/^[A-Za-z0-9]{5,15}$/.test(dn)) e.docNumber = "Usa solo letras y números (5 a 15 caracteres).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = "Escribe un correo válido, por ejemplo nombre@correo.com.";
  if (!/^3\d{9}$/.test(digits)) e.phone = "El celular debe tener 10 dígitos y empezar por 3.";
  if (!f.city.trim()) e.city = "Escribe tu ciudad de procedencia.";
  if (!f.arrival) e.arrival = "Elige la hora estimada de llegada.";
  if (f.hasPet === "si" && !f.smallBreed) e.smallBreed = "Confirma que te haces responsable de tu mascota.";
  if (f.decoRequested && !f.occasion) e.occasion = "Elige la ocasión.";
  if (!f.policies) e.policies = "Debes aceptar las políticas de reserva.";
  if (!f.dataProcessing) e.dataProcessing = "Debes autorizar el tratamiento de tus datos.";
  return e;
}

// Celular de Colombia: solo dígitos, sin el indicativo si lo pegaron (57…), agrupado como 315 205 8712.
const phoneDigits = (v: string) => {
  let d = v.replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("57")) d = d.slice(2);
  return d.slice(0, 10);
};
const fmtPhone = (d: string) => [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join(" ");

const DOC_TYPES = [
  { value: "CC", label: "CC · Cédula de ciudadanía" },
  { value: "CE", label: "CE · Cédula de extranjería" },
  { value: "Pasaporte", label: "Pasaporte" },
  { value: "PPT", label: "PPT · Permiso por Protección Temporal" },
];

// Días sin ninguna cabaña libre, del mes visible y el siguiente.
async function unavailableDays(view: string, cabinIds: string[]) {
  const to = addDays(monthStart(addDays(view, 40)), -1);
  const rs = await Promise.all(cabinIds.map((id) => api.calendar({ cabinTypeId: id, from: view, to })));
  const sets = rs.map((r) => new Set(r.data?.unavailableDates ?? []));
  const days: Record<string, boolean> = {};
  for (let d = view; d <= to; d = addDays(d, 1)) days[d] = sets.every((s) => s.has(d));
  return days;
}

// Turnstile real solo con backend y clave configurada; si no, casilla simulada.
const captchaReal = !isMockApi && !!config.turnstileSiteKey && !config.turnstileSiteKey.includes("{");

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => void };
  }
}

function Field({
  id,
  label,
  error,
  errId,
  wide,
  children,
}: {
  id: string;
  label: ReactNode;
  error?: string;
  errId: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${wide ? "col-span-full" : ""}`}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
      <p id={errId} aria-live="polite" className="field-error">
        {error}
      </p>
    </div>
  );
}

function Counter({
  label,
  sub,
  count,
  decDisabled,
  incDisabled,
  onDec,
  onInc,
}: {
  label: string;
  sub: string;
  count: number;
  decDisabled: boolean;
  incDisabled: boolean;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="clear-both flex items-center justify-between gap-3 border-b-2 border-dotted border-card-muted py-2.5">
      <div className="flex flex-col">
        <strong className="text-[.95rem]">{label}</strong>
        <span className="text-[.8rem]">{sub}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          aria-label={`Quitar ${label.toLowerCase()}`}
          disabled={decDisabled}
          onClick={onDec}
          className="btn-icon size-11 border-2 border-on-light disabled:opacity-35"
        >
          <MinusIcon />
        </button>
        <span aria-live="polite" className="min-w-[22px] text-center text-[1.1rem] font-extrabold">
          {count}
        </span>
        <button
          type="button"
          aria-label={`Añadir ${label.toLowerCase()}`}
          disabled={incDisabled}
          onClick={onInc}
          className="btn-icon size-11 border-2 border-on-light disabled:opacity-35"
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}

const stepTitle = "display text-[2.2rem] leading-none";
const backBtn = "btn btn-outline-dark min-h-[52px] px-[22px] font-bold";
const nextBtn = "btn btn-card min-h-14 px-[30px] disabled:opacity-50";

export function ReservationWizard() {
  const router = useRouter();
  const { c, cabins, cabinName } = useSite();
  const cabinIds = cabins.map((x) => x.id).join(",");
  const arrivals = arrivalOptions(c.checkInStart, c.checkInEnd);
  const params = useSearchParams();
  const tsRef = useRef<HTMLDivElement>(null);
  const tsDone = useRef(false);
  const prevStep = useRef(1);
  // Números de secuencia: una respuesta vieja que llega tarde no pisa a una más nueva.
  const calSeq = useRef(0);
  const availSeq = useRef(0);
  // «Ver cabañas disponibles» mientras la consulta sigue en curso: se avanza apenas responda.
  const goNext = useRef(false);

  // Estado inicial desde la URL (la portada envía fechas, huéspedes y cabaña).
  const [init] = useState(() => {
    const t = todayISO();
    let ci = params.get("checkIn");
    let co = params.get("checkOut");
    if (!(isISO(ci) && ci >= t)) ci = null;
    if (!(ci && isISO(co) && co > ci)) co = null;
    const type = params.get("type");
    return {
      ci,
      co,
      adults: Math.min(6, Math.max(1, parseInt(params.get("adults") ?? "") || 2)),
      children: Math.max(0, parseInt(params.get("children") ?? "") || 0),
      type: type && cabins.some((x) => x.id === type) ? (type as CabinTypeId) : null,
      view: monthStart(ci || t),
      pick: (ci && !co ? "out" : "in") as "in" | "out",
      pet: params.get("pet") === "1",
      deco: params.get("deco") === "1",
      paso: params.get("paso"), // desde la portada: "cabana" (comparar cabañas) o "datos" (seguir con la cabaña elegida)
    };
  });

  // Con fechas válidas se empieza en «Cabaña»; con paso=datos se pasa a «Tus datos» si la cabaña elegida tiene cupo.
  const [step, setStep] = useState(() => (init.ci && init.co && (init.paso === "cabana" || (init.paso === "datos" && init.type)) ? 2 : 1));
  const jumpToData = useRef(init.paso === "datos" && !!(init.ci && init.co && init.type));
  const [types, setTypes] = useState<CabinType[]>([]);
  const [ci, setCi] = useState(init.ci);
  const [co, setCo] = useState(init.co);
  const [adults, setAdults] = useState(init.adults);
  const [children, setChildren] = useState(init.children);
  const [view, setView] = useState(init.view);
  const [pick, setPick] = useState(init.pick);
  const [unavail, setUnavail] = useState<Record<string, boolean>>({});
  const [calLoading, setCalLoading] = useState(true);
  const [rangeError, setRangeError] = useState("");
  const [avail, setAvail] = useState<Availability | null>(null);
  const [availLoading, setAvailLoading] = useState(!!(init.ci && init.co));
  const [availError, setAvailError] = useState(false);
  const [type, setType] = useState<CabinTypeId | null>(init.type);
  const [f, setF] = useState<Form>({ ...EMPTY_FORM, hasPet: init.pet ? "si" : "no", decoRequested: init.deco });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showErrSummary, setShowErrSummary] = useState(false);
  const [errFromServer, setErrFromServer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<null | "network" | "429" | "server" | "expired">(null);
  const [modal409, setModal409] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [captchaError, setCaptchaError] = useState(false);
  // Para confirmar: el abono (y el saldo después) o el total de una vez.
  const [plan, setPlan] = useState<Plan>("deposit");
  const [sumOpen, setSumOpen] = useState(false);
  const [waiting, setWaiting] = useState(false);
  // Aviso cuando la disponibilidad cambia en tiempo real y afecta lo que el huésped eligió.
  const [liveNotice, setLiveNotice] = useState<{ text: string; action?: "cabana" | "fechas" } | null>(null);
  // Selección actual para los callbacks asíncronos (respuestas de la API y avisos en tiempo real).
  const sel = useRef({ ci, co, step, type });
  useEffect(() => {
    sel.current = { ci, co, step, type };
  });

  const today = todayISO();

  // Las funciones fetch* solo actualizan estado al resolver; quien las llama marca la carga.
  // Días sin cabañas libres del mes visible y el siguiente. Si una fecha elegida se acaba de ocupar, se ajusta la selección.
  const fetchCal = useCallback(
    (v: string) => {
      const seq = ++calSeq.current;
      unavailableDays(v, cabinIds ? cabinIds.split(",") : []).then(
        (days) => {
          if (seq !== calSeq.current) return;
          setUnavail((prev) => ({ ...prev, ...days }));
          setCalLoading(false);
          const s = sel.current;
          if (s.step !== 1 || !s.ci) return;
          if (days[s.ci]) {
            setCi(null);
            setCo(null);
            setPick("in");
            setAvail(null);
            setLiveNotice({ text: `La noche del ${fmtDate(s.ci)} se acaba de ocupar. Elige otra fecha de llegada.` });
            return;
          }
          for (let x = s.ci; s.co && x < s.co; x = addDays(x, 1))
            if (days[x]) {
              setCo(null);
              setPick("out");
              setAvail(null);
              setLiveNotice({ text: `Alguien acaba de reservar la noche del ${fmtDate(x)}. Elige otra fecha de salida.` });
              return;
            }
        },
        () => seq === calSeq.current && setCalLoading(false),
      );
    },
    [setUnavail, setCalLoading, setCi, setCo, setPick, setAvail, setLiveNotice, cabinIds],
  );

  // Cabañas disponibles para las fechas y huéspedes. `silent`: actualización en tiempo real (sin esqueleto ni error visible).
  const fetchAvail = useCallback(
    (q: { ci: string; co: string; adults: number; children: number }, silent = false) => {
      const seq = ++availSeq.current;
      api
        .availability({ checkIn: q.ci, checkOut: q.co, adults: q.adults, children: q.children })
        .then((r) => {
          if (seq !== availSeq.current) return;
          if (r.status !== 200 || !r.data) throw 0;
          const data = r.data;
          const free = (id: string | null) => !!id && !!data.options.find((x) => x.cabinTypeId === id)?.available;
          setAvail(data);
          setAvailError(false);
          if (jumpToData.current) {
            jumpToData.current = false;
            if (free(init.type)) setStep(3);
          }
          if (goNext.current) {
            goNext.current = false;
            setWaiting(false);
            if (data.options.some((o) => o.available)) setStep(2);
          }
          // Si la cabaña elegida ya no está disponible, se deselecciona (y, si pasó en tiempo real, se avisa).
          const s = sel.current;
          if (s.type && !free(s.type)) {
            setType(null);
            if (silent && s.step >= 2) {
              const others = data.options.some((o) => o.available);
              setLiveNotice(
                others
                  ? { text: `${cabinName(s.type)} se acaba de ocupar en esas fechas. Elige otra cabaña.`, action: s.step > 2 ? "cabana" : undefined }
                  : { text: `${cabinName(s.type)} se acaba de ocupar y ya no quedan cabañas libres en esas fechas. Elige otras fechas.`, action: "fechas" },
              );
            }
          }
        })
        .catch(() => {
          if (seq !== availSeq.current || silent) return;
          setAvailError(true);
          goNext.current = false;
          setWaiting(false);
        })
        .finally(() => seq === availSeq.current && setAvailLoading(false));
    },
    [setAvail, setType, setAvailError, setAvailLoading, setStep, setWaiting, setLiveNotice, cabinName, init.type],
  );

  const loadCal = (v: string) => {
    setCalLoading(true);
    fetchCal(v);
  };
  const loadAvail = useCallback(
    (q: { ci: string; co: string; adults: number; children: number }) => {
      setAvailLoading(true);
      setAvailError(false);
      fetchAvail(q);
    },
    [fetchAvail, setAvailLoading, setAvailError],
  );

  useEffect(() => {
    api
      .cabinTypes()
      .then((r) => r.status === 200 && r.data && setTypes(r.data))
      .catch(() => {});
    fetchCal(init.view);
  }, [init, fetchCal]);

  // Con llegada y salida elegidas se consulta la disponibilidad enseguida: la acción del paso 1 ya sabe si hay cupo.
  useEffect(() => {
    if (!ci || !co) return;
    const t = setTimeout(() => loadAvail({ ci, co, adults, children }), 250);
    return () => clearTimeout(t);
  }, [ci, co, adults, children, loadAvail]);

  // Tiempo real: un cambio de ocupación en las fechas visibles o elegidas vuelve a consultar la API (que es la que valida).
  const live = useAvailabilitySync((changes: AvailabilityChanges) => {
    if (touches(changes, view, addDays(monthStart(addDays(view, 40)), -1))) fetchCal(view);
    if (ci && co && touches(changes, ci, addDays(co, -1))) fetchAvail({ ci, co, adults, children }, true);
  });

  // Al cambiar de paso: foco en el título del paso y desplazamiento suave.
  useEffect(() => {
    if (prevStep.current === step) return;
    prevStep.current = step;
    const t = setTimeout(() => {
      const h = document.getElementById("step-title");
      if (h) {
        h.focus({ preventScroll: true });
        window.scrollTo({ top: Math.max(0, h.getBoundingClientRect().top + window.scrollY - 120), behavior: "smooth" });
      }
    }, 30);
    return () => clearTimeout(t);
  }, [step]);

  useEffect(() => {
    if (step !== 4 || !captchaReal || tsDone.current || !tsRef.current) return;
    tsDone.current = true;
    const el = tsRef.current;
    const render = () =>
      window.turnstile!.render(el, {
        sitekey: config.turnstileSiteKey,
        language: "es",
        callback: (t: string) => {
          setCaptcha(t);
          setCaptchaError(false);
        },
        "expired-callback": () => setCaptcha(""),
      });
    if (window.turnstile) return render();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [step]);

  const nights = ci && co ? nightsBetween(ci, co) : 0;
  const option = avail && type ? avail.options.find((o) => o.cabinTypeId === type) : undefined;
  const q = option?.quote;
  const total = adults + children;
  const maxGuests = types.length ? Math.max(...types.map((x) => x.maxPersonas)) : 4;
  const typeList: Pick<CabinType, "id" | "nombre" | "precioPareja" | "personaAdicional" | "maxPersonas">[] = types.length
    ? types
    : cabins.map((x) => ({ id: x.id, nombre: x.full, precioPareja: x.couple, personaAdicional: x.extra, maxPersonas: x.max }));
  const nTxt = (n: number) => plural(n, "noche", "noches");
  const guestsTxt = `${total} huésped${total > 1 ? "es" : ""}`;

  const isUnavail = (d: string) => d < today || !!unavail[d];
  const pickDate = (d: string) => {
    setLiveNotice(null);
    if (pick === "in" || !ci || d <= ci) {
      if (isUnavail(d)) return;
      setCi(d);
      setCo(null);
      setPick("out");
      setRangeError("");
      setAvail(null);
      return;
    }
    for (let x = ci; x < d; x = addDays(x, 1))
      if (isUnavail(x)) {
        setRangeError("El rango incluye noches sin disponibilidad. Elige otras fechas.");
        return;
      }
    setCo(d);
    setPick("in");
    setRangeError("");
    setAvail(null);
  };
  const changeMonth = (v: string) => {
    setView(v);
    loadCal(v);
  };

  const setField = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setErrors((prev) => {
      if (!(k in prev)) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  };
  const bind = (k: keyof Form) => ({
    value: f[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setField(k, e.target.value as never),
  });
  const inv = (k: string) => ({ "aria-invalid": !!errors[k] });

  const focusFirst = (errs: FieldErrors, summary: boolean) =>
    setTimeout(() => {
      const el = summary ? document.getElementById("err-summary") : document.getElementById(FIELD_ID[ORDER.find((k) => errs[k])!]);
      el?.focus();
    }, 60);

  const body = (): ReservationInput => ({
    cabinTypeId: type!,
    checkIn: ci!,
    checkOut: co!,
    adults,
    children,
    pet: { hasPet: f.hasPet === "si", smallBreedConfirmed: f.hasPet === "si" && f.smallBreed },
    decoration: { requested: f.decoRequested, occasion: f.decoRequested ? f.occasion : "", notes: f.decoRequested ? f.decoNotes.trim() : "" },
    estimatedArrival: f.arrival,
    guest: {
      fullName: f.fullName.trim(),
      docType: f.docType,
      docNumber: f.docNumber.trim(),
      email: f.email.trim(),
      phone: `+57 ${f.phone.replace(/\D/g, "")}`,
      city: f.city.trim(),
    },
    specialRequests: f.specialRequests.trim(),
    consents: { policies: f.policies, dataProcessing: f.dataProcessing, marketing: f.marketing },
    captchaToken: captcha,
    website: f.website,
  });

  const arrivalLabel = (arrivals.find((a) => a[0] === f.arrival) ?? ["", ""])[1];
  const waText = () =>
    [
      `Hola, quiero reservar en ${config.name}.`,
      `Cabaña: ${type ? cabinName(type) : ""}`,
      `Llegada: ${ci ? fmtLong(ci) : ""}`,
      `Salida: ${co ? fmtLong(co) : ""}`,
      `Huéspedes: ${adults} adultos, ${children} niños`,
      `Nombre: ${f.fullName}`,
      `Documento: ${f.docType} ${f.docNumber}`,
      `Correo: ${f.email}`,
      `Celular: +57 ${f.phone}`,
      `Ciudad: ${f.city}`,
      `Llegada estimada: ${arrivalLabel}`,
      `Mascota: ${f.hasPet === "si" ? "sí" : "no"}`,
      `Decoración: ${f.decoRequested ? (OCCASIONS[f.occasion] || "sí") + (f.decoNotes ? " – " + f.decoNotes : "") : "no"}`,
      f.specialRequests ? `Solicitudes: ${f.specialRequests}` : "",
      q ? `Total: ${cop(q.total)} (abono ${cop(q.deposit)})` : "",
    ]
      .filter(Boolean)
      .join("\n");

  async function submit() {
    if (submitting || needCabin()) return;
    if (!captcha) {
      setCaptchaError(true);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const b = body();
    try {
      // 1) Se retienen las fechas (la base de datos impide que otra persona tome la misma cabaña) y 2) se abre la pasarela.
      // La reserva no queda confirmada aquí: se confirma solo cuando la pasarela aprueba el abono.
      const r = await api.createReservation(b);
      if (r.status === 201) {
        const held = r.data as PublicReservation;
        saveLastReservation({ res: held, email: b.guest.email, name: b.guest.fullName, adults: b.adults, children: b.children });
        const pay = await api.startPayment({ code: held.code, email: b.guest.email, kind: plan }).catch(() => null);
        const start = pay?.data as PaymentStart | ApiError | null | undefined;
        if (pay?.status === 201 && start && "checkoutUrl" in start) {
          resetIdem();
          window.location.assign(start.checkoutUrl);
          return;
        }
        resetIdem();
        // La retención de un intento anterior ya venció: se puede volver a enviar (crea una nueva).
        if ((start as ApiError | null)?.error === "HOLD_EXPIRED") {
          setSubmitting(false);
          setSubmitError("expired");
          return;
        }
        // Las fechas quedaron apartadas pero la pasarela no abrió: el pago se reintenta desde «Mi reserva».
        router.push("/mi-reserva?code=" + encodeURIComponent(held.code));
        return;
      }
      setSubmitting(false);
      if (r.status === 409) {
        setModal409(true);
        setTimeout(() => document.getElementById("m409-btn")?.focus(), 40);
        return;
      }
      if (r.status === 422) {
        const e: FieldErrors = {};
        const fields = (r.data as ValidationError | null)?.fields ?? {};
        Object.keys(fields).forEach((k) => (e[SERVER_FIELD[k] || k] = fields[k]));
        setErrors(e);
        setShowErrSummary(true);
        setErrFromServer(true);
        setStep(3);
        focusFirst(e, true);
        return;
      }
      setSubmitError(r.status === 429 ? "429" : "server");
    } catch {
      setSubmitting(false);
      setSubmitError("network");
    }
  }

  // Si la consulta ya respondió se avanza al instante; si sigue en curso (o falló), el botón espera la respuesta.
  const toStep2 = () => {
    if (!(ci && co) || waiting) return;
    if (avail && !availLoading) {
      if (avail.options.some((o) => o.available)) setStep(2);
      return;
    }
    goNext.current = true;
    setWaiting(true);
    if (availError || !availLoading) loadAvail({ ci, co, adults, children });
  };
  const needCabin = () => {
    if (type) return false;
    setLiveNotice({ text: "Elige una cabaña disponible para continuar.", action: "cabana" });
    return true;
  };
  const toStep4 = () => {
    if (needCabin()) return;
    const e = validate(f);
    if (Object.keys(e).length) {
      setErrors(e);
      setShowErrSummary(true);
      setErrFromServer(false);
      focusFirst(e, false);
      return;
    }
    setErrors({});
    setShowErrSummary(false);
    setStep(4);
  };
  const back = () => !submitting && setStep((s) => Math.max(1, s - 1));

  // Resultado de la consulta junto a la acción del paso 1.
  const freeOpts = avail?.options.filter((o) => o.available) ?? [];
  const freeUnits = freeOpts.reduce((n, o) => n + o.unitsLeft, 0);
  const checking = !!(ci && co) && !availError && (availLoading || !avail);
  const searchTone: "idle" | "ok" | "bad" = !(ci && co) || checking ? "idle" : availError || !freeOpts.length ? "bad" : "ok";
  const searchText = !ci
    ? "Elige la fecha de llegada en el calendario."
    : !co
      ? "Ahora elige la fecha de salida."
      : availError
        ? "No pudimos consultar la disponibilidad."
        : checking
          ? "Consultando disponibilidad…"
          : freeOpts.length
            ? `${plural(freeUnits, "cabaña libre", "cabañas libres")} · desde ${cop(Math.min(...freeOpts.map((o) => o.quote.total)))}`
            : "No hay cabañas libres para estas fechas y huéspedes. Prueba otras fechas.";

  const errKeys = Object.keys(errors);
  const pn = q?.base && nights ? q.base / nights : 0;
  const xpn = q?.extraGuests && nights ? q.extraAmount / (q.extraGuests * nights) : 0;
  const sumRows = [
    { k: "Cabaña", v: type ? cabinName(type) : "Por elegir" },
    { k: "Llegada", v: ci ? fmtDate(ci, true) : "—" },
    { k: "Salida", v: co ? fmtDate(co, true) : "—" },
    { k: "Noches", v: nights ? String(nights) : "—" },
    { k: "Huéspedes", v: `${plural(adults, "adulto", "adultos")}${children ? ` · ${plural(children, "niño", "niños")}` : ""}` },
  ];
  const sumTotal = q ? cop(q.total) : "—";
  const depositLine = q
    ? `Para confirmar: abono de ${cop(q.deposit)} (saldo ${cop(q.balance)}) o el total de una vez.`
    : "Elige fechas y cabaña para ver el total.";
  const errText = {
    network: "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
    "429": "Recibimos demasiados intentos seguidos. Espera un momento y vuelve a intentarlo.",
    server: "Ocurrió un error al iniciar tu reserva.",
    expired: "El tiempo de tu intento anterior terminó. Vuelve a intentarlo para apartar las fechas de nuevo.",
  };

  return (
    <main className="gutter-1240 pt-4 pb-16">
      <h1 className="display mb-5 text-[clamp(2.6rem,6vw,4.6rem)] leading-[.92]">
        <span>Reserva tu cabaña</span> <span className="text-accent">en 4 pasos</span>
      </h1>

      <nav aria-label="Progreso de la reserva" className="mb-6">
        <ol className="grid grid-cols-4 gap-2">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const cur = n === step;
            return (
              <li key={label} className="flex flex-col gap-2">
                <span aria-hidden="true" className={`h-1.5 rounded-full ${n <= step ? "bg-accent" : "bg-on-dark/20"}`} />
                <button
                  type="button"
                  onClick={() => done && !submitting && setStep(n)}
                  disabled={!done}
                  aria-current={cur ? "step" : undefined}
                  className={`flex min-h-11 items-center gap-2.5 text-left text-on-dark disabled:cursor-default ${n > step ? "opacity-60" : ""}`}
                >
                  <span
                    className={`grid size-8 flex-none place-items-center rounded-full text-[.85rem] font-extrabold ${cur ? "bg-card text-on-light" : done ? "bg-accent text-on-light" : "border-2 border-on-dark/40 text-on-dark"}`}
                  >
                    {done ? "✓" : n}
                  </span>
                  <span className={`text-[.88rem] leading-[1.2] font-bold ${cur ? "max-sm:hidden" : "max-[899px]:hidden"}`}>{label}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <p aria-live="polite" className="mt-2.5 text-[.85rem] font-semibold">
          Paso {step} de 4: {STEPS[step - 1]}
        </p>
      </nav>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[1_1_600px] flex-col gap-5">
          {liveNotice && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[color-mix(in_srgb,var(--color-highlight)_32%,var(--color-card))] px-5 py-3.5 text-on-light"
            >
              <p className="min-w-0 flex-[1_1_260px] font-bold">{liveNotice.text}</p>
              <div className="flex items-center gap-2">
                {liveNotice.action && !(liveNotice.action === "cabana" && step === 2) && (
                  <button
                    type="button"
                    onClick={() => {
                      const to = liveNotice.action === "fechas" ? 1 : 2;
                      setLiveNotice(null);
                      setStep(to);
                    }}
                    className="btn btn-cta min-h-11 px-5"
                  >
                    {liveNotice.action === "fechas" ? "Cambiar fechas" : "Elegir otra cabaña"}
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Cerrar aviso"
                  onClick={() => setLiveNotice(null)}
                  className="btn-icon size-11 text-[1.4rem] leading-none hover:bg-on-light/8"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <section aria-labelledby="step-title" className="flex flex-col gap-5">
              <h2 id="step-title" tabIndex={-1} className={stepTitle}>
                1 · Fechas y huéspedes
              </h2>
              {/* Un solo formulario: fechas a la izquierda, huéspedes a la derecha y la acción al pie, con el resultado de la consulta. */}
              <div className="flex flex-col rounded-lg bg-card text-on-light">
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
                  <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
                    <div className="grid grid-cols-2 gap-2.5">
                      {(["in", "out"] as const).map((pk) => {
                        const value = pk === "in" ? ci : co;
                        const on = pick === pk && (pk === "in" || !!ci);
                        return (
                          <button
                            key={pk}
                            type="button"
                            disabled={pk === "out" && !ci}
                            aria-pressed={on}
                            onClick={() => setPick(pk)}
                            className={`flex min-h-[64px] min-w-0 flex-col justify-center gap-0.5 rounded-md border-2 px-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${on ? "border-on-light" : "border-card-muted enabled:hover:border-on-light/45"}`}
                          >
                            <span className="text-[.72rem] font-extrabold tracking-[.06em] uppercase">{pk === "in" ? "Llegada" : "Salida"}</span>
                            <span className={`truncate text-[1rem] font-bold ${value ? "" : "opacity-60"}`}>
                              {value ? (
                                <>
                                  <span className="sm:hidden">{fmtDate(value)}</span>
                                  <span className="max-sm:hidden">{fmtDate(value, true)}</span>
                                </>
                              ) : (
                                "Elegir fecha"
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {rangeError && (
                      <p role="alert" className="-mt-1 font-bold text-error">
                        {rangeError}
                      </p>
                    )}
                    <div className="flex flex-col gap-2.5">
                      <RangeCalendar
                        view={view}
                        today={today}
                        checkIn={ci}
                        checkOut={co}
                        pick={pick}
                        unavailable={unavail}
                        loading={calLoading}
                        hint={
                          pick === "out" && ci
                            ? "Ahora elige el día de salida"
                            : ci && co
                              ? `${nTxt(nights)} · ${fmtDate(ci)} → ${fmtDate(co)}`
                              : "Elige el día de llegada"
                        }
                        onPick={pickDate}
                        onMonth={changeMonth}
                      />
                    </div>
                    <div className="dotted-top mt-auto flex flex-wrap items-center gap-x-3.5 gap-y-2 pt-3 text-[.78rem] font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true" className="size-3.5 rounded-full bg-cta" />
                        Tus fechas
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true" className="size-3.5 rounded-full bg-card-muted" />
                        Noches elegidas
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true" className="font-extrabold line-through opacity-50">
                          12
                        </span>
                        Sin disponibilidad
                      </span>
                      {live !== "off" && (
                        <span className="ml-auto inline-flex items-center gap-1.5 opacity-80">
                          <span
                            aria-hidden="true"
                            className={`size-2 rounded-full ${live === "live" ? "bg-accent" : live === "offline" ? "bg-error" : "bg-highlight"}`}
                          />
                          {live === "live" ? "Disponibilidad en tiempo real" : live === "offline" ? "Reconectando…" : "Conectando…"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    role="group"
                    aria-labelledby="guests-title"
                    className="flex min-w-0 flex-col gap-3 border-t-2 border-dotted border-card-muted p-4 sm:p-5 md:border-t-0 md:border-l-2"
                  >
                    <div className="flex min-h-[64px] flex-col justify-center">
                      <h3 id="guests-title" className="text-[.72rem] font-extrabold tracking-[.06em] uppercase">
                        Huéspedes
                      </h3>
                      <p className="text-[1rem] font-bold">{`${plural(adults, "adulto", "adultos")}${children ? ` · ${plural(children, "niño", "niños")}` : ""}`}</p>
                    </div>
                    <Counter
                      label="Adultos"
                      sub="13 años o más"
                      count={adults}
                      decDisabled={adults <= 1}
                      incDisabled={total >= maxGuests}
                      onDec={() => {
                        setAdults(Math.max(1, adults - 1));
                        setAvail(null);
                      }}
                      onInc={() => {
                        if (total < maxGuests) setAdults(adults + 1);
                        setAvail(null);
                      }}
                    />
                    <Counter
                      label="Niños"
                      sub="Hasta 12 años"
                      count={children}
                      decDisabled={children <= 0}
                      incDisabled={total >= maxGuests}
                      onDec={() => {
                        setChildren(Math.max(0, children - 1));
                        setAvail(null);
                      }}
                      onInc={() => {
                        if (total < maxGuests) setChildren(children + 1);
                        setAvail(null);
                      }}
                    />
                    <p className="mt-auto rounded-sm bg-card-muted px-3 py-2.5 text-[.84rem]">
                      {`Adultos y niños cuentan igual para la capacidad y la tarifa. La tarifa incluye 2 personas; desde la 3.ª se suma el valor por persona adicional. Máximo ${maxGuests} por cabaña.`}
                    </p>
                  </div>
                </div>

                {/* Acción del paso: siempre visible (fija al pie en el celular) y con el resultado de la consulta al lado. */}
                <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-b-lg border-t-2 border-dotted border-card-muted bg-card px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-14px_24px_-20px_rgb(0_0_0/0.5)] sm:px-5 sm:py-4">
                  <div aria-live="polite" className="min-w-0">
                    <p className="text-[.74rem] font-extrabold tracking-[.06em] uppercase opacity-80 max-sm:hidden">
                      {ci && co ? `${fmtDate(ci)} → ${fmtDate(co)} · ${nTxt(nights)} · ${guestsTxt}` : "Tu búsqueda"}
                    </p>
                    <p className={`text-[.92rem] leading-snug font-bold sm:text-[1.02rem] ${searchTone === "bad" ? "text-error" : ""}`}>{searchText}</p>
                  </div>
                  <button
                    type="button"
                    onClick={toStep2}
                    disabled={!(ci && co) || searchTone === "bad"}
                    aria-busy={waiting || undefined}
                    className="btn btn-cta min-h-[52px] flex-none px-5 transition-[background-color,opacity] disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-14 sm:px-7"
                  >
                    {waiting && <span aria-hidden="true" className="size-5 animate-spin-fast rounded-full border-3 border-cta-text border-r-transparent" />}
                    {waiting ? (
                      "Consultando…"
                    ) : availError ? (
                      "Reintentar"
                    ) : (
                      <span>
                        Ver cabañas<span className="max-sm:hidden"> disponibles</span>
                      </span>
                    )}
                    {!waiting && !availError && <span aria-hidden="true">→</span>}
                  </button>
                </div>
              </div>
            </section>
          )}

          {step === 2 && (
            <section aria-labelledby="step-title" className="flex flex-col gap-5">
              <h2 id="step-title" tabIndex={-1} className={stepTitle}>
                2 · Elige tu cabaña
              </h2>
              {availLoading && (
                <div role="status" aria-label="Consultando disponibilidad" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
                  {[0, 1].map((k) => (
                    <div key={k} className="flex flex-col gap-3 rounded-lg bg-card p-3.5">
                      <span className="skeleton aspect-video rounded-md" />
                      <span className="skeleton h-7 w-[70%] rounded-sm" />
                      <span className="skeleton h-4 w-[90%] rounded-sm" />
                      <span className="skeleton h-[52px] w-[45%] rounded-full" />
                    </div>
                  ))}
                </div>
              )}
              {availError && !availLoading && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-card p-5 text-on-light">
                  <strong>No pudimos consultar la disponibilidad.</strong>
                  <button type="button" onClick={() => ci && co && loadAvail({ ci, co, adults, children })} className="btn btn-cta min-h-12 px-[22px]">
                    Reintentar
                  </button>
                </div>
              )}
              {avail && !availLoading && ci && co && (
                <>
                  <p className="font-semibold">{`${fmtDate(ci)} → ${fmtDate(co)} · ${nTxt(avail.nights)} · ${guestsTxt}`}</p>
                  <div role="radiogroup" aria-label="Tipo de cabaña" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
                    {avail.options.map((op) => {
                      const ty = typeList.find((x) => x.id === op.cabinTypeId);
                      const cab = cabins.find((x) => x.id === op.cabinTypeId);
                      const name = ty?.nombre ?? cab?.full ?? op.cabinTypeId;
                      const sel = type === op.cabinTypeId;
                      return (
                        <article
                          key={op.cabinTypeId}
                          className={`flex flex-col gap-3 rounded-lg bg-card p-3.5 text-on-light ${sel ? "shadow-[0_0_0_3px_var(--color-highlight)]" : ""} ${op.available ? "" : "opacity-70"}`}
                        >
                          <div className="relative aspect-video overflow-hidden rounded-md bg-card-muted">
                            <PhotoSlot
                              src={cab?.photos[0]}
                              alt={name}
                              placeholder={`Foto real: ${name.toLowerCase()}`}
                              sizes="(min-width: 900px) 400px, 100vw"
                            />
                            {cab?.badge && (
                              <span className="pointer-events-none absolute top-2.5 left-2.5 rounded-full bg-highlight px-3 py-1.5 text-[.78rem] font-extrabold">
                                {cab.badge}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5 px-1.5 pb-1.5">
                            <h3 className="display text-[2rem] leading-none">{name}</h3>
                            <p className="text-[.88rem]">{`${cop(ty?.precioPareja)} la noche para 2 personas · Persona adicional ${cop(ty?.personaAdicional)} · Máximo ${ty?.maxPersonas} personas`}</p>
                            {op.available ? (
                              <>
                                <p className="text-[.85rem] font-bold">
                                  {op.unitsLeft === 1 ? "Queda 1 cabaña de este tipo" : `Quedan ${op.unitsLeft} cabañas de este tipo`}
                                </p>
                                <p className="mt-1.5 flex flex-wrap items-baseline gap-2">
                                  <strong className="display text-[2rem] leading-none">{cop(op.quote.total)}</strong>
                                  <span className="text-[.85rem] font-semibold">{`por ${nTxt(avail.nights)} · ${guestsTxt}`}</span>
                                </p>
                                <button
                                  type="button"
                                  role="radio"
                                  aria-checked={sel}
                                  onClick={() => setType(op.cabinTypeId)}
                                  className={`btn mt-1.5 min-h-[52px] self-start border-2 border-cta px-[26px] ${sel ? "bg-cta text-cta-text" : "bg-transparent text-on-light"}`}
                                >
                                  {sel ? "Seleccionado ✓" : "Elegir esta cabaña"}
                                </button>
                              </>
                            ) : (
                              <p className="mt-1.5 rounded-sm bg-card-muted px-3.5 py-2.5 font-bold">
                                {op.reason === "capacity" || (ty && total > ty.maxPersonas)
                                  ? `Máximo ${ty?.maxPersonas} personas en esta cabaña`
                                  : "Sin disponibilidad en estas fechas"}
                              </p>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
              <div className="flex flex-wrap justify-between gap-3">
                <button type="button" onClick={back} className={backBtn}>
                  ← Cambiar fechas
                </button>
                <button type="button" onClick={() => option?.available && setStep(3)} disabled={!option?.available} className={nextBtn}>
                  Continuar con tus datos →
                </button>
              </div>
            </section>
          )}

          {step === 3 && (
            <section aria-labelledby="step-title" className="flex flex-col gap-5">
              <h2 id="step-title" tabIndex={-1} className={stepTitle}>
                3 · Tus datos
              </h2>
              {showErrSummary && errKeys.length > 0 && (
                <div
                  id="err-summary"
                  tabIndex={-1}
                  role="alert"
                  aria-labelledby="err-summary-title"
                  className="rounded-lg bg-card px-[22px] py-[18px] text-on-light shadow-[inset_0_0_0_3px_var(--color-error)]"
                >
                  <h3 id="err-summary-title" className="mb-2 font-extrabold text-error">
                    {errFromServer
                      ? `Revisa ${plural(errKeys.length, "dato", "datos")} que no pudimos validar`
                      : `Corrige ${plural(errKeys.length, "campo", "campos")} para continuar`}
                  </h3>
                  <ul className="flex list-disc flex-col gap-1 pl-5">
                    {errKeys.map((k) => (
                      <li key={k}>
                        <a
                          href={"#" + (FIELD_ID[k] || "step-title")}
                          onClick={(e) => {
                            e.preventDefault();
                            document.getElementById(FIELD_ID[k])?.focus();
                          }}
                          className="font-bold text-error underline"
                        >
                          {`${LABEL[k] || k}: ${errors[k]}`}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <form
                noValidate
                onSubmit={(e) => e.preventDefault()}
                className="relative flex flex-col gap-[22px] rounded-lg bg-card p-[clamp(18px,3vw,32px)] text-on-light"
              >
                <div aria-hidden="true" className="absolute -left-[10000px] size-px overflow-hidden">
                  <label htmlFor="f-website">Deja este campo vacío</label>
                  <input id="f-website" name="website" type="text" tabIndex={-1} autoComplete="off" {...bind("website")} />
                </div>
                <div className="grid grid-cols-1 gap-x-[18px] gap-y-4 sm:grid-cols-2">
                  <Field id="f-name" label="Nombre completo" errId="e-name" error={errors.fullName} wide>
                    <input
                      id="f-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      required
                      {...bind("fullName")}
                      {...inv("fullName")}
                      aria-describedby="e-name"
                      className="field-input"
                    />
                  </Field>
                  <Field id="f-doctype" label="Tipo de documento" errId="e-doctype" error={errors.docType}>
                    <Combobox
                      tone="site"
                      id="f-doctype"
                      value={f.docType}
                      onChange={(v) => setField("docType", v as DocType)}
                      options={DOC_TYPES}
                      invalid={!!errors.docType}
                      describedBy="e-doctype"
                    />
                  </Field>
                  <Field id="f-docnum" label="Número de documento" errId="e-docnum" error={errors.docNumber}>
                    <input
                      id="f-docnum"
                      name="docNumber"
                      type="text"
                      inputMode={f.docType === "CC" || f.docType === "PPT" ? "numeric" : "text"}
                      autoComplete="off"
                      {...bind("docNumber")}
                      {...inv("docNumber")}
                      aria-describedby="e-docnum"
                      className="field-input"
                    />
                  </Field>
                  <Field id="f-email" label="Correo electrónico" errId="e-email" error={errors.email}>
                    <input
                      id="f-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      {...bind("email")}
                      {...inv("email")}
                      aria-describedby="e-email"
                      className="field-input"
                    />
                  </Field>
                  <Field id="f-phone" label="Celular" errId="e-phone" error={errors.phone}>
                    {/* Siempre de Colombia: el +57 es fijo y se agrega al enviar. */}
                    <div className="relative">
                      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 flex items-center gap-2.5 pl-4 font-bold">
                        +57
                        <span className="h-6 w-0.5 rounded-full bg-card-muted" />
                      </span>
                      <input
                        id="f-phone"
                        name="tel"
                        type="tel"
                        autoComplete="tel-national"
                        inputMode="numeric"
                        placeholder="315 205 8712"
                        value={f.phone}
                        onChange={(e) => setField("phone", fmtPhone(phoneDigits(e.target.value)))}
                        {...inv("phone")}
                        aria-describedby="e-phone"
                        className="field-input pl-[68px] tabular-nums"
                      />
                    </div>
                  </Field>
                  <Field id="f-city" label="Ciudad de procedencia" errId="e-city" error={errors.city}>
                    <input
                      id="f-city"
                      name="city"
                      type="text"
                      autoComplete="address-level2"
                      {...bind("city")}
                      {...inv("city")}
                      aria-describedby="e-city"
                      className="field-input"
                    />
                  </Field>
                  <Field id="f-arrival" label="Hora estimada de llegada" errId="e-arrival" error={errors.arrival}>
                    <Combobox
                      tone="site"
                      id="f-arrival"
                      value={f.arrival}
                      onChange={(v) => setField("arrival", v)}
                      options={arrivals.map(([v, l]) => ({ value: v, label: l }))}
                      placeholder="Elige una hora"
                      searchable={false}
                      invalid={!!errors.arrival}
                      describedBy="e-arrival"
                    />
                  </Field>
                </div>

                <div className="flex flex-col gap-3">
                  <ToggleCard
                    id="f-pet"
                    icon={<PawIcon size={20} />}
                    title="¿Viajas con mascota?"
                    description={f.hasPet === "si" ? "Sí, viajo con mi mascota" : "Tu mascota es bienvenida, sin costo adicional"}
                    checked={f.hasPet === "si"}
                    onChange={(on) => setField("hasPet", on ? "si" : "no")}
                  >
                    <div className="flex flex-col gap-1">
                      <CheckOption
                        id="f-smallbreed"
                        checked={f.smallBreed}
                        onChange={(v) => setField("smallBreed", v)}
                        invalid={!!errors.smallBreed}
                        describedBy="e-smallbreed"
                        note="Por comodidad de todos los huéspedes y de las mascotas de la casa."
                      >
                        Confirmo que mi mascota estará bajo mi cuidado durante la estadía
                      </CheckOption>
                      <p id="e-smallbreed" aria-live="polite" className="field-error">
                        {errors.smallBreed}
                      </p>
                    </div>
                  </ToggleCard>

                  <ToggleCard
                    id="f-deco"
                    icon={<GiftIcon size={20} />}
                    title="Decoración para una ocasión especial"
                    description="Valor adicional · te contactamos para cotizarla"
                    checked={f.decoRequested}
                    onChange={(v) => setField("decoRequested", v)}
                  >
                    <div className="grid grid-cols-1 gap-x-3.5 gap-y-3 sm:grid-cols-2">
                      <Field id="f-occasion" label="Ocasión" errId="e-occasion" error={errors.occasion}>
                        <Combobox
                          tone="site"
                          id="f-occasion"
                          value={f.occasion}
                          onChange={(v) => setField("occasion", v)}
                          options={Object.entries(OCCASIONS).map(([v, l]) => ({ value: v, label: l }))}
                          placeholder="Elige la ocasión"
                          invalid={!!errors.occasion}
                          describedBy="e-occasion"
                        />
                      </Field>
                      <Field id="f-deconotes" label="Detalles (opcional)" errId="e-deconotes">
                        <input
                          id="f-deconotes"
                          type="text"
                          maxLength={500}
                          placeholder="Ej. globos, pétalos, un mensaje"
                          {...bind("decoNotes")}
                          className="field-input"
                        />
                      </Field>
                    </div>
                  </ToggleCard>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="f-requests" className="field-label">
                    Solicitudes especiales <span className="font-medium tracking-normal normal-case">(opcional)</span>
                  </label>
                  <textarea id="f-requests" rows={3} maxLength={1000} {...bind("specialRequests")} className="field-input resize-y" />
                </div>

                <fieldset className="flex min-w-0 flex-col gap-2.5">
                  <legend className="mb-2 font-extrabold">Autorizaciones</legend>
                  <div className="flex flex-col gap-1">
                    <CheckOption
                      card
                      id="f-policies"
                      checked={f.policies}
                      onChange={(v) => setField("policies", v)}
                      invalid={!!errors.policies}
                      describedBy="e-policies"
                      note="Obligatorio"
                    >
                      Acepto las{" "}
                      <Link href="/politicas" target="_blank" className="font-extrabold underline">
                        políticas de reserva
                      </Link>
                    </CheckOption>
                    <p id="e-policies" aria-live="polite" className="field-error">
                      {errors.policies}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <CheckOption
                      card
                      id="f-data"
                      checked={f.dataProcessing}
                      onChange={(v) => setField("dataProcessing", v)}
                      invalid={!!errors.dataProcessing}
                      describedBy="e-data"
                      note="Obligatorio · Ley 1581 de 2012"
                    >
                      Autorizo el tratamiento de mis datos personales según la{" "}
                      <Link href="/privacidad" target="_blank" className="font-extrabold underline">
                        política de privacidad
                      </Link>
                    </CheckOption>
                    <p id="e-data" aria-live="polite" className="field-error">
                      {errors.dataProcessing}
                    </p>
                  </div>
                  <CheckOption
                    card
                    id="f-marketing"
                    checked={f.marketing}
                    onChange={(v) => setField("marketing", v)}
                    note="Opcional · puedes darte de baja cuando quieras"
                  >
                    Quiero recibir promociones
                  </CheckOption>
                </fieldset>
              </form>
              <div className="flex flex-wrap justify-between gap-3">
                <button type="button" onClick={back} className={backBtn}>
                  ← Cambiar cabaña
                </button>
                <button type="button" onClick={toStep4} className={nextBtn}>
                  Revisar reserva →
                </button>
              </div>
            </section>
          )}

          {step === 4 && (
            <section aria-labelledby="step-title" className="flex flex-col gap-5">
              <h2 id="step-title" tabIndex={-1} className={stepTitle}>
                4 · Revisa y paga
              </h2>
              <div className="flex flex-col gap-[18px] rounded-lg bg-card p-[clamp(18px,3vw,32px)] text-on-light">
                <h3 className="text-[1.05rem] font-extrabold">Desglose · {type ? cabinName(type) : ""}</h3>
                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-2.5 text-[.95rem]">
                  <dt>{`${nTxt(nights)} × ${cop(pn)} (tarifa para 2)`}</dt>
                  <dd className="text-right font-bold">{cop(q?.base)}</dd>
                  {!!q?.extraGuests && (
                    <>
                      <dt>{`${plural(q.extraGuests, "persona adicional", "personas adicionales")} × ${cop(xpn)} × ${nTxt(nights)}`}</dt>
                      <dd className="text-right font-bold">{cop(q.extraAmount)}</dd>
                    </>
                  )}
                  <dt className="dotted-top pt-2.5 font-extrabold">Total</dt>
                  <dd className="dotted-top display pt-2.5 text-right text-[2rem] leading-none">{cop(q?.total)}</dd>
                </dl>
                <div className="flex flex-col gap-2.5">
                  <h3 className="text-[1.05rem] font-extrabold">¿Cuánto quieres pagar ahora?</h3>
                  <PlanChoice
                    wide
                    value={plan}
                    onChange={setPlan}
                    deposit={q?.deposit ?? 0}
                    total={q?.total ?? 0}
                    pct={config.depositPct}
                    disabled={submitting}
                  />
                  <p className="text-[.82rem]">Lo que pagues para confirmar no es reembolsable.</p>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-2.5 rounded-md bg-card-muted px-4 py-3.5 text-[.9rem]">
                  {[
                    { k: "Huésped", v: f.fullName },
                    { k: "Documento", v: `${f.docType} ${f.docNumber}` },
                    { k: "Correo", v: f.email },
                    { k: "Celular", v: `+57 ${f.phone}` },
                    { k: "Llegada estimada", v: arrivalLabel || "—" },
                    { k: "Mascota", v: f.hasPet === "si" ? "Sí" : "No" },
                    { k: "Decoración", v: f.decoRequested ? `${OCCASIONS[f.occasion] || "Sí"} · valor adicional` : "No" },
                    { k: "Solicitudes", v: f.specialRequests || "Ninguna" },
                  ].map((r) => (
                    <div key={r.k}>
                      <span className="block text-[.72rem] font-extrabold tracking-[.06em] uppercase">{r.k}</span>
                      <span className="font-semibold break-words">{r.v}</span>
                    </div>
                  ))}
                </div>
                <details className="rounded-md bg-card-muted px-4 py-3">
                  <summary className="min-h-8 font-extrabold">Resumen de políticas</summary>
                  <ul className="mt-2.5 flex list-disc flex-col gap-1.5 pl-[18px] text-[.9rem]">
                    {c.policies.map((p) => (
                      <li key={p.q}>
                        <strong>{p.q}.</strong> {p.a}
                      </li>
                    ))}
                  </ul>
                </details>
                <div className="flex flex-col gap-2">
                  {captchaReal ? (
                    <div ref={tsRef} />
                  ) : (
                    <CheckOption
                      card
                      className="max-w-[360px]"
                      checked={!!captcha}
                      invalid={captchaError}
                      onChange={(v) => {
                        setCaptcha(v ? "mock-turnstile-token" : "");
                        setCaptchaError(false);
                      }}
                      note="Turnstile simulado"
                    >
                      Verificación antispam
                    </CheckOption>
                  )}
                  {captchaError && (
                    <p role="alert" className="font-bold text-error">
                      Completa la verificación antispam para enviar.
                    </p>
                  )}
                </div>
                {submitError && (
                  <div
                    role="alert"
                    className="flex flex-col gap-3 rounded-md bg-[color-mix(in_srgb,var(--color-highlight)_30%,var(--color-card))] px-[18px] py-4"
                  >
                    <strong>{errText[submitError]}</strong>
                    <div className="flex flex-wrap gap-2.5">
                      <button type="button" onClick={submit} className="btn btn-cta min-h-12 px-[22px]">
                        Reintentar
                      </button>
                      <a href={wa(c.whatsapp, waText())} target="_blank" rel="noopener" className="btn btn-outline-light min-h-12 gap-2 px-[22px]">
                        <WhatsAppIcon />
                        Enviar por WhatsApp
                      </a>
                    </div>
                  </div>
                )}
              </div>
              <p className="rounded-lg bg-surface px-5 py-4 text-[.92rem] font-semibold">
                {`Te llevamos a la pasarela segura de Wompi (tarjeta, PSE, Nequi o Bancolombia). Tus fechas quedan apartadas ${HOLD_MINUTES} minutos mientras pagas; la reserva se confirma solo cuando el pago sea aprobado.`}
              </p>
              <div className="flex flex-wrap justify-between gap-3">
                <button type="button" onClick={back} disabled={submitting} className={backBtn}>
                  ← Editar datos
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  aria-busy={submitting}
                  className={`btn btn-highlight min-h-[60px] gap-3 px-[34px] text-[1.05rem] ${submitting ? "cursor-progress opacity-70" : ""}`}
                >
                  {submitting && <span aria-hidden="true" className="size-5 animate-spin-fast rounded-full border-3 border-on-light border-r-transparent" />}
                  {submitting ? "Abriendo el pago…" : payLabel(plan, (plan === "full" ? q?.total : q?.deposit) ?? 0)}
                </button>
              </div>
            </section>
          )}
        </div>

        <aside
          aria-label="Resumen de tu reserva"
          className="sticky top-4 hidden flex-[0_0_340px] flex-col gap-3.5 rounded-lg bg-surface p-[22px] min-[900px]:flex"
        >
          <h2 className="display text-[1.8rem] leading-none">Tu reserva</h2>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-2 text-[.92rem]">
            {sumRows.map((r) => (
              <div key={r.k} className="contents">
                <dt className="font-semibold opacity-85">{r.k}</dt>
                <dd className="text-right font-bold">{r.v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-1 border-t-2 border-dotted border-on-dark/30 pt-3.5">
            <span className="eyebrow">Total</span>
            <strong className="display text-[2.6rem] leading-none">{sumTotal}</strong>
            <span className="text-[.86rem]">{depositLine}</span>
          </div>
          <p className="text-[.8rem] text-on-dark-muted">{`Tus fechas se apartan ${HOLD_MINUTES} minutos mientras pagas el abono del ${config.depositPct} % o el total. La reserva se confirma cuando el pago es aprobado.`}</p>
        </aside>
      </div>

      <div
        className={`fixed inset-x-0 bottom-0 z-60 rounded-t-lg bg-surface px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-[0_-12px_30px_-12px_rgb(0_0_0/0.5)] min-[900px]:hidden ${step === 1 ? "hidden" : ""}`}
      >
        {sumOpen && (
          <div id="sum-panel" className="max-h-[50vh] overflow-auto px-1 pt-1.5 pb-3.5">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-2 text-[.92rem]">
              {sumRows.map((r) => (
                <div key={r.k} className="contents">
                  <dt className="font-semibold">{r.k}</dt>
                  <dd className="text-right font-bold">{r.v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2.5 text-[.84rem]">{depositLine}</p>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col leading-[1.1]">
            <span className="text-[.72rem] font-extrabold tracking-[.06em] uppercase">Total</span>
            <strong className="display text-[1.9rem]">{sumTotal}</strong>
          </div>
          <button
            type="button"
            aria-expanded={sumOpen}
            aria-controls="sum-panel"
            onClick={() => setSumOpen(!sumOpen)}
            className="btn btn-outline-dark min-h-12 px-5"
          >
            {sumOpen ? "Ocultar resumen" : "Ver resumen"}
          </button>
        </div>
      </div>

      {modal409 && (
        <div className="fixed inset-0 z-100 grid place-items-center bg-black/55 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="m409-title"
            aria-describedby="m409-desc"
            className="flex w-full max-w-[440px] flex-col gap-3.5 rounded-lg bg-card p-7 text-on-light shadow-card"
          >
            <h2 id="m409-title" className="display text-[2rem] leading-none">
              Estas fechas se acaban de ocupar
            </h2>
            <p id="m409-desc">Otra persona reservó mientras completabas tus datos. Tus datos se conservan: elige nuevas fechas y continúa.</p>
            <button
              type="button"
              id="m409-btn"
              onClick={() => {
                setModal409(false);
                setStep(1);
                setCo(null);
                setPick("out");
                setAvail(null);
                setUnavail({});
                loadCal(view);
              }}
              className="btn btn-cta min-h-[52px]"
            >
              Elegir otras fechas
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
