"use client";

// Apariencia del panel: claro, oscuro o la del sistema (preferencia de este navegador). El atributo data-admin-theme de
// <html> elige los colores (app/globals.css). En una carga completa lo pone un script de app/layout.tsx antes de pintar;
// aquí se mantiene al día (cambio de preferencia, del sistema o navegación desde el sitio) y se quita al salir del panel.
import { useEffect, useRef, useState } from "react";
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "@/components/ui/icons";
import { PREF, usePref, writePref } from "@/components/admin/prefs";
import { Popover, useLabelTip } from "@/components/ui/floating";
import { iconButtonClass } from "@/components/admin/ui";

export type ThemePref = "light" | "dark" | "system";

export const THEME_OPTIONS = [
  { value: "light", label: "Claro", hint: "Fondo crema", icon: SunIcon },
  { value: "dark", label: "Oscuro", hint: "Para la noche o poca luz", icon: MoonIcon },
  { value: "system", label: "Sistema", hint: "Igual que este dispositivo", icon: MonitorIcon },
] as const;

// Color de la barra del navegador en el celular: el fondo del panel en cada modo.
const BAR = { light: "#f7f2e8", dark: "#121110" };

export function useThemePref() {
  const raw = usePref(PREF.theme, "light");
  const pref: ThemePref = raw === "dark" || raw === "system" ? raw : "light";
  return [pref, (v: ThemePref) => writePref(PREF.theme, v)] as const;
}

export function useApplyTheme() {
  const [pref] = useThemePref();
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const mode = pref === "dark" || (pref === "system" && mq.matches) ? "dark" : "light";
      document.documentElement.dataset.adminTheme = mode;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR[mode]);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [pref]);
  useEffect(
    () => () => {
      delete document.documentElement.dataset.adminTheme;
    },
    [],
  );
}

// Apariencia en el encabezado: el icono del modo actual abre un menú con las tres opciones. `compact`: celular.
export function ThemeMenu({ compact = false }: { compact?: boolean }) {
  const [pref, setPref] = useThemePref();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const current = THEME_OPTIONS.find((o) => o.value === pref)!;
  const tip = useLabelTip(`Apariencia: ${current.label}`);
  const Icon = current.icon;
  const pick = (v: ThemePref) => {
    setPref(v);
    setOpen(false);
    anchor.current?.focus();
  };
  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Apariencia: ${current.label}`}
        {...(open ? {} : tip)}
        onClick={() => setOpen(!open)}
        className={compact ? iconButtonClass("secondary") : iconButtonClass("primary")}
      >
        <Icon size={18} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} placement="bottom-end" label="Apariencia" role="menu" className="w-[250px] p-1.5">
        <p className="px-3 pt-2 pb-1.5 text-[12px] font-semibold text-ink-muted">Apariencia</p>
        {THEME_OPTIONS.map((o) => {
          const on = o.value === pref;
          const OptIcon = o.icon;
          return (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={on}
              onClick={() => pick(o.value)}
              className={`flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-left transition-colors ${on ? "bg-panel" : "hover:bg-panel/70"}`}
            >
              <span aria-hidden="true" className={`grid size-9 flex-none place-items-center rounded-full text-ink ${on ? "bg-pink" : "bg-panel"}`}>
                <OptIcon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-ink">{o.label}</span>
                <span className="block text-[12px] text-ink-muted">{o.hint}</span>
              </span>
              {on && <CheckIcon size={15} className="flex-none text-ink" />}
            </button>
          );
        })}
      </Popover>
    </>
  );
}

// Selector de apariencia en la página de Configuración: las tres opciones a la vista.
export function ThemeSwitch() {
  const [pref, setPref] = useThemePref();
  return (
    <div role="radiogroup" aria-label="Apariencia" className="grid grid-cols-3 gap-1 rounded-full bg-panel p-1">
      {THEME_OPTIONS.map((o) => {
        const on = o.value === pref;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setPref(o.value)}
            className={`inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-[13px] font-semibold transition-colors duration-150 ${on ? "bg-ink text-paper" : "text-ink-muted hover:text-ink"}`}
          >
            <Icon size={15} />
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
