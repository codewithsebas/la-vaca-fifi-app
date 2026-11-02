"use client";

// Comprobantes de pago: tarjeta con acciones, visor privado y aprobación/rechazo.
// Se usan en la ficha de la reserva y en el módulo de Pagos (misma lógica, mismo aspecto).
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckIcon, CloseIcon, DownloadIcon, ExternalLinkIcon, EyeIcon, FileTextIcon, ImageIcon, ShieldIcon } from "@/components/ui/icons";
import { api } from "@/lib/client/api";
import { cop, download, timeAgo } from "@/lib/format";
import type { PaymentProof, Reservation } from "@/lib/types";
import { useAdmin } from "@/components/admin/context";
import { paths } from "@/components/admin/routes";
import { Badge, Button, Callout, IconButton, Modal, ModalPresence, Spinner, buttonClass, type Tone } from "@/components/admin/ui";

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Nombre al descargar: comprobante-pago-{código de reserva}.{ext}. Conserva la extensión original si corresponde al tipo real del archivo.
const EXTENSIONS: Record<string, string[]> = { "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"], "application/pdf": ["pdf"] };
function downloadName(p: PaymentProof) {
  const own = /.([a-z0-9]{2,5})$/i.exec(p.fileName)?.[1]?.toLowerCase();
  const known = EXTENSIONS[p.mime] ?? [];
  const ext = own && known.includes(own) ? own : (known[0] ?? own ?? "bin");
  return `comprobante-pago-${p.reservationCode}.${ext}`;
}

const PROOF_STATUS: Record<PaymentProof["status"], { label: string; tone: Tone }> = {
  pending: { label: "Por revisar", tone: "info" },
  approved: { label: "Aprobado", tone: "success" },
  rejected: { label: "Rechazado", tone: "danger" },
};

// Aprobar (con opción de confirmar la reserva) o rechazar (con motivo que verá el huésped).
function useProofReview() {
  const { ask } = useAdmin();
  const approve = (p: PaymentProof, r?: Reservation) => {
    const canConfirm = r?.status === "pending_deposit" || r?.status === "expired";
    ask({
      title: "Aprobar comprobante",
      text: r ? `${r.code} · ${r.guest.fullName}` : p.reservationCode,
      details: [...(r ? [{ k: "Abono esperado", v: cop(r.quote.deposit) }] : []), { k: "Archivo", v: p.fileName }],
      okLabel: "Aprobar",
      done: "Comprobante aprobado",
      option: canConfirm,
      optionLabel: canConfirm ? "Confirmar la reserva y registrar el abono como recibido" : undefined,
      run: (cf) => api.admin.reviewProof({ id: p.id, decision: "approve", note: "", confirmReservation: !!cf.option }),
    });
  };
  const reject = (p: PaymentProof) =>
    ask({
      title: "Rechazar comprobante",
      text: `${p.reservationCode} · ${p.fileName}`,
      okLabel: "Rechazar",
      danger: true,
      done: "Comprobante rechazado",
      noteLabel: "Motivo del rechazo",
      noteHint: "El huésped verá este motivo al consultar su reserva y podrá subir otro comprobante.",
      noteRequired: true,
      run: (cf) => api.admin.reviewProof({ id: p.id, decision: "reject", note: cf.note ?? "", confirmReservation: false }),
    });
  return { approve, reject };
}

