"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment, useState, type CSSProperties, type FormEvent } from "react";
import { Brand, BrandName, Logo } from "@/components/brand/logo";
import { useSite } from "@/components/site/site-provider";
import { EyeIcon, EyeOffIcon } from "@/components/ui/icons";
import { Constellation, ShootingStar } from "@/components/brand/night-sky";
import { api } from "@/lib/client/api";
import { isMockApi } from "@/lib/config";
import { adminInput } from "@/components/admin/shared";
import { Button, Callout, Field } from "@/components/admin/ui";

/* ───────────── Paisaje: el Nevado del Ruiz ───────────── */

// Nevado del Ruiz (viewBox 560×200): volcán ancho de cumbre casi plana. La nieve, con lenguas de glaciar, y la sombra
// de la ladera derecha se recortan con la silueta del volcán.
const NEVADO = "M0 200C70 182 120 150 170 104C196 80 210 52 228 38Q246 26 268 28L292 24Q314 22 330 32C350 46 366 74 392 102C440 150 492 184 560 200Z";
const NEVADO_SNOW = "M0 0H560V88L470 90L410 94L392 108L376 96L358 112L340 98L322 120L304 100L286 110L268 96L250 116L232 98L214 106L196 94L150 92L0 90Z";
const NEVADO_SHADE = "M286 0H560V200H330Q302 110 286 0Z";
// Cordillera delante del nevado (con un valle donde él asoma) y lomas cercanas.
const RANGE = "M0 220V150l110-54 80 32 110-66 100 56 80-26 100 48 80-16 100 22 100-14 80 18 90-58 80 28 90-36v136z";
const HILLS = "M0 100V46C160 22 320 64 500 42S820 16 1000 44 1150 38 1200 32V100Z";
const FOG: CSSProperties = {
  background:
    "radial-gradient(40% 60% at 30% 55%, color-mix(in srgb, var(--color-card) 8%, transparent), transparent 70%), radial-gradient(34% 55% at 74% 45%, color-mix(in srgb, var(--color-card) 7%, transparent), transparent 70%)",
};

