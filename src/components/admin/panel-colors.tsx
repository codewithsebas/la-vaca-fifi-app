"use client";

// Configuración → Colores: toda la plataforma en un solo lugar. Panel: paletas y ajuste color por color; todo el panel cambia
// en vivo mientras se elige (AdminCtx.previewColors) y el equipo lo ve al guardar. Sitio web: el editor de components/admin/theme.tsx,
// con vista previa del sitio; aquí porque Contenido del sitio está desactivado. Los cambios sin guardar sobreviven al cambiar de pestaña.
import { useEffect, useState } from "react";
import { CheckIcon, PaletteIcon, PlusIcon, RefreshIcon } from "@/components/ui/icons";
import { api } from "@/lib/client/api";
import { can } from "@/lib/permissions";
import {
  DEFAULT_PANEL_COLORS,
  PANEL_COLOR_GROUPS,
  PANEL_PRESETS,
  mergePanelColors,
  panelColorIssues,
  samePanelColors,
  type PanelColors,
} from "@/lib/panel-colors";
import { sameTheme, themeIssues } from "@/lib/theme";
import { useAdmin, useParam } from "@/components/admin/context";
import { AccessDenied } from "@/components/admin/account";
import { CalendarLegend } from "@/components/admin/calendar/shared";
import { ColorField, ThemeEditor } from "@/components/admin/theme";
import { Badge, Button, Callout, Card, CardHeader, PageHeader, SaveBar, Segmented } from "@/components/admin/ui";

