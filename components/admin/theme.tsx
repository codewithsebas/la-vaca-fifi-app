"use client";

// Contenido del sitio → Colores: paletas listas, ajuste color por color, aviso de contraste y vista previa en vivo.
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { CheckIcon, EyeIcon, MonitorIcon, PaletteIcon, RefreshIcon, SmartphoneIcon, WarningIcon } from "@/components/icons";
import {
  DEFAULT_THEME,
  THEME_GROUPS,
  THEME_PRESETS,
  mergeTheme,
  normalizeHex,
  presetOf,
  sameTheme,
  themeCss,
  themeField,
  themeIssues,
  themeVars,
  type SiteTheme,
  type ThemeIssue,
  type ThemeKey,
} from "@/lib/theme";
import { adminInput } from "./shared";
import { Badge, Button, Callout, Card, CardHeader, Segmented, Spinner } from "./ui";

// Estilo en línea con la paleta: aplica los colores solo dentro del contenedor (vistas previas del panel).
export const themeStyle = (t: SiteTheme) => themeVars(t) as CSSProperties;

export function ThemeEditor({ theme, saved, onChange }: { theme: SiteTheme; saved: SiteTheme; onChange: (t: SiteTheme) => void }) {
  const set = (p: Partial<SiteTheme>) => onChange(mergeTheme({ ...theme, ...p }));
  const current = presetOf(theme);
  const issues = themeIssues(theme);

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,44%)]">
      <div className="@container flex min-w-0 flex-col gap-4">
        {/* En pantallas angostas la vista previa (fija arriba) solo lleva un resumen del contraste: el detalle va aquí. */}
        {issues.length > 0 && <ContrastIssues theme={theme} issues={issues} className="lg:hidden" />}

        <Card aria-labelledby="th-presets" className="flex flex-col gap-4 p-4 sm:p-5">
          <CardHeader
            id="th-presets"
            icon={<PaletteIcon size={18} />}
            title="Paletas"
            subtitle="Combinaciones listas, con buen contraste. Elige una y ajusta los colores que quieras más abajo."
            actions={
              // Siempre visible (deshabilitado con los colores originales): así la cuadrícula no se mueve al elegir una paleta.
              <Button
                size="sm"
                variant="ghost"
                icon={<RefreshIcon size={14} />}
                disabled={sameTheme(theme, DEFAULT_THEME)}
                onClick={() => onChange({ ...DEFAULT_THEME })}
              >
                Colores originales
              </Button>
            }
          />
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,168px),1fr))] gap-2.5">
            {THEME_PRESETS.map((p) => {
              const on = current?.id === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange({ ...p.theme })}
                    className={`flex h-full w-full flex-col gap-2 rounded-xl border p-2 text-left transition-[border-color,box-shadow] duration-150 ${on ? "border-focus ring-4 ring-focus/15" : "border-line hover:border-ink-subtle"}`}
                  >
                    <Swatches t={p.theme} />
                    <span className="flex flex-col gap-0.5 px-0.5 pb-0.5">
                      <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
                        {p.label}
                        {on && <CheckIcon size={14} className="text-success" />}
                        {sameTheme(p.theme, saved) && (
                          <span className="ml-auto rounded-full bg-canvas px-2 py-px text-[11px] font-bold text-ink-muted">Publicada</span>
                        )}
                      </span>
                      <span className="text-[12.5px] leading-snug text-ink-muted">{p.description}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!current && <p className="text-[13px] text-ink-muted">Paleta personalizada: los colores ya no coinciden con ninguna de las paletas.</p>}
        </Card>

        <Card aria-labelledby="th-colors" className="flex flex-col gap-5 p-4 sm:p-5">
          <CardHeader id="th-colors" title="Color por color" subtitle="Haz clic en la muestra para elegir un color o escribe su código (#RRGGBB)." />
          {THEME_GROUPS.map((g) => (
            <fieldset key={g.label} className="flex min-w-0 flex-col gap-3">
              <legend className="mb-2 text-[12px] font-bold tracking-[.06em] text-ink-muted uppercase">{g.label}</legend>
              <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
                {g.fields.map((f) => (
                  <ColorField key={f.key} k={f.key} value={theme[f.key]} onChange={(v) => set({ [f.key]: v })} />
                ))}
              </div>
            </fieldset>
          ))}
        </Card>
      </div>

      {/* La vista previa acompaña siempre al desplazarse. En pantallas anchas ocupa el alto libre de la ventana, entre la
          barra superior (56 px) y la de guardado; en angostas va arriba, bajo el encabezado, con un alto contenido. */}
      <aside
        aria-labelledby="th-prev"
        className="sticky z-10 flex min-w-0 flex-col gap-3 max-lg:top-14 max-lg:order-first max-lg:-mx-4 max-lg:border-b max-lg:border-line max-lg:bg-canvas max-lg:px-4 max-lg:pt-2 max-lg:pb-3 lg:top-[72px] lg:h-[calc(100dvh-96px-var(--savebar-h,64px))] lg:min-h-[400px]"
      >
        <div className="flex-none max-lg:hidden">
          {issues.length ? (
            <ContrastIssues theme={theme} issues={issues} className="max-h-[30dvh] overflow-y-auto" />
          ) : (
            <Callout tone="success">Todos los textos se leen bien con estos colores.</Callout>
          )}
        </div>
        <ThemePreview theme={theme} issues={issues.length} unpublished={!sameTheme(theme, saved)} />
      </aside>
    </div>
  );
}

