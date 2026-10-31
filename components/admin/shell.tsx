"use client";

// Estructura común del panel (app/admin/layout.tsx): sesión, datos, tiempo real, navegación, migas de pan, avisos y confirmaciones.
// Cada módulo es una página propia (app/admin/<modulo>/page.tsx) que se monta dentro de este marco.
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Brand } from "@/components/brand";
import { ExternalLinkIcon, InfoIcon, LogoutIcon, MenuIcon, RefreshIcon, WarningIcon, CloseIcon } from "@/components/icons";
import { useSite } from "@/components/site-provider";
import { api } from "@/lib/api";
import { config } from "@/lib/config";
import { todayISO } from "@/lib/format";
import { panelCss, type SiteTheme } from "@/lib/theme";
import type { AdminData } from "@/lib/types";
import { AdminProvider, type AdminCtx } from "@/components/admin/context";
import { DateRangePicker } from "@/components/admin/date-picker";
import { TipProvider } from "@/components/ui/floating";
import { Login, PanelLoader } from "@/components/admin/login";
import { LiveDot, NotificationCenter, chime, soundFor, unlockAudio, useRealtime } from "@/components/admin/notifications";
import { CONTENT_SECTIONS, MODULES, MODULE_IDS, NAV_GROUPS, clientKeyOf, legacyPath, moduleOf, paths, type ModuleId } from "@/components/admin/routes";
import { type Ask, type ConfirmCfg, adminInput } from "@/components/admin/shared";
import {
  Breadcrumbs,
  Button,
  Callout,
  CountBadge,
  ErrorState,
  Field,
  FieldError,
  IconButton,
  Modal,
  PageSkeleton,
  Toasts,
  type Crumb,
  type ToastMsg,
} from "@/components/admin/ui";

/* ───────────── Colores ───────────── */

// El panel usa la paleta del sitio (Contenido del sitio → Colores): la barra lateral, los botones y las etiquetas la
// toman tal cual y la zona de trabajo se deriva de ella (lib/theme.ts). La hoja se va con el panel al volver al sitio.
function PanelTheme({ theme }: { theme: SiteTheme }) {
  return <style dangerouslySetInnerHTML={{ __html: panelCss(theme) }} />;
}

/* ───────────── Acceso ───────────── */

type Gate = { status: "checking" } | { status: "login" } | { status: "error" } | { status: "app"; data: AdminData };

// La sesión la valida el servidor: si /admin/data responde 200 hay sesión de administrador.
export function AdminShell({ children }: { children: ReactNode }) {
  // Antes de entrar (carga, ingreso), los colores publicados que trae el sitio; dentro, los de los datos del panel,
  // que cambian apenas se publica otra paleta.
  const { theme } = useSite();
  return (
    <>
      <PanelTheme theme={theme} />
      <Gated>{children}</Gated>
    </>
  );
}