// Un comprobante con su estado y acciones. `r` (la reserva) añade el contexto del huésped cuando se lista fuera de la ficha.
export function ProofCard({ p, r, showReservation = false }: { p: PaymentProof; r?: Reservation; showReservation?: boolean }) {
  const { now } = useAdmin();
  const { approve, reject } = useProofReview();
  const [viewing, setViewing] = useState(false);
  const st = PROOF_STATUS[p.status];
  return (
    <li className={`flex flex-col gap-2.5 rounded-[18px] p-3.5 ${p.status === "pending" ? "bg-blue-soft" : "bg-canvas/60"}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-full bg-paper text-ink-muted">
          {p.mime === "application/pdf" ? <FileTextIcon size={18} /> : <ImageIcon size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          {showReservation && r && (
            <p className="truncate text-[14px] font-semibold text-ink">
              {r.guest.fullName} <span className="font-medium text-ink-muted">· {r.code}</span>
            </p>
          )}
          <p className={`truncate ${showReservation ? "text-[13px] text-ink" : "text-[14px] font-semibold text-ink"}`}>{p.fileName}</p>
          <p className="text-[12px] text-ink-muted">
            {kb(p.size)} · {p.mime === "application/pdf" ? "PDF" : "Imagen"} · {timeAgo(p.createdAt, now)}
            {showReservation && r ? ` · abono ${cop(r.quote.deposit)}` : ""}
          </p>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      {p.note && <p className="rounded-[12px] bg-paper/70 px-3 py-2 text-[13px] text-ink">«{p.note}»</p>}
      {p.status === "rejected" && p.reviewNote && <p className="text-[12.5px] text-error">Motivo: {p.reviewNote}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<EyeIcon size={14} />} onClick={() => setViewing(true)}>
          Ver
        </Button>
        {p.status === "pending" && (
          <>
            <Button size="sm" variant="primary" icon={<CheckIcon size={14} />} onClick={() => approve(p, r)}>
              Aprobar
            </Button>
            <Button size="sm" variant="danger-ghost" icon={<CloseIcon size={14} />} onClick={() => reject(p)}>
              Rechazar
            </Button>
          </>
        )}
        {showReservation && (
          <Link href={paths.reserva(p.reservationCode)} className={buttonClass("ghost", "sm", "sm:ml-auto")}>
            Ver reserva
          </Link>
        )}
      </div>
      <ModalPresence>{viewing && <ProofViewer p={p} onClose={() => setViewing(false)} />}</ModalPresence>
    </li>
  );
}

// Visor del comprobante: URL firmada de 5 minutos, pedida al abrir (el archivo nunca es público).
function ProofViewer({ p, onClose }: { p: PaymentProof; onClose: () => void }) {
  const [state, setState] = useState<{ url: string } | "loading" | "error">("loading");
  useEffect(() => {
    let alive = true;
    api.admin
      .proofUrl(p.id)
      .then((r) => alive && setState(r.status === 200 && r.data ? { url: r.data.url } : "error"))
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [p.id]);

  // Descarga directa sin salir del panel. Un <a download> hacia la URL firmada no sirve: es de otro dominio (Storage)
  // y el navegador ignora `download` y abre el archivo. Se pide una firma nueva (la del visor caduca a los 5 minutos),
  // se trae el archivo a memoria y se guarda desde un enlace local. El archivo sigue siendo privado.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const save = async (host: Element) => {
    setSaving(true);
    setSaveError(false);
    try {
      const r = await api.admin.proofUrl(p.id);
      if (r.status !== 200 || !r.data) throw new Error(`No se pudo firmar la URL (${r.status})`);
      const res = await fetch(r.data.url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Storage respondió ${res.status}`);
      download(downloadName(p), await res.blob(), p.mime, host);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      labelledBy="pv-title"
      dismissOnBackdrop
      initialFocus="#pv-close"
      className="m-auto flex h-[min(860px,calc(100dvh-32px))] w-[calc(100%-32px)] max-w-[900px] flex-col rounded-[26px] p-0"
    >
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 id="pv-title" className="truncate text-[15px] font-bold text-ink">
            {p.fileName}
          </h2>
          <p className="flex items-center gap-1 text-[12px] text-ink-muted">
            <ShieldIcon size={12} />
            Enlace privado y temporal (5 minutos)
          </p>
        </div>
        <div className="flex items-center gap-1">
          {typeof state === "object" && (
            <>
              <a href={state.url} target="_blank" rel="noopener" className={buttonClass("ghost", "sm")}>
                <ExternalLinkIcon size={14} />
                <span className="max-sm:sr-only">Abrir</span>
              </a>
              <Button
                size="sm"
                variant="ghost"
                loading={saving}
                icon={<DownloadIcon size={14} />}
                aria-label={saving ? "Descargando comprobante" : "Descargar comprobante"}
                onClick={(e) => save(e.currentTarget.closest("dialog") ?? document.body)}
              >
                <span aria-hidden="true" className="max-sm:sr-only">
                  {saving ? "Descargando…" : "Descargar"}
                </span>
              </Button>
            </>
          )}
          <IconButton id="pv-close" label="Cerrar visor" onClick={onClose}>
            <CloseIcon size={19} />
          </IconButton>
        </div>
      </header>
      {saveError && (
        <div className="border-b border-line px-4 py-2.5">
          <Callout tone="error" role="alert">
            No se pudo descargar el comprobante. Revisa tu conexión e inténtalo de nuevo.
          </Callout>
        </div>
      )}
      <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-canvas p-3">
        {state === "loading" ? (
          <Spinner size={24} className="text-ink-muted" />
        ) : state === "error" ? (
          <Callout tone="error" role="alert">
            No se pudo abrir el comprobante. Cierra el visor e inténtalo de nuevo.
          </Callout>
        ) : p.mime === "application/pdf" ? (
          <iframe title={p.fileName} src={state.url} className="size-full rounded-[12px] border border-line bg-white" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal: no pasa por el optimizador
          <img src={state.url} alt={`Comprobante ${p.fileName}`} className="max-h-full max-w-full rounded-[12px] object-contain shadow-panel" />
        )}
      </div>
    </Modal>
  );
}
