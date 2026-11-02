"use client";

// Importar reservas desde un archivo de Excel (.xls o .xlsx) exportado de otro sistema. El archivo se lee en el
// navegador; cada habitación del archivo se asigna a una cabaña del panel (se recuerda para la próxima vez), se revisan
// las filas (fechas ocupadas, datos incompletos, ya importadas) y se crean de una vez. Las reservas «ok» entran
// confirmadas, sin pagos registrados: el saldo completo queda por cobrar.
import Link from "next/link";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { AlertIcon, CheckIcon, CloseIcon, HomeIcon, ListIcon, RefreshIcon, SpreadsheetIcon, UploadIcon, WarningIcon } from "@/components/ui/icons";
import { ACTIVE_STATUSES, EMAIL_RE, invalidImportRow, normalizePhone } from "@/lib/booking";
import { api } from "@/lib/client/api";
import { cop, fmtDate, nightsBetween, plural } from "@/lib/format";
import type { AdminData, ImportResult, ImportRow } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin } from "@/components/admin/context";
import { Paginator, usePaged } from "@/components/admin/paginator";
import { PREF, readPref, writePref } from "@/components/admin/prefs";
import { MODULES, paths } from "@/components/admin/routes";
import { norm } from "@/components/admin/shared";
import { Badge, Button, Callout, Card, CardHeader, EmptyState, PageHeader, Segmented, Spinner, StatCard, Switch, type Tone } from "@/components/admin/ui";

/* ───────────── Lectura del archivo ───────────── */

// Una fila del archivo, ya leída (sin asignar a una cabaña).
type Source = {
  line: number; // fila en el archivo (la 1 es el encabezado)
  ref: string;
  guest: string;
  email: string;
  phone: string;
  checkIn: string | null;
  checkOut: string | null;
  rooms: string[];
  total: number;
  commission: number;
  channel: string;
  state: string;
};
type Sheet = { name: string; rows: Source[]; missing: string[] };

// Nombres de columna aceptados (sin tildes ni mayúsculas). El formato de referencia es el reporte «Reservas»:
// Reserva, Cliente, Cliente email, Cliente teléfonos, Desde, Hasta, Habitaciones, Valor de la Reserva, Canal, Comisión y Estado.
const COLUMNS = {
  ref: ["reserva", "codigo", "codigo de reserva", "numero de reserva", "id"],
  guest: ["cliente", "huesped", "nombre", "nombre del cliente"],
  email: ["cliente email", "email", "correo", "correo electronico"],
  phone: ["cliente telefonos", "cliente telefono", "telefonos", "telefono", "celular"],
  checkIn: ["desde", "llegada", "entrada", "check-in", "check in"],
  checkOut: ["hasta", "salida", "check-out", "check out"],
  rooms: ["habitaciones", "habitacion", "cabanas", "cabana", "unidad"],
  total: ["valor de la reserva", "valor", "total", "precio"],
  commission: ["comision"],
  channel: ["canal de la reserva", "canal", "origen"],
  state: ["estado", "status"],
};
type Col = keyof typeof COLUMNS;
const REQUIRED: Partial<Record<Col, string>> = { ref: "Reserva", guest: "Cliente", checkIn: "Desde", checkOut: "Hasta", rooms: "Habitaciones" };

