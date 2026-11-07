"use client";

// Estructura común del panel (app/admin/layout.tsx): sesión, datos, tiempo real, navegación, avisos y confirmaciones.
// Cada módulo es una página propia (app/admin/<modulo>/page.tsx) que se monta dentro de este marco.
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Brand, BrandName, Logo } from "@/components/brand/logo";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, InfoIcon, MenuIcon, RefreshIcon, SearchIcon, SettingsIcon, WarningIcon } from "@/components/ui/icons";
import { useSite } from "@/components/site/site-provider";
import { api } from "@/lib/client/api";
import { offlineEnabled } from "@/lib/offline/config";
import type { SyncEngine } from "@/lib/offline/engine";
import { precacheShell } from "@/lib/offline/precache";
import { closeSession, endSession, openSession } from "@/lib/offline/session";
import { cabinName } from "@/lib/booking";
import { config } from "@/lib/config";
import { todayISO } from "@/lib/format";
import { mergePanelColors, panelColorsCss, type PanelColors } from "@/lib/panel-colors";
import { themeCss, type SiteTheme } from "@/lib/theme";
import type { AdminData, PanelRole } from "@/lib/types";
import { AdminProvider, type AdminCtx } from "@/components/admin/context";
import { DateRangePicker } from "@/components/admin/date-picker";
import { PanelFooter } from "@/components/admin/footer";
import { TipProvider, useLabelTip, useTip } from "@/components/ui/floating";
import { Login } from "@/components/admin/login";
import { PanelSkeleton } from "@/components/admin/skeletons";
import { NotificationCenter, chime, soundFor, unlockAudio, useRealtime } from "@/components/admin/notifications";
import { PREF, usePref, writePref } from "@/components/admin/prefs";
import { ThemeMenu, syncBrowserBar, useApplyTheme } from "@/components/admin/appearance";
import { BookingSyncButton } from "@/components/admin/booking-calendars";
import { CONTENT_SECTIONS, MODULES, MODULE_IDS, NAV_GROUPS, canOpen, clientKeyOf, legacyPath, moduleOf, paths, type ModuleId } from "@/components/admin/routes";
import { AccessDenied, AccountMenu } from "@/components/admin/account";
import { GlobalSearch } from "@/components/admin/global-search";
import { SyncChip } from "@/components/admin/sync";
import { type Ask, type ConfirmCfg, adminInput } from "@/components/admin/shared";
import {
  Button,
  Callout,
  CountBadge,
  enter,
  ErrorState,
  Field,
  FieldError,
  IconButton,
  Modal,
  ModalPresence,
  iconButtonClass,
  PageSkeleton,
  Toasts,
  type Crumb,
  type ToastMsg,
} from "@/components/admin/ui";

/* ───────────── Colores ───────────── */

// El panel tiene sus propios colores (app/globals.css), personalizables en Configuración → Colores. La paleta publicada
// del sitio se declara igual, para las vistas previas del sitio que muestra (fotos, colores, textos). Las hojas se van
// con el panel al volver al sitio.
function PanelTheme({ theme }: { theme: SiteTheme }) {
  return <style dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />;
}
function PanelColorsStyle({ colors }: { colors: PanelColors }) {
  useEffect(syncBrowserBar, [colors]);
  // Se valida aquí porque esta hoja envuelve todo el panel: unos datos sin colores no deben tumbarlo.
  return <style dangerouslySetInnerHTML={{ __html: panelColorsCss(mergePanelColors(colors)) }} />;
}

/* ───────────── Acceso ───────────── */

type Gate =
  | { status: "checking" }
  | { status: "login" }
  | { status: "error"; firstTime?: boolean }
  | { status: "expired" }
  | { status: "app"; data: AdminData; engine: SyncEngine | null };

// La sesión la valida el servidor: si /admin/data responde 200 hay sesión de administrador.
export function AdminShell({ children }: { children: ReactNode }) {
  // Antes de entrar (carga, ingreso), los colores publicados que trae el sitio; dentro, los de los datos del panel,
  // que cambian apenas se publica otra paleta.
  const { theme, panelColors } = useSite();
  useApplyTheme();
  return (
    <>
      <PanelTheme theme={theme} />
      <Gated panelColors={panelColors}>{children}</Gated>
    </>
  );
}