const ratio = (n: number) => `${(Math.floor(n * 10) / 10).toLocaleString("es-CO")}:1`;

function ContrastIssues({ theme, issues, className = "" }: { theme: SiteTheme; issues: ThemeIssue[]; className?: string }) {
  return (
    <Callout tone="warning" className={className}>
      <p className="font-semibold">Hay combinaciones difíciles de leer</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {issues.map((x) => (
          <li key={`${x.fg}-${x.bg}`} className="flex flex-wrap items-center gap-x-2">
            <span className="inline-flex flex-none" aria-hidden="true">
              <span className="size-3.5 rounded-l-full ring-1 ring-black/10" style={{ background: theme[x.fg] }} />
              <span className="size-3.5 rounded-r-full ring-1 ring-black/10" style={{ background: theme[x.bg] }} />
            </span>
            {`${x.label}: ${ratio(x.ratio)} (mínimo ${ratio(x.min)})`}
          </li>
        ))}
      </ul>
      <p className="mt-1.5">
        Aclara u oscurece «{themeField(issues[0].fg).label}» o «{themeField(issues[0].bg).label}» hasta que desaparezca el aviso.
      </p>
    </Callout>
  );
}

function Swatches({ t }: { t: SiteTheme }) {
  const keys: ThemeKey[] = ["bg", "surface", "card", "accent", "highlight"];
  return (
    <span aria-hidden="true" className="flex h-8 overflow-hidden rounded-lg ring-1 ring-black/10">
      {keys.map((k) => (
        <span key={k} className="flex-1" style={{ background: t[k] }} />
      ))}
    </span>
  );
}

