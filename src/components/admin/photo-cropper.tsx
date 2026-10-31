"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { CheckIcon, MinusIcon, PlusIcon, RefreshIcon, UploadIcon, WarningIcon } from "@/components/ui/icons";
import { cropOutput, imageSize, type Crop } from "@/lib/image-resize";
import { Button, Callout, IconButton, Modal, Spinner } from "@/components/admin/ui";

// Recorte antes de subir: el marco tiene la proporción exacta del espacio del sitio; quien sube la foto
// la arrastra para encuadrarla y acerca con el control, la rueda del mouse o pellizcando en el celular.

const MAX_ZOOM = 4;
type Size = { width: number; height: number };
type View = { z: number; cx: number; cy: number }; // acercamiento (1 = la foto cubre el marco) y centro del recorte en px de la foto

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const px = (z: Size) => `${z.width} × ${z.height} px`;
// "4/5" → 0.8 (ancho / alto)
const ratioOf = (aspect: string) => {
  const [a, b] = aspect.split("/").map(Number);
  return a / b;
};

// Región de la foto que entra en el marco para una vista (ajustada para no salirse de la foto).
function regionOf(img: Size, ratio: number, v: View): Crop & { cx: number; cy: number } {
  const w0 = Math.min(img.width, img.height * ratio);
  const width = w0 / v.z;
  const height = width / ratio;
  const x = clamp(v.cx - width / 2, 0, img.width - width);
  const y = clamp(v.cy - height / 2, 0, img.height - height);
  return { x, y, width, height, cx: x + width / 2, cy: y + height / 2 };
}

type Props = {
  file: File;
  title: string;
  aspect: string; // proporción del espacio, como en PhotoSlotDef ("4/5")
  hint: string;
  min: readonly [number, number];
  onCancel: () => void;
  onChooseOther: () => void;
  onConfirm: (crop: Crop, size: Size) => void;
};