function Gated({ panelColors, children }: { panelColors: PanelColors; children: ReactNode }) {
  const [gate, setGate] = useState<Gate>({ status: "checking" });
  const check = useCallback(() => {
    const online = () =>
      api.admin
        .data()
        .then((r) =>
          setGate(
            r.status === 200 && r.data
              ? { status: "app", data: r.data, engine: null }
              : r.status === 401 || r.status === 403
                ? { status: "login" }
                : { status: "error" },
          ),
        )
        .catch(() => setGate({ status: "error" }));
    if (!offlineEnabled) return online();
    // Sin conexión también abre: con lo guardado en este dispositivo por el último usuario validado (lib/offline).
    return openSession().then(
      (o) =>
        setGate(
          o.status === "app"
            ? { status: "app", data: o.engine.data, engine: o.engine }
            : o.status === "error"
              ? { status: "error", firstTime: o.firstTime }
              : { status: o.status },
        ),
      (e) => {
        // Este navegador no permite guardar datos (IndexedDB bloqueado o sin espacio): el panel sigue funcionando en línea.
        console.error("[offline] sin almacén local", e);
        return online();
      },
    );
  }, []);
  const recheck = useCallback(() => {
    setGate({ status: "checking" });
    check();
  }, [check]);
  const loggedOut = useCallback(() => setGate({ status: "login" }), []);

  useEffect(() => {
    check();
    return () => closeSession();
  }, [check]);

  // Antes de entrar, los colores publicados; dentro, los de los datos del panel (Panel). Mientras llegan los datos, el
  // panel ya se ve con su forma (esqueletos); al entrar, cada pieza llega con animación.
  const pre = <PanelColorsStyle colors={panelColors} />;
  if (gate.status === "checking")
    return (
      <>
        {pre}
        <PanelSkeleton />
      </>
    );
  if (gate.status === "login")
    return (
      <>
        {pre}
        <Login onSuccess={recheck} />
      </>
    );
  if (gate.status === "error" || gate.status === "expired")
    return (
      <div className="admin-surface grid min-h-dvh grid-rows-[1fr_auto] place-items-center bg-canvas px-4 pb-4">
        <div className="w-full max-w-[460px]">
          <ErrorState
            title={gate.status === "expired" ? "Conéctate para seguir" : "No pudimos abrir el panel"}
            text={
              gate.status === "expired"
                ? "Pasaron muchos días sin validar tu sesión con el servidor. Conéctate a internet para volver a abrir el panel en este dispositivo."
                : gate.firstTime
                  ? "La primera vez en este dispositivo necesitas internet para descargar los datos. Después, el panel también funciona sin conexión."
                  : "Revisa tu conexión a internet. Si el problema sigue, el servidor puede estar en mantenimiento."
            }
            onRetry={recheck}
          />
        </div>
        {pre}
        <PanelFooter className="w-full" />
      </div>
    );
  return (
    <Panel initialData={gate.data} engine={gate.engine} onLoggedOut={loggedOut}>
      {children}
    </Panel>
  );
}

/* ───────────── Confirmación ───────────── */

type ConfirmState = ConfirmCfg & { error: string; busy: boolean };

