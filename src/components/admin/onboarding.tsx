"use client";

// Primer ingreso al panel: primero se pide (sin poder saltarlo) el nombre y la foto de perfil; enseguida, una guía corta
// que recorre lo esencial del panel de La Vaca Fifí (el estado del día, crear una reserva, el calendario, las cabañas,
// las reservas de Booking que llegan por correo y las tarifas).
// La guía se marca como vista en la cuenta (user_metadata.tour_done) al terminarla o saltarla; se puede volver a abrir
// desde el menú de la cuenta («Guía del panel»).
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CloseIcon, UserIcon } from "@/components/ui/icons";
import { api } from "@/lib/client/api";
import { Fifi } from "@/components/brand/fifi";
import { ProfilePhoto } from "@/components/admin/account";
import { useAdmin } from "@/components/admin/context";
import { canOpen, paths, type ModuleId } from "@/components/admin/routes";
import { isAdminRole } from "@/lib/permissions";
import { adminInput } from "@/components/admin/shared";
import { Button, Field, Modal, ModalPresence } from "@/components/admin/ui";

const TOUR_EVENT = "panel:tour";
// Abre la guía desde cualquier parte del panel (menú de la cuenta).
export const startTour = () => window.dispatchEvent(new Event(TOUR_EVENT));

// Nombre y apellido: al menos dos palabras de dos letras o más. La foto es opcional.
const isFullName = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2).length >= 2;
const needsProfile = (me: { name: string }) => !isFullName(me.name);

export function Onboarding() {
  const { data, setData, toast } = useAdmin();
  const me = data.me;
  const [reopened, setReopened] = useState(false);
  const profileMissing = needsProfile(me);
  // Primer ingreso: con el perfil completo y la guía sin ver, arranca sola. Después, solo si se vuelve a abrir.
  const touring = reopened || !me.toured;

  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener(TOUR_EVENT, open);
    return () => window.removeEventListener(TOUR_EVENT, open);
  }, []);

  const finish = useCallback(() => {
    setReopened(false);
    if (me.toured) return;
    toast("Vuelve a ver la guía cuando quieras desde el menú de tu cuenta.");
    setData((d) => ({ ...d, me: { ...d.me, toured: true } }));
    api.admin.finishTour().catch(() => {});
  }, [me.toured, setData, toast]);

  return (
    <>
      <ModalPresence>{profileMissing && <ProfileSetup />}</ModalPresence>
      {touring && !profileMissing && <Tour onDone={finish} />}
    </>
  );
}

/* ───────────── Paso obligatorio: nombre y apellido (la foto es opcional) ───────────── */

