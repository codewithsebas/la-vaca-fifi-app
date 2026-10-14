"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  ArrowDownIcon, ArrowUpIcon, CheckIcon, ClockIcon, CloseIcon, ExternalLinkIcon, FileTextIcon, HomeIcon, ImageIcon, PaletteIcon, PhoneIcon, PinIcon, PlusIcon, ShieldIcon, TrashIcon, UploadIcon, WalletIcon, WarningIcon,
} from "@/components/icons";
import { api } from "@/lib/api";
import { config, isMockApi } from "@/lib/config";
import { resizeImage, type Crop } from "@/lib/image-resize";
import { PHOTO_SLOTS, TEXT_LIMITS, fmtTime, type PhotoSlotDef, type SitePolicy, type SiteSettings, type SiteTexts } from "@/lib/site";
import { themeIssues, type SiteTheme } from "@/lib/theme";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin } from "./context";
import { CONTENT_GROUPS, CONTENT_SECTIONS, MODULES, isContentSection, paths, type ContentSectionId } from "./routes";
import { PhotoCropper } from "./photo-cropper";
import { ServicesManager } from "./services";
import { ThemeEditor, themeStyle } from "./theme";
import { adminInput } from "./shared";
import { Button, Callout, Card, CardHeader, Field, FieldError, GroupedNavTabs, IconButton, PageHeader, SaveBar, Spinner } from "./ui";

/* ───────────── Una ruta por zona del sitio, un solo formulario ───────────── */

const ICONS: Record<ContentSectionId, ReactNode> = {
  portada: <HomeIcon size={15} />,
  experiencias: <ImageIcon size={15} />,
  servicios: <CheckIcon size={15} />,
  horarios: <ClockIcon size={15} />,
  politicas: <FileTextIcon size={15} />,
  contacto: <PhoneIcon size={15} />,
  pagos: <WalletIcon size={15} />,
  redes: <ShieldIcon size={15} />,
  colores: <PaletteIcon size={15} />,
};
// Zonas que solo tienen fotos (se publican al subirlas): no muestran la barra de guardado.
// Servicios también se publica al instante (cada cambio va directo al servidor).
const PHOTOS_ONLY: ContentSectionId[] = ["experiencias", "servicios"];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const URL_OK = /^https:\/\/[^\s]+$/;

// Horas cada 30 minutos con el formato del sitio ("3:00 p. m."); si la guardada no cae en la grilla, también se ofrece.
function timeOptions(current: string) {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) for (const m of ["00", "30"]) out.push(String(h).padStart(2, "0") + ":" + m);
  if (TIME.test(current) && !out.includes(current)) out.push(current);
  return out.sort().map((v) => ({ value: v, label: fmtTime(v), keywords: v }));
}

type Form = { s: SiteSettings; policies: SitePolicy[]; t: SiteTexts; theme: SiteTheme };

// Errores por campo, con la sección en la que se corrigen.
function validate({ s, policies, t }: Form) {
  const e: Record<string, { msg: string; tab: ContentSectionId }> = {};
  if (!t.hero.title.trim()) e.heroTitle = { msg: "Escribe el título de la portada.", tab: "portada" };
  const lines = t.hero.rotating.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > TEXT_LIMITS.rotatingLines || lines.some((l) => l.length > TEXT_LIMITS.highlight))
    e.heroRotating = { msg: `Hasta ${TEXT_LIMITS.rotatingLines} frases, de máximo ${TEXT_LIMITS.highlight} caracteres cada una.`, tab: "portada" };
  if (!TIME.test(s.checkInStart) || !TIME.test(s.checkInEnd) || s.checkInEnd <= s.checkInStart) e.checkIn = { msg: "La hora final del check-in debe ser posterior a la inicial.", tab: "horarios" };
  if (!TIME.test(s.checkOutTime)) e.checkOut = { msg: "Elige la hora de check-out.", tab: "horarios" };
  const phones = s.phones.map((p) => p.trim()).filter(Boolean);
  if (!phones.length) e.phones = { msg: "Escribe al menos un teléfono.", tab: "contacto" };
  else if (phones.some((p) => !/^[\d\s()+-]{7,20}$/.test(p))) e.phones = { msg: "Los teléfonos solo pueden tener números, espacios y los signos + ( ) -.", tab: "contacto" };
  if (!/^\d{10,15}$/.test(s.whatsapp.replace(/\D/g, ""))) e.whatsapp = { msg: "Incluye el indicativo del país, por ejemplo 573144001279.", tab: "contacto" };
  if (!policies.length) e.policies = { msg: "Debe haber al menos una política.", tab: "politicas" };
  else if (policies.some((p) => !p.q.trim() || !p.a.trim())) e.policies = { msg: "Cada política necesita título y texto.", tab: "politicas" };
  for (const k of ["instagram", "facebook", "tiktok"] as const) if (t.social[k].trim() && !URL_OK.test(t.social[k].trim())) e[k] = { msg: "Pega el enlace completo, empezando por https://", tab: "redes" };
  return e;
}

