"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  IdCardIcon,
  ListIcon,
  LockIcon,
  MailIcon,
  MoonIcon,
  NoteIcon,
  SearchIcon,
  ShieldIcon,
  TagIcon,
  TrashIcon,
  TrendIcon,
  UsersIcon,
  WarningIcon,
  WhatsAppIcon,
} from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/status-pill";
import { type ClientSummary, buildClients, paymentState, pendingOf, valueOf } from "@/lib/admin-metrics";
import { api } from "@/lib/client/api";
import { can } from "@/lib/permissions";
import { config } from "@/lib/config";
import { cop, dateOf, fmtDate, fmtDateTime, nightsBetween, plural, waTo } from "@/lib/format";
import type { ClientProfile, ClientProfileInput, Reservation, Severity, Trust } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin, useParam } from "@/components/admin/context";
import { Paginator, usePaged } from "@/components/admin/paginator";
import { EmailComposer, hasEmail } from "@/components/admin/email-composer";
import { Facts } from "@/components/admin/reservation-detail";
import { MODULES, paths } from "@/components/admin/routes";
import { TRUST, adminInput, norm } from "@/components/admin/shared";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  Deco,
  EmptyState,
  Field,
  IconButton,
  ModalPresence,
  PageHeader,
  SaveBar,
  Segmented,
  StatCard,
  Stars,
  buttonClass,
  type Tone,
} from "@/components/admin/ui";

type Filter = "todos" | "nuevos" | "recurrentes" | "frecuentes" | "alertas";
type Sort = "actividad" | "reservas" | "valor" | "nombre" | "nuevos";

function useClients() {
  const { data, today } = useAdmin();
  return useMemo(() => buildClients(data.reservations, data.clients, today), [data.reservations, data.clients, today]);
}

const lastActivity = (c: ClientSummary) => c.reservations.reduce((m, r) => (r.createdAt > m ? r.createdAt : m), c.firstAt);

/* ───────────── Listado ───────────── */