function ConfirmDialog({
  cf,
  onChange,
  onCancel,
  onOk,
}: {
  cf: ConfirmState;
  onChange: (p: Partial<ConfirmCfg>) => void;
  onCancel: () => void;
  onOk: () => void;
}) {
  const noteMissing = !!cf.noteRequired && !cf.note?.trim();
  return (
    <Modal
      role="alertdialog"
      onClose={onCancel}
      labelledBy="cf-title"
      describedBy="cf-text"
      initialFocus={cf.reschedule || cf.noteLabel ? "#cf-first" : "#cf-ok"}
      className="m-auto w-[calc(100%-32px)] max-w-[460px] rounded-[26px] p-0"
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex gap-3.5">
          <span
            aria-hidden="true"
            className={`grid size-11 flex-none place-items-center rounded-full ${cf.danger ? "bg-error-soft text-error" : "bg-pink text-ink"}`}
          >
            {cf.danger ? <WarningIcon size={19} /> : <InfoIcon size={19} />}
          </span>
          <div className="min-w-0 pt-1.5">
            <h2 id="cf-title" className="text-[18px] leading-tight font-bold tracking-[-0.02em] text-ink">
              {cf.title}
            </h2>
            <p id="cf-text" className="mt-1.5 text-[14px] text-ink-muted">
              {cf.text}
            </p>
          </div>
        </div>
        {cf.details && cf.details.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-[16px] bg-panel px-4 py-3 text-[13.5px]">
            {cf.details.map((d) => (
              <div key={d.k} className="contents">
                <dt className="text-ink-muted">{d.k}</dt>
                <dd className="font-semibold text-ink">{d.v}</dd>
              </div>
            ))}
          </dl>
        )}
        {cf.reschedule && (
          <Field label="Nuevas fechas" hint="Los días con punto rojo ya no tienen cabañas libres de este tipo.">
            {(p) => (
              <DateRangePicker
                id="cf-first"
                describedBy={p["aria-describedby"]}
                mode="nights"
                from={cf.ci ?? null}
                to={cf.co ?? null}
                min={todayISO()}
                marks={cf.marks}
                legend
                onChange={(ci, co) => onChange({ ci: ci ?? undefined, co: co ?? undefined })}
              />
            )}
          </Field>
        )}
        {cf.noteLabel && (
          <Field label={cf.noteLabel} hint={cf.noteHint}>
            {(p) => (
              <textarea
                {...p}
                id="cf-first"
                rows={3}
                maxLength={500}
                value={cf.note ?? ""}
                onChange={(e) => onChange({ note: e.target.value })}
                className={`${adminInput} resize-y leading-relaxed`}
              />
            )}
          </Field>
        )}
        {cf.optionLabel && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-[16px] border border-line px-4 py-3 text-[14px] text-ink transition-colors hover:bg-panel">
            <input
              type="checkbox"
              checked={!!cf.option}
              onChange={(e) => onChange({ option: e.target.checked })}
              className="mt-0.5 size-4 flex-none accent-[var(--color-ink)]"
            />
            {cf.optionLabel}
          </label>
        )}
        {cf.error && <FieldError>{cf.error}</FieldError>}
      </div>
      <div className="flex flex-col-reverse gap-2 rounded-b-[26px] border-t border-line bg-canvas/70 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">
        <Button onClick={onCancel}>Volver</Button>
        <Button
          id="cf-ok"
          variant={cf.danger ? "danger" : "primary"}
          loading={cf.busy}
          disabled={noteMissing || (cf.reschedule && !(cf.ci && cf.co))}
          onClick={onOk}
        >
          {cf.busy ? "Procesando…" : cf.okLabel}
        </Button>
      </div>
    </Modal>
  );
}

/* ───────────── Navegación ───────────── */

type Badges = Partial<Record<ModuleId, { n: number; label: string }>>;

// Elemento del menú de la barra lateral negra. `mini`: solo el icono (barra contraída), con el nombre en el título y
// para lectores de pantalla.
const navItem = (mini: boolean) =>
  `group relative flex items-center rounded-full text-left text-[14px] leading-tight font-medium transition-colors duration-150 ${
    mini ? "mx-auto size-10 justify-center" : "min-h-[38px] w-full gap-3 px-3.5 py-1.5 pointer-coarse:min-h-11"
  }`;
const navIcon = "text-white/55 transition-colors group-hover:text-white/90";
// Booking lleva su azul (el del tema claro del panel, fijo porque la barra es oscura en los dos temas y en el oscuro ese
// token se oscurece): el icono, y al pasar el mouse un fondo azul tan suave como el gris de las demás filas.
const bookingIcon = "text-[#91a9e0] transition-colors group-hover:text-[#dbe5f8]";
const bookingHover = "text-white/72 hover:bg-[#b6c8ef]/20 hover:text-white";
// Tooltips de la barra lateral contraída: al lado, desde el borde de la barra, y sin esperar.
const SIDE_TIP = { placement: "right", delay: 60 } as const;

function NavTip({ label, badge }: { label: string; badge?: { n: number; label: string } }) {
  return (
    <span className="flex flex-col gap-0.5 whitespace-nowrap">
      <span className="flex items-center gap-2 text-[13px] font-semibold">
        {label}
        {badge?.n ? <span className="rounded-full bg-pink px-1.5 text-[11px] font-bold text-ink tabular-nums">{badge.n}</span> : null}
      </span>
      {badge?.n ? <span className="text-[11.5px] opacity-70">{`${badge.n} ${badge.label}`}</span> : null}
    </span>
  );
}