type FormCtx = {
  f: Form;
  saved: Form;
  errors: ReturnType<typeof validate>;
  err: (k: string) => string | undefined;
  setS: (p: Partial<SiteSettings>) => void;
  setT: <K extends keyof SiteTexts>(k: K, p: Partial<SiteTexts[K]>) => void;
  setPolicies: (fn: (p: SitePolicy[]) => SitePolicy[]) => void;
  setTheme: (t: SiteTheme) => void;
};
const Ctx = createContext<FormCtx | null>(null);

// app/admin/contenido/layout.tsx: encabezado, pestañas por grupos (rutas), «dónde aparece» y barra de guardado.
// El formulario vive aquí: al cambiar de sección se conservan los cambios sin guardar y se publican juntos.
export function ContentLayout({ children }: { children: ReactNode }) {
  const { data, go, ask } = useAdmin();
  const seg = usePathname().split("/")[3] ?? "";
  const section = isContentSection(seg) ? seg : null;
  const meta = CONTENT_SECTIONS.find((x) => x.id === section);
  const saved: Form = { s: data.site.settings, policies: data.site.policies, t: data.site.texts, theme: data.site.theme };
  const [f, setF] = useState<Form>(saved);
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);

  const ctx: FormCtx = {
    f,
    saved,
    errors,
    err: (k) => errors[k]?.msg,
    setS: (p) => setF((x) => ({ ...x, s: { ...x.s, ...p } })),
    setT: (k, p) => setF((x) => ({ ...x, t: { ...x.t, [k]: { ...x.t[k], ...p } } })),
    setPolicies: (fn) => setF((x) => ({ ...x, policies: fn(x.policies) })),
    setTheme: (theme) => setF((x) => ({ ...x, theme })),
  };

  const save = () => {
    const e = validate(f);
    setErrors(e);
    const first = Object.values(e)[0];
    if (first) {
      if (first.tab !== section) go(paths.contenido(first.tab));
      setTimeout(() => document.querySelector<HTMLElement>('main [aria-invalid="true"], main [data-invalid="true"]')?.focus(), 120);
      return;
    }
    const body = {
      settings: { ...f.s, phones: f.s.phones.map((p) => p.trim()).filter(Boolean), whatsapp: f.s.whatsapp.replace(/\D/g, "") },
      policies: f.policies.map((p) => ({ ...p, q: p.q.trim(), a: p.a.trim() })),
      content: f.t,
      theme: f.theme,
    };
    const issues = themeIssues(f.theme).length;
    const text = `Los textos, horarios, contactos, políticas y colores se actualizan en todo el sitio.${issues ? ` Ojo: ${issues === 1 ? "una combinación de colores tiene poco contraste y puede costar leerla" : `${issues} combinaciones de colores tienen poco contraste y puede costar leerlas`}.` : ""}`;
    ask({ title: "Publicar cambios del sitio", text, okLabel: "Publicar", done: "Cambios publicados en el sitio", run: () => api.admin.saveSite(body) });
  };

  const counts = Object.values(errors).reduce<Record<string, number>>((m, x) => ({ ...m, [x.tab]: (m[x.tab] ?? 0) + 1 }), {});

  return (
    <Ctx.Provider value={ctx}>
      <PageHeader title={MODULES.contenido.label} description="Organizado por las secciones del sitio. Las fotos se publican al subirlas; los textos, al guardar." />
      <GroupedNavTabs
        label="Secciones del sitio"
        current={section ?? ""}
        groups={CONTENT_GROUPS.map((g) => ({ label: g, tabs: CONTENT_SECTIONS.filter((x) => x.group === g).map((x) => ({ id: x.id, href: paths.contenido(x.id), label: x.label, icon: ICONS[x.id], count: counts[x.id] })) }))}
      />
      {meta && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-panel/60 px-4 py-3 text-[13.5px] text-ink-muted">
          <p>
            <span className="font-semibold text-ink">Dónde aparece: </span>
            {meta.where}
          </p>
          <a href={meta.href} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 font-semibold text-ink underline-offset-2 hover:underline">
            Ver en el sitio
            <ExternalLinkIcon size={14} />
          </a>
        </div>
      )}
      <div key={section} className="flex flex-col gap-4 motion-safe:animate-fade-in">
        {children}
      </div>
      {section && !PHOTOS_ONLY.includes(section) && (
        <SaveBar
          dirty={dirty}
          onDiscard={() => {
            setF(saved);
            setErrors({});
          }}
          onSave={save}
          saveLabel="Publicar cambios"
        />
      )}
    </Ctx.Provider>
  );
}