export function ClientList() {
  const { data, cabinLabel } = useAdmin();
  const money = can(data.me.role, "finance");
  const clients = useClients();
  const [q, setQ] = useParam("q", "");
  const [filterP, setFilter] = useParam<Filter>("filtro", "todos");
  const [sort, setSort] = useParam<Sort>("orden", "actividad");

  // "Frecuentes": el 20 % con más estadías (mínimo 2).
  const frequentMin = useMemo(() => {
    const s = clients.map((c) => c.stays).sort((a, b) => b - a);
    return Math.max(2, s[Math.floor(s.length * 0.2)] ?? 2);
  }, [clients]);
  const test: Record<Filter, (c: ClientSummary) => boolean> = {
    todos: () => true,
    nuevos: (c) => c.isNew,
    recurrentes: (c) => c.isRecurring,
    frecuentes: (c) => c.stays >= frequentMin,
    alertas: (c) => c.flagged || c.incidents > 0,
  };
  const filter: Filter = filterP in test ? filterP : "todos";
  const nq = norm(q.trim());
  const list = clients
    .filter((c) => test[filter](c) && (!nq || [c.name, c.email, c.phone, c.docNumber, c.city].some((v) => norm(v || "").includes(nq))))
    .sort((a, b) =>
      sort === "reservas"
        ? b.stays - a.stays || b.value - a.value
        : sort === "valor"
          ? b.value - a.value
          : sort === "nombre"
            ? a.name.localeCompare(b.name, "es")
            : sort === "nuevos"
              ? a.firstAt < b.firstAt
                ? 1
                : -1
              : lastActivity(a) < lastActivity(b)
                ? 1
                : -1,
    );
  const paged = usePaged(list, "clientes", [filter, nq, sort].join("|"));

  const total = clients.length;
  const recurring = clients.filter((c) => c.isRecurring).length;
  const value = clients.reduce((s, c) => s + c.value, 0);
  const latest = [...data.reservations].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 6);

  return (
    <>
      <PageHeader
        title={MODULES.clientes.label}
        description="Cada cliente se identifica por su documento. Su historial y la valoración interna del equipo están en su ficha."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          accent="pink"
          label="Clientes"
          value={total}
          hint={`${clients.filter((c) => c.isNew).length} nuevos en 30 días`}
          icon={<UsersIcon size={15} />}
        />
        <StatCard
          accent="green"
          label="Recurrentes"
          value={recurring}
          hint={total ? `${Math.round((recurring / total) * 100)} % volvió al menos una vez` : "—"}
          icon={<TrendIcon size={15} />}
          tone="success"
        />
        {money ? (
          <StatCard
            accent="yellow"
            label="Valor generado"
            value={cop(value)}
            hint={total ? `${cop(Math.round(value / total))} por cliente` : "—"}
            icon={<TrendIcon size={15} />}
          />
        ) : (
          <StatCard
            accent="yellow"
            label="Con estadías"
            value={clients.filter((c) => c.stays > 0).length}
            hint="se han hospedado al menos una vez"
            icon={<TrendIcon size={15} />}
          />
        )}
        <StatCard
          accent="blue"
          label="Con alertas"
          value={clients.filter(test.alertas).length}
          hint="confianza baja o incidencias"
          icon={<WarningIcon size={15} />}
          tone={clients.some(test.alertas) ? "warning" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-3 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <Field label="Buscar">
                {(p) => (
                  <div className="relative">
                    <SearchIcon size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle" />
                    <input
                      {...p}
                      type="search"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Nombre, correo, celular, documento o ciudad"
                      className={`${adminInput} pl-9`}
                    />
                  </div>
                )}
              </Field>
              <Field label="Mostrar">
                {(p) => (
                  <Combobox
                    id={p.id}
                    value={filter}
                    onChange={(v) => setFilter(v as Filter)}
                    options={[
                      { value: "todos", label: "Todos los clientes", description: plural(total, "cliente", "clientes") },
                      { value: "nuevos", label: "Nuevos", description: `${clients.filter(test.nuevos).length} en los últimos 30 días` },
                      { value: "recurrentes", label: "Recurrentes", description: plural(recurring, "cliente", "clientes") },
                      { value: "frecuentes", label: "Más frecuentes", description: "El 20 % con más estadías" },
                      { value: "alertas", label: "Con alertas", description: plural(clients.filter(test.alertas).length, "cliente", "clientes") },
                    ]}
                  />
                )}
              </Field>
              <Field label="Ordenar por">
                {(p) => (
                  <Combobox
                    id={p.id}
                    value={sort}
                    onChange={(v) => setSort(v as Sort)}
                    options={[
                      { value: "actividad", label: "Actividad más reciente" },
                      { value: "nuevos", label: "Clientes más nuevos" },
                      { value: "reservas", label: "Más reservas" },
                      ...(money ? [{ value: "valor", label: "Mayor valor generado" }] : []),
                      { value: "nombre", label: "Nombre (A–Z)" },
                    ]}
                  />
                )}
              </Field>
            </div>
            <p aria-live="polite" className="border-t border-line pt-3 text-[13px] font-medium text-ink-muted">
              {plural(list.length, "cliente", "clientes")}
              {filter !== "todos" || nq ? " con estos filtros" : ""}
            </p>
          </Card>
          {list.length ? (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-line">
                {paged.rows.map((c) => (
                  <li key={c.key}>
                    <Link
                      href={paths.cliente(c.key)}
                      className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 text-left transition-colors hover:bg-canvas/60 md:grid-cols-[minmax(0,1.6fr)_90px_120px_minmax(0,1.1fr)_auto]"
                    >
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
                          {c.name}
                          {c.isNew && <Badge tone="info">Nuevo</Badge>}
                          {c.isRecurring && <Badge tone="success">Recurrente</Badge>}
                          {(c.flagged || c.incidents > 0) && (
                            <Badge tone="danger" icon={<AlertIcon size={11} />}>
                              Alerta
                            </Badge>
                          )}
                        </span>
                        <span className="block truncate text-[12.5px] text-ink-muted">
                          {c.email} · {c.city}
                        </span>
                      </span>
                      <span className="hidden text-[13px] text-ink md:block">
                        <strong className="tabular-nums">{c.stays}</strong> <span className="text-ink-muted">{c.stays === 1 ? "estadía" : "estadías"}</span>
                      </span>
                      <span className="hidden text-right text-[13.5px] font-semibold text-ink tabular-nums md:block">{money ? cop(c.value) : ""}</span>
                      <span className="hidden min-w-0 items-center gap-2 md:flex">
                        <Stars value={c.profile?.rating ?? null} size={13} />
                        {c.profile && c.profile.trust !== "sin_evaluar" && <Badge tone={TRUST[c.profile.trust].tone}>{TRUST[c.profile.trust].label}</Badge>}
                      </span>
                      <ChevronRightIcon size={16} className="text-ink-subtle transition-transform duration-150 motion-safe:group-hover:translate-x-0.5" />
                      <span className="col-span-2 flex flex-wrap gap-x-3 text-[12.5px] text-ink-muted md:hidden">
                        <span>{plural(c.stays, "estadía", "estadías")}</span>
                        {money && <span className="font-semibold text-ink">{cop(c.value)}</span>}
                        {c.profile?.rating ? <Stars value={c.profile.rating} size={12} /> : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Paginator p={paged} noun="clientes" className="border-t border-line px-4 py-3" />
            </Card>
          ) : (
            <Card className="p-4">
              <EmptyState
                icon={<UsersIcon size={18} />}
                title={clients.length ? "No hay clientes con ese filtro" : "Aún no hay clientes"}
                text={clients.length ? "Prueba con otra búsqueda o filtro." : "Cada persona que reserve aparecerá aquí con su historial."}
              />
            </Card>
          )}
        </div>

        <Card aria-labelledby="cl-recent" className="flex flex-col gap-3 p-4 sm:p-5">
          <CardHeader id="cl-recent" title="Últimas reservas" subtitle="De más reciente a más antigua" />
          {latest.length ? (
            <ul className="-mx-2 flex flex-col">
              {latest.map((r) => (
                <li key={r.code}>
                  <Link
                    href={paths.reserva(r.code)}
                    className="flex w-full items-center gap-3 rounded-[16px] px-2.5 py-2 text-left transition-colors hover:bg-canvas/70"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">{r.guest.fullName}</span>
                      <span className="block truncate text-[12px] text-ink-muted">
                        {cabinLabel(r.cabinTypeId)} · {fmtDate(r.checkIn)}
                      </span>
                    </span>
                    <StatusPill status={r.status} size="sm" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-muted">Sin reservas todavía.</p>
          )}
        </Card>
      </div>
    </>
  );
}

/* ───────────── Ficha ───────────── */

const TRUST_OPTIONS: Trust[] = ["alta", "media", "baja", "no_recomendado", "sin_evaluar"];
const TAGS = [
  "Paga puntual",
  "Huésped ejemplar",
  "Viene con mascota",
  "Celebra aniversario",
  "Viaja en familia",
  "Llega tarde",
  "Pide decoración",
  "Requiere seguimiento",
];
const SEVERITY: Record<Severity, { label: string; tone: Tone }> = {
  leve: { label: "Leve", tone: "warning" },
  moderada: { label: "Moderada", tone: "warning" },
  grave: { label: "Grave", tone: "danger" },
};

export function ClientDetail({ clientKey }: { clientKey: string }) {
  const c = useClients().find((x) => x.key === clientKey);
  if (!c)
    return (
      <>
        <PageHeader title="Cliente no encontrado" />
        <Card className="p-4">
          <EmptyState
            icon={<UsersIcon size={18} />}
            title="No encontramos este cliente"
            text="Puede que el enlace esté incompleto o que sus reservas ya no existan."
            action={
              <Link href={paths.clientes()} className={buttonClass("primary")}>
                Ir a Clientes
              </Link>
            }
          />
        </Card>
      </>
    );
  return <ClientFile key={c.key} c={c} />;
}

// La ficha: lo que hay que saber del cliente a la izquierda y, a la derecha, la valoración interna, que se guarda con la
// barra fija al pie. Las notas e incidencias se guardan al agregarlas: son un registro, no parte del formulario.
function ClientFile({ c }: { c: ClientSummary }) {
  const { data, setData, today, toast, onAuthError } = useAdmin();
  const money = can(data.me.role, "finance");
  const [composing, setComposing] = useState(false);
  const p = c.profile;
  const base: ClientProfileInput = {
    rating: p?.rating ?? null,
    trust: p?.trust ?? "sin_evaluar",
    tags: p?.tags ?? [],
    preferences: p?.preferences ?? "",
    summary: p?.summary ?? "",
  };
  const [v, setV] = useState<ClientProfileInput>(base);
  const [busy, setBusy] = useState(false);
  const [tag, setTag] = useState("");
  const dirty = JSON.stringify(v) !== JSON.stringify(base);
  const set = (x: Partial<ClientProfileInput>) => setV((o) => ({ ...o, ...x }));

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.admin.saveClient({ ...v, clientKey: c.key });
      if (r.status === 401 || r.status === 403) return onAuthError();
      if (r.status !== 200 || !r.data || "error" in r.data) throw 0;
      const profile = r.data;
      setData((d) => ({ ...d, clients: { ...d.clients, [profile.clientKey]: profile } }));
      toast("Valoración guardada");
    } catch {
      toast("No se pudo guardar la valoración. Inténtalo de nuevo.", "error");
    } finally {
      setBusy(false);
    }
  }

  const addTag = (t: string) => {
    const x = t.trim().slice(0, 30);
    if (x && !v.tags.some((y) => y.toLowerCase() === x.toLowerCase()) && v.tags.length < 20) set({ tags: [...v.tags, x] });
    setTag("");
  };

  const upcoming = c.nextStay;
  const firstStay = [...c.reservations].filter((r) => valueOf(r) && r.status !== "cancelled").sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1))[0];

  return (
    <>
      <PageHeader
        title={c.name}
        description={[c.city, `Cliente desde ${fmtDate(dateOf(c.firstAt), true)}`].filter(Boolean).join(" · ")}
        actions={
          <>
            <a
              href={waTo(c.phone, `Hola ${c.name.split(" ")[0]}, te escribimos de ${config.name}.`)}
              target="_blank"
              rel="noopener"
              className={buttonClass("secondary")}
            >
              <WhatsAppIcon size={15} />
              WhatsApp
            </a>
            <Button
              icon={<MailIcon size={15} />}
              disabled={!hasEmail(c.email)}
              title={hasEmail(c.email) ? `Enviar un correo a ${c.email}` : "Este cliente no tiene un correo válido registrado"}
              onClick={() => setComposing(true)}
            >
              Correo
            </Button>
          </>
        }
      >
        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.isRecurring ? <Badge tone="success">Cliente recurrente</Badge> : <Badge>{c.stays ? "Una estadía" : "Sin estadías concretadas"}</Badge>}
          {c.isNew && <Badge tone="info">Nuevo</Badge>}
          {p && p.trust !== "sin_evaluar" && <Badge tone={TRUST[p.trust].tone}>{TRUST[p.trust].label}</Badge>}
        </div>
      </PageHeader>

      {(c.flagged || c.incidents > 0) && (
        <Callout tone="error" role="alert">
          <strong>Atención:</strong>{" "}
          {p?.trust === "no_recomendado" ? "el equipo marcó a este cliente como no recomendado. " : p?.trust === "baja" ? "confianza baja. " : ""}
          {c.incidents > 0 ? `${plural(c.incidents, "incidencia registrada", "incidencias registradas")}. ` : ""}Revisa la valoración interna antes de confirmar
          nuevas reservas.
        </Callout>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          accent="pink"
          label="Reservas"
          value={c.reservations.length}
          hint={plural(c.stays, "concretada", "concretadas")}
          icon={<ListIcon size={15} />}
        />
        <StatCard
          accent="green"
          label="Noches"
          value={c.nights}
          hint={c.stays ? `${(c.nights / c.stays).toFixed(1)} por estadía` : "—"}
          icon={<MoonIcon size={15} />}
        />
        {money ? (
          <StatCard
            accent="yellow"
            label="Valor generado"
            value={cop(c.value)}
            hint={c.stays ? `${cop(Math.round(c.value / Math.max(1, c.stays)))} por estadía` : "—"}
            icon={<TrendIcon size={15} />}
          />
        ) : (
          <StatCard accent="yellow" label="Estadías" value={c.stays} hint={c.isRecurring ? "cliente recurrente" : "—"} icon={<TrendIcon size={15} />} />
        )}
        <StatCard
          accent="blue"
          label={upcoming ? "Próxima llegada" : "Última estadía"}
          value={upcoming ? fmtDate(upcoming.checkIn) : c.lastStay ? fmtDate(c.lastStay) : "—"}
          hint={
            upcoming
              ? upcoming.checkIn === today
                ? "llega hoy"
                : `en ${plural(nightsBetween(today, upcoming.checkIn), "día", "días")}`
              : firstStay
                ? `Primera: ${fmtDate(firstStay.checkIn, true)}`
                : undefined
          }
          icon={<CalendarIcon size={15} />}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4">
          {upcoming && <NextStay r={upcoming} money={money} />}
          <ClientData c={c} money={money} />
          <Card aria-labelledby="cl-hist" className="flex flex-col gap-3 p-4 sm:p-5">
            <CardHeader
              id="cl-hist"
              icon={<ListIcon size={17} />}
              title="Historial de reservas"
              subtitle={`${plural(c.reservations.length, "reserva", "reservas")} · de la más reciente a la más antigua`}
            />
            <ClientHistory list={c.reservations} />
          </Card>
          <ClientLog c={c} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card aria-labelledby="cl-int" className="flex flex-col gap-4 p-4 sm:p-5">
            <CardHeader
              id="cl-int"
              icon={<ShieldIcon size={17} />}
              accent="blue"
              title="Valoración interna"
              subtitle={p ? `Actualizada ${fmtDate(dateOf(p.updatedAt))}` : "Sin valoración todavía"}
              actions={<Badge icon={<LockIcon size={11} />}>Privado</Badge>}
            />
            <p className="rounded-[16px] bg-canvas/70 px-4 py-2.5 text-[12.5px] text-ink-muted">
              Solo la ve el equipo en este panel. <strong className="text-ink">Nunca se muestra al cliente</strong> ni aparece en el sitio, en sus correos o en
              «Consultar mi reserva».
            </p>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-ink">Valoración</span>
              <div className="flex items-center gap-2">
                <Stars value={v.rating} onChange={(n) => set({ rating: n })} size={24} />
                <span className="text-[12.5px] text-ink-muted">{v.rating ? `${v.rating} de 5` : "Sin valorar"}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span id="cl-trust" className="text-[13px] font-semibold text-ink">
                Nivel de confianza
              </span>
              <div role="radiogroup" aria-labelledby="cl-trust" className="flex flex-wrap gap-1.5">
                {TRUST_OPTIONS.map((t) => {
                  const on = v.trust === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => set({ trust: t })}
                      className={`rounded-full ${on ? "" : "border border-line-strong px-2.5 py-0.5 text-[12px] leading-[1.5] font-semibold text-ink-muted transition-colors hover:border-ink hover:text-ink"}`}
                    >
                      {on ? (
                        <Badge tone={TRUST[t].tone} icon={<CheckIcon size={11} />}>
                          {TRUST[t].label}
                        </Badge>
                      ) : (
                        TRUST[t].label
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card aria-labelledby="cl-tags" className="flex flex-col gap-3 p-4 sm:p-5">
            <CardHeader id="cl-tags" icon={<TagIcon size={17} />} accent="yellow" title="Etiquetas" subtitle="Para reconocer al cliente de un vistazo." />
            {v.tags.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {v.tags.map((t) => (
                  <li key={t} className="inline-flex items-center gap-1 rounded-full bg-paper py-0.5 pr-0.5 pl-2.5 text-[12.5px] font-semibold text-ink">
                    {t}
                    <button
                      type="button"
                      aria-label={`Quitar ${t}`}
                      onClick={() => set({ tags: v.tags.filter((x) => x !== t) })}
                      className="btn-icon size-6 text-ink-muted hover:bg-ink/8 hover:text-ink"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-1.5">
              {TAGS.filter((t) => !v.tags.includes(t)).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => addTag(t)}
                  className="rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-[12px] text-ink-muted transition-colors hover:border-ink hover:text-ink"
                >
                  + {t}
                </button>
              ))}
            </div>
            <input
              type="text"
              aria-label="Nueva etiqueta"
              maxLength={30}
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(tag);
                }
              }}
              placeholder="Otra etiqueta y Enter"
              className={adminInput}
            />
          </Card>

          <Card aria-labelledby="cl-notes" className="flex flex-col gap-3 p-4 sm:p-5">
            <CardHeader id="cl-notes" icon={<NoteIcon size={17} />} accent="green" title="Preferencias y observaciones" />
            <Field label="Preferencias" hint="Útil para su próxima visita: cabaña favorita, horarios, alergias, ocasiones especiales.">
              {(fp) => (
                <textarea
                  {...fp}
                  rows={2}
                  maxLength={2000}
                  value={v.preferences}
                  onChange={(e) => set({ preferences: e.target.value })}
                  className={`${adminInput} resize-y leading-relaxed`}
                />
              )}
            </Field>
            <Field label="Observaciones generales">
              {(fp) => (
                <textarea
                  {...fp}
                  rows={3}
                  maxLength={2000}
                  value={v.summary}
                  onChange={(e) => set({ summary: e.target.value })}
                  className={`${adminInput} resize-y leading-relaxed`}
                />
              )}
            </Field>
          </Card>
        </div>
      </div>

      <SaveBar
        dirty={dirty}
        onDiscard={() => {
          setV(base);
          setTag("");
        }}
        onSave={save}
        saveLabel={busy ? "Guardando…" : "Guardar cambios"}
      />
      <ModalPresence>
        {composing && <EmailComposer clientKey={c.key} name={c.name} email={c.email} reservations={c.reservations} onClose={() => setComposing(false)} />}
      </ModalPresence>
    </>
  );
}

/* ───────────── Próxima estadía ───────────── */

function NextStay({ r, money }: { r: Reservation; money: boolean }) {
  const { cabinLabel } = useAdmin();
  const pending = pendingOf(r).total;
  return (
    <section aria-labelledby="cl-next" className="relative isolate flex flex-col gap-3 overflow-hidden rounded-[22px] bg-pink p-4 sm:p-5">
      <Deco accent="pink" shape="calendar" className="-top-6 -right-6 size-[120px] rotate-12" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="cl-next" className="text-[13.5px] font-semibold text-ink">
            Próxima estadía
          </h2>
          <p className="mt-1 text-[clamp(1.2rem,1.8vw,1.5rem)] leading-tight font-bold tracking-[-0.02em] text-ink">
            {fmtDate(r.checkIn, true)} → {fmtDate(r.checkOut)}
          </p>
          <p className="mt-1 text-[13px] text-ink/75">
            {cabinLabel(r.cabinTypeId, r.unit)} · {plural(nightsBetween(r.checkIn, r.checkOut), "noche", "noches")} ·{" "}
            {plural(r.adults + r.children, "huésped", "huéspedes")} · {r.code}
          </p>
        </div>
        <Link href={paths.reserva(r.code)} className={buttonClass("primary", "sm")}>
          Ver reserva
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusPill status={r.status} size="sm" />
        {money && pending > 0 && (
          <span className="rounded-full bg-paper/70 px-2.5 py-0.5 text-[12px] font-semibold text-ink">{`Por cobrar ${cop(pending)}`}</span>
        )}
      </div>
    </section>
  );
}

/* ───────────── Datos del cliente ───────────── */

const docLabel = (c: ClientSummary) => (c.docType === "SD" ? "Sin documento" : `${c.docType} ${c.docNumber}`);
const sourceLabel = (r: Reservation) => (r.source === "import" ? r.channel || "Importada" : r.source === "panel" ? "Creada por el equipo" : "Sitio web");

function ClientData({ c, money }: { c: ClientSummary; money: boolean }) {
  const { cabinLabel } = useAdmin();
  const mail = hasEmail(c.email);
  const kept = c.reservations.filter((r) => r.status !== "cancelled" && r.status !== "expired");
  // La cabaña en la que más ha reservado (sin contar las canceladas o vencidas).
  const counts = new Map<string, number>();
  for (const r of kept) counts.set(r.cabinTypeId, (counts.get(r.cabinTypeId) ?? 0) + 1);
  const favorite = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const first = [...c.reservations].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
  const dropped = c.reservations.length - kept.length;
  return (
    <Card aria-labelledby="cl-data" className="flex flex-col gap-2 p-4 sm:p-5">
      <CardHeader id="cl-data" icon={<IdCardIcon size={17} />} title="Datos del cliente" subtitle="Tomados de su reserva más reciente." />
      <div className="grid grid-cols-1 gap-x-8 2xl:grid-cols-2">
        <Facts
          rows={[
            { k: "Documento", v: docLabel(c), copy: c.docType === "SD" ? "" : c.docNumber },
            {
              k: "Correo",
              v: mail ? (
                <a href={`mailto:${c.email}`} className="underline-offset-2 hover:underline">
                  {c.email}
                </a>
              ) : (
                "Sin correo registrado"
              ),
              copy: mail ? c.email : "",
            },
            {
              k: "Celular",
              v: (
                <a href={`tel:${c.phone}`} className="underline-offset-2 hover:underline">
                  {c.phone}
                </a>
              ),
              copy: c.phone,
            },
            { k: "Ciudad", v: c.city || "—" },
          ]}
        />
        <Facts
          rows={[
            { k: "Llegó por", v: sourceLabel(first) },
            { k: "Cabaña preferida", v: favorite ? cabinLabel(favorite) : "—" },
            { k: "Mascota", v: c.reservations.some((r) => r.pet?.hasPet) ? "Ha venido con mascota" : "Sin mascota" },
            { k: "Canceladas o vencidas", v: dropped },
            ...(money
              ? [
                  { k: "Total pagado", v: cop(c.reservations.reduce((s, r) => s + r.paid, 0)) },
                  { k: "Por cobrar", v: cop(c.reservations.reduce((s, r) => s + pendingOf(r).total, 0)) },
                ]
              : []),
          ]}
        />
      </div>
    </Card>
  );
}

/* ───────────── Registro interno ───────────── */

function ClientLog({ c }: { c: ClientSummary }) {
  const { data, setData, toast, onAuthError, ask } = useAdmin();
  const canDelete = can(data.me.role, "delete");
  const entries = c.profile?.entries ?? [];
  const [entry, setEntry] = useState<{ kind: "note" | "incident"; severity: Severity; text: string; code: string }>({
    kind: "note",
    severity: "leve",
    text: "",
    code: "",
  });
  const [busy, setBusy] = useState(false);

  async function addEntry() {
    const text = entry.text.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const r = await api.admin.addClientEntry({
        clientKey: c.key,
        kind: entry.kind,
        severity: entry.kind === "incident" ? entry.severity : null,
        text,
        reservationCode: entry.code || null,
      });
      if (r.status === 401 || r.status === 403) return onAuthError();
      if (r.status !== 200 || !r.data) throw 0;
      const profile: ClientProfile = r.data;
      setData((d) => ({ ...d, clients: { ...d.clients, [profile.clientKey]: profile } }));
      setEntry({ ...entry, text: "", code: "" });
      toast(entry.kind === "incident" ? "Incidencia registrada" : "Nota agregada");
    } catch {
      toast("No se pudo guardar el registro", "error");
    } finally {
      setBusy(false);
    }
  }

  const removeEntry = (id: number) =>
    ask({
      title: "Eliminar registro",
      text: "Se borra del historial interno del cliente.",
      okLabel: "Eliminar",
      danger: true,
      done: "Registro eliminado",
      run: () => api.admin.deleteClientEntry(id),
    });

  return (
    <Card aria-labelledby="cl-log" className="flex flex-col gap-3 p-4 sm:p-5">
      <CardHeader
        id="cl-log"
        icon={<NoteIcon size={17} />}
        title="Registro interno"
        subtitle="Notas e incidencias del equipo. Se guardan al agregarlas."
        actions={<Badge icon={<LockIcon size={11} />}>Privado</Badge>}
      />
      <div className="flex flex-col gap-2.5 rounded-[18px] bg-canvas/60 p-3.5">
        <div className="flex flex-wrap gap-2">
          <Segmented
            size="sm"
            label="Tipo de registro"
            value={entry.kind}
            onChange={(k) => setEntry({ ...entry, kind: k })}
            options={[
              { value: "note", label: "Nota" },
              { value: "incident", label: "Incidencia" },
            ]}
          />
          {entry.kind === "incident" && (
            <Segmented
              size="sm"
              label="Gravedad"
              value={entry.severity}
              onChange={(s) => setEntry({ ...entry, severity: s })}
              options={(Object.keys(SEVERITY) as Severity[]).map((s) => ({ value: s, label: SEVERITY[s].label }))}
            />
          )}
        </div>
        <textarea
          aria-label={entry.kind === "incident" ? "Describe la incidencia" : "Nota"}
          rows={2}
          maxLength={2000}
          value={entry.text}
          onChange={(e) => setEntry({ ...entry, text: e.target.value })}
          placeholder={entry.kind === "incident" ? "Qué pasó: daños, cobros pendientes, quejas, ruido…" : "Algo útil para la próxima vez…"}
          className={`${adminInput} resize-y`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[180px] flex-1">
            <Combobox
              value={entry.code}
              onChange={(code) => setEntry({ ...entry, code })}
              options={[
                { value: "", label: "Sin reserva asociada" },
                ...c.reservations.map((r) => ({ value: r.code, label: r.code, description: `${fmtDate(r.checkIn)} → ${fmtDate(r.checkOut)}` })),
              ]}
              className="h-8 min-h-8 text-[13px]"
            />
          </div>
          <Button size="sm" variant="primary" loading={busy} disabled={!entry.text.trim()} onClick={addEntry}>
            {entry.kind === "incident" ? "Registrar incidencia" : "Agregar nota"}
          </Button>
        </div>
      </div>
      {entries.length ? (
        <ol className="flex flex-col gap-2">
          {entries.map((e) => (
            <li key={e.id} className={`flex gap-3 rounded-[16px] px-4 py-2.5 ${e.kind === "incident" ? "bg-error-soft" : "bg-canvas/70"}`}>
              <span aria-hidden="true" className="mt-0.5 flex-none text-ink-muted">
                {e.kind === "incident" ? <AlertIcon size={15} className="text-error" /> : <NoteIcon size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-muted">
                  {fmtDateTime(e.createdAt)}
                  {e.severity && <Badge tone={SEVERITY[e.severity].tone}>{`Incidencia ${SEVERITY[e.severity].label.toLowerCase()}`}</Badge>}
                  {e.reservationCode && <span>· {e.reservationCode}</span>}
                </p>
                <p className="mt-0.5 text-[13.5px] whitespace-pre-wrap text-ink">{e.text}</p>
              </div>
              {canDelete && (
                <IconButton label="Eliminar registro" size="sm" variant="danger-ghost" onClick={() => removeEntry(e.id)}>
                  <TrashIcon size={14} />
                </IconButton>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13px] text-ink-muted">Sin notas ni incidencias registradas.</p>
      )}
    </Card>
  );
}

// Historial de reservas del cliente, de la más reciente a la más antigua, con paginador.
function ClientHistory({ list }: { list: Reservation[] }) {
  const { cabinLabel } = useAdmin();
  const paged = usePaged(list, "historial-cliente", "", 10);
  return (
    <>
      <ol className="relative flex flex-col gap-2 before:absolute before:top-3 before:bottom-3 before:left-[11px] before:w-px before:bg-line">
        {paged.rows.map((r) => (
          <li key={r.code} className="relative pl-8">
            <span
              aria-hidden="true"
              className="absolute top-4 left-1.5 size-3 rounded-full border-2 border-panel ring-1 ring-line-strong"
              style={{
                background: `var(--color-status-${r.status === "pending_deposit" ? "pending" : r.status === "checked_in" ? "checked-in" : r.status})`,
              }}
            />
            <Link
              href={paths.reserva(r.code)}
              className="group flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-[16px] bg-canvas/60 px-4 py-3 text-left transition-colors hover:bg-canvas"
            >
              <span className="min-w-[180px] flex-1">
                <span className="block text-[14px] font-semibold text-ink">
                  {fmtDate(r.checkIn, true)} → {fmtDate(r.checkOut)}
                </span>
                <span className="block text-[12.5px] text-ink-muted">
                  {r.code} · {cabinLabel(r.cabinTypeId, r.unit)} · {plural(nightsBetween(r.checkIn, r.checkOut), "noche", "noches")} ·{" "}
                  {plural(r.adults + r.children, "huésped", "huéspedes")}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-[13.5px] font-semibold text-ink tabular-nums">{cop(r.quote.total)}</span>
                <span className="block text-[12px] text-ink-muted">{paymentState(r).label}</span>
              </span>
              <StatusPill status={r.status} size="sm" />
              <ChevronRightIcon size={16} className="text-ink-subtle" />
            </Link>
          </li>
        ))}
      </ol>
      <Paginator p={paged} noun="reservas" />
    </>
  );
}