function ProfileSetup() {
  const { data, setData, onAuthError } = useAdmin();
  const me = data.me;
  // Vacío: lo que hay suele ser la parte del correo antes de la @ (no es un nombre y apellido).
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");
  const nameErr = name.trim().length > 80 ? "Máximo 80 caracteres." : !isFullName(name) ? "Escribe tu nombre y tu apellido." : "";

  async function save() {
    setTried(true);
    if (busy || nameErr) return;
    // Con el nombre ya guardado, el diálogo se cierra solo: needsProfile deja de cumplirse.
    if (name.trim() === me.name) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.admin.profile({ name: name.trim() });
      if (r.status === 401 || r.status === 403) return onAuthError();
      if (r.status !== 200 || !r.data || !("me" in r.data)) {
        const fields = (r.data as { fields?: Record<string, string> } | null)?.fields;
        return setError(fields?.name ?? "No se pudo guardar. Inténtalo de nuevo.");
      }
      const updated = r.data.me;
      setData((d) => ({ ...d, me: { ...d.me, name: updated.name } }));
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      // Obligatorio: ni Escape ni el fondo lo cierran (si el navegador lo cierra igual, se vuelve a abrir).
      onClose={() => {
        const d = document.getElementById("ob-dialog")?.closest("dialog");
        if (d && !d.open) d.showModal();
      }}
      labelledBy="ob-title"
      describedBy="ob-text"
      dismissOnBackdrop={false}
      initialFocus="input"
      className="m-auto w-[calc(100%-32px)] max-w-[480px] rounded-[26px] p-0"
    >
      <form
        id="ob-dialog"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-full bg-success-soft text-success">
              <UserIcon size={18} />
            </span>
            <div className="min-w-0 pt-1">
              <h2 id="ob-title" className="text-[18px] font-bold tracking-[-0.02em] text-ink">
                Bienvenido al panel
              </h2>
              <p id="ob-text" className="text-[13.5px] text-ink-muted">
                Antes de empezar, escribe tu nombre y tu apellido: así el equipo sabe quién hizo cada cosa. La foto es opcional.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-semibold text-ink">
              Foto de perfil <span className="font-normal text-ink-muted">(opcional)</span>
            </p>
            <ProfilePhoto />
          </div>

          <Field label="Nombre y apellido" error={error || (tried ? nameErr : "") || undefined}>
            {(p) => (
              <input
                {...p}
                value={name}
                maxLength={80}
                autoComplete="name"
                placeholder="Nombre y apellido"
                onChange={(e) => setName(e.target.value)}
                className={adminInput}
              />
            )}
          </Field>
        </div>
        <div className="flex flex-col-reverse gap-2 rounded-b-[26px] border-t border-line bg-canvas/70 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">
          <Button type="submit" variant="primary" loading={busy} icon={<ArrowRightIcon size={14} />}>
            Continuar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ───────────── Guía del panel ───────────── */

// `module`: la página que abre el paso (y el enlace del menú que se resalta). `target`: lo que se resalta en la página
// (data-tour en el componente de esa página).
// `adminOnly`: lo que explica solo lo ven los administradores (p. ej., los calendarios de Booking).
type Step = { module: ModuleId; href: string; target: string; adminOnly?: true; title: string; text: string; points: ReactNode[] };

const STEPS: Step[] = [
  {
    module: "dashboard",
    href: paths.dashboard,
    target: "pulse",
    title: "El estado del día",
    text: "Lo primero que ves al entrar es lo que pasa hoy en la finca.",
    points: [
      "Quién llega, quién sale y quién está en estadía, con las llegadas de las próximas dos semanas.",
      "Las reservas que esperan el abono y lo que falta por cobrar.",
      "Las noches libres de la semana y los baños con algún problema.",
    ],
  },
  {
    module: "dashboard",
    href: paths.dashboard,
    target: "new-reservation",
    title: "Crear una reserva",
    text: "Toca «Nueva reserva» (también está en el calendario y en Reservas).",
    points: [
      <>
        <b>Estadía:</b> la cabaña, su número, las fechas y cuántas personas.
      </>,
      <>
        <b>Huésped:</b> nombre, celular, documento y notas.
      </>,
      <>
        <b>Pago:</b> si ya pagó, registra el abono. Sin abono, la reserva no aparta las fechas: si otra paga primero, se le corre.
      </>,
    ],
  },
  {
    module: "calendario",
    href: paths.calendario(),
    target: "calendar-bar",
    title: "Ver el calendario",
    text: "La ocupación de cada cabaña, día por día.",
    points: [
      "Muévete con las flechas y «Hoy», elige el mes, la vista y la cabaña.",
      "Cada barra es una reserva: tócala para ver el detalle.",
      "Arriba de cada tipo ves cuántas cabañas quedan libres.",
    ],
  },
  {
    module: "cabanas",
    href: paths.cabanas,
    target: "new-cabin",
    title: "Crear o actualizar cabañas",
    text: "Lo que ves aquí es lo que se ofrece en el sitio, en el mismo orden.",
    points: [
      "«Nueva cabaña» agrega un tipo con sus fotos, capacidad y características.",
      "«Editar» cambia los datos de una cabaña; desactivarla la saca del sitio sin borrarla.",
      "Los baños y sus cierres están en «Bloqueos y baños».",
    ],
  },
  {
    module: "cabanas",
    href: paths.nuevaCabana,
    target: "cabin-capacity",
    title: "Capacidad y precio base",
    text: "Al crear o editar una cabaña, aquí defines cuántos caben y cuánto cuesta.",
    points: [
      <>
        <b>Capacidad máxima:</b> personas por cabaña, incluidos los niños.
      </>,
      <>
        <b>Cabañas de este tipo:</b> cuántas hay y el número de cada una, el mismo de la finca y de Booking.
      </>,
      <>
        <b>Precio base:</b> por noche. Las temporadas con otro precio se configuran en Tarifas.
      </>,
    ],
  },
  {
    module: "booking",
    href: paths.booking,
    target: "booking-inbox",
    title: "Reservas de Booking",
    text: "Las reservas de Booking.com llegan por correo de Ayenda y esperan aquí a que alguien les asigne cabaña.",
    points: [
      <>
        <b>Por asignar:</b> elige la cabaña y su número; en ese momento se crea la reserva, confirmada y sin pagos.
      </>,
      "Si la reserva ya estaba en el panel, descártala.",
      "Arriba ves las cifras de Booking del mes y, si eres administrador, los calendarios iCal de cada cabaña.",
    ],
  },
  {
    module: "tarifas",
    href: paths.tarifas(),
    target: "rates-tabs",
    title: "Precios, tarifas y temporadas",
    text: "Lo que cuesta cada noche, en tres secciones.",
    points: [
      <>
        <b>Tarifas:</b> el precio base por noche de cada cabaña.
      </>,
      <>
        <b>Temporadas:</b> precios para fechas especiales; reemplazan la tarifa base en esas fechas.
      </>,
      <>
        <b>Simulador:</b> calcula una estadía antes de cotizarla.
      </>,
    ],
  },
];

const ON = "data-tour-on";
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Solo el contenido de la página (no la barra lateral) repite la entrada del panel (globals.css: [data-entering]);
// `fast`, más rápida (al pasar de paso en la guía).
function replayEntrance(fast: boolean) {
  const main = document.querySelector("main");
  if (!main || reduced()) return;
  main.setAttribute("data-entering", "");
  main.toggleAttribute("data-enter-fast", fast);
  setTimeout(() => main.removeAttribute("data-entering"), fast ? 1200 : 1800);
}
const visible = (el: Element | null): el is HTMLElement => el instanceof HTMLElement && el.getClientRects().length > 0;
// Lo que se resalta en un paso: el primero que se ve (algunos están dos veces, p. ej. «Nueva reserva» del teléfono y del computador).
const targetOf = (name: string) => [...document.querySelectorAll(`[data-tour="${name}"]`)].find(visible) ?? null;

// Tarjeta fija (no modal: la página sigue a la vista y se puede usar). Cada paso abre su página y resalta lo que explica.
function Tour({ onDone }: { onDone: () => void }) {
  const { data, go } = useAdmin();
  const pathname = usePathname();
  const router = useRouter();
  const role = data.me.role;
  const steps = useMemo(() => STEPS.filter((s) => canOpen(role, s.module) && (!s.adminOnly || isAdminRole(role))), [role]);
  const [i, setI] = useState(0);
  const step = steps[i];
  const last = i === steps.length - 1;
  // Página en la que está el panel ahora (para los temporizadores y los clics) y si ya se llegó a la del paso.
  const arrived = useRef(false);
  const where = useRef(pathname);
  useEffect(() => {
    where.current = pathname;
  });
  // Al cerrar, la tarjeta y el velo se desvanecen antes de desmontarse.
  const [leaving, setLeaving] = useState(false);
  // «Terminar»: la tarjeta se va, los huecos se cierran y el velo oscurece todo; detrás se abre el dashboard, que entra
  // con su animación de llegada mientras el velo se desvanece.
  const [finishing, setFinishing] = useState(false);
  const close = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onDone, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : finishing ? 620 : 260);
  }, [leaving, onDone, finishing]);
  // Con todo oscuro aparece en el centro el mensaje de despedida (baja desde arriba), se queda un momento y se va hacia
  // abajo; mientras tanto se abre el dashboard detrás. Al irse el mensaje, el velo se desvanece y muestra el dashboard.
  const [farewell, setFarewell] = useState<"in" | "out" | null>(null);
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  // Fases: el velo se vuelve negro del todo; aparece el mensaje; se va; recién entonces se abre el dashboard (detrás del
  // negro) y, cuando ya está dibujado, el velo se desvanece mientras su contenido entra con la animación de llegada.
  const [revealing, setRevealing] = useState(false);
  const finish = () => {
    if (leaving || finishing) return;
    const still = reduced();
    setFinishing(true);
    setTimeout(() => setFarewell("in"), still ? 0 : 420);
    setTimeout(() => setFarewell("out"), still ? 1800 : 3100);
    setTimeout(
      () => {
        setFarewell(null);
        setRevealing(true);
        if (where.current !== paths.dashboard) go(paths.dashboard);
      },
      still ? 1800 : 3540,
    );
  };
  useEffect(() => {
    if (!revealing || pathname !== paths.dashboard) return;
    let done = false;
    const open = () => {
      if (done) return;
      done = true;
      clearInterval(poll);
      replayEntrance(false);
      closeRef.current(); // la versión actual: ya sabe que se está terminando (velo más lento)
    };
    const poll = setInterval(() => visible(targetOf("pulse")) && open(), 50);
    const giveUp = setTimeout(open, 3000);
    return () => {
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, [revealing, pathname]);

  // Pasar a un paso de otra página: la misma transición de «Terminar», más rápida. El velo oscurece todo y los huecos se
  // cierran; se abre la página y su contenido entra mientras el velo vuelve a dejar ver lo resaltado. `toPath` es la
  // página a la que se va: el velo sigue cerrado hasta que el panel llega a ella.
  const [toPath, setToPath] = useState<string | null>(null);
  const switching = toPath !== null;
  // Ya en la página nueva, el velo sigue cerrado hasta que la página termina de dibujarse (aparece lo que explica el
  // paso): la primera visita a una página tarda más (carga su código y sus datos) y así no se ve a medio armar. Entonces
  // su contenido entra con la animación de llegada y el velo se abre. Si lo resaltado no aparece, se abre igual a los 3 s.
  useEffect(() => {
    if (toPath === null || pathname !== toPath || !step) return;
    let opened = false;
    let reveal: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      if (opened) return;
      opened = true;
      clearInterval(poll);
      replayEntrance(true);
      reveal = setTimeout(() => setToPath(null), reduced() ? 0 : 60);
    };
    const poll = setInterval(() => visible(targetOf(step.target)) && open(), 50);
    const giveUp = setTimeout(open, 3000);
    return () => {
      clearInterval(poll);
      clearTimeout(giveUp);
      clearTimeout(reveal);
    };
  }, [pathname, toPath, step]);

  // Si la página no llega (la primera carga de su código en un servidor lento, o la conexión), el velo no se queda cerrado:
  // a los 6 s se abre igual y la guía sigue; lo resaltado aparece cuando la página termine de cargar.
  useEffect(() => {
    if (toPath === null) return;
    const t = setTimeout(() => setToPath(null), 6000);
    return () => clearTimeout(t);
  }, [toPath]);

  // Las páginas de la guía se piden por adelantado: el primer paso a cada una no espera a que cargue su código.
  useEffect(() => {
    steps.forEach((s) => router.prefetch(s.href));
  }, [steps, router]);
  const goTo = (n: number) => {
    const target = steps[n];
    if (!target || switching) return;
    const path = target.href.split("?")[0];
    if (path === where.current || reduced()) return setI(n);
    setToPath(path);
    setTimeout(() => setI(n), 140); // el efecto de abajo abre la página
  };

  // Para los clics en lo resaltado (efecto de más abajo): siempre la versión actual, sin volver a montar el resaltado.
  const goToRef = useRef(goTo);
  useEffect(() => {
    goToRef.current = goTo;
  });

  // Abre la página del paso (solo al cambiar de paso). Si después la persona se va a otra página por su cuenta, la guía
  // se cierra en lugar de devolverla. (Tocar lo resaltado cuando lleva al paso siguiente avanza la guía: más abajo.)
  useEffect(() => {
    if (!step) return;
    arrived.current = where.current === step.href.split("?")[0];
    if (!arrived.current) go(step.href);
  }, [step, go]);
  useEffect(() => {
    if (!step) return;
    if (pathname === step.href.split("?")[0]) arrived.current = true;
    else if (arrived.current && !finishing) close(); // «Terminar» abre el dashboard y cierra la guía por su cuenta
  }, [pathname, step, close, finishing]);

  // Resalta lo que explica el paso (cuando la página termina de cargar) y su enlace en el menú.
  useEffect(() => {
    if (!step || finishing || switching) return;
    const marked: HTMLElement[] = [];
    const unlisten: (() => void)[] = [];
    const mark = (el: HTMLElement) => {
      // Todo lo resaltado va redondeado: si el elemento tiene esquinas rectas (p. ej. la barra del calendario), se le da un
      // radio mientras dure el paso. El contorno y el hueco del velo siguen ese radio.
      if ((parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0) < 14) {
        const before = el.style.borderRadius;
        el.style.borderRadius = "20px";
        unlisten.push(() => void (el.style.borderRadius = before));
      }
      el.setAttribute(ON, "");
      marked.push(el);
    };
    // Se busca sin parar mientras dure el paso: una página que tarda en cargar (la primera vez, o con conexión lenta) se
    // resalta igual, y si la página vuelve a dibujar lo resaltado (otro elemento en el DOM), se marca de nuevo.
    let current: HTMLElement | null = null;
    const timer = setInterval(() => {
      if (current?.isConnected) return;
      const el = targetOf(step.target);
      if (visible(el)) {
        current = el;
        mark(el);
        // Lo resaltado lleva a la página del paso siguiente (p. ej. «Nueva cabaña»): la guía avanza y explica lo que hay ahí.
        const link = el.closest("a");
        const next = steps[i + 1];
        if (link && next && new URL(link.href).pathname === next.href.split("?")[0]) {
          const onClick = (e: MouseEvent) => {
            // Ni el navegador ni el Link navegan: lo hace la guía al pasar de paso (un solo paso en el historial).
            e.preventDefault();
            e.stopPropagation();
            goToRef.current(i + 1);
          };
          link.addEventListener("click", onClick);
          unlisten.push(() => link.removeEventListener("click", onClick));
        }
        el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
    }, 120);
    const nav = document.querySelector(`[data-nav="${step.module}"]`);
    if (visible(nav)) mark(nav);
    return () => {
      clearInterval(timer);
      marked.forEach((el) => el.removeAttribute(ON));
      unlisten.forEach((off) => off());
    };
  }, [step, pathname, steps, i, finishing, switching]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  if (!step) return null;
  return (
    <>
      <Spotlight leaving={leaving} finishing={finishing} switching={switching} />
      {farewell && (
        <div role="status" className="pointer-events-none fixed inset-0 z-[46] grid place-items-center overflow-hidden p-6">
          {/* Brillo cálido detrás del mensaje, que se abre despacio. */}
          <div
            aria-hidden="true"
            className="tour-farewell-glow absolute top-1/2 left-1/2 size-[min(900px,140vw)] -translate-x-1/2 -translate-y-1/2 rounded-full"
          />
          <div data-out={farewell === "out" || undefined} className="tour-farewell relative flex max-w-[620px] flex-col items-center text-center">
            {/* Cada pieza baja desde arriba, una tras otra (--d). */}
            <span data-f className="tour-farewell-fifi w-[150px]" style={{ "--d": "0ms" } as CSSProperties}>
              <Fifi />
            </span>
            <span
              data-f
              style={{ "--d": "140ms" } as CSSProperties}
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-white/8 py-1.5 pr-3.5 pl-1.5 text-[12.5px] font-semibold tracking-[0.08em] text-[#f4b8d6] uppercase ring-1 ring-[#f4b8d6]/30"
            >
              <span className="grid size-6 place-items-center rounded-full bg-[#f4b8d6] text-[#171614]">
                <CheckIcon size={13} />
              </span>
              Guía completada
            </span>
            <p
              data-f
              style={{ "--d": "260ms" } as CSSProperties}
              className="mt-5 text-[clamp(1.25rem,2.6vw,1.75rem)] leading-tight font-medium tracking-[-0.02em] text-white/80"
            >
              Listo, ya estás preparado para usar
            </p>
            <p
              data-f
              style={{ "--d": "380ms" } as CSSProperties}
              className="tour-farewell-name mt-1 text-[clamp(2.2rem,5.4vw,3.6rem)] leading-[1.05] font-bold tracking-[-0.035em]"
            >
              La Vaca Fifí
            </p>
            <span
              data-f
              style={{ "--d": "500ms" } as CSSProperties}
              className="mt-6 h-px w-24 bg-gradient-to-r from-transparent via-[#f4b8d6]/70 to-transparent"
            />
            <p data-f style={{ "--d": "580ms" } as CSSProperties} className="mt-4 text-[14px] text-white/55">
              Tu panel te espera. ¡Muuu!
            </p>
          </div>
        </div>
      )}
      <section
        role="region"
        aria-label="Guía del panel"
        aria-live="polite"
        data-leaving={leaving || finishing || undefined}
        className="tour-card fixed inset-x-3 bottom-3 z-50 flex flex-col gap-4 rounded-[24px] p-5 text-ink sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px]"
      >
        <div className="flex items-start justify-between gap-3">
          <div key={i} className="tour-step min-w-0">
            <p className="text-[12.5px] font-medium text-ink-muted">
              Guía del panel · {i + 1} de {steps.length}
            </p>
            <h2 className="mt-1 text-[18px] leading-tight font-bold tracking-[-0.02em] text-ink">{step.title}</h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Saltar la guía"
            className="grid size-8 flex-none place-items-center rounded-full text-ink-muted transition-colors hover:bg-panel hover:text-ink"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div key={i} className="tour-step flex flex-col gap-2.5 [--tour-delay:60ms]">
          <p className="text-[14px] text-ink">{step.text}</p>
          <ul className="flex flex-col gap-2">
            {step.points.map((p, k) => (
              <li key={k} className="flex gap-2.5 text-[13.5px] leading-snug text-ink-muted [&_b]:font-semibold [&_b]:text-ink">
                <span aria-hidden="true" className="mt-[7px] size-1.5 flex-none rounded-full bg-ink-subtle" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div aria-hidden="true" className="flex gap-1.5">
            {steps.map((s, k) => (
              <span
                key={s.target}
                className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out ${k === i ? "w-5 bg-ink" : "w-1.5 bg-line-strong"}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 && (
              <Button size="sm" variant="ghost" icon={<ArrowLeftIcon size={14} />} onClick={() => goTo(i - 1)}>
                Atrás
              </Button>
            )}
            <Button
              size="sm"
              variant="primary"
              icon={last ? <CheckIcon size={14} /> : <ArrowRightIcon size={14} />}
              loading={switching}
              onClick={() => (last ? finish() : goTo(i + 1))}
            >
              {last ? "Terminar" : "Siguiente"}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

/* ───────────── Oscurecer el resto ───────────── */

const HOLE_PAD = 8;
type Hole = { x: number; y: number; w: number; h: number; r: number };

// Toda la pantalla y, adentro, un rectángulo redondeado por hueco.
function veilPath(holes: Hole[]) {
  const big = "M-10 -10H100000V100000H-10Z";
  return (
    big +
    holes
      .filter((h) => h.w > 0.5 && h.h > 0.5)
      .map(({ x, y, w, h, r }) => {
        const k = Math.max(0, Math.min(r, w / 2, h / 2));
        return `M${x + k} ${y}H${x + w - k}A${k} ${k} 0 0 1 ${x + w} ${y + k}V${y + h - k}A${k} ${k} 0 0 1 ${x + w - k} ${y + h}H${x + k}A${k} ${k} 0 0 1 ${x} ${y + h - k}V${y + k}A${k} ${k} 0 0 1 ${x + k} ${y}Z`;
      })
      .join("")
  );
}

// Velo sobre todo el panel con huecos en lo que se resalta ([data-tour-on]). Sigue a lo resaltado en cada cuadro (scroll,
// cambios de tamaño, la página que termina de cargar) y, al cambiar de paso, cada hueco viaja con suavidad hasta lo
// nuevo; uno que ya no tiene qué mostrar se cierra sobre su centro. No atrapa clics: lo resaltado se puede usar.
function Spotlight({ leaving, finishing, switching }: { leaving: boolean; finishing: boolean; switching: boolean }) {
  // Los huecos se dibujan escribiendo el trazado directamente (sin estado de React): seguirlos en cada cuadro no vuelve
  // a renderizar nada.
  const path = useRef<SVGPathElement>(null);
  useEffect(() => {
    const ease = reduced() ? 1 : 0.16;
    const shut = (h: Hole): Hole => ({ x: h.x + h.w / 2, y: h.y + h.h / 2, w: 0, h: 0, r: 0 });
    // El radio de cada elemento se lee una vez (getComputedStyle en cada cuadro obliga a recalcular estilos).
    const radius = new WeakMap<Element, number>();
    const radiusOf = (el: HTMLElement) => {
      let r = radius.get(el);
      if (r === undefined) radius.set(el, (r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0));
      return r;
    };
    let cur: Hole[] = [];
    let raf = 0;
    let last = "";
    const tick = () => {
      const target = [...document.querySelectorAll<HTMLElement>(`[${ON}]`)].map((el) => {
        const b = el.getBoundingClientRect();
        return {
          x: b.left - HOLE_PAD,
          y: b.top - HOLE_PAD,
          w: b.width + HOLE_PAD * 2,
          h: b.height + HOLE_PAD * 2,
          r: Math.min(radiusOf(el) + HOLE_PAD, (b.height + HOLE_PAD * 2) / 2),
        };
      });
      const n = Math.max(cur.length, target.length);
      const next: Hole[] = [];
      for (let k = 0; k < n; k++) {
        const to = target[k] ?? shut(cur[k]);
        const from = cur[k] ?? shut(to); // uno nuevo se abre desde su centro
        const step = (a: number, b: number) => (Math.abs(b - a) < 0.3 ? b : a + (b - a) * ease);
        const h = { x: step(from.x, to.x), y: step(from.y, to.y), w: step(from.w, to.w), h: step(from.h, to.h), r: step(from.r, to.r) };
        if (target[k] || h.w > 0.5) next.push(h);
      }
      cur = next;
      const d = veilPath(next);
      if (d !== last && path.current) {
        last = d;
        path.current.setAttribute("d", d);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <svg
      aria-hidden="true"
      data-leaving={leaving || undefined}
      data-finishing={finishing || undefined}
      data-switching={switching || undefined}
      className="tour-veil pointer-events-none fixed inset-0 z-[45] size-full"
    >
      {/* Un solo trazado con los huecos recortados (evenodd): así lo oscurecido también bloquea el mouse (sin tooltips ni
          clics sobre lo que no es del paso) y los huecos lo dejan pasar. */}
      <path ref={path} d={veilPath([])} fillRule="evenodd" fill="rgba(10, 9, 8, 0.62)" className={leaving ? "" : "pointer-events-auto"} />
    </svg>
  );
}