export function PhotoCropper({ file, title, aspect, hint, min, onCancel, onChooseOther, onConfirm }: Props) {
  const ratio = ratioOf(aspect);
  const [img, setImg] = useState<(Size & { url: string }) | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>({ z: 1, cx: 0, cy: 0 });
  const [frameW, setFrameW] = useState(0);
  const [dragging, setDragging] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  // Medidas reales (con la orientación EXIF aplicada, igual que al recortar) y una URL local para verla.
  // La URL nace y se libera en el mismo efecto: así sobrevive al doble montaje de React en desarrollo.
  useEffect(() => {
    let alive = true;
    const url = URL.createObjectURL(file);
    imageSize(file).then(
      (s) => {
        if (!alive) return;
        setImg({ ...s, url });
        setView({ z: 1, cx: s.width / 2, cy: s.height / 2 });
      },
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth));
    ro.observe(el);
    setFrameW(el.clientWidth);
    return () => ro.disconnect();
  }, [img]);

  const region = img ? regionOf(img, ratio, view) : null;
  const k = region && frameW ? frameW / region.width : 0; // px de pantalla por px de la foto

  // Cambia la vista y la deja dentro de la foto (`fn` recibe la vista actual, su región y la escala).
  const update = (fn: (v: View, r: Crop, k: number) => View) =>
    setView((v) => {
      if (!img || !frameW) return v;
      const r = regionOf(img, ratio, v);
      const next = fn({ ...v, cx: r.cx, cy: r.cy }, r, frameW / r.width);
      const fixed = regionOf(img, ratio, { ...next, z: clamp(next.z, 1, MAX_ZOOM) });
      return { z: clamp(next.z, 1, MAX_ZOOM), cx: fixed.cx, cy: fixed.cy };
    });
  const pan = (dx: number, dy: number) => update((v, _r, k) => ({ ...v, cx: v.cx - dx / k, cy: v.cy - dy / k }));
  // `to`: nuevo acercamiento a partir del actual (se calcula sobre el estado más reciente: rueda y pellizco disparan muchos eventos seguidos).
  const zoom = (to: (z: number) => number, at?: { x: number; y: number }) =>
    update((v, r, k) => {
      const nz = clamp(to(v.z), 1, MAX_ZOOM);
      const p = at ?? { x: frameW / 2, y: frameW / ratio / 2 };
      // El punto de la foto bajo `p` sigue bajo `p` después de acercar.
      const sx = r.x + p.x / k;
      const sy = r.y + p.y / k;
      const nk = k * (nz / v.z);
      const nw = frameW / nk;
      return { z: nz, cx: sx - p.x / nk + nw / 2, cy: sy - p.y / nk + nw / ratio / 2 };
    });

  // Rueda del mouse: el listener debe ser no pasivo para que la página no se desplace mientras se acerca.
  const wheel = useRef<(e: WheelEvent) => void>(() => {});
  useEffect(() => {
    wheel.current = (e: WheelEvent) => {
      e.preventDefault();
      const box = frame.current!.getBoundingClientRect();
      zoom((z) => z * Math.exp(-e.deltaY * 0.0015), { x: e.clientX - box.left, y: e.clientY - box.top });
    };
  });
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fn = (e: WheelEvent) => wheel.current(e);
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, [img]);

  // Arrastrar con un dedo o el mouse mueve la foto; con dos dedos, pellizcar acerca o aleja.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const ps = pointers.current;
    const prev = ps.get(e.pointerId);
    if (!prev) return;
    if (ps.size === 1) {
      pan(e.clientX - prev.x, e.clientY - prev.y);
    } else if (ps.size === 2) {
      const other = [...ps.entries()].find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      const box = frame.current!.getBoundingClientRect();
      if (before > 0) zoom((z) => z * (after / before), { x: (e.clientX + other.x) / 2 - box.left, y: (e.clientY + other.y) / 2 - box.top });
    }
    ps.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (!pointers.current.size) setDragging(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 60 : 12;
    const keys: Record<string, () => void> = {
      // La foto se mueve hacia donde apunta la flecha (igual que al arrastrarla).
      ArrowLeft: () => pan(-step, 0),
      ArrowRight: () => pan(step, 0),
      ArrowUp: () => pan(0, -step),
      ArrowDown: () => pan(0, step),
      "+": () => zoom((z) => z * 1.15),
      "=": () => zoom((z) => z * 1.15),
      "-": () => zoom((z) => z / 1.15),
    };
    if (!keys[e.key]) return;
    e.preventDefault();
    keys[e.key]();
  };

  const out = region ? cropOutput(region.width, ratio) : null;
  const low = region ? region.width < min[0] - 0.5 || region.height < min[1] - 0.5 : false;
  const zoomPct = Math.round(view.z * 100);

  return (
    <Modal
      onClose={onCancel}
      labelledBy="crop-title"
      describedBy="crop-help"
      initialFocus="#crop-frame"
      className="m-auto w-[calc(100%-32px)] max-w-[600px] rounded-2xl p-0 motion-safe:open:animate-pop-in"
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <h2 id="crop-title" className="text-[17px] font-bold text-ink">
            Encuadra la foto · {title}
          </h2>
          <p id="crop-help" className="text-[13.5px] text-ink-muted">
            Arrastra la foto para moverla y usa el zoom para acercarla. Lo que ves en el marco es exactamente lo que se publica ({hint}).
          </p>
        </div>

        {failed ? (
          <Callout tone="error" role="alert">
            No se pudo leer la imagen. Prueba con otra en JPG, PNG o WebP.
          </Callout>
        ) : (
          <div
            ref={frame}
            id="crop-frame"
            tabIndex={0}
            role="group"
            aria-roledescription="área de recorte"
            aria-label="Área de recorte. Usa las flechas para mover la foto y + o − para acercar o alejar."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            className={`relative mx-auto touch-none overflow-hidden rounded-xl bg-[repeating-conic-gradient(var(--color-line)_0_25%,transparent_0_50%)] bg-[length:16px_16px] select-none ${img ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
            style={{ aspectRatio: aspect, width: `min(100%, calc(min(50dvh, 520px) * ${ratio}))` }}
          >
            {img && region && k > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element -- archivo local (blob:) que aún no se ha subido
              <img
                src={img.url}
                alt=""
                draggable={false}
                className="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left"
                style={{ width: img.width * k, height: img.height * k, transform: `translate3d(${-region.x * k}px, ${-region.y * k}px, 0)` }}
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-ink-muted">
                <Spinner size={22} />
              </div>
            )}
            {/* Tercios: ayudan a encuadrar; se marcan más mientras se arrastra. */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 transition-opacity duration-150 ${dragging ? "opacity-100" : "opacity-45"}`}
            >
              {["left-1/3", "left-2/3"].map((c) => (
                <span key={c} className={`absolute inset-y-0 ${c} w-px bg-white/70 shadow-[0_0_2px_rgb(0_0_0/0.5)]`} />
              ))}
              {["top-1/3", "top-2/3"].map((c) => (
                <span key={c} className={`absolute inset-x-0 ${c} h-px bg-white/70 shadow-[0_0_2px_rgb(0_0_0/0.5)]`} />
              ))}
            </div>
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-black/15 ring-inset" />
          </div>
        )}

        {!failed && (
          <div className="flex items-center gap-2">
            <IconButton label="Alejar" size="sm" variant="secondary" disabled={!img || view.z <= 1} onClick={() => zoom((z) => z / 1.25)}>
              <MinusIcon size={15} />
            </IconButton>
            <label htmlFor="crop-zoom" className="sr-only">
              Zoom
            </label>
            <input
              id="crop-zoom"
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={view.z}
              disabled={!img}
              aria-valuetext={`${zoomPct} %`}
              onChange={(e) => zoom(() => Number(e.target.value))}
              className="h-10 min-w-0 flex-1 accent-[var(--color-cta)]"
            />
            <IconButton label="Acercar" size="sm" variant="secondary" disabled={!img || view.z >= MAX_ZOOM} onClick={() => zoom((z) => z * 1.25)}>
              <PlusIcon size={15} />
            </IconButton>
            <span className="w-12 text-right text-[12.5px] font-semibold text-ink-muted tabular-nums">{zoomPct} %</span>
            <IconButton
              label="Centrar y quitar el zoom"
              size="sm"
              variant="ghost"
              disabled={!img}
              onClick={() => img && setView({ z: 1, cx: img.width / 2, cy: img.height / 2 })}
            >
              <RefreshIcon size={15} />
            </IconButton>
          </div>
        )}

        {out && (
          <p aria-live="polite" className="text-[13px] text-ink-muted">
            Se publicará a <strong className="text-ink">{px(out)}</strong> · el espacio pide mínimo {px({ width: min[0], height: min[1] })}.
          </p>
        )}
        {low && out && (
          <Callout tone="warning" role="status">
            {view.z > 1 ? "Con este zoom" : "Esta foto"} el recorte queda de <strong>{px(out)}</strong> y este espacio necesita al menos{" "}
            <strong>{px({ width: min[0], height: min[1] })}</strong>: en el sitio se verá borrosa.{" "}
            {view.z > 1 ? "Aleja el zoom o usa una foto más grande." : "Usa el archivo original o una foto más grande."}
          </Callout>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 rounded-b-2xl border-t border-line bg-canvas/60 px-5 py-3.5 sm:flex-row sm:items-center sm:px-6">
        <Button variant="ghost" icon={<UploadIcon size={14} />} onClick={onChooseOther} className="sm:mr-auto">
          Elegir otra foto
        </Button>
        <Button onClick={onCancel}>Cancelar</Button>
        <Button
          variant="primary"
          disabled={!region || !out}
          icon={low ? <WarningIcon size={14} /> : <CheckIcon size={14} />}
          onClick={() => region && out && onConfirm({ x: region.x, y: region.y, width: region.width, height: region.height }, out)}
        >
          {low ? "Subir de todas formas" : "Recortar y publicar"}
        </Button>
      </div>
    </Modal>
  );
}
