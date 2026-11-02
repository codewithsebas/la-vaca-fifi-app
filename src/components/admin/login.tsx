"use client";

import Link from "next/link";
import { useState, type CSSProperties, type FormEvent } from "react";
import { BrandName, Logo } from "@/components/brand/logo";
import { EyeIcon, EyeOffIcon } from "@/components/ui/icons";
import { api } from "@/lib/client/api";
import { isMockApi } from "@/lib/config";
import { adminInput } from "@/components/admin/shared";
import { Button, Callout, Field } from "@/components/admin/ui";

// Cuadrícula del fondo del ingreso y de la pantalla de carga, en el color de las líneas del panel; se desvanece hacia
// los bordes.
const GRID: CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, color-mix(in srgb, var(--color-line) 70%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--color-line) 70%, transparent) 1px, transparent 1px)",
  backgroundSize: "48px 48px",
  backgroundPosition: "center",
  maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, black 30%, transparent 75%)",
};

/* ───────────── Pantalla de carga ───────────── */

// Mientras se valida la sesión y se cargan los datos: la misma tarjeta del ingreso, con el logo y una barra de carga.
export function PanelLoader({ label = "Preparando tu panel…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="admin-surface relative grid h-dvh place-items-center overflow-hidden bg-canvas px-4 py-4 text-ink">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={GRID} />
      <div className="relative flex w-full max-w-[360px] flex-col items-center gap-5 rounded-[28px] bg-paper px-6 py-10 text-center shadow-overlay motion-safe:animate-pop-in sm:px-10">
        <Logo size={88} eager className="motion-safe:animate-glide" />
        <BrandName wordSize="1.35rem" eyebrowSize=".66rem" className="items-center text-ink" />
        <span aria-hidden="true" className="relative mt-2 h-[3px] w-44 overflow-hidden rounded-full bg-ink/12">
          <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-pink-deep motion-safe:animate-loader-bar" />
        </span>
        <span className="text-[13px] font-medium text-ink-muted">{label}</span>
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

// Campos en píldora, como el botón de entrar.
const pillInput = `${adminInput} min-h-12 rounded-full px-5`;

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [lg, setLg] = useState({ email: "", password: "", error: "", loading: false });
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(false);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // La ayuda de la contraseña y el error no se muestran a la vez: así la tarjeta cabe sin scroll en pantallas bajas.
    setForgot(false);
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
  return (
    <main className="admin-surface relative grid h-dvh place-items-center overflow-hidden bg-canvas px-4 py-4 text-ink">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={GRID} />

      <form
        noValidate
        onSubmit={onSubmit}
        aria-labelledby="lg-title"
        className="relative flex w-full max-w-[440px] flex-col gap-5 rounded-[28px] bg-paper px-6 py-8 shadow-overlay motion-safe:animate-pop-in sm:px-10 sm:py-10 [@media(601px<=height<=860px)]:gap-3.5 [@media(601px<=height<=860px)]:py-6 [@media(max-height:600px)]:gap-2.5 [@media(max-height:600px)]:py-5"
      >
        {/* Logo y nombre centrados, sobre el saludo. En pantallas bajas todo se compacta para que quepa sin scroll. */}
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo size={72} eager className="motion-safe:animate-glide [@media(max-height:860px)]:size-14" />
          <BrandName wordSize="1.15rem" eyebrowSize=".62rem" className="items-center text-ink" />
          <h1 id="lg-title" className="mt-3 text-[26px] leading-tight font-bold tracking-[-0.03em] [@media(max-height:860px)]:mt-1">
            Bienvenido al panel
          </h1>
          <p className="max-w-[30ch] text-[14.5px] text-balance text-ink-muted [@media(max-height:640px)]:hidden">
            {isMockApi ? "Modo simulado: entra con cualquier correo y contraseña." : "Ingresa con tu cuenta del equipo para gestionar las reservas."}
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
              className={pillInput}
            />
          )}
        </Field>
        <div className="flex flex-col gap-2">
          <Field label="Contraseña">
            {(p) => (
              <div className="relative">
                <input
                  {...p}
                  {...missing(lg.password)}
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Tu contraseña"
                  value={lg.password}
                  onChange={(e) => setLg({ ...lg, password: e.target.value })}
                  className={`${pillInput} pr-13`}
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={show}
                  className="absolute top-1/2 right-1.5 grid size-9 -translate-y-1/2 place-items-center rounded-full text-ink-muted transition-colors hover:bg-ink/6 hover:text-ink"
                >
                  {show ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                </button>
              </div>
            )}
          </Field>
          {/* No hay registro ni recuperación por correo: las cuentas las crea y restablece un administrador. */}
          <button
            type="button"
            onClick={() => {
              setForgot(!forgot);
              setLg({ ...lg, error: "" });
            }}
            aria-expanded={forgot}
            aria-controls="lg-forgot"
            className="self-end rounded-full px-1 text-[13.5px] font-bold text-ink transition-colors hover:text-ink-muted"
          >
            ¿Olvidaste tu contraseña?
          </button>
          {forgot && (
            <p id="lg-forgot" className="rounded-2xl bg-panel px-4 py-3 text-[13px] leading-snug text-ink-muted motion-safe:animate-fade-in">
              Comunícate con el administrador del panel para recuperar el acceso a tu cuenta.
            </p>
          )}
        </div>

        {lg.error && (
          <Callout tone="error" role="alert">
            {lg.error}
          </Callout>
        )}
        <Button type="submit" variant="primary" size="lg" loading={lg.loading}>
          {lg.loading ? "Entrando…" : "Entrar"}
        </Button>
        <p className="text-center text-[13.5px] text-ink-muted">
          ¿Buscabas el sitio?{" "}
          <Link href="/" className="font-bold text-ink transition-colors hover:text-ink-muted">
            Volver a La Vaca Fifí
          </Link>
        </p>
      </form>
    </main>
  );
}
