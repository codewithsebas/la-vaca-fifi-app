// Fotos del panel: se miden, se recortan y se preparan en el navegador antes de subirlas.

type Size = { width: number; height: number };
// Región de la foto original, en píxeles reales (ya con la orientación EXIF aplicada).
export type Crop = { x: number; y: number; width: number; height: number };

// Dimensiones reales de una imagen (respeta la orientación EXIF en navegadores actuales).
export async function imageSize(file: Blob): Promise<Size> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

const MAX_BYTES = 4.5 * 1024 * 1024; // margen bajo el límite de 5 MB del servidor
const MAX_SIDE = 2400;

// Tamaño final de un recorte de `cropWidth` px de ancho con proporción `ratio` (ancho / alto): nunca se amplía
// (ampliar solo agranda el archivo, no agrega detalle) y el lado mayor no pasa de MAX_SIDE. Siempre la proporción exacta.
export function cropOutput(cropWidth: number, ratio: number): Size {
  const width = Math.max(1, Math.min(Math.round(cropWidth), Math.round(MAX_SIDE * Math.min(1, ratio))));
  return { width, height: Math.round(width / ratio) };
}

// Reduce el lado mayor a `maxSide` sin bajar del mínimo que necesita el hueco (`min`), con remuestreo
// de alta calidad, y codifica en WebP (o JPEG si el navegador no codifica WebP).
// Con `crop` y `size` solo usa esa región de la foto y la entrega exactamente a ese tamaño.
export async function resizeImage(file: File, { maxSide = MAX_SIDE, min = [0, 0] as readonly [number, number], crop, size }: { maxSide?: number; min?: readonly [number, number]; crop?: Crop; size?: Size } = {}): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    let rect: Crop | undefined = crop ?? { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
    const { width: w0, height: h0 } = rect;
    const scale = Math.min(1, Math.max(maxSide / Math.max(w0, h0), min[0] / w0, min[1] / h0));
    const tw = size?.width ?? Math.round(w0 * scale);
    const th = size?.height ?? Math.round(h0 * scale);

    // Reducir a la mitad en pasos evita el aliasing de un solo salto grande (sobre todo en Firefox).
    // El primer paso toma solo la región recortada; los siguientes, el lienzo anterior completo.
    let src: CanvasImageSource = bitmap;
    let w = w0;
    let h = h0;
    while (w / 2 >= tw * 1.05) {
      w = Math.round(w / 2);
      h = Math.round(h / 2);
      src = draw(src, w, h, rect);
      rect = undefined;
    }
    const canvas = draw(src, tw, th, rect);

    const encode = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));
    for (const q of [0.92, 0.85, 0.78]) {
      const webp = await encode("image/webp", q);
      const blob = webp?.type === "image/webp" ? webp : await encode("image/jpeg", q);
      if (!blob) throw new Error("No se pudo procesar la imagen");
      if (blob.size <= MAX_BYTES || q === 0.78) return blob;
    }
    throw new Error("No se pudo procesar la imagen");
  } finally {
    bitmap.close();
  }
}

function draw(src: CanvasImageSource, w: number, h: number, rect?: Crop) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (rect) ctx.drawImage(src, rect.x, rect.y, rect.width, rect.height, 0, 0, w, h);
  else ctx.drawImage(src, 0, 0, w, h);
  return canvas;
}