const headerKey = (v: unknown) =>
  norm(String(v ?? ""))
    .replace(/[#:*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const text = (v: unknown) => String(v ?? "").trim();

// Valor en pesos: número de la celda o texto como «$ 840.000» (punto de miles; lo que va después de la coma se ignora).
function money(v: unknown) {
  if (typeof v === "number") return Math.max(0, Math.round(v));
  const digits = String(v ?? "")
    .replace(/[^\d,]/g, "")
    .split(",")[0];
  return digits ? Number(digits) : 0;
}

function isoOf(y: number, m: number, d: number) {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null; // 31/02 y similares
  return t.toISOString().slice(0, 10);
}

// Fecha: número de serie de Excel, «dd/mm/aaaa» (también con - o .) o «aaaa-mm-dd».
function dateOf(v: unknown, serial: (n: number) => { y: number; m: number; d: number }) {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const p = serial(v);
    return isoOf(p.y, p.m, p.d);
  }
  const s = text(v);
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return isoOf(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? isoOf(+m[1], +m[2], +m[3]) : null;
}

async function readSheet(file: File): Promise<Sheet> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = ws ? XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" }) : [];
  // El encabezado es la primera fila (entre las 10 primeras) donde aparecen las columnas clave.
  let head = -1;
  let cols = {} as Record<Col, number>;
  for (let i = 0; i < Math.min(10, grid.length); i++) {
    const h = grid[i].map(headerKey);
    const c = Object.fromEntries(Object.entries(COLUMNS).map(([k, names]) => [k, h.findIndex((x) => names.includes(x))])) as Record<Col, number>;
    if ([c.ref, c.checkIn, c.checkOut].filter((x) => x >= 0).length >= 2) {
      head = i;
      cols = c;
      break;
    }
  }
  if (head < 0) return { name: file.name, rows: [], missing: Object.values(REQUIRED) as string[] };
  const missing = (Object.keys(REQUIRED) as Col[]).filter((k) => cols[k] < 0).map((k) => REQUIRED[k]!);
  const get = (r: unknown[], k: Col) => (cols[k] >= 0 ? r[cols[k]] : "");
  const serial = (n: number) => XLSX.SSF.parse_date_code(n);
  const rows = grid
    .slice(head + 1)
    .map((r, i) => ({
      line: head + i + 2,
      ref: text(get(r, "ref")),
      guest: text(get(r, "guest")).replace(/\s+/g, " "),
      email: text(get(r, "email")).toLowerCase(),
      phone: text(get(r, "phone")),
      checkIn: dateOf(get(r, "checkIn"), serial),
      checkOut: dateOf(get(r, "checkOut"), serial),
      rooms: text(get(r, "rooms"))
        .split(/[,;|]+/)
        .map((x) => x.trim())
        .filter(Boolean),
      total: money(get(r, "total")),
      commission: money(get(r, "commission")),
      channel: text(get(r, "channel")).slice(0, 40),
      state: text(get(r, "state")),
    }))
    .filter((r) => r.ref || r.guest);
  return { name: file.name, rows, missing };
}

/* ───────────── Revisión ───────────── */

const roomKey = (s: string) => norm(s).replace(/\s+/g, " ").trim();
const OK_STATES = ["ok", "confirmada", "confirmado", "confirmed", "activa", "activo"];
const CANCEL_STATES = ["canceled", "cancelled", "cancelada", "cancelado", "no_show", "no show", "noshow", "no-show"];

type Kind = "ready" | "problem" | "skipped";
type Item = { key: string; src: Source; room: string; row: ImportRow; kind: Kind; note: string };
type Mapping = Record<string, string>; // habitación del archivo → "cabaña:unidad" o "skip"

const STATE_LABEL: Record<ImportRow["status"], { label: string; tone: Tone }> = {
  confirmed: { label: "Confirmada con saldo", tone: "info" },
  completed: { label: "Finalizada", tone: "neutral" },
  cancelled: { label: "Cancelada", tone: "danger" },
};

// Cada habitación de una fila es una reserva (una por unidad); el valor y la comisión se reparten entre ellas.
function review(sheet: Sheet, map: Mapping, withCancelled: boolean, data: AdminData, today: string): Item[] {
  const units: Record<string, number> = Object.fromEntries(data.cabinTypes.map((c) => [c.id, c.units]));
  const imported = new Set(data.reservations.map((r) => r.externalRef).filter(Boolean));
  const taken: { cabin: string; unit: number; from: string; to: string; ref: string }[] = [];
  const out: Item[] = [];
  for (const s of sheet.rows) {
    const rooms = s.rooms.length ? s.rooms : [""];
    const n = rooms.length;
    rooms.forEach((room, i) => {
      const ref = `xls:${s.ref}${n > 1 ? `-${i + 1}` : ""}`.slice(0, 80);
      const state = norm(s.state);
      const status: ImportRow["status"] | null = CANCEL_STATES.includes(state)
        ? "cancelled"
        : OK_STATES.includes(state) || !state
          ? s.checkOut && s.checkOut < today
            ? "completed"
            : "confirmed"
          : null;
      const target = map[roomKey(room)];
      const [cabin, unit] = target && target !== "skip" ? target.split(":") : ["", "0"];
      const phone = s.phone.replace(/\D/g, "").length >= 7 ? normalizePhone(s.phone) : "";
      const row: ImportRow = {
        ref,
        guest: s.guest,
        email: EMAIL_RE.test(s.email) ? s.email : "",
        phone,
        checkIn: s.checkIn ?? "",
        checkOut: s.checkOut ?? "",
        cabinTypeId: cabin as ImportRow["cabinTypeId"],
        unit: Number(unit),
        total: Math.floor(s.total / n) + (i === 0 ? s.total % n : 0),
        commission: Math.floor(s.commission / n) + (i === 0 ? s.commission % n : 0),
        channel: s.channel,
        status: status ?? "confirmed",
        notes: "",
      };
      const item = (kind: Kind, note: string) => out.push({ key: `${s.line}-${i}`, src: s, room, row, kind, note });

      if (!status) return item("problem", `Estado desconocido: «${s.state}».`);
      if (status === "cancelled" && !withCancelled) return item("skipped", "Cancelada en el archivo.");
      if (!room) return item("problem", "La fila no tiene habitación.");
      if (!target) return item("problem", `Asigna «${room}» a una cabaña del panel.`);
      if (target === "skip") return item("skipped", "Habitación marcada como «No importar».");
      if (imported.has(ref)) return item("skipped", "Ya se había importado.");
      const why = invalidImportRow(row, units);
      if (why) return item("problem", why);
      // Solo las confirmadas ocupan fechas (las finalizadas y canceladas no chocan con nada).
      if (status === "confirmed") {
        const clash = data.reservations.find(
          (r) =>
            ACTIVE_STATUSES.includes(r.status) &&
            r.cabinTypeId === row.cabinTypeId &&
            r.unit === row.unit &&
            r.checkIn < row.checkOut &&
            row.checkIn < r.checkOut,
        );
        if (clash) return item("problem", `Las fechas chocan con la reserva ${clash.code}.`);
        const block = data.blocks.find((b) => b.cabinTypeId === row.cabinTypeId && b.unit === row.unit && b.from < row.checkOut && row.checkIn <= b.to);
        if (block) return item("problem", `Las fechas chocan con un bloqueo (${fmtDate(block.from)} → ${fmtDate(block.to)}).`);
        const twin = taken.find((t) => t.cabin === row.cabinTypeId && t.unit === row.unit && t.from < row.checkOut && row.checkIn < t.to);
        if (twin) return item("problem", `Se cruza con la reserva ${twin.ref.slice(4)} del mismo archivo.`);
        taken.push({ cabin: row.cabinTypeId, unit: row.unit, from: row.checkIn, to: row.checkOut, ref });
      }
      item("ready", "");
    });
  }
  return out;
}

/* ───────────── Página ───────────── */

type Phase = { kind: "idle" } | { kind: "reading"; name: string } | { kind: "error"; text: string } | { kind: "loaded"; sheet: Sheet };
type Filter = "todas" | Kind;
const CHUNK = 100;

function savedMap(): Mapping {
  try {
    const v = JSON.parse(readPref(PREF.importMap, "{}"));
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function ImportView() {
  const { data, today, reload, toast, onAuthError, cabinLabel } = useAdmin();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [map, setMap] = useState<Mapping>(savedMap);
  const [withCancelled, setWithCancelled] = useState(false);
  const [filter, setFilter] = useState<Filter>("todas");
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<{ ok: ImportResult[]; failed: (ImportResult & { item?: Item })[] } | null>(null);

  const sheet = phase.kind === "loaded" ? phase.sheet : null;

  // Habitaciones del archivo (agrupadas sin tildes ni mayúsculas) y cuántas reservas tiene cada una.
  const rooms = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const r of sheet?.rows ?? [])
      for (const room of r.rooms) {
        const k = roomKey(room);
        const e = m.get(k);
        if (e) e.count++;
        else m.set(k, { label: room, count: 1 });
      }
    return [...m.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label, "es", { numeric: true }));
  }, [sheet]);

  const unitOptions = useMemo(
    () =>
      data.cabinTypes.flatMap((c) =>
        Array.from({ length: c.units }, (_, i) => ({ value: `${c.id}:${i + 1}`, label: cabinLabel(c.id, c.units > 1 ? i + 1 : undefined) })),
      ),
    [data.cabinTypes, cabinLabel],
  );

  const items = useMemo(() => (sheet ? review(sheet, map, withCancelled, data, today) : []), [sheet, map, withCancelled, data, today]);
  const count = (k: Kind) => items.filter((x) => x.kind === k).length;
  const shown = filter === "todas" ? items : items.filter((x) => x.kind === filter);
  const paged = usePaged(shown, "importar", filter);
  const ready = items.filter((x) => x.kind === "ready");

  async function open(file: File | undefined) {
    if (!file) return;
    if (!/\.(xlsx?|csv)$/i.test(file.name)) return setPhase({ kind: "error", text: "Elige un archivo de Excel (.xls o .xlsx) o CSV." });
    if (file.size > 10 * 1024 * 1024) return setPhase({ kind: "error", text: "El archivo pesa más de 10 MB." });
    setPhase({ kind: "reading", name: file.name });
    setResults(null);
    try {
      const s = await readSheet(file);
      // Sugerencia: la habitación que se llame igual que una cabaña del panel queda asignada.
      setMap((m) => {
        const next = { ...m };
        for (const r of s.rows)
          for (const room of r.rooms) {
            const k = roomKey(room);
            if (next[k]) continue;
            const same = unitOptions.find((o) => roomKey(o.label) === k);
            if (same) next[k] = same.value;
          }
        return next;
      });
      setFilter("todas");
      setPhase({ kind: "loaded", sheet: s });
    } catch {
      setPhase({ kind: "error", text: "No pudimos leer el archivo. Ábrelo en Excel, guárdalo de nuevo como .xlsx e inténtalo otra vez." });
    }
  }

  const assign = (k: string, v: string) => {
    const next = { ...map, [k]: v };
    if (!v) delete next[k];
    setMap(next);
    writePref(PREF.importMap, JSON.stringify(next));
  };

  async function run() {
    if (!ready.length || progress) return;
    const rows = ready.map((x) => x.row);
    const ok: ImportResult[] = [];
    const failed: (ImportResult & { item?: Item })[] = [];
    setProgress({ done: 0, total: rows.length });
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const r = await api.admin.importReservations(rows.slice(i, i + CHUNK));
        if (r.status === 401 || r.status === 403) return onAuthError();
        if (r.status !== 200 || !r.data || !("results" in r.data)) throw 0;
        for (const x of r.data.results) {
          if (x.ok) ok.push(x);
          else failed.push({ ...x, item: ready.find((y) => y.row.ref === x.ref) });
        }
        setProgress({ done: Math.min(rows.length, i + CHUNK), total: rows.length });
      }
    } catch {
      toast("Se interrumpió la importación. Revisa tu conexión: las que ya se crearon no se duplican al reintentar.", "error");
    } finally {
      setProgress(null);
      setResults({ ok, failed });
      await reload();
    }
  }

  const reset = () => {
    setPhase({ kind: "idle" });
    setResults(null);
    if (input.current) input.current.value = "";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    open(e.dataTransfer.files[0]);
  };

  return (
    <>
      <PageHeader
        title={MODULES.importar.label}
        description="Carga el reporte de reservas de otro sistema (Excel). Revisas todo antes de crear nada, y un mismo archivo no se importa dos veces."
        actions={
          sheet ? (
            <Button icon={<RefreshIcon size={14} />} onClick={reset}>
              Otro archivo
            </Button>
          ) : undefined
        }
      />
      <input
        ref={input}
        type="file"
        accept=".xls,.xlsx,.csv"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => open(e.target.files?.[0])}
      />

      {results && <Results results={results} onAgain={reset} />}

      {!sheet ? (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Card className="p-4 sm:p-5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center justify-center gap-3 rounded-[20px] border-2 border-dashed px-6 py-14 text-center transition-colors ${over ? "border-ink bg-paper" : "border-line-strong bg-paper/40"}`}
            >
              <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-green text-ink">
                {phase.kind === "reading" ? <Spinner size={22} /> : <SpreadsheetIcon size={24} />}
              </span>
              <p className="text-[16px] font-bold text-ink">{phase.kind === "reading" ? `Leyendo ${phase.name}…` : "Arrastra el archivo aquí"}</p>
              <p className="max-w-[46ch] text-[13.5px] text-ink-muted">Excel (.xls o .xlsx) o CSV, hasta 10 MB. El archivo se lee en este navegador.</p>
              <Button variant="primary" icon={<UploadIcon size={15} />} onClick={() => input.current?.click()} loading={phase.kind === "reading"}>
                Elegir archivo
              </Button>
              {phase.kind === "error" && (
                <p role="alert" className="flex items-center gap-1.5 text-[13px] font-semibold text-error">
                  <AlertIcon size={15} />
                  {phase.text}
                </p>
              )}
            </div>
          </Card>
          <Card aria-labelledby="im-format" className="flex flex-col gap-3 p-4 sm:p-5">
            <CardHeader
              id="im-format"
              icon={<ListIcon size={18} />}
              accent="yellow"
              title="Formato del archivo"
              subtitle="El reporte «Reservas» con estas columnas:"
            />
            <ul className="flex flex-wrap gap-1.5">
              {[
                "Reserva",
                "Cliente",
                "Cliente email",
                "Cliente teléfonos",
                "Desde",
                "Hasta",
                "Habitaciones",
                "Valor de la Reserva",
                "Canal de la reserva",
                "Comisión",
                "Estado",
              ].map((c) => (
                <li key={c}>
                  <Badge>{c}</Badge>
                </li>
              ))}
            </ul>
            <ul className="flex flex-col gap-1.5 text-[13px] text-ink-muted">
              <li>
                <strong className="text-ink">ok</strong>: entra como <strong className="text-ink">confirmada con saldo</strong> (sin pagos registrados), o
                finalizada si la salida ya pasó.
              </li>
              <li>
                <strong className="text-ink">canceled</strong> y <strong className="text-ink">no_show</strong>: se omiten, salvo que elijas incluirlas como
                canceladas.
              </li>
              <li>Varias habitaciones en una fila: una reserva por habitación, con el valor repartido.</li>
              <li>Sin documento: el cliente se agrupa por su teléfono.</li>
            </ul>
          </Card>
        </div>
      ) : (
        <>
          {sheet.missing.length > 0 && (
            <Callout tone="error" role="alert">
              {sheet.rows.length
                ? `Faltan columnas en el archivo: ${sheet.missing.join(", ")}.`
                : "No encontramos el encabezado (Reserva, Desde, Hasta…) en la primera hoja del archivo."}
            </Callout>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard accent="blue" label="Reservas en el archivo" value={items.length} hint={sheet.name} icon={<SpreadsheetIcon size={15} />} />
            <StatCard
              accent="green"
              label="Listas para importar"
              value={count("ready")}
              hint={cop(ready.reduce((s, x) => s + x.row.total, 0))}
              icon={<CheckIcon size={15} />}
            />
            <StatCard
              accent="pink"
              label="Con problemas"
              value={count("problem")}
              hint="revisa la asignación o las fechas"
              icon={<WarningIcon size={15} />}
              tone={count("problem") ? "warning" : undefined}
            />
            <StatCard accent="yellow" label="Omitidas" value={count("skipped")} hint="canceladas o ya importadas" icon={<CloseIcon size={15} />} />
          </div>

          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <Card aria-labelledby="im-rooms" className="flex flex-col gap-4 p-4 sm:p-5">
              <CardHeader
                id="im-rooms"
                icon={<HomeIcon size={18} />}
                accent="green"
                title="Habitaciones del archivo"
                subtitle="A qué cabaña del panel corresponde cada una. Se recuerda para la próxima importación."
              />
              {rooms.length ? (
                <ul className="flex flex-col gap-2">
                  {rooms.map(([k, r]) => (
                    <li key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-3 rounded-[16px] bg-paper/60 px-3.5 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-semibold text-ink">{r.label}</span>
                        <span className="text-[12px] text-ink-muted">{plural(r.count, "reserva", "reservas")}</span>
                      </span>
                      <Combobox
                        value={map[k] ?? ""}
                        onChange={(v) => assign(k, v)}
                        placeholder="Elegir cabaña"
                        invalid={!map[k]}
                        options={[...unitOptions, { value: "skip", label: "No importar", description: "Las reservas de esta habitación se omiten" }]}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact icon={<HomeIcon size={18} />} title="El archivo no trae habitaciones" />
              )}
              {data.cabinTypes.reduce((s, c) => s + c.units, 0) < rooms.length && (
                <Callout tone="warning">
                  El archivo tiene {rooms.length} habitaciones y el panel{" "}
                  {plural(
                    data.cabinTypes.reduce((s, c) => s + c.units, 0),
                    "unidad",
                    "unidades",
                  )}
                  . Si dos habitaciones van a la misma unidad, sus fechas pueden chocar. Puedes agregar unidades en Cabañas.
                </Callout>
              )}
              <div className="rounded-[16px] border border-line px-4 py-3">
                <Switch
                  checked={withCancelled}
                  onChange={setWithCancelled}
                  label="Incluir canceladas y no show"
                  description="Entran como canceladas (para el historial del cliente). No ocupan fechas."
                />
              </div>
            </Card>

            <Card aria-labelledby="im-preview" className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
              <CardHeader id="im-preview" icon={<ListIcon size={18} />} accent="blue" title="Vista previa" subtitle="Así quedarán las reservas en el panel." />
              <Segmented
                label="Mostrar"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "todas", label: "Todas", count: items.length },
                  { value: "ready", label: "Listas", count: count("ready") },
                  { value: "problem", label: "Con problemas", count: count("problem") },
                  { value: "skipped", label: "Omitidas", count: count("skipped") },
                ]}
              />
              {shown.length ? (
                <>
                  <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[18px] bg-paper/60">
                    {paged.rows.map((x) => (
                      <li key={x.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-4 py-3">
                        <span
                          aria-hidden="true"
                          className={`mt-0.5 grid size-7 place-items-center rounded-full ${x.kind === "ready" ? "bg-success-soft text-success" : x.kind === "problem" ? "bg-warning-soft text-warning" : "bg-ink/6 text-ink-muted"}`}
                        >
                          {x.kind === "ready" ? <CheckIcon size={13} /> : x.kind === "problem" ? <WarningIcon size={13} /> : <CloseIcon size={13} />}
                        </span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate text-[14px] font-semibold text-ink">{x.src.guest || "Sin nombre"}</span>
                            <span className="text-[12px] text-ink-muted">#{x.src.ref}</span>
                            <Badge tone={STATE_LABEL[x.row.status].tone}>{STATE_LABEL[x.row.status].label}</Badge>
                          </span>
                          <span className="block text-[12.5px] text-ink-muted">
                            {x.room || "Sin habitación"}
                            {x.row.cabinTypeId ? ` → ${cabinLabel(x.row.cabinTypeId, x.row.unit)}` : ""} ·{" "}
                            {x.src.checkIn && x.src.checkOut
                              ? `${fmtDate(x.src.checkIn, true)} → ${fmtDate(x.src.checkOut, true)} · ${plural(Math.max(0, nightsBetween(x.src.checkIn, x.src.checkOut)), "noche", "noches")}`
                              : "fechas no válidas"}
                            {x.src.channel ? ` · ${x.src.channel}` : ""}
                          </span>
                          {x.note && (
                            <span className={`mt-0.5 block text-[12.5px] font-semibold ${x.kind === "problem" ? "text-warning" : "text-ink-muted"}`}>
                              {x.note}
                            </span>
                          )}
                        </span>
                        <span className="text-right text-[13.5px] font-semibold text-ink tabular-nums">{cop(x.row.total)}</span>
                      </li>
                    ))}
                  </ul>
                  <Paginator p={paged} noun="reservas" />
                </>
              ) : (
                <EmptyState compact icon={<ListIcon size={18} />} title="No hay reservas en esta vista" />
              )}
            </Card>
          </div>

          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-ink">
                {ready.length ? `${plural(ready.length, "reserva lista", "reservas listas")} para importar` : "No hay reservas listas para importar"}
              </p>
              <p className="text-[13px] text-ink-muted">
                {progress
                  ? `Creando ${progress.done} de ${progress.total}…`
                  : count("problem")
                    ? `${plural(count("problem"), "fila con problemas no se importará", "filas con problemas no se importarán")} hasta que las corrijas.`
                    : "Entran sin pagos registrados: registra los pagos recibidos desde cada reserva."}
              </p>
              {progress && (
                <div className="mt-2 h-2 w-full max-w-[360px] overflow-hidden rounded-full bg-ink/8">
                  <div className="h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
              )}
            </div>
            <Button variant="primary" size="lg" icon={<UploadIcon size={16} />} disabled={!ready.length} loading={!!progress} onClick={run}>
              {progress ? "Importando…" : `Importar ${ready.length ? plural(ready.length, "reserva", "reservas") : ""}`}
            </Button>
          </Card>
        </>
      )}
    </>
  );
}

/* ───────────── Resultado ───────────── */

function Results({ results, onAgain }: { results: { ok: ImportResult[]; failed: (ImportResult & { item?: Item })[] }; onAgain: () => void }) {
  const { ok, failed } = results;
  const paged = usePaged(failed, "importar-fallidas");
  return (
    <Card aria-labelledby="im-done" className="flex flex-col gap-4 p-4 sm:p-5">
      <CardHeader
        id="im-done"
        icon={failed.length ? <WarningIcon size={18} /> : <CheckIcon size={18} />}
        accent={failed.length ? "yellow" : "green"}
        title={ok.length ? `${plural(ok.length, "reserva creada", "reservas creadas")}` : "No se creó ninguna reserva"}
        subtitle={
          failed.length
            ? `${plural(failed.length, "fila no se pudo crear", "filas no se pudieron crear")}: abajo el motivo.`
            : "Ya aparecen en Reservas y en el calendario."
        }
        actions={
          <>
            <Link href={paths.reservas()} className="inline-flex h-8 items-center rounded-full bg-ink px-3.5 text-[13px] font-semibold text-paper">
              Ver reservas
            </Link>
            <Button size="sm" onClick={onAgain}>
              Importar otro archivo
            </Button>
          </>
        }
      />
      {failed.length > 0 && (
        <>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[18px] bg-paper/60">
            {paged.rows.map((f) => (
              <li key={f.ref} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13.5px]">
                <span className="min-w-0">
                  <span className="font-semibold text-ink">{f.item?.src.guest ?? f.ref}</span>
                  <span className="ml-2 text-[12px] text-ink-muted">#{f.ref.replace(/^xls:/, "")}</span>
                </span>
                <span className="font-semibold text-warning">{f.error ?? "No se pudo crear."}</span>
              </li>
            ))}
          </ul>
          <Paginator p={paged} noun="filas" />
        </>
      )}
    </Card>
  );
}
