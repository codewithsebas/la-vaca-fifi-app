"use client";

// Esqueletos de carga del panel: calcan la estructura real (barra lateral, encabezado y la página que se abre) mientras
// llegan los datos, para que al cargar todo quede en su sitio y no salte nada. El dashboard tiene el suyo, pieza por pieza.
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { Brand, Logo } from "@/components/brand/logo";
import { PREF, usePref } from "@/components/admin/prefs";
import { MODULES, MODULE_IDS, NAV_GROUPS, moduleOf } from "@/components/admin/routes";
import { ACCENT, Deco, PageSkeleton, Skeleton, type Accent, type DecoShape } from "@/components/admin/ui";

// Bloque gris sobre las tarjetas de color (un poco más marcado que sobre el fondo crema).
const OnColor = ({ className = "" }: { className?: string }) => (
  <span aria-hidden="true" className={`block animate-pulse-soft rounded-full bg-ink/12 ${className}`} />
);

/* ───────────── Marco del panel ───────────── */

export function PanelSkeleton() {
  const pathname = usePathname();
  const mini = usePref(PREF.sidebar, "full") === "mini";
  const mod = moduleOf(pathname);
  return (
    <div
      role="status"
      aria-live="polite"
      className="admin-root min-h-dvh bg-canvas text-[15px] text-ink lg:flex"
      style={{ "--admin-sidebar": mini ? "104px" : "280px" } as CSSProperties}
    >
      <span className="sr-only">Cargando el panel…</span>
      <SidebarSkeleton mini={mini} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Móvil y tableta */}
        <header aria-hidden="true" className="admin-surface sticky top-0 z-30 flex h-16 flex-none items-center justify-between gap-2 px-3 lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-10 flex-none place-items-center rounded-full bg-ink" />
            <Logo size={32} eager />
            <Skeleton className="h-4 w-28 rounded-full max-[400px]:hidden" />
          </div>
          <div className="flex items-center gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="size-10 rounded-full" />
            ))}
          </div>
        </header>
        {/* Escritorio */}
        <header aria-hidden="true" className="admin-surface sticky top-0 z-20 hidden flex-none items-center gap-4 px-8 pt-4 pb-3 lg:flex">
          <div className="flex h-12 w-full max-w-[620px] min-w-0 items-center gap-2 rounded-full border border-line-strong bg-paper/70 py-1 pr-4 pl-1">
            <span className="size-10 flex-none rounded-full bg-ink" />
            <Skeleton className="h-3.5 w-[min(320px,60%)] rounded-full" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-9 w-[104px] rounded-full" />
            <span className="size-10 rounded-full bg-ink" />
            <span className="size-10 rounded-full bg-ink" />
            <span className="size-10 rounded-full bg-ink" />
            <div className="flex h-12 items-center gap-2.5 rounded-full border border-line-strong bg-paper/70 py-1 pr-1 pl-1 xl:pr-3.5">
              <Skeleton className="size-[38px] rounded-full" />
              <span className="hidden flex-col gap-1.5 xl:flex">
                <Skeleton className="h-3 w-24 rounded-full" />
                <Skeleton className="h-2.5 w-16 rounded-full" />
              </span>
            </div>
          </div>
        </header>
        <main
          aria-hidden="true"
          className={`admin-surface mx-auto flex w-full ${mod === "calendario" ? "max-w-none" : "max-w-[1440px]"} min-w-0 flex-1 flex-col gap-6 px-4 pt-3 pb-6 motion-safe:animate-fade-in lg:px-8 lg:pt-3`}
        >
          {mod === "dashboard" ? (
            <DashboardSkeleton />
          ) : (
            <>
              <Skeleton className="-mb-2 h-3.5 w-48 rounded-full" />
              <PageSkeleton />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// Barra lateral: la misma tarjeta de color con la marca; los módulos, en barras claras (el menú depende del rol).
function SidebarSkeleton({ mini }: { mini: boolean }) {
  const groups = NAV_GROUPS.map((g) => MODULE_IDS.filter((id) => MODULES[id].group === g && MODULES[id].nav !== false && !MODULES[id].off).length);
  // Anchos variados para que no parezca una regla.
  const widths = ["w-24", "w-20", "w-28", "w-[88px]", "w-[72px]", "w-32"];
  let k = 0;
  return (
    <aside aria-hidden="true" className="sticky top-0 z-40 hidden h-dvh w-(--admin-sidebar) flex-none p-3 lg:block">
      <div className="admin-dark relative flex h-full flex-col overflow-hidden rounded-[28px] bg-sidebar text-white">
        <div className={`flex min-w-0 items-center gap-3 pt-6 pb-5 ${mini ? "justify-center px-2" : "px-5"}`}>
          {mini ? <Logo size={40} eager /> : <Brand size={40} wordSize="1.1rem" eyebrowSize=".47rem" eager />}
        </div>
        <div className={`flex flex-col ${mini ? "gap-2.5 px-2" : "gap-4 px-3"}`}>
          {groups.map((n, gi) => (
            <div key={gi} className="flex flex-col gap-0.5">
              {mini ? (
                gi > 0 && <span className="mx-auto mb-2 block h-px w-6 bg-white/12" />
              ) : (
                <span className="mx-3.5 mt-1 mb-2 block h-2.5 w-16 animate-pulse-soft rounded-full bg-white/10" />
              )}
              {Array.from({ length: n }, (_, i) => {
                const w = widths[k++ % widths.length];
                return mini ? (
                  <span key={i} className="mx-auto grid size-10 place-items-center">
                    <span className="size-[19px] animate-pulse-soft rounded-md bg-white/14" />
                  </span>
                ) : (
                  <span key={i} className="flex min-h-[38px] items-center gap-3 px-3.5 py-1.5">
                    <span className="size-[19px] flex-none animate-pulse-soft rounded-md bg-white/14" />
                    <span className={`h-3 animate-pulse-soft rounded-full bg-white/12 ${w}`} />
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

/* ───────────── Dashboard ───────────── */

// La tarjeta de color de los indicadores (dashboard.tsx, Highlight), con su figura y el título; las cifras, en barras.
function CardFrame({
  accent,
  shape,
  title,
  action = false,
  className = "",
  children,
}: {
  accent: Accent;
  shape: DecoShape;
  title: string;
  action?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`relative isolate flex min-h-[200px] min-w-0 flex-col gap-4 overflow-hidden rounded-[24px] p-5 ${ACCENT[accent].bg} ${className}`}>
      <Deco accent={accent} shape={shape} className="-top-7 -right-7 size-[140px] rotate-[16deg]" />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[17px] leading-tight font-semibold tracking-[-0.01em] text-ink">{title}</p>
        {action && <span className="h-[26px] w-[84px] animate-pulse-soft rounded-full bg-paper/60" />}
      </div>
      {children}
    </div>
  );
}

// Cifra y rótulo (dashboard.tsx, Stat).
function StatSk({ strong = false, wide = false }: { strong?: boolean; wide?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 pb-1.5 ${strong ? "border-b-2 border-ink/25" : "border-b-2 border-transparent"}`}>
      <OnColor className={`h-[18px] ${wide ? "w-14" : "w-8"}`} />
      <OnColor className="h-2.5 w-[70%]" />
    </div>
  );
}

// Fila de las listas (dashboard.tsx, Row): círculo de color, nombre, detalle y la etiqueta al final.
function RowSk({ accent, i }: { accent: Accent; i: number }) {
  const name = ["w-[52%]", "w-[40%]", "w-[60%]", "w-[46%]"][i % 4];
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-[18px] bg-panel py-2.5 pr-3 pl-2.5">
      <span className={`size-10 flex-none animate-pulse-soft rounded-full opacity-70 ${ACCENT[accent].bg}`} />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className={`h-3.5 rounded-full ${name}`} />
        <Skeleton className="h-3 w-[70%] rounded-full" />
      </span>
      <span className="h-[26px] w-14 flex-none animate-pulse-soft rounded-full bg-paper" />
    </li>
  );
}

// Título de sección con el contador.
function HeadSk({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <p className="flex items-center gap-2 text-[18px] leading-tight font-semibold tracking-[-0.015em] text-ink">
        {title} <Skeleton className="h-5 w-7 rounded-full" />
      </p>
      {right}
    </div>
  );
}

// Alturas fijas de las barras de llegadas (parecen datos, no cambian entre cargas).
const BARS = [64, 82, 40, 40, 52, 40, 40, 70, 40, 40, 58, 40, 40, 46];

export function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-8 xl:grid-cols-[minmax(0,1fr)_336px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-7">
        {/* Saludo y resumen del día */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-[clamp(1.6rem,2.5vw,2.1rem)] w-56 rounded-full" />
          <Skeleton className="h-4 w-[min(520px,100%)] rounded-full" />
          {/* Sin la columna derecha (pantallas medianas y pequeñas), los botones van bajo el saludo. */}
          <div className="mt-1 flex gap-2 xl:hidden">
            <span className="h-10 w-[132px] rounded-full border border-line-strong bg-paper/70" />
            <span className="h-10 w-[150px] rounded-full bg-ink" />
          </div>
        </div>

        {/* Indicadores */}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <CardFrame accent="yellow" shape="sun" title="Hoy:">
              <div className="grid grid-cols-3 gap-3 pr-10">
                <StatSk strong />
                <StatSk />
                <StatSk />
              </div>
              <div className="mt-auto">
                <div className="flex h-[88px] items-end gap-[5px]">
                  {BARS.map((h, i) => (
                    <span key={i} className="flex h-full flex-1 items-end justify-center">
                      <span
                        className="block w-full max-w-[11px] animate-pulse-soft rounded-full bg-ink/14"
                        style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }}
                      />
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex justify-between">
                  <OnColor className="h-2.5 w-8" />
                  <OnColor className="h-2.5 w-14" />
                </div>
              </div>
            </CardFrame>

            <CardFrame accent="pink" shape="cabin" title="Ocupación:">
              <div className="grid grid-cols-3 gap-3 pr-10 sm:max-w-[360px]">
                <StatSk strong wide />
                <StatSk wide />
                <StatSk wide />
              </div>
              <div className="mt-auto">
                <div className="relative h-[104px]">
                  <svg viewBox="0 0 280 100" preserveAspectRatio="none" className="absolute inset-0 size-full animate-pulse-soft overflow-visible">
                    <path
                      d="M0,82 C30,82 60,80 90,78 C110,76 120,64 140,62 C160,60 170,76 190,74 C215,72 225,56 245,58 C262,60 270,70 280,70"
                      fill="none"
                      stroke="var(--color-ink)"
                      strokeOpacity={0.18}
                      strokeWidth={1.75}
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                  <span className="absolute bottom-0 w-0 border-l-[1.5px] border-dashed border-ink/20" style={{ left: "50%", top: "62%" }} />
                </div>
                <div className="mt-2 grid grid-cols-5 justify-items-center">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <OnColor key={i} className={`h-2.5 w-12 ${i === 0 ? "justify-self-start" : i === 4 ? "justify-self-end" : ""}`} />
                  ))}
                </div>
              </div>
            </CardFrame>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <CardFrame accent="green" shape="coin" title="Por cobrar:" action className="min-h-[164px]">
              <OnColor className="h-[clamp(1.6rem,2.6vw,2.1rem)] w-[min(240px,70%)]" />
              <div className="mt-auto grid grid-cols-3 gap-3 sm:max-w-[420px]">
                <StatSk />
                <StatSk />
                <StatSk />
              </div>
            </CardFrame>
            <CardFrame accent="blue" shape="calendar" title="Próximos 7 días:" action className="min-h-[164px]">
              <OnColor className="h-[clamp(1.6rem,2.6vw,2.1rem)] w-[min(180px,70%)]" />
              <div className="mt-auto grid grid-cols-3 gap-3 pr-8">
                <StatSk />
                <StatSk />
                <StatSk />
              </div>
            </CardFrame>
          </div>
        </div>

        {/* Movimiento de hoy */}
        <div className="flex min-w-0 flex-col gap-3">
          <HeadSk
            title="Movimiento de hoy"
            right={
              <div className="flex gap-1.5">
                <span className="h-8 w-14 rounded-full bg-ink/80" />
                {[84, 76, 96].map((w) => (
                  <span key={w} className="h-8 rounded-full border border-dashed border-line-strong" style={{ width: w }} />
                ))}
              </div>
            }
          />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)]">
            <ul className="flex min-w-0 flex-col gap-2">
              <RowSk accent="blue" i={0} />
              <RowSk accent="pink" i={1} />
              <RowSk accent="pink" i={2} />
            </ul>
            <div className="flex min-w-0 flex-col gap-4 rounded-[22px] bg-pink/70 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-2">
                  <OnColor className="h-4 w-40" />
                  <OnColor className="h-3 w-28" />
                </div>
                <span className="h-[26px] w-16 animate-pulse-soft rounded-full bg-paper/80" />
              </div>
              <div className="flex gap-1.5">
                <OnColor className="h-6 w-24" />
                <OnColor className="h-6 w-20" />
              </div>
              <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-3">
                {["w-[70%]", "w-[45%]", "w-[55%]", "w-[80%]"].map((w, i) => (
                  <div key={i} className="contents">
                    <OnColor className="h-3 w-16" />
                    <OnColor className={`h-3 ${w}`} />
                  </div>
                ))}
              </div>
              <div className="mt-auto flex gap-2">
                <span className="h-8 w-32 rounded-full bg-ink/85" />
                <span className="h-8 w-28 animate-pulse-soft rounded-full bg-paper/60" />
              </div>
            </div>
          </div>
        </div>

        {/* Pagos por completar */}
        <div className="flex min-w-0 flex-col gap-3">
          <HeadSk title="Pagos por completar" right={<Skeleton className="h-3.5 w-16 rounded-full" />} />
          <ul className="flex flex-col gap-2">
            <RowSk accent="yellow" i={0} />
            <RowSk accent="green" i={3} />
          </ul>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-6">
        {/* Mes */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Skeleton className="size-8 rounded-full" />
            <span className="h-7 w-36 animate-pulse-soft rounded-full bg-ink/80" />
            <Skeleton className="size-8 rounded-full" />
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"].map((w) => (
              <span key={w} className="mx-auto mb-1 rounded-full bg-panel px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted">
                {w}
              </span>
            ))}
            {Array.from({ length: 35 }, (_, i) => (
              <span key={i} className="mx-auto grid size-9 place-items-center">
                <span className="size-5 animate-pulse-soft rounded-full bg-ink/7" style={{ animationDelay: `${(i % 7) * 50}ms` }} />
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="h-12 flex-1 rounded-full bg-ink" />
          <span className="size-12 rounded-full border border-line-strong bg-paper/70" />
          <span className="size-12 rounded-full border border-line-strong bg-paper/70" />
        </div>

        {/* Agenda de hoy */}
        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-3 w-28 rounded-full" />
            </div>
            <span className="h-8 w-[112px] rounded-full bg-ink/85" />
          </div>
          <div className="flex items-center gap-2 py-1">
            <span className="w-[46px] flex-none">
              <span className="block h-[18px] w-10 rounded-full bg-pink" />
            </span>
            <span className="h-0 flex-1 border-t-[1.5px] border-dashed border-ink/30" />
          </div>
          <ol className="flex flex-col gap-2">
            {(["blue", "pink", "pink"] as Accent[]).map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-[46px] flex-none pt-4">
                  <Skeleton className="h-3 w-9 rounded-full" />
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-3 rounded-[18px] bg-panel p-3">
                  <span className={`size-9 flex-none animate-pulse-soft rounded-full opacity-70 ${ACCENT[a].bg}`} />
                  <span className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className={`h-3.5 rounded-full ${["w-[60%]", "w-[48%]", "w-[66%]"][i]}`} />
                    <Skeleton className="h-3 w-[80%] rounded-full" />
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <span className="h-12 w-full rounded-full bg-ink" />
        </div>

        {/* Próximas llegadas */}
        <div className="flex min-w-0 flex-col gap-3">
          <HeadSk title="Próximas llegadas" />
          <ul className="flex flex-col gap-2">
            <RowSk accent="blue" i={2} />
            <RowSk accent="blue" i={0} />
            <RowSk accent="blue" i={1} />
          </ul>
        </div>
      </aside>
    </div>
  );
}