// Menú de módulos por grupos: el mismo en la barra lateral (escritorio) y en el cajón (móvil y tableta).
function NavList({
  current,
  badges,
  role,
  mini = false,
  onNavigate,
}: {
  current: ModuleId | null;
  badges: Badges;
  role: PanelRole;
  mini?: boolean;
  onNavigate?: () => void;
}) {
  const tip = useTip();
  const groups = NAV_GROUPS.map((g) => ({
    g,
    ids: MODULE_IDS.filter((id) => MODULES[id].group === g && MODULES[id].nav !== false && canOpen(role, id)),
  })).filter((x) => x.ids.length);
  // Turno de cada módulo en la entrada del panel: uno tras otro, de arriba abajo.
  let order = 0;
  return (
    <nav aria-label="Módulos del panel" className={`flex flex-col ${mini ? "gap-2.5" : "gap-2"}`}>
      {groups.map(({ g, ids }, gi) => (
        <div key={g} className="flex flex-col gap-0.5">
          {mini ? (
            gi > 0 && <span aria-hidden="true" className="mx-auto mb-2 block h-px w-6 bg-white/12" />
          ) : (
            <p className="px-3.5 pb-1 text-[12.5px] font-medium text-white/45">{g}</p>
          )}
          {ids.map((id) => {
            const { label, icon: Icon, href } = MODULES[id];
            const active = current === id;
            const b = badges[id];
            // Junto a Booking (solo administradores, que son quienes leen Booking), un botón para leerlo ya.
            const reloadBooking = id === "booking" && role === "admin" && !mini;
            const link = (
              <Link
                key={id}
                href={href}
                onClick={() => onNavigate?.()}
                aria-current={active ? "page" : undefined}
                data-nav={id}
                {...enter(1 + order++ * 0.5, "side")}
                {...(mini ? tip(() => <NavTip label={label} badge={b} />, SIDE_TIP) : {})}
                className={`${navItem(mini)} ${reloadBooking ? "pr-10" : ""} ${active ? `text-pink ${mini ? "bg-white/10" : ""}` : id === "booking" ? bookingHover : "text-white/72 hover:bg-white/7 hover:text-white"}`}
              >
                {active && !mini && <span aria-hidden="true" className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full bg-pink" />}
                <Icon size={19} className={id === "booking" ? bookingIcon : active ? "text-pink" : navIcon} />
                <span className={mini ? "sr-only" : "flex-1"}>{label}</span>
                {b?.n ? (
                  mini ? (
                    <>
                      <span aria-hidden="true" className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-pink ring-2 ring-ink" />
                      <span className="sr-only">{`${b.n} ${b.label}`}</span>
                    </>
                  ) : (
                    <CountBadge n={b.n} tone="attention" label={b.label} />
                  )
                ) : null}
              </Link>
            );
            return reloadBooking ? (
              <div key={id} className="relative">
                {link}
                <BookingSyncButton className="absolute top-1/2 right-1.5 -translate-y-1/2" />
              </div>
            ) : (
              link
            );
          })}
        </div>
      ))}
    </nav>
  );
}

// Barra lateral de escritorio: panel negro redondeado, separado del borde. Se contrae a solo iconos (preferencia de
// este navegador); su ancho, en --admin-sidebar, lo usan también las barras fijas al pie (SaveBar).
function Sidebar({
  current,
  badges,
  role,
  mini,
  onToggle,
}: {
  current: ModuleId | null;
  badges: Badges;
  role: PanelRole;
  mini: boolean;
  onToggle: () => void;
}) {
  const tip = useTip();
  return (
    <aside {...enter(0, "side")} className="sticky top-0 z-40 hidden h-dvh w-(--admin-sidebar) flex-none p-3 transition-[width] duration-200 lg:block">
      <div
        data-tip-edge
        className="admin-dark relative flex h-full flex-col rounded-[28px] bg-sidebar text-white [[data-admin-theme=dark]_&]:ring-1 [[data-admin-theme=dark]_&]:ring-white/8"
      >
        <Link
          href={paths.dashboard}
          aria-label={mini ? `${config.name}: ir al dashboard` : undefined}
          {...(mini ? tip(() => <NavTip label="Ir al dashboard" />, SIDE_TIP) : {})}
          className={`flex min-w-0 items-center gap-3 rounded-[20px] pt-6 pb-5 ${mini ? "justify-center px-2" : "px-5"}`}
        >
          {mini ? <Logo size={32} eager /> : <Brand size={40} wordSize="1.1rem" eyebrowSize=".47rem" eyebrow="cabañas · restaurante" eager />}
        </Link>
        {/* Centrado con el logo: 24 px de margen + medio logo − 14 px (medio botón): 30 px abierto (logo de 40), 26 px
            contraído (logo de 32, centrado con los íconos; el botón sale un poco más para no taparlo). Dorado pastel fijo en
            los dos modos: la barra lateral es negra siempre y el dorado oscuro del modo oscuro no se vería. */}
        <button
          type="button"
          onClick={onToggle}
          aria-label={mini ? "Expandir el menú" : "Contraer el menú"}
          data-gesture={mini ? "next" : "prev"}
          {...tip(() => <NavTip label={mini ? "Expandir el menú" : "Contraer el menú"} />, SIDE_TIP)}
          aria-expanded={!mini}
          className={`absolute grid size-7 ${mini ? "top-[26px] -right-[18px]" : "top-7.5 -right-3.5"} place-items-center rounded-full bg-[#f5d462] text-[#171614] ring-[3px] ring-canvas transition-colors hover:bg-[#e9bf38]`}
        >
          {mini ? <ChevronRightIcon size={15} /> : <ChevronLeftIcon size={15} />}
        </button>
        <div className={`no-scrollbar flex-1 overflow-y-auto pb-4 ${mini ? "px-2" : "px-3"}`}>
          <NavList current={current} badges={badges} role={role} mini={mini} />
        </div>
      </div>
    </aside>
  );
}

// Atajo a Configuración en el encabezado.
function SettingsLink() {
  const tip = useLabelTip("Configuración");
  return (
    <Link href={paths.configuracion} aria-label="Configuración" data-gesture="settings" {...tip} className={iconButtonClass("primary")}>
      <SettingsIcon size={18} />
    </Link>
  );
}

// Ruta de la página (Dashboard / Módulo / Detalle): da el nombre de la página actual.
function crumbsFor(pathname: string, data: AdminData): Crumb[] {
  const mod = moduleOf(pathname);
  const root: Crumb = { label: MODULES.dashboard.label, href: paths.dashboard };
  if (mod === "dashboard") return [{ label: MODULES.dashboard.label }];
  if (!mod) return [root, { label: "Página no encontrada" }];
  const seg = decodeURIComponent(pathname.split("/")[3] ?? "");
  const section: Crumb = { label: MODULES[mod].label, href: MODULES[mod].href };
  if (!seg) return [root, section];
  const detail =
    mod === "reservas"
      ? `Reserva ${seg.toUpperCase()}`
      : mod === "clientes"
        ? (data.reservations.find((r) => r.clientKey === clientKeyOf(seg))?.guest.fullName ?? "Cliente")
        : mod === "cabanas"
          ? seg === "nueva"
            ? "Nueva cabaña"
            : `Editar ${data.cabinTypes.find((c) => c.id === seg)?.nombre ?? "cabaña"}`
          : mod === "contenido"
            ? (CONTENT_SECTIONS.find((s) => s.id === seg)?.label ?? "Sección")
            : mod === "configuracion"
              ? "Colores"
              : "Detalle";
  return [root, section, { label: detail }];
}

// Enlaces del panel anterior (/admin?s=…&r=…) → rutas actuales.
function LegacyRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    if (pathname !== paths.dashboard) return;
    const to = legacyPath(new URLSearchParams(search.toString()));
    if (to) router.replace(to);
  }, [pathname, search, router]);
  return null;
}

