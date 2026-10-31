"use client";

import { useEffect, useRef, useState } from "react";
import { useSite } from "@/components/site-provider";
import { emailTemplates } from "@/lib/emails";

type Opt = { label: string; on: boolean; pick: () => void };

// Iframe que crece a la altura de su contenido (el `load` puede ocurrir antes de hidratar).
function AutoHeightFrame({ title, html, width }: { title: string; html: string; width: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const fit = () => {
      const d = frame.contentDocument;
      if (d?.documentElement) frame.style.height = d.documentElement.scrollHeight + 4 + "px";
    };
    if (frame.contentDocument?.readyState === "complete") fit();
    frame.addEventListener("load", fit);
    return () => frame.removeEventListener("load", fit);
  }, [html]);
  return <iframe ref={ref} title={title} srcDoc={html} className="mx-auto block h-[900px] rounded-xl border-0 bg-transparent" style={{ width }} />;
}

export function EmailPreview() {
  const { c } = useSite();
  const templates = emailTemplates(c);
  const [width, setWidth] = useState(600);
  const [dark, setDark] = useState(false);
  const [mode, setMode] = useState<"html" | "text">("html");

  const opt = (label: string, on: boolean, pick: () => void): Opt => ({ label, on, pick });
  const groups: { label: string; opts: Opt[] }[] = [
    { label: "Ancho", opts: [opt("600 px", width === 600, () => setWidth(600)), opt("375 px", width === 375, () => setWidth(375))] },
    { label: "Tema", opts: [opt("Claro", !dark, () => setDark(false)), opt("Oscuro", dark, () => setDark(true))] },
    { label: "Formato", opts: [opt("HTML", mode === "html", () => setMode("html")), opt("Texto plano", mode === "text", () => setMode("text"))] },
  ];

  return (
    <div className="box-border min-h-screen gutter-1200 pt-7 pb-20">
      <h1 className="display mb-1.5 text-[clamp(2.4rem,5vw,4rem)] leading-[.95]">Plantillas de correo</h1>
      <p className="mb-5 max-w-[70ch]">
        HTML de 600 px con tablas, estilos inline y colores hex. Los dos primeros se envían de verdad (con Resend) y se muestran con datos de ejemplo; el resto
        son plantillas de referencia con variables <strong>{"{{var}}"}</strong> que aún no se envían. Cada correo trae su versión en texto plano.
      </p>
      <div role="toolbar" aria-label="Vista previa" className="sticky top-0 z-5 flex flex-wrap gap-3.5 bg-bg pt-3 pb-4">
        {groups.map((g) => (
          <div key={g.label} role="group" aria-label={g.label} className="flex gap-1 rounded-full bg-surface p-1">
            {g.opts.map((o) => (
              <button
                key={o.label}
                type="button"
                aria-pressed={o.on}
                onClick={o.pick}
                className={`min-h-11 rounded-full px-4 font-bold ${o.on ? "bg-card text-on-light" : "bg-transparent text-on-dark"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-7">
        {templates.map((t, i) => {
          const n = String(i + 1);
          // El mismo logo que llevan los correos enviados (app/correo/logo.png).
          let html = t.html.replace("{{logoUrl}}", "/correo/logo.png");
          if (dark) html = html.replace('<body class="em-body"', '<body class="em-body dm"');
          return (
            <article key={t.name} aria-labelledby={`em-${i}`} className="flex flex-col gap-3.5 rounded-lg bg-surface p-[clamp(14px,2.5vw,24px)]">
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
                <h2 id={`em-${i}`} className="text-[1.05rem] font-extrabold">
                  {n} · {t.name}
                </h2>
                <span className="text-[.85rem]">
                  Para: <strong>{t.to}</strong>
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[.78rem] font-extrabold ${t.sent ? "bg-accent text-on-light" : "bg-card-muted text-on-light"}`}
                >
                  {t.sent === "auto" ? "Se envía automáticamente" : t.sent === "panel" ? "Se envía desde el panel" : "Plantilla · aún no se envía"}
                </span>
              </div>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1 rounded-md bg-[color-mix(in_srgb,var(--color-bg)_60%,var(--color-surface))] px-3.5 py-3 text-[.88rem]">
                <dt className="font-extrabold">Asunto</dt>
                <dd>{t.subject}</dd>
                <dt className="font-extrabold">Preheader</dt>
                <dd>{t.preheader}</dd>
                <dt className="font-extrabold">Datos</dt>
                <dd className="font-mono text-[.8rem] [overflow-wrap:anywhere]">{t.vars}</dd>
              </dl>
              {mode === "html" ? (
                <div className="overflow-x-auto rounded-md p-2.5" style={{ background: dark ? "#0B0F0C" : "#DDD6C2" }}>
                  <AutoHeightFrame key={`${width}-${dark}`} title={`Vista previa: ${t.name}`} html={html} width={width} />
                </div>
              ) : (
                <pre
                  className="rounded-md bg-card p-[18px] font-mono text-[.82rem] leading-[1.6] [overflow-wrap:anywhere] whitespace-pre-wrap text-on-light"
                  style={{ maxWidth: width }}
                >
                  {t.text}
                </pre>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
