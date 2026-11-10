"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CloseIcon, MonitorIcon, SmartphoneIcon } from "@/components/ui/icons";
import { IconButton, Spinner } from "@/components/admin/ui";
import type { FromPreview, PreviewData, PreviewZone, ToPreview } from "@/lib/site-preview";

type Device = "desktop" | "mobile";
// Ancho real con el que se pinta la página: decide sus puntos de quiebre. Luego se escala para que quepa.
const WIDTH: Record<Device, number> = { desktop: 1280, mobile: 390 };
const PHONE_HEIGHT = 844;
const DEVICES: { id: Device; label: string; icon: ReactNode }[] = [
  { id: "desktop", label: "Escritorio", icon: <MonitorIcon size={15} /> },
  { id: "mobile", label: "Celular", icon: <SmartphoneIcon size={15} /> },
];

// La página de inicio real con lo que se está editando (app/vista-previa). En pantallas anchas va fija junto al editor; en
// las angostas se abre a pantalla completa.
export function ContentPreview({
  data,
  zone,
  dirty,
  open,
  onClose,
  onEdit,
}: {
  data: PreviewData;
  zone?: PreviewZone;
  dirty: boolean;
  open: boolean;
  onClose: () => void;
  onEdit: (zone: PreviewZone) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<Device>(() => (window.innerWidth < 768 ? "mobile" : "desktop"));
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Cuántas veces la página avisó que está lista (si se recarga, hay que volver a enviarle todo).
  const [ready, setReady] = useState(0);
  const edit = useRef(onEdit);
  useEffect(() => {
    edit.current = onEdit;
  }, [onEdit]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent<FromPreview>) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === "vf-preview-ready") setReady((n) => n + 1);
      if (e.data?.type === "vf-preview-edit") edit.current(e.data.zone);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const send = (m: ToPreview) => frame.current?.contentWindow?.postMessage(m, window.location.origin);

  // Al escribir, una pausa corta evita volver a pintar toda la página con cada tecla.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => send({ type: "vf-preview-data", data }), 100);
    return () => clearTimeout(t);
  }, [data, ready]);

  useEffect(() => {
    if (ready && zone) send({ type: "vf-preview-zone", zone });
  }, [zone, ready]);

  const width = WIDTH[device];
  const scale = size.w ? Math.min(1, size.w / width) : 1;
  const height = size.h ? Math.min(device === "mobile" ? PHONE_HEIGHT : Infinity, size.h / scale) : 0;

  return (
    <aside
      aria-label="Vista previa del sitio"
      className={`${open ? "max-xl:flex" : "max-xl:hidden"} flex min-w-0 flex-col gap-2 bg-canvas max-xl:fixed max-xl:inset-0 max-xl:z-50 max-xl:p-3 xl:sticky xl:top-[84px] xl:h-[calc(100dvh-84px-var(--savebar-h,0px)-16px)] xl:bg-transparent`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-[13px] text-ink-muted">
          <span className="font-semibold text-ink">Vista previa</span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2 rounded-full ${dirty ? "bg-pink-deep" : "bg-success"}`} />
            {dirty ? "Con tus cambios, aún sin publicar" : "Igual a lo publicado"}
          </span>
        </p>
        <div className="flex items-center gap-1.5">
          <div role="group" aria-label="Tamaño de la vista previa" className="flex gap-1 rounded-full bg-panel p-1">
            {DEVICES.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={device === d.id}
                onClick={() => setDevice(d.id)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors ${device === d.id ? "bg-ink text-paper" : "text-ink-muted hover:text-ink"}`}
              >
                {d.icon}
                {d.label}
              </button>
            ))}
          </div>
          <span className="xl:hidden">
            <IconButton label="Cerrar la vista previa" onClick={onClose}>
              <CloseIcon size={17} />
            </IconButton>
          </span>
        </div>
      </div>

      <div ref={stage} className="relative min-h-0 flex-1 overflow-hidden rounded-[18px] bg-panel">
        <div
          style={{ width: width * scale, height: height * scale }}
          className={`mx-auto overflow-hidden bg-paper ${device === "mobile" ? "rounded-[18px] ring-1 ring-line" : ""} ${size.w ? "" : "invisible"}`}
        >
          <iframe
            ref={frame}
            src="/vista-previa"
            title="Vista previa de la página de inicio"
            tabIndex={-1}
            style={{ width, height, transform: `scale(${scale})`, transformOrigin: "0 0" }}
            className="border-0"
          />
        </div>
        {!ready && (
          <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 bg-panel text-[13px] font-semibold text-ink-muted">
            <Spinner size={18} />
            Cargando la página…
          </div>
        )}
      </div>

      <p className="text-[12px] text-ink-muted">Toca una parte de la página para ir a su editor.</p>
    </aside>
  );
}