// Muestra (selector nativo) + código. El código se puede escribir a medias: solo se aplica cuando es un color válido.
function ColorField({ k, value, onChange }: { k: ThemeKey; value: string; onChange: (v: string) => void }) {
  const f = themeField(k);
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setDraft(value);
  }
  const invalid = normalizeHex(draft) === null;
  const changed = value !== DEFAULT_THEME[k];

  return (
    <div className="flex min-w-0 gap-3 rounded-xl border border-line p-3">
      <label
        className="relative size-11 flex-none cursor-pointer overflow-hidden rounded-lg ring-1 ring-black/15 focus-within:ring-2 focus-within:ring-focus"
        style={{ background: value }}
      >
        <span className="sr-only">{`Elegir color: ${f.label}`}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
      </label>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={id} className="text-[13px] font-semibold text-ink">
            {f.label}
          </label>
          {changed && (
            <button
              type="button"
              onClick={() => onChange(DEFAULT_THEME[k])}
              className="rounded-sm text-[12px] font-semibold text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Original<span className="sr-only">: {f.label}</span>
            </button>
          )}
        </div>
        <input
          id={id}
          type="text"
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          value={draft.toUpperCase()}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-hint`}
          onChange={(e) => {
            setDraft(e.target.value);
            const hex = normalizeHex(e.target.value);
            if (hex && e.target.value.replace("#", "").length === 6) onChange(hex);
          }}
          onBlur={() => {
            // Al salir del campo se aplica también el formato corto (#ABC); si no es un color, vuelve el anterior.
            const hex = normalizeHex(draft);
            if (hex && hex !== value) onChange(hex);
            else setDraft(value);
          }}
          className={`${adminInput} font-mono text-[13px] uppercase`}
        />
        <p id={`${id}-hint`} className="text-[12px] leading-snug text-ink-muted">
          {f.hint}
        </p>
      </div>
    </div>
  );
}

/* ───────────── Vista previa ───────────── */

// El sitio real dentro de un marco, a la escala de cada equipo. El marco tiene el alto de una pantalla de ese equipo
// (las secciones del sitio se ajustan al alto de la ventana), dentro del espacio disponible.
const DEVICES = {
  escritorio: { label: "Computador", icon: <MonitorIcon size={15} />, width: 1280, minHeight: 720, maxHeight: 860 },
  celular: { label: "Celular", icon: <SmartphoneIcon size={15} />, width: 390, minHeight: 600, maxHeight: 844 },
};
type Device = keyof typeof DEVICES;

const PREVIEW_STYLE = "vista-previa-colores";

// Pone la paleta en el documento del marco, por encima de la publicada. Devuelve false si el documento aún no existe.
function paint(frame: HTMLIFrameElement | null, theme: SiteTheme) {
  const doc = frame?.contentDocument;
  if (!doc?.head || doc.URL === "about:blank") return false;
  let style = doc.getElementById(PREVIEW_STYLE);
  if (!style) {
    style = doc.createElement("style");
    style.id = PREVIEW_STYLE;
    doc.head.append(style);
  }
  style.textContent = `html${themeCss(theme)}`; // html:root pesa más que el :root de la hoja publicada
  return true;
}

// La página de inicio tal como está publicada (textos, fotos, cabañas), pintada con los colores que se están eligiendo:
// se puede recorrer y abrir sus enlaces. Lo publicado no cambia hasta guardar.
function ThemePreview({ theme, issues, unpublished }: { theme: SiteTheme; issues: number; unpublished: boolean }) {
  const [device, setDevice] = useState<Device>("escritorio");
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [ready, setReady] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Con el sitio ya cargado, los colores cambian al instante. Mientras carga, el documento existe antes de que lleguen
  // las fotos: se pinta en cuanto aparece, para no mostrar primero los colores publicados.
  useEffect(() => {
    if (paint(frame.current, theme)) return;
    const t = setInterval(() => {
      if (!paint(frame.current, theme)) return;
      clearInterval(t);
      setReady(true);
    }, 120);
    return () => clearInterval(t);
  }, [theme]);

  const d = DEVICES[device];
  const scale = box ? Math.min(1, box.w / d.width, box.h / d.minHeight) : 0;
  const height = box && scale ? Math.min(d.maxHeight, Math.max(d.minHeight, Math.floor(box.h / scale))) : d.minHeight;
  const shown = Math.floor(height * scale);

  return (
    <>
      <div className="flex flex-none flex-wrap items-center gap-x-2.5 gap-y-2">
        <h3 id="th-prev" className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted">
          <EyeIcon size={14} />
          Vista previa
        </h3>
        {unpublished && <Badge tone="info">Sin publicar</Badge>}
        {issues > 0 && (
          <Badge tone="warning" icon={<WarningIcon size={12} />} className="lg:hidden">
            {`${issues} con poco contraste`}
          </Badge>
        )}
        {/* En el celular solo los íconos: el encabezado cabe en una línea y la vista previa no salta al elegir colores. */}
        <Segmented
          size="sm"
          label="Equipo de la vista previa"
          value={device}
          onChange={setDevice}
          options={(Object.keys(DEVICES) as Device[]).map((k) => ({
            value: k,
            icon: DEVICES[k].icon,
            label: <span className="max-sm:sr-only">{DEVICES[k].label}</span>,
          }))}
          className="ml-auto"
        />
      </div>
      {/* En pantallas angostas el área reserva un alto máximo; lo que el marco no usa se devuelve con un margen negativo. */}
      <div
        ref={area}
        style={{ "--unused": `${box && scale ? Math.max(0, box.h - shown) : 0}px` } as CSSProperties}
        className="relative min-h-0 max-lg:-mb-(--unused) max-lg:h-[min(34svh,300px)] lg:flex-1"
      >
        {scale > 0 && (
          <div
            className="mx-auto overflow-hidden rounded-xl bg-panel shadow-panel ring-1 ring-line-strong"
            style={{ width: Math.floor(d.width * scale), height: shown }}
          >
            {/* Es una ruta de este mismo sitio: el panel puede escribir en su documento. Al navegar dentro del marco se
                vuelve a pintar. */}
            <iframe
              ref={frame}
              src="/"
              title="Vista previa del sitio con los colores elegidos"
              onLoad={() => paint(frame.current, theme) && setReady(true)}
              style={{ width: d.width, height, transform: `scale(${scale})`, transformOrigin: "0 0" }}
              className={`block border-0 transition-opacity duration-300 ${ready ? "" : "opacity-0"}`}
            />
          </div>
        )}
        {!ready && (
          <p role="status" className="absolute inset-0 flex items-center justify-center gap-2.5 text-[13px] font-medium text-ink-muted">
            <Spinner />
            Cargando la vista previa…
          </p>
        )}
      </div>
    </>
  );
}