// Paisaje del ingreso y de la pantalla de carga: el Nevado del Ruiz asoma detrás de la cordillera, entre niebla. Al
// cargar, la cordillera sube a su lugar y el nevado aparece detrás, más despacio; después solo se mueven la niebla y
// una estrella fugaz. Con movimiento reducido queda quieto.
function NevadoScene({ id, sky = true, className = "" }: { id: string; sky?: boolean; className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 bottom-0 ${className}`}>
      <div className="absolute bottom-[14%] left-[78%] w-[min(58%,520px)] -translate-x-1/2 sm:left-[68%]">
        <svg viewBox="0 0 560 200" className="block h-auto w-full motion-safe:animate-land-rise" style={{ animationDuration: "2.2s", animationDelay: "250ms" }}>
          <defs>
            <clipPath id={`${id}-nevado`}>
              <path d={NEVADO} />
            </clipPath>
          </defs>
          <path d={NEVADO} className="fill-[color-mix(in_srgb,var(--color-surface)_84%,var(--color-on-dark))]" />
          <g clipPath={`url(#${id}-nevado)`}>
            <path d={NEVADO_SNOW} className="fill-card/80" />
            <path d={NEVADO_SHADE} className="fill-bg/25" />
          </g>
        </svg>
      </div>
      {sky && <ShootingStar className="absolute bottom-[88%] left-[38%]" travel={150} every={10} delay={3} />}
      <div className="absolute -inset-x-[10%] bottom-[18%] h-[38%] motion-safe:animate-fog-drift" style={FOG} />
      <svg viewBox="0 0 1200 220" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-[72%] w-full fill-surface motion-safe:animate-land-rise">
        <path d={RANGE} />
      </svg>
      <svg
        viewBox="0 0 1200 100"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-[30%] w-full fill-[color-mix(in_srgb,var(--color-surface)_55%,var(--color-deep))] motion-safe:animate-land-rise"
        style={{ animationDelay: "120ms" }}
      >
        <path d={HILLS} />
      </svg>
    </div>
  );
}

/* ───────────── Pantalla de carga ───────────── */

// Mientras se valida la sesión y se cargan los datos: el monograma sobre el nevado y la cordillera.
export function PanelLoader({ label = "Preparando tu panel…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="admin-dark relative grid min-h-dvh place-items-center overflow-hidden bg-bg px-6 text-on-dark">
      <NevadoScene id="carga" sky={false} className="h-[30vh]" />
      <div className="relative flex flex-col items-center gap-7 motion-safe:animate-fade-in">
        <Logo size={120} eager className="size-[clamp(96px,20vw,120px)] motion-safe:animate-glide" />
        <p className="flex">
          <BrandName wordSize="clamp(2rem,6vw,2.6rem)" />
        </p>
        <span aria-hidden="true" className="relative h-[3px] w-44 overflow-hidden rounded-full bg-on-dark/15">
          <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-highlight motion-safe:animate-loader-bar" />
        </span>
        <span className="text-[13px] font-medium text-on-dark/70">{label}</span>
      </div>
    </div>
  );
}

/* ───────────── Ingreso ───────────── */

const LOGIN_ERRORS: Record<number, string> = {
  401: "Credenciales no válidas.",
  403: "Esta cuenta no tiene acceso al panel.",
  503: "El servidor no está configurado. Revisa las variables de entorno de Supabase.",
};

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [lg, setLg] = useState({ email: "", password: "", error: "", loading: false });
  const [show, setShow] = useState(false);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!lg.email || !lg.password) return setLg({ ...lg, error: "Escribe tu correo y tu contraseña." });
    setLg({ ...lg, loading: true, error: "" });
    try {
      const r = await api.admin.login({ email: lg.email, password: lg.password });
      if (r.status !== 200) return setLg({ ...lg, loading: false, error: LOGIN_ERRORS[r.status] ?? "No se pudo iniciar sesión." });
      setLg({ ...lg, loading: false, password: "" });
      onSuccess();
    } catch {
      setLg({ ...lg, loading: false, error: "Error de conexión. Inténtalo de nuevo." });
    }
  }
  const missing = (v: string) => (lg.error && !v ? ({ "aria-invalid": true } as const) : {});
  // La foto y el título de la portada del sitio (Contenido del sitio → Portada): si cambian allá, cambian aquí.
  const { photos, texts } = useSite();
  const photo = photos["hero-main"];
  const split = (t: string | undefined, accent: boolean) =>
    (t ?? "")
      .split(" ")
      .filter(Boolean)
      .map((w) => ({ w, accent }));
  const words = [...split(texts.hero.title, false), ...split(texts.hero.highlight, true)];
  return (
    <main className="admin-dark relative grid min-h-dvh bg-bg text-on-dark lg:grid-cols-[minmax(0,1.2fr)_minmax(460px,1fr)]">
      {/* Foto: arriba en el celular, mitad izquierda en pantallas anchas. */}
      {/* En el celular la foto se disuelve hacia abajo (máscara): así su borde no se marca como una línea sobre el logo. */}
      <div
        aria-hidden="true"
        className="relative h-[38vh] min-h-[240px] overflow-hidden bg-surface max-lg:[mask-image:linear-gradient(to_bottom,black_65%,transparent)] lg:sticky lg:top-0 lg:h-dvh"
      >
        {photo ? (
          // Se asienta al cargar y luego respira con un acercamiento muy lento, como la portada del sitio.
          <div className="absolute inset-0 motion-safe:animate-ken-burns">
            <Image src={photo} alt="" fill preload sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover motion-safe:animate-photo-settle" />
          </div>
        ) : (
          <>
            <svg viewBox="0 0 1200 220" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-1/2 w-full fill-bg/70">
              <path d="M0 220V150l140-62 92 40 128-90 108 82 92-42 140 72 118-92 112 64 120-52 150 82v68z" />
            </svg>
            <Constellation className="absolute top-[12%] left-1/2 w-[min(30%,220px)] -translate-x-1/2" opacity={0.4} depth={0} />
          </>
        )}
        {/* Velo para leer el título sobre cualquier foto; en el celular la foto se funde con el fondo. */}
        <span className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-bg via-bg/55 to-transparent lg:h-1/2 lg:from-black/70 lg:via-black/25" />
        {/* El título sube palabra por palabra, como en la portada del sitio. */}
        <p className="display absolute right-8 bottom-10 left-8 hidden text-[clamp(3rem,5.2vw,5.6rem)] leading-[.9] tracking-[.005em] text-balance lg:block">
          {words.map(({ w, accent }, i) => (
            <Fragment key={i}>
              {i > 0 && " "}
              <span className={`inline-block motion-safe:animate-rise ${accent ? "text-accent" : ""}`} style={{ animationDelay: `${350 + i * 90}ms` }}>
                {w}
              </span>
            </Fragment>
          ))}
          {texts.hero.badge && (
            <span
              className="mt-4 block font-body text-[15px] leading-snug font-semibold tracking-normal text-on-dark/85 normal-case motion-safe:animate-rise"
              style={{ animationDelay: `${450 + words.length * 90}ms` }}
            >
              {texts.hero.badge}
            </span>
          )}
        </p>
      </div>

      {/* En pantallas anchas el formulario se centra un poco más arriba, para dejar ver el nevado debajo. */}
      <div className="relative z-1 -mt-20 flex flex-col items-center justify-center gap-6 overflow-hidden px-4 pb-10 lg:mt-0 lg:px-12 lg:pt-12 lg:pb-[clamp(80px,20vh,200px)]">
        {/* El paisaje de la pantalla de carga, al pie del lado del formulario: el nevado y una estrella fugaz. */}
        <NevadoScene id="ingreso" className="h-[150px] lg:h-[clamp(170px,32vh,340px)]" />
        {/* Logo y nombre del sitio sobre el formulario. */}
        <p className="relative flex items-center gap-3 motion-safe:animate-rise">
          <Brand size={52} wordSize="1.6rem" eyebrowSize=".7rem" eager />
        </p>
        <form
          noValidate
          onSubmit={onSubmit}
          aria-labelledby="lg-title"
          className="admin-surface relative flex w-full max-w-[400px] flex-col gap-5 rounded-2xl bg-panel p-6 text-ink shadow-overlay motion-safe:animate-pop-in sm:p-8"
        >
          <div>
            <h1 id="lg-title" className="text-[22px] leading-tight font-extrabold tracking-[-0.01em]">
              Panel de reservas
            </h1>
            <p className="mt-1 text-[14px] text-ink-muted">
              {isMockApi ? "Modo simulado: entra con cualquier correo y contraseña." : "Ingresa con tu cuenta de administración."}
            </p>
          </div>
          <Field label="Correo">
            {(p) => (
              <input
                {...p}
                {...missing(lg.email)}
                type="email"
                autoComplete="username"
                inputMode="email"
                placeholder="tucorreo@ejemplo.com"
                value={lg.email}
                onChange={(e) => setLg({ ...lg, email: e.target.value })}
                className={adminInput}
              />
            )}
          </Field>
          <Field label="Contraseña">
            {(p) => (
              <div className="relative">
                <input
                  {...p}
                  {...missing(lg.password)}
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="***********"
                  value={lg.password}
                  onChange={(e) => setLg({ ...lg, password: e.target.value })}
                  className={`${adminInput} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={show}
                  className="btn-icon absolute top-1/2 right-1 size-9 -translate-y-1/2 text-ink-muted transition-colors hover:bg-ink/6 hover:text-ink"
                >
                  {show ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                </button>
              </div>
            )}
          </Field>
          {lg.error && (
            <Callout tone="error" role="alert">
              {lg.error}
            </Callout>
          )}
          <Button type="submit" variant="primary" size="lg" loading={lg.loading}>
            {lg.loading ? "Entrando…" : "Entrar"}
          </Button>
        </form>
        <Link href="/" className="relative rounded-sm text-[13.5px] font-semibold text-on-dark/75 transition-colors hover:text-on-dark">
          ← Volver al sitio
        </Link>
      </div>
    </main>
  );
}