// app/admin/contenido/[seccion]/page.tsx: los campos de una zona del sitio.
export function ContentSection({ id }: { id: ContentSectionId }) {
  const { f, saved, errors, err, setS, setT, setPolicies, setTheme } = useContext(Ctx)!;
  return (
    <>
        {id === "portada" && (
          <>
            <Card aria-labelledby="ct-hero" className="grid grid-cols-1 gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
              <div className="flex flex-col gap-4">
                <CardHeader id="ct-hero" icon={<HomeIcon size={18} />} title="Textos de la portada" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Título (primera línea)" error={err("heroTitle")} hint={`${f.t.hero.title.length}/${TEXT_LIMITS.title}`}>
                    {(p) => <input {...p} type="text" maxLength={TEXT_LIMITS.title} value={f.t.hero.title} onChange={(e) => setT("hero", { title: e.target.value })} className={adminInput} />}
                  </Field>
                  <Field label="Título resaltado (segunda línea)" hint={`${f.t.hero.highlight.length}/${TEXT_LIMITS.highlight}`}>
                    {(p) => <input {...p} type="text" maxLength={TEXT_LIMITS.highlight} value={f.t.hero.highlight} onChange={(e) => setT("hero", { highlight: e.target.value })} className={adminInput} />}
                  </Field>
                </div>
                <Field
                  label="Frases que se alternan con el título resaltado (opcional)"
                  error={err("heroRotating")}
                  hint={`Una por línea, hasta ${TEXT_LIMITS.rotatingLines}. En la portada cambian solas, letra por letra: «las estrellas» → «la Vía Láctea»… Déjalo vacío para que no cambie.`}
                >
                  {(p) => <textarea {...p} rows={3} maxLength={TEXT_LIMITS.rotating} value={f.t.hero.rotating} onChange={(e) => setT("hero", { rotating: e.target.value })} className={`${adminInput} resize-y leading-relaxed`} placeholder={"la Vía Láctea\nel cielo andino"} />}
                </Field>
                <Field label="Etiqueta junto al título" hint="Corta. Ej. «Murillo, Tolima · A 2.950 m de altura».">
                  {(p) => <input {...p} type="text" maxLength={TEXT_LIMITS.badge} value={f.t.hero.badge} onChange={(e) => setT("hero", { badge: e.target.value })} className={adminInput} />}
                </Field>
                <Field label="Descripción" hint={`${f.t.hero.description.length}/${TEXT_LIMITS.description}`}>
                  {(p) => <textarea {...p} rows={3} maxLength={TEXT_LIMITS.description} value={f.t.hero.description} onChange={(e) => setT("hero", { description: e.target.value })} className={`${adminInput} resize-y leading-relaxed`} />}
                </Field>
              </div>
              <HeroPreview t={f.t} theme={f.theme} />
            </Card>
            <PhotoGroups groups={["Portada · banner grande", "Portada · banners pequeños"]} />
          </>
        )}

        {id === "experiencias" && <PhotoGroups groups={["Alta montaña bajo las estrellas"]} />}

        {id === "colores" && <ThemeEditor theme={f.theme} saved={saved.theme} onChange={setTheme} />}

        {id === "servicios" && <ServicesManager />}

        {id === "horarios" && (
          <Card aria-labelledby="ct-hours" className="flex max-w-[640px] flex-col gap-4 p-4 sm:p-5">
            <CardHeader id="ct-hours" icon={<ClockIcon size={18} />} title="Horarios" subtitle="Las horas de llegada que se pueden elegir al reservar siguen esta ventana." />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Check-in desde">
                {(p) => <Combobox id={p.id} describedBy={p["aria-describedby"]} invalid={!!err("checkIn")} value={f.s.checkInStart} onChange={(v) => setS({ checkInStart: v })} options={timeOptions(f.s.checkInStart)} searchPlaceholder="Buscar hora…" />}
              </Field>
              <Field label="Check-in hasta">
                {(p) => <Combobox id={p.id} describedBy={p["aria-describedby"]} invalid={!!err("checkIn")} value={f.s.checkInEnd} onChange={(v) => setS({ checkInEnd: v })} options={timeOptions(f.s.checkInEnd)} searchPlaceholder="Buscar hora…" />}
              </Field>
              <Field label="Check-out" error={err("checkOut")}>
                {(p) => <Combobox id={p.id} describedBy={p["aria-describedby"]} invalid={!!p["aria-invalid"]} value={f.s.checkOutTime} onChange={(v) => setS({ checkOutTime: v })} options={timeOptions(f.s.checkOutTime)} searchPlaceholder="Buscar hora…" />}
              </Field>
            </div>
            {err("checkIn") && <FieldError>{err("checkIn")}</FieldError>}
            {TIME.test(f.s.checkInStart) && TIME.test(f.s.checkInEnd) && TIME.test(f.s.checkOutTime) && (
              <Callout>
                <span className="font-semibold">En el sitio:</span> Check-in {fmtTime(f.s.checkInStart)} a {fmtTime(f.s.checkInEnd)} · Check-out {fmtTime(f.s.checkOutTime)}
              </Callout>
            )}
          </Card>
        )}

        {id === "politicas" && (
          <Card aria-labelledby="ct-pol" className="flex flex-col gap-4 p-4 sm:p-5">
            <CardHeader id="ct-pol" icon={<FileTextIcon size={18} />} title="Reservas y políticas" subtitle="Funcionan como preguntas frecuentes: un título y su respuesta. El orden es el del sitio." />
            <ol className="flex flex-col gap-3">
              {f.policies.map((p, i) => (
                <li key={p.id} className="flex gap-3 rounded-xl border border-line p-3 sm:p-4">
                  <span aria-hidden="true" className="mt-7 grid size-6 flex-none place-items-center rounded-full bg-canvas text-[12px] font-bold text-ink-muted tabular-nums max-sm:hidden">
                    {i + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="flex items-end gap-2">
                      <Field label={<>Título<span className="sr-only"> de la política {i + 1}</span></>} className="flex-1">
                        {(fp) => (
                          <input {...fp} aria-invalid={errors.policies && !p.q.trim() ? true : undefined} type="text" maxLength={120} value={p.q} onChange={(e) => setPolicies((ps) => ps.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} className={adminInput} />
                        )}
                      </Field>
                      <div className="flex gap-0.5">
                        <IconButton label={`Subir política ${i + 1}`} disabled={i === 0} onClick={() => setPolicies((ps) => swap(ps, i, i - 1))}>
                          <ArrowUpIcon size={16} />
                        </IconButton>
                        <IconButton label={`Bajar política ${i + 1}`} disabled={i === f.policies.length - 1} onClick={() => setPolicies((ps) => swap(ps, i, i + 1))}>
                          <ArrowDownIcon size={16} />
                        </IconButton>
                        <IconButton label={`Eliminar política ${i + 1}`} variant="danger-ghost" disabled={f.policies.length <= 1} onClick={() => setPolicies((ps) => ps.filter((_, j) => j !== i))}>
                          <TrashIcon size={16} />
                        </IconButton>
                      </div>
                    </div>
                    <Field label={<>Texto<span className="sr-only"> de la política {i + 1}</span></>}>
                      {(fp) => (
                        <textarea {...fp} aria-invalid={errors.policies && !p.a.trim() ? true : undefined} rows={3} maxLength={2000} value={p.a} onChange={(e) => setPolicies((ps) => ps.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} className={`${adminInput} resize-y leading-relaxed`} />
                      )}
                    </Field>
                  </div>
                </li>
              ))}
            </ol>
            {err("policies") && <FieldError>{err("policies")}</FieldError>}
            {f.policies.length < 20 && (
              <Button icon={<PlusIcon size={14} />} onClick={() => setPolicies((ps) => [...ps, { id: crypto.randomUUID(), q: "", a: "" }])} className="self-start">
                Agregar política
              </Button>
            )}
          </Card>
        )}

        {id === "contacto" && (
          <>
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
              <Card aria-labelledby="ct-contact" className="flex flex-col gap-4 p-4 sm:p-5">
                <CardHeader id="ct-contact" icon={<PhoneIcon size={17} />} title="Contacto" />
                <Field label="WhatsApp (con indicativo)" hint="Solo números, con el indicativo del país. Ej. 573144001279" error={err("whatsapp")}>
                  {(p) => <input {...p} type="tel" inputMode="numeric" value={f.s.whatsapp} onChange={(e) => setS({ whatsapp: e.target.value })} placeholder="573144001279" className={adminInput} />}
                </Field>
                <fieldset className="flex min-w-0 flex-col gap-2">
                  <legend className="mb-1.5 text-[13px] font-semibold text-ink">Teléfonos</legend>
                  {f.s.phones.map((ph, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="tel"
                        aria-label={`Teléfono ${i + 1}`}
                        aria-invalid={errors.phones && !/^[\d\s()+-]{7,20}$/.test(ph.trim()) ? true : undefined}
                        value={ph}
                        onChange={(e) => setS({ phones: f.s.phones.map((x, j) => (j === i ? e.target.value : x)) })}
                        className={`${adminInput} min-w-0 flex-1`}
                      />
                      <IconButton label={`Quitar teléfono ${i + 1}`} disabled={f.s.phones.length <= 1} onClick={() => setS({ phones: f.s.phones.filter((_, j) => j !== i) })}>
                        <CloseIcon size={17} />
                      </IconButton>
                    </div>
                  ))}
                  {f.s.phones.length < 5 && (
                    <Button size="sm" variant="ghost" icon={<PlusIcon size={14} />} onClick={() => setS({ phones: [...f.s.phones, ""] })} className="self-start">
                      Agregar teléfono
                    </Button>
                  )}
                  {err("phones") && <FieldError>{err("phones")}</FieldError>}
                </fieldset>
              </Card>
              <Card aria-labelledby="ct-loc" className="flex flex-col gap-4 p-4 sm:p-5">
                <CardHeader id="ct-loc" icon={<PinIcon size={17} />} title="Ubicación" />
                <div className="rounded-xl bg-canvas px-3.5 py-3 text-[13.5px]">
                  <p className="font-semibold text-ink">{config.address}</p>
                  <p className="mt-0.5 text-ink-muted">La dirección y el punto del mapa forman parte de la configuración del sitio; para cambiarlos se requiere un ajuste técnico.</p>
                </div>
                <Field label="Nota de ubicación" hint="Se muestra bajo la dirección. Déjala vacía para ocultarla.">
                  {(p) => <input {...p} type="text" maxLength={TEXT_LIMITS.note} value={f.t.location.note} onChange={(e) => setT("location", { note: e.target.value })} className={adminInput} />}
                </Field>
              </Card>
            </div>
            <PhotoGroups groups={["Contacto"]} />
          </>
        )}

        {id === "pagos" && (
          <Card aria-labelledby="ct-pay" className="flex max-w-[760px] flex-col gap-4 p-4 sm:p-5">
            <CardHeader id="ct-pay" icon={<WalletIcon size={18} />} title="Pago fuera de línea" subtitle={`El abono (${config.depositPct} %) y el saldo se pagan en línea con Wompi. Si el huésped no paga el saldo dentro de la hora siguiente al check-in, ve estas instrucciones para pagarlo en recepción o por transferencia.`} />
            <Field label="Instrucciones de pago" hint="Banco, tipo y número de cuenta, titular, o llave de Bre-B / Nequi. Se muestran tal cual las escribas.">
              {(p) => (
                <textarea
                  {...p}
                  rows={4}
                  maxLength={TEXT_LIMITS.instructions}
                  value={f.t.payment.instructions}
                  onChange={(e) => setT("payment", { instructions: e.target.value })}
                  placeholder="Bancolombia · Ahorros 000-000000-00 · a nombre de …"
                  className={`${adminInput} resize-y leading-relaxed`}
                />
              )}
            </Field>
            {!f.t.payment.instructions.trim() && (
              <Callout tone="warning">
                Aún no hay instrucciones: si el saldo vence, el huésped solo verá que debe pagar en recepción o escribir por WhatsApp.
              </Callout>
            )}
            <Callout>Cuando recibas un pago por fuera de la pasarela, regístralo en la ficha de la reserva («Registrar abono» o «Registrar pago del saldo»): queda en el historial de pagos y aplica las mismas reglas que un pago en línea.</Callout>
          </Card>
        )}

        {id === "redes" && (
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <Card aria-labelledby="ct-social" className="flex flex-col gap-4 p-4 sm:p-5">
              <CardHeader id="ct-social" icon={<ExternalLinkIcon size={17} />} title="Redes sociales" subtitle="Pega el enlace completo del perfil. Las vacías no se muestran." />
              {(["instagram", "facebook", "tiktok"] as const).map((k) => (
                <Field key={k} label={k === "tiktok" ? "TikTok" : k[0].toUpperCase() + k.slice(1)} error={err(k)}>
                  {(p) => <input {...p} type="url" inputMode="url" maxLength={TEXT_LIMITS.url} value={f.t.social[k]} onChange={(e) => setT("social", { [k]: e.target.value })} placeholder={`https://www.${k}.com/…`} className={adminInput} />}
                </Field>
              ))}
            </Card>
            <Card aria-labelledby="ct-legal" className="flex flex-col gap-4 p-4 sm:p-5">
              <CardHeader id="ct-legal" icon={<ShieldIcon size={17} />} title="Datos legales" />
              <Field label="Número de RNT (Registro Nacional de Turismo)" hint="Si lo dejas vacío, el RNT no se muestra en el pie de página.">
                {(p) => <input {...p} type="text" value={f.s.rnt} onChange={(e) => setS({ rnt: e.target.value })} placeholder="Ej. 123456" className={adminInput} />}
              </Field>
            </Card>
          </div>
        )}
    </>
  );
}

const swap = <T,>(a: T[], i: number, j: number) => {
  const n = [...a];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
};

// Vista previa de la portada con los estilos y los colores (aún sin publicar) del sitio.
function HeroPreview({ t, theme }: { t: SiteTexts; theme: SiteTheme }) {
  return (
    <section aria-labelledby="ct-prev" className="flex flex-col gap-2">
      <h3 id="ct-prev" className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted">
        <CheckIcon size={14} />
        Vista previa
      </h3>
      <div aria-hidden="true" style={themeStyle(theme)} className="flex flex-col gap-4 rounded-lg bg-surface p-5 text-on-dark">
        <p className="display text-[2.6rem] leading-[.9]">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{t.hero.title || "Título"}</span>
            {t.hero.badge && <span className="rounded-sm bg-card px-2 py-1 font-body text-[.62rem] leading-tight font-semibold tracking-normal text-on-light normal-case">{t.hero.badge}</span>}
          </span>
          {t.hero.highlight && <span className="block text-accent">{t.hero.highlight}</span>}
        </p>
        <p className="text-[.85rem] text-on-dark-muted">{t.hero.description}</p>
        <span className="btn btn-cta min-h-10 self-start px-4 text-[.8rem]">Reservar ahora</span>
      </div>
    </section>
  );
}

/* ───────────── Fotos por zona ───────────── */

type Size = { width: number; height: number };
const UPLOAD_ERRORS: Record<number, string> = {
  413: "La imagen pesa demasiado (máximo 5 MB).",
  415: "Formato no compatible. Usa JPG, PNG o WebP.",
  501: "La subida de imágenes no está disponible en modo simulado.",
};
const isLow = (s: PhotoSlotDef, z: Size) => z.width < s.min[0] || z.height < s.min[1];
const px = (z: Size) => `${z.width} × ${z.height} px`;

// Resolución real de la foto publicada (el original en Storage, no la miniatura optimizada).
function useNaturalSize(src?: string) {
  const [size, setSize] = useState<(Size & { src: string }) | null>(null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    const img = new window.Image();
    img.onload = () => alive && setSize({ src, width: img.naturalWidth, height: img.naturalHeight });
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);
  return size?.src === src ? size : null;
}

type SlotState = { busy: boolean; locked: boolean; error?: string };

function PhotoCard({ s, src, st, onPick, onDrop, onRemove }: { s: PhotoSlotDef; src?: string; st: SlotState; onPick: () => void; onDrop: (f: File) => void; onRemove: () => void }) {
  const [over, setOver] = useState(false);
  const size = useNaturalSize(src);
  const low = size && isLow(s, size);
  const dragProps = st.locked
    ? {}
    : {
        onDragOver: (e: DragEvent) => {
          e.preventDefault();
          setOver(true);
        },
        onDragLeave: () => setOver(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onDrop(f);
        },
      };

  return (
    <li {...dragProps} className={`flex flex-col overflow-hidden rounded-2xl border bg-panel shadow-panel transition-[border-color,box-shadow] duration-150 ${over ? "border-focus ring-4 ring-focus/15" : "border-line"}`}>
      <div className="relative bg-canvas" style={{ aspectRatio: s.aspect }}>
        {src ? (
          <Image src={src} alt={s.alt} fill sizes="(min-width: 640px) 280px, 50vw" className="object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-4 text-center text-ink-muted">
            <ImageIcon size={26} className="opacity-60" />
            <span className="text-[13px] font-semibold">Sin foto</span>
            <span className="text-[12px]">En el sitio se ve un marcador</span>
          </div>
        )}
        {src && (
          <span className={`absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold shadow-panel ${low ? "bg-warning-soft text-warning" : "bg-panel/95 text-success"}`}>
            {low ? <WarningIcon size={13} /> : <CheckIcon size={12} />}
            {low ? "Resolución baja" : "Publicada"}
          </span>
        )}
        {(st.busy || over) && (
          <div role={st.busy ? "status" : undefined} className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-panel/80 text-[13px] font-semibold text-ink backdrop-blur-[2px] motion-safe:animate-fade-in">
            {st.busy ? <Spinner size={22} /> : <UploadIcon size={22} />}
            {st.busy ? "Optimizando y subiendo…" : "Suelta la foto para subirla"}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-[14px] leading-tight font-semibold text-ink">{s.label}</h3>
          <p className="text-[12.5px] text-ink-muted">{`${s.hint} · mínimo ${s.min[0]} × ${s.min[1]} px`}</p>
          {size && (
            <p className={`text-[12.5px] ${low ? "font-semibold text-warning" : "text-ink-muted"}`}>
              {`Actual: ${px(size)}`}
              {low && " · se verá borrosa"}
            </p>
          )}
        </div>

        {st.error && <FieldError>{st.error}</FieldError>}

        <div className="mt-auto flex gap-2">
          <Button size="sm" variant={src ? "secondary" : "primary"} icon={<UploadIcon size={15} />} disabled={st.locked} onClick={onPick} className="flex-1">
            {src ? "Reemplazar" : "Subir foto"}
          </Button>
          {src && (
            <IconButton label={`Quitar foto: ${s.label}`} size="sm" variant="danger-ghost" disabled={st.locked} onClick={onRemove}>
              <TrashIcon size={16} />
            </IconButton>
          )}
        </div>
      </div>
    </li>
  );
}

function PhotoGroups({ groups }: { groups: string[] }) {
  const { data, setData, ask, toast, onAuthError } = useAdmin();
  const photos = data.site.photos;
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cropping, setCropping] = useState<{ s: PhotoSlotDef; file: File } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<string | null>(null);

  const setError = (slot: string, msg = "") => setErrors((e) => ({ ...e, [slot]: msg }));

  // Sube solo la región encuadrada, ya con la proporción exacta del espacio.
  async function upload(s: PhotoSlotDef, file: File, crop: Crop, size: Size) {
    setBusy(s.id);
    try {
      const blob = await resizeImage(file, { crop, size });
      const r = await api.admin.uploadPhoto(s.id, blob, `${s.id}.${blob.type === "image/webp" ? "webp" : "jpg"}`);
      if (r.status === 401 || r.status === 403) return onAuthError();
      if (r.status !== 200 || !r.data) return setError(s.id, UPLOAD_ERRORS[r.status] ?? "No se pudo subir la imagen. Inténtalo de nuevo.");
      const next = r.data;
      setData((d) => ({ ...d, site: { ...d.site, photos: next } }));
      toast(`${s.label}: foto publicada`);
    } catch {
      setError(s.id, "No se pudo leer la imagen. Prueba con otra en JPG, PNG o WebP.");
    } finally {
      setBusy(null);
    }
  }

  // Antes de subirla, la foto se encuadra en el marco del espacio (ahí mismo se avisa si no alcanza la resolución).
  function onFile(s: PhotoSlotDef, file: File | undefined) {
    if (!file) return;
    setError(s.id);
    if (!file.type.startsWith("image/")) return setError(s.id, "Elige una imagen JPG, PNG o WebP.");
    setCropping({ s, file });
  }

  const pick = (slot: string) => {
    target.current = slot;
    input.current?.click();
  };

  return (
    <>
      <Callout tone="info">
        Al elegir una foto puedes <strong>moverla y acercarla</strong> para encuadrarla: se recorta a la medida exacta de cada espacio, se optimiza y se publica. Usa el <strong>archivo original</strong> de la cámara o del celular: las capturas de pantalla y las fotos reenviadas por WhatsApp pierden resolución. También puedes arrastrar una foto sobre cada espacio.
        {isMockApi && <strong> En modo simulado la subida no está disponible.</strong>}
      </Callout>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const s = PHOTO_SLOTS.find((x) => x.id === target.current);
          if (s) onFile(s, e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {groups.map((g, gi) => {
        const slots = PHOTO_SLOTS.filter((s) => s.group === g);
        const filled = slots.filter((s) => photos[s.id]).length;
        return (
          <section key={g} aria-labelledby={`g-${gi}`} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line pb-2">
              <h2 id={`g-${gi}`} className="text-[15px] font-bold text-ink">
                {g}
              </h2>
              <p className="text-[12.5px] font-medium text-ink-muted">{`${filled} de ${slots.length} con foto`}</p>
            </div>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,210px),1fr))] gap-4">
              {slots.map((s) => (
                <PhotoCard
                  key={s.id}
                  s={s}
                  src={photos[s.id]}
                  st={{ busy: busy === s.id, locked: !!busy, error: errors[s.id] }}
                  onPick={() => pick(s.id)}
                  onDrop={(f) => onFile(s, f)}
                  onRemove={() =>
                    ask({
                      title: "Quitar foto",
                      text: `${s.label}: en el sitio volverá a verse el marcador hasta que subas otra.`,
                      okLabel: "Quitar",
                      danger: true,
                      done: "Foto quitada",
                      run: () => api.admin.deletePhoto(s.id),
                    })
                  }
                />
              ))}
            </ul>
          </section>
        );
      })}
      {cropping && (
        <PhotoCropper
          key={`${cropping.s.id}:${cropping.file.name}:${cropping.file.lastModified}`}
          file={cropping.file}
          title={cropping.s.label}
          aspect={cropping.s.aspect}
          hint={cropping.s.hint}
          min={cropping.s.min}
          onCancel={() => setCropping(null)}
          onChooseOther={() => {
            const id = cropping.s.id;
            setCropping(null);
            pick(id);
          }}
          onConfirm={(crop, size) => {
            setCropping(null);
            upload(cropping.s, cropping.file, crop, size);
          }}
        />
      )}
    </>
  );
}