export function PanelColorsView() {
  const { data, ask, previewColors } = useAdmin();
  const saved = mergePanelColors(data.site.panelColors);
  const [draft, setDraft] = useState(saved);
  const dirty = !samePanelColors(draft, saved);
  const issues = panelColorIssues(draft);
  const current = PANEL_PRESETS.find((p) => samePanelColors(p.colors, draft));

  // Al guardar en otra pestaña o dispositivo (o al terminar de guardar aquí), lo guardado pasa a ser la base.
  const [base, setBase] = useState(saved);
  if (!samePanelColors(base, saved)) {
    setBase(saved);
    setDraft(saved);
  }

  const [tab, setTab] = useParam<"panel" | "sitio">("para", "panel");
  const siteSaved = data.site.theme;
  const [siteDraft, setSiteDraft] = useState(siteSaved);
  const siteDirty = !sameTheme(siteDraft, siteSaved);
  const [siteBase, setSiteBase] = useState(siteSaved);
  if (!sameTheme(siteBase, siteSaved)) {
    setSiteBase(siteSaved);
    setSiteDraft(siteSaved);
  }

  useEffect(() => {
    previewColors(dirty ? draft : null);
  }, [dirty, draft, previewColors]);
  useEffect(() => () => previewColors(null), [previewColors]);

  if (!can(data.me.role, "content")) return <AccessDenied module="configuracion" />;

  const save = () =>
    ask({
      title: "Guardar los colores del panel",
      text: `Todo el equipo verá el panel con estos colores.${issues.length ? ` Ojo: ${issues.length === 1 ? "una combinación tiene poco contraste" : `${issues.length} combinaciones tienen poco contraste`} y puede costar leerla.` : ""}`,
      okLabel: "Guardar colores",
      done: "Colores del panel guardados",
      run: () => api.admin.savePanelColors(draft),
    });

  const saveSite = () => {
    const n = themeIssues(siteDraft).length;
    ask({
      title: "Publicar los colores del sitio",
      text: `Los huéspedes verán el sitio con estos colores.${n ? ` Ojo: ${n === 1 ? "una combinación tiene poco contraste" : `${n} combinaciones tienen poco contraste`} y puede costar leerla.` : ""}`,
      okLabel: "Publicar colores",
      done: "Colores del sitio publicados",
      // El resto del contenido va tal como está guardado: aquí solo cambian los colores.
      run: () => api.admin.saveSite({ settings: data.site.settings, policies: data.site.policies, content: data.site.texts, theme: siteDraft }),
    });
  };

  return (
    <>
      <PageHeader
        title="Colores"
        description="Personaliza los colores de toda la plataforma: negros, azules, fondos y estados. El panel cambia mientras eliges; el sitio web, en su vista previa. Nada se aplica hasta confirmar."
      />

      <Segmented
        label="Qué colores editar"
        value={tab}
        onChange={setTab}
        options={[
          { value: "panel", label: "Panel" },
          { value: "sitio", label: "Sitio web" },
        ]}
        className="self-start"
      />

      {tab === "sitio" && <ThemeEditor theme={siteDraft} saved={siteSaved} onChange={setSiteDraft} />}

      <div className={`grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,34%)] ${tab === "sitio" ? "hidden" : ""}`}>
        <div className="@container flex min-w-0 flex-col gap-4">
          <Card aria-labelledby="pc-presets" className="flex flex-col gap-4 p-4 sm:p-5">
            <CardHeader
              id="pc-presets"
              icon={<PaletteIcon size={18} />}
              title="Paletas"
              subtitle="Combinaciones listas, con buen contraste. Elige una y ajusta lo que quieras más abajo."
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<RefreshIcon size={14} />}
                  disabled={samePanelColors(draft, DEFAULT_PANEL_COLORS)}
                  onClick={() => setDraft(DEFAULT_PANEL_COLORS)}
                >
                  Colores originales
                </Button>
              }
            />
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,168px),1fr))] gap-2.5">
              {PANEL_PRESETS.map((p) => {
                const on = current?.id === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDraft(p.colors)}
                      className={`flex h-full w-full flex-col gap-2 rounded-[18px] border p-2 text-left transition-[border-color,box-shadow,background-color] duration-150 ${on ? "border-ink bg-paper ring-4 ring-ink/10" : "border-transparent bg-canvas/60 hover:border-line-strong"}`}
                    >
                      <Swatches c={p.colors} />
                      <span className="flex flex-col gap-0.5 px-0.5 pb-0.5">
                        <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
                          {p.label}
                          {on && <CheckIcon size={14} className="text-success" />}
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

          <Card aria-labelledby="pc-colors" className="flex flex-col gap-5 p-4 sm:p-5">
            <CardHeader id="pc-colors" title="Color por color" subtitle="Haz clic en la muestra para elegir un color o escribe su código (#RRGGBB)." />
            {PANEL_COLOR_GROUPS.map((g) => (
              <fieldset key={g.label} className="flex min-w-0 flex-col gap-3">
                <legend className="mb-2 text-[12px] font-bold tracking-[.06em] text-ink-muted uppercase">{g.label}</legend>
                {g.note && <p className="-mt-1 text-[12.5px] text-ink-muted">{g.note}</p>}
                <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
                  {g.fields.map((f) => (
                    <ColorField
                      key={f.key}
                      label={f.label}
                      hint={f.hint}
                      value={draft[f.key]}
                      original={DEFAULT_PANEL_COLORS[f.key]}
                      onChange={(v) => setDraft((d: PanelColors) => ({ ...d, [f.key]: v }))}
                    />
                  ))}
                </div>
              </fieldset>
            ))}
          </Card>
        </div>

        <aside aria-labelledby="pc-sample" className="sticky top-20 z-10 flex min-w-0 flex-col gap-3 max-lg:static max-lg:order-first">
          {issues.length ? (
            <Callout tone="warning">
              <p className="font-semibold">Hay combinaciones difíciles de leer</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {issues.map((x) => (
                  <li key={x.label} className="flex flex-wrap items-center gap-x-2">
                    <span className="inline-flex flex-none" aria-hidden="true">
                      <span className="size-3.5 rounded-l-full ring-1 ring-black/10" style={{ background: x.fg }} />
                      <span className="size-3.5 rounded-r-full ring-1 ring-black/10" style={{ background: x.bg }} />
                    </span>
                    {`${x.label}: ${(Math.floor(x.ratio * 10) / 10).toLocaleString("es-CO")}:1 (mínimo 4,5:1)`}
                  </li>
                ))}
              </ul>
            </Callout>
          ) : (
            <Callout tone="success">Todos los textos se leen bien con estos colores.</Callout>
          )}
          <Card aria-labelledby="pc-sample" className="flex flex-col gap-3.5 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <h2 id="pc-sample" className="text-[15px] font-bold text-ink">
                Muestra
              </h2>
              {dirty && <Badge tone="info">Sin guardar</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" icon={<PlusIcon size={14} />}>
                Principal
              </Button>
              <Button size="sm">Secundario</Button>
              <Badge tone="success">Éxito</Badge>
              <Badge tone="warning">Aviso</Badge>
              <Badge tone="info">Info</Badge>
            </div>
            <div className="flex flex-col gap-2 rounded-[16px] bg-canvas p-3">
              <span
                className="flex h-[30px] items-center rounded-full border border-ink px-2.5 text-[13px] font-bold text-ink"
                style={{ background: "var(--bar-confirmed)" }}
              >
                Reserva confirmada
              </span>
              <span
                className="flex h-[30px] items-center rounded-full border border-ink px-2.5 text-[13px] font-bold text-ink"
                style={{ background: "var(--bar-checked-in)" }}
              >
                Reserva en estadía
              </span>
            </div>
            <CalendarLegend />
          </Card>
        </aside>
      </div>

      {tab === "sitio" ? (
        <SaveBar dirty={siteDirty} onDiscard={() => setSiteDraft(siteSaved)} onSave={saveSite} saveLabel="Publicar colores" />
      ) : (
        <SaveBar dirty={dirty} onDiscard={() => setDraft(saved)} onSave={save} saveLabel="Guardar colores" />
      )}
    </>
  );
}

function Swatches({ c }: { c: PanelColors }) {
  return (
    <span aria-hidden="true" className="flex h-8 overflow-hidden rounded-[12px] ring-1 ring-black/10">
      {[c.sidebar, c.canvas, c.panel, c.green, c.yellow, c.blue, c.pink].map((x, i) => (
        <span key={i} className="flex-1" style={{ background: x }} />
      ))}
    </span>
  );
}