/* ───────────── Panel ───────────── */

function Panel({
  initialData,
  engine,
  onLoggedOut,
  children,
}: {
  initialData: AdminData;
  engine: SyncEngine | null;
  onLoggedOut: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [data, setDataState] = useState<AdminData>(initialData);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [menu, setMenu] = useState(false);
  const [searching, setSearching] = useState(false);
  const [colorPreview, setColorPreview] = useState<PanelColors | null>(null);
  const mini = usePref(PREF.sidebar, "full") === "mini";
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const firstPath = useRef(true);
  // Entrada del panel (globals.css): las piezas con data-enter se animan solo mientras dura; navegar después no las repite.
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 1800);
    return () => clearTimeout(t);
  }, []);
  const today = todayISO();
  const mod = moduleOf(pathname);

  const setData = useCallback((fn: (d: AdminData) => AdminData) => setDataState(fn), []);
  const showToast = useCallback(
    (text: string, kind: "ok" | "error" = "ok", action?: ToastMsg["action"]) => {
      const id = Date.now() + Math.random();
      // El módulo dice qué pasó; aquí se aclara que aún no llegó al servidor, sin que cada módulo tenga que saberlo.
      const local = kind === "ok" && !!engine && Date.now() - engine.lastQueuedAt < 2000;
      setToast({ id, text: local ? `${text} · Guardado en este dispositivo` : text, kind, action });
      setTimeout(() => setToast((t) => (t?.id === id ? null : t)), action ? 6000 : 3600);
    },
    [engine],
  );

  const load = useCallback(async () => {
    if (engine) return engine.sync();
    try {
      const r = await api.admin.data();
      if (r.status === 401 || r.status === 403) return onLoggedOut();
      if (r.status !== 200 || !r.data) throw 0;
      setDataState(r.data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [engine, onLoggedOut]);

  // La proyección del motor es la fuente de los datos: cambia con cada escritura, cada entrega del servidor y otras pestañas.
  useEffect(() => {
    if (!engine) return;
    engine.setOnAuthLost(onLoggedOut);
    const unsubscribe = engine.subscribe(() => setDataState(engine.data));
    // Lo que cambió entre abrir el motor y este momento.
    void Promise.resolve().then(() => setDataState(engine.data));
    if (engine.status.network === "online") void precacheShell();
    return unsubscribe;
  }, [engine, onLoggedOut]);

  // Un 401 o 403 de un módulo: si la sesión sigue bien, era falta de permiso, y eso no saca del panel ni descarta nada.
  const authError = useCallback(() => {
    if (!engine) return onLoggedOut();
    void api.admin.ping().then(
      (r) => (r.status === 200 ? showToast("Tu cuenta no tiene permiso para esta acción.", "error") : onLoggedOut()),
      () => showToast("Sin conexión: no se pudo comprobar tu sesión.", "error"),
    );
  }, [engine, onLoggedOut, showToast]);

  // Varios cambios seguidos (tiempo real) se agrupan en una sola recarga.
  const scheduleReload = useCallback(() => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(load, 400);
  }, [load]);

  const go = useCallback((href: string) => router.push(href), [router]);
  const openReservation = useCallback((code: string) => router.push(paths.reserva(code)), [router]);

  // Al cambiar de página: el foco va al título (lectores de pantalla y teclado empiezan por arriba).
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    const t = setTimeout(() => document.getElementById("ad-title")?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(t);
  }, [pathname]);

  // Reloj para cuentas regresivas: cada segundo donde se muestran (dashboard y ficha de reserva).
  const fast = mod === "dashboard" || /^\/admin\/reservas\/[^/]+/.test(pathname);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), fast ? 1000 : 30000);
    return () => clearInterval(t);
  }, [fast]);

  // El sonido solo puede sonar después de una interacción: se habilita con cada clic o tecla
  // (barato si ya está activo; reanuda el audio si el celular lo suspendió en segundo plano).
  useEffect(() => {
    const unlock = () => unlockAudio();
    addEventListener("pointerdown", unlock);
    addEventListener("keydown", unlock);
    return () => {
      removeEventListener("pointerdown", unlock);
      removeEventListener("keydown", unlock);
    };
  }, []);

  const live = useRealtime({
    onNotification: (n) => {
      setDataState((d) => (d.notifications.some((x) => x.id === n.id) ? d : { ...d, notifications: [n, ...d.notifications] }));
      if (!n.readAt) {
        showToast(n.title, "ok", n.reservationCode ? { label: "Ver", onClick: () => openReservation(n.reservationCode!) } : undefined);
        if (soundFor(n.kind)) void chime();
      }
      scheduleReload();
    },
    onChange: scheduleReload,
  });

  const crumbs = crumbsFor(pathname, data);
  const unread = data.notifications.filter((n) => !n.readAt).length;
  const pageLabel = crumbs[crumbs.length - 1].label;

  // Título de la pestaña: página actual y avisos sin leer, visibles aunque el panel esté en segundo plano.
  // Next vuelve a poner el título de los metadatos después de cada navegación: se observa <head> y se reaplica.
  const tabTitle = `${unread ? `(${unread}) ` : ""}${pageLabel} · Panel | ${config.name}`;
  useEffect(() => {
    const apply = () => {
      if (document.title !== tabTitle) document.title = tabTitle;
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  }, [tabTitle]);

  const ask: Ask = useCallback((cfg) => setConfirm({ ...cfg, error: "", busy: false }), []);

  async function runConfirm() {
    if (!confirm || confirm.busy) return;
    const cf = confirm;
    setConfirm({ ...cf, busy: true, error: "" });
    try {
      const r = await cf.run(cf);
      if (r.status === 401 || r.status === 403) {
        setConfirm(null);
        return authError();
      }
      if (r.status >= 400) {
        const { fields } = (r.data as { fields?: Record<string, string> } | null) ?? {};
        const msg = fields
          ? Object.values(fields)[0]
          : r.status === 409
            ? "Esas fechas no están disponibles."
            : r.status === 501
              ? "No disponible en modo simulado."
              : "No se pudo completar la acción.";
        setConfirm({ ...cf, busy: false, error: msg });
        return;
      }
      setConfirm(null);
      showToast(cf.done, "ok");
      await load();
    } catch {
      setConfirm({ ...cf, busy: false, error: "Error de conexión. Inténtalo de nuevo." });
    }
  }

  const logout = useCallback(async () => {
    if (!engine) return void api.admin.logout().finally(onLoggedOut);
    const me = engine.me.id;
    const out = () => endSession(me, () => api.admin.logout()).finally(onLoggedOut);
    await engine.sync();
    const unsent = engine.list();
    if (!unsent.length) return void out();
    // Cerrar sesión borra este dispositivo: lo que no se ha enviado se pierde, y eso se decide viéndolo.
    setConfirm({
      title: `Tienes ${unsent.length} ${unsent.length === 1 ? "cambio" : "cambios"} sin sincronizar`,
      text: "Si cierras sesión ahora se borran de este dispositivo y no se pueden recuperar. Vuelve atrás para sincronizar primero.",
      details: unsent.slice(0, 6).map((o, i) => ({ k: String(i + 1), v: o.label })),
      okLabel: "Descartar y cerrar sesión",
      danger: true,
      done: "Sesión cerrada",
      run: async () => {
        await out();
        return { status: 200, data: null };
      },
      error: "",
      busy: false,
    });
  }, [engine, onLoggedOut]);

  const cabinMap = useMemo(() => new Map(data.cabinTypes.map((c) => [c.id, c])), [data.cabinTypes]);
  const ctx: AdminCtx = {
    data,
    setData,
    reload: load,
    ask,
    toast: showToast,
    go,
    openReservation,
    onAuthError: authError,
    logout,
    live,
    sync: engine,
    today,
    now,
    cabin: (id) => cabinMap.get(id),
    cabinLabel: (id, unit) => {
      const c = cabinMap.get(id);
      const name = c?.nombre ?? id;
      return unit ? cabinName(c, unit) : name;
    },
    previewColors: setColorPreview,
  };

  const badges: Badges = {
    reservas: { n: data.reservations.filter((r) => r.status === "pending_deposit").length, label: "pendientes de abono" },
    // Lo que pide acción en Pagos: comprobantes por revisar.
    pagos: { n: data.proofs.filter((p) => p.status === "pending").length, label: "comprobantes por revisar" },
    notificaciones: { n: unread, label: "sin leer" },
  };
  // El calendario usa todo el ancho de la pantalla; su alto crece con las filas y se desplaza con la página.
  const fullWidth = mod === "calendario";
  // La sección de contenido conserva su formulario al cambiar de pestaña: no se vuelve a montar.
  const pageKey = mod === "contenido" ? "contenido" : pathname;

  return (
    <AdminProvider value={ctx}>
      <PanelTheme theme={data.site.theme} />
      <PanelColorsStyle colors={colorPreview ?? data.site.panelColors} />
      <TipProvider>
        <Suspense fallback={null}>
          <LegacyRedirect />
        </Suspense>
        <div
          className="admin-root min-h-dvh bg-canvas text-[15px] text-ink lg:flex"
          data-entering={entering ? "" : undefined}
          style={{ "--admin-sidebar": mini ? "88px" : "252px" } as CSSProperties}
        >
          <Sidebar current={mod} badges={badges} role={data.me.role} mini={mini} onToggle={() => writePref(PREF.sidebar, mini ? "full" : "mini")} />

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Móvil y tableta: menú en cajón, marca, búsqueda y notificaciones */}
            <header {...enter(0, "down")} className="admin-surface admin-header sticky top-0 z-30 flex flex-none flex-col lg:hidden">
              <div className="flex h-16 items-center justify-between gap-2 px-3">
                <div className="flex min-w-0 items-center gap-2">
                  <IconButton label="Abrir el menú" variant="primary" aria-expanded={menu} onClick={() => setMenu(true)}>
                    <MenuIcon size={19} />
                  </IconButton>
                  <Link href={paths.dashboard} className="flex min-w-0 items-center gap-2.5 rounded-full py-1 pr-2 text-ink">
                    <Logo size={32} eager />
                    {/* En el celular solo el nombre (el lema no cabe junto a los botones); en los más angostos, solo el logo. */}
                    <BrandName wordSize="1rem" eyebrowSize=".5rem" className="max-[400px]:hidden max-sm:[&_.brand-eyebrow]:hidden" />
                  </Link>
                </div>
                <div className="flex items-center gap-1.5">
                  <SyncChip compact />
                  <ThemeMenu compact />
                  <IconButton
                    label={searching ? "Cerrar la búsqueda" : "Buscar"}
                    variant="secondary"
                    aria-expanded={searching}
                    onClick={() => setSearching(!searching)}
                  >
                    {searching ? <CloseIcon size={18} /> : <SearchIcon size={18} />}
                  </IconButton>
                  <NotificationCenter />
                  <AccountMenu onLogout={logout} compact />
                </div>
              </div>
              {searching && (
                <div className="px-3 pb-3 motion-safe:animate-fade-in">
                  <GlobalSearch autoFocus onDone={() => setSearching(false)} />
                </div>
              )}
            </header>

            {/* Escritorio: búsqueda, apariencia, notificaciones, configuración y cuenta */}
            <header className="admin-surface admin-header sticky top-0 z-20 hidden flex-none items-center gap-4 px-8 pt-4 pb-3 lg:flex">
              <div {...enter(0, "down")} className="w-full max-w-[620px]">
                <GlobalSearch className="w-full" />
              </div>
              {/* Los botones bajan uno tras otro, después del buscador. */}
              <div className="ml-auto flex items-center gap-2">
                <span {...enter(1, "down")}>
                  <SyncChip />
                </span>
                <span {...enter(1.6, "down")} className="flex">
                  <ThemeMenu />
                </span>
                <span {...enter(2.2, "down")} className="flex">
                  <NotificationCenter />
                </span>
                <span {...enter(2.8, "down")} className="flex">
                  <SettingsLink />
                </span>
                <span {...enter(3.4, "down")} className="flex">
                  <AccountMenu onLogout={logout} />
                </span>
              </div>
            </header>

            {/* Con una barra de guardado (fija al pie), el final de la página deja libre su alto para no quedar tapado. */}
            <main
              className={`admin-surface mx-auto flex w-full ${fullWidth ? "max-w-none" : "max-w-[1440px]"} min-w-0 flex-1 flex-col gap-6 px-4 pt-3 pb-6 lg:px-8 lg:pt-3 [.admin-root:has([data-savebar])_&]:pb-[calc(var(--savebar-h,64px)+24px)]`}
            >
              {loadError && (
                <Callout tone="warning" role="alert">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>No pudimos actualizar los datos. Lo que ves puede estar desactualizado.</span>
                    <Button size="sm" onClick={load} icon={<RefreshIcon size={14} />}>
                      Reintentar
                    </Button>
                  </div>
                </Callout>
              )}
              <div key={pageKey} {...(mod === "dashboard" ? {} : enter(2))} className="flex flex-col gap-6 motion-safe:animate-fade-in">
                <Suspense fallback={<PageSkeleton />}>{mod && !canOpen(data.me.role, mod) ? <AccessDenied module={mod} /> : children}</Suspense>
              </div>
              <PanelFooter />
            </main>
          </div>

          <ModalPresence>
            {menu && (
              <Modal
                onClose={() => setMenu(false)}
                labelledBy="mn-title"
                dismissOnBackdrop
                initialFocus="#mn-close"
                motion="drawer"
                className="m-0 mr-auto h-dvh max-h-none w-[min(300px,86vw)] rounded-r-[28px] bg-sidebar! p-0 lg:hidden"
              >
                <div className="admin-dark flex h-full flex-col bg-sidebar text-white">
                  <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-5">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Brand size={36} wordSize="1.05rem" eyebrowSize=".52rem" />
                    </span>
                    <h2 id="mn-title" className="sr-only">
                      Menú del panel
                    </h2>
                    <IconButton id="mn-close" label="Cerrar el menú" onClick={() => setMenu(false)} className="text-white hover:bg-white/10">
                      <CloseIcon size={20} />
                    </IconButton>
                  </div>
                  <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4">
                    <NavList current={mod} badges={badges} role={data.me.role} onNavigate={() => setMenu(false)} />
                  </div>
                </div>
              </Modal>
            )}
          </ModalPresence>

          <Toasts toast={toast} onDismiss={() => setToast(null)} />
          <ModalPresence>
            {confirm && <ConfirmDialog cf={confirm} onChange={(p) => setConfirm({ ...confirm, ...p })} onCancel={() => setConfirm(null)} onOk={runConfirm} />}
          </ModalPresence>
        </div>
      </TipProvider>
    </AdminProvider>
  );
}