function Gated({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<Gate>({ status: "checking" });
  const check = useCallback(
    () =>
      api.admin
        .data()
        .then((r) =>
          setGate(
            r.status === 200 && r.data ? { status: "app", data: r.data } : r.status === 401 || r.status === 403 ? { status: "login" } : { status: "error" },
          ),
        )
        .catch(() => setGate({ status: "error" })),
    [],
  );
  const recheck = useCallback(() => {
    setGate({ status: "checking" });
    check();
  }, [check]);
  const loggedOut = useCallback(() => setGate({ status: "login" }), []);

  useEffect(() => {
    check();
  }, [check]);

  if (gate.status === "checking") return <PanelLoader />;
  if (gate.status === "login") return <Login onSuccess={recheck} />;
  if (gate.status === "error")
    return (
      <div className="admin-surface grid min-h-dvh place-items-center bg-canvas px-4">
        <div className="w-full max-w-[460px]">
          <ErrorState
            title="No pudimos abrir el panel"
            text="Revisa tu conexión a internet. Si el problema sigue, el servidor puede estar en mantenimiento."
            onRetry={recheck}
          />
        </div>
      </div>
    );
  return (
    <Panel initialData={gate.data} onLoggedOut={loggedOut}>
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
      className="m-auto w-[calc(100%-32px)] max-w-[460px] rounded-2xl p-0 motion-safe:open:animate-pop-in"
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex gap-3.5">
          <span
            aria-hidden="true"
            className={`grid size-10 flex-none place-items-center rounded-full ${cf.danger ? "bg-error-soft text-error" : "bg-canvas text-ink"}`}
          >
            {cf.danger ? <WarningIcon size={19} /> : <InfoIcon size={19} />}
          </span>
          <div className="min-w-0 pt-1.5">
            <h2 id="cf-title" className="text-[17px] leading-tight font-bold text-ink">
              {cf.title}
            </h2>
            <p id="cf-text" className="mt-1.5 text-[14px] text-ink-muted">
              {cf.text}
            </p>
          </div>
        </div>
        {cf.details && cf.details.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-canvas px-3.5 py-3 text-[13.5px]">
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
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line px-3.5 py-3 text-[14px] text-ink transition-colors hover:bg-canvas">
            <input
              type="checkbox"
              checked={!!cf.option}
              onChange={(e) => onChange({ option: e.target.checked })}
              className="mt-0.5 size-4 flex-none accent-[var(--color-cta)]"
            />
            {cf.optionLabel}
          </label>
        )}
        {cf.error && <FieldError>{cf.error}</FieldError>}
      </div>
      <div className="flex flex-col-reverse gap-2 rounded-b-2xl border-t border-line bg-canvas/60 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">
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

const navItem =
  "group relative flex min-h-9 w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left text-[14px] leading-tight font-semibold transition-colors pointer-coarse:min-h-11";

// Menú de módulos por grupos: el mismo en la barra lateral (escritorio) y en el cajón (móvil y tableta).
function NavList({ current, badges, onNavigate }: { current: ModuleId | null; badges: Badges; onNavigate?: () => void }) {
  return (
    <nav aria-label="Módulos del panel" className="flex flex-col gap-4">
      {NAV_GROUPS.map((g) => (
        <div key={g} className="flex flex-col gap-0.5">
          {g !== "General" && <p className="px-3 pb-1 text-[11px] font-bold tracking-[.1em] text-on-dark/50 uppercase">{g}</p>}
          {MODULE_IDS.filter((id) => MODULES[id].group === g).map((id) => {
            const { label, icon: Icon, href } = MODULES[id];
            const active = current === id;
            const b = badges[id];
            return (
              <Link
                key={id}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`${navItem} ${active ? "bg-white/10 text-on-dark" : "text-on-dark/72 hover:bg-white/6 hover:text-on-dark"}`}
              >
                {active && <span aria-hidden="true" className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-highlight" />}
                <Icon size={18} className={active ? "text-highlight" : "text-on-dark/55 transition-colors group-hover:text-on-dark/85"} />
                <span className="flex-1">{label}</span>
                {b?.n ? <CountBadge n={b.n} tone="attention" label={b.label} /> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function NavFooter({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-white/10 px-3 py-2.5">
      <a href="/" target="_blank" rel="noopener" className={`${navItem} text-on-dark/72 hover:bg-white/6 hover:text-on-dark`}>
        <ExternalLinkIcon size={17} className="text-on-dark/55" />
        Ver sitio web
      </a>
      <button type="button" onClick={onLogout} className={`${navItem} text-on-dark/72 hover:bg-white/6 hover:text-on-dark`}>
        <LogoutIcon size={17} className="text-on-dark/55" />
        Cerrar sesión
      </button>
    </div>
  );
}

// Migas de pan a partir de la ruta: Dashboard / Módulo / Detalle.
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

function Panel({ initialData, onLoggedOut, children }: { initialData: AdminData; onLoggedOut: () => void; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [data, setDataState] = useState<AdminData>(initialData);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [menu, setMenu] = useState(false);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const firstPath = useRef(true);
  const today = todayISO();
  const mod = moduleOf(pathname);

  const setData = useCallback((fn: (d: AdminData) => AdminData) => setDataState(fn), []);
  const showToast = useCallback((text: string, kind: "ok" | "error" = "ok", action?: ToastMsg["action"]) => {
    const id = Date.now() + Math.random();
    setToast({ id, text, kind, action });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), action ? 6000 : 3600);
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await api.admin.data();
      if (r.status === 401 || r.status === 403) return onLoggedOut();
      if (r.status !== 200 || !r.data) throw 0;
      setDataState(r.data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [onLoggedOut]);

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

  // El sonido solo puede sonar después de una interacción: se habilita con el primer clic o tecla.
  useEffect(() => {
    const unlock = () => unlockAudio();
    addEventListener("pointerdown", unlock, { once: true });
    addEventListener("keydown", unlock, { once: true });
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
        if (soundFor(n.kind)) chime();
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
      if (r.status === 401 || r.status === 403) return onLoggedOut();
      if (r.status >= 400) {
        const { fields, error: code } = (r.data as { fields?: Record<string, string>; error?: string } | null) ?? {};
        const msg = fields
          ? Object.values(fields)[0]
          : code === "CHANNEL_CONFLICT"
            ? "Booking.com ya vendió alguna de esas noches."
            : code === "CHANNEL_UNAVAILABLE"
              ? "No se pudo confirmar con Booking.com (Beds24 no respondió). Inténtalo en un momento."
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

  const logout = useCallback(() => {
    api.admin.logout().finally(onLoggedOut);
  }, [onLoggedOut]);

  const cabinMap = useMemo(() => new Map(data.cabinTypes.map((c) => [c.id, c])), [data.cabinTypes]);
  const ctx: AdminCtx = {
    data,
    setData,
    reload: load,
    ask,
    toast: showToast,
    go,
    openReservation,
    onAuthError: onLoggedOut,
    logout,
    live,
    today,
    now,
    cabin: (id) => cabinMap.get(id),
    cabinLabel: (id, unit) => {
      const name = cabinMap.get(id)?.nombre ?? id;
      return unit ? `${name} ${unit}` : name;
    },
  };

  const badges: Badges = {
    reservas: { n: data.reservations.filter((r) => r.status === "pending_deposit").length, label: "pendientes de abono" },
    // Lo que pide acción en Pagos: pagos por reembolsar, saldos vencidos sin pagar y comprobantes por revisar.
    pagos: {
      n:
        data.payments.filter((p) => p.needsRefund).length +
        data.reservations.filter((r) => r.status === "checked_in" && !r.balancePaidAt && r.balanceOverdueAt).length +
        data.proofs.filter((p) => p.status === "pending").length,
      label: "pagos que requieren atención",
    },
    notificaciones: { n: unread, label: "sin leer" },
  };
  // El calendario usa todo el alto de la pantalla (si hay alto suficiente; si no, la página se desplaza).
  const fullHeight = mod === "calendario";
  // La sección de contenido conserva su formulario al cambiar de pestaña: no se vuelve a montar.
  const pageKey = mod === "contenido" ? "contenido" : pathname;

  return (
    <AdminProvider value={ctx}>
      <PanelTheme theme={data.site.theme} />
      <TipProvider>
        <Suspense fallback={null}>
          <LegacyRedirect />
        </Suspense>
        <div className="admin-root min-h-dvh bg-canvas text-[15px] text-ink lg:flex">
          <aside className="admin-dark sticky top-0 hidden h-dvh w-[248px] flex-none flex-col bg-bg text-on-dark lg:flex">
            <Link href={paths.dashboard} className="flex items-center gap-3 px-5 pt-5 pb-4">
              <Brand size={40} wordSize="1.2rem" eyebrowSize=".58rem" eager />
            </Link>
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              <NavList current={mod} badges={badges} />
            </div>
            <NavFooter onLogout={logout} />
          </aside>

          <div className={`flex min-w-0 flex-1 flex-col ${fullHeight ? "tall:h-dvh" : ""}`}>
            {/* Móvil y tableta: menú en cajón, marca y notificaciones */}
            <header className="admin-dark sticky top-0 z-30 flex h-14 flex-none items-center justify-between gap-2 bg-bg pr-2 pl-1 text-on-dark shadow-[0_1px_0_rgb(255_255_255/0.06)] [--bell-ring:var(--color-bg)] lg:hidden">
              <div className="flex min-w-0 items-center gap-1">
                <IconButton label="Abrir el menú" aria-expanded={menu} onClick={() => setMenu(true)} className="text-on-dark hover:bg-white/10">
                  <MenuIcon size={21} />
                </IconButton>
                <Link href={paths.dashboard} className="flex min-w-0 items-center gap-2.5 rounded-lg py-1 pr-2">
                  <Brand size={32} wordSize="1rem" eyebrowSize=".5rem" eager />
                </Link>
              </div>
              <div className="flex items-center gap-1.5">
                <LiveDot status={live} />
                <NotificationCenter />
              </div>
            </header>

            {/* Escritorio: migas de pan + estado en vivo + notificaciones */}
            <div className="admin-surface sticky top-0 z-20 hidden h-14 flex-none items-center justify-between gap-4 border-b border-line bg-canvas/85 px-8 backdrop-blur lg:flex">
              <Breadcrumbs items={crumbs} />
              <div className="flex items-center gap-3">
                <Link
                  href={paths.configuracion}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[12.5px] font-medium text-ink-muted transition-colors hover:text-ink"
                  title={live === "live" ? "Las reservas y pagos nuevos llegan sin recargar" : undefined}
                >
                  <LiveDot status={live} />
                  {live === "live" ? "En vivo" : live === "connecting" ? "Conectando…" : live === "offline" ? "Sin tiempo real" : "Modo simulado"}
                </Link>
                <NotificationCenter />
              </div>
            </div>

            {/* Con una barra de guardado (fija al pie), el final de la página deja libre su alto para no quedar tapado. */}
            <main
              className={`admin-surface mx-auto flex w-full max-w-[1400px] min-w-0 flex-1 flex-col gap-5 px-4 pt-4 pb-8 lg:px-8 lg:pt-6 [.admin-root:has([data-savebar])_&]:pb-[calc(var(--savebar-h,64px)+24px)] ${fullHeight ? "tall:min-h-0 tall:pb-5" : ""}`}
            >
              <Breadcrumbs items={crumbs} className="lg:hidden" />
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
              <div key={pageKey} className={`flex flex-col gap-5 motion-safe:animate-fade-in ${fullHeight ? "tall:min-h-0 tall:flex-1" : ""}`}>
                <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
              </div>
            </main>
          </div>

          {menu && (
            <Modal
              onClose={() => setMenu(false)}
              labelledBy="mn-title"
              dismissOnBackdrop
              initialFocus="#mn-close"
              className="m-0 mr-auto h-dvh max-h-none w-[min(300px,86vw)] p-0 motion-safe:open:animate-slide-in-left lg:hidden"
            >
              <div className="admin-dark flex h-full flex-col bg-bg text-on-dark">
                <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-4">
                  <span className="flex items-center gap-2.5">
                    <Brand size={34} wordSize="1.05rem" eyebrowSize=".52rem" />
                  </span>
                  <h2 id="mn-title" className="sr-only">
                    Menú del panel
                  </h2>
                  <IconButton id="mn-close" label="Cerrar el menú" onClick={() => setMenu(false)} className="text-on-dark hover:bg-white/10">
                    <CloseIcon size={20} />
                  </IconButton>
                </div>
                <div className="flex-1 overflow-y-auto px-3 pb-4">
                  <NavList current={mod} badges={badges} onNavigate={() => setMenu(false)} />
                </div>
                <NavFooter onLogout={logout} />
              </div>
            </Modal>
          )}

          <Toasts toast={toast} onDismiss={() => setToast(null)} />
          {confirm && <ConfirmDialog cf={confirm} onChange={(p) => setConfirm({ ...confirm, ...p })} onCancel={() => setConfirm(null)} onOk={runConfirm} />}
        </div>
      </TipProvider>
    </AdminProvider>
  );
}
