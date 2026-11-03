// Enlace liviano entre la API del navegador y el motor de sincronización. El sitio público también carga lib/client/api:
// aquí no se importa el motor, que solo entra en el panel.
import type { ApiResult } from "@/lib/types";

type Mutate = <T>(type: string, input: unknown) => Promise<ApiResult<T>>;
type Cache = { get: <T>(key: string) => Promise<T | undefined>; set: (key: string, value: unknown) => Promise<unknown> };

let active: { mutate: Mutate; cache: Cache } | null = null;

export const setRuntime = (r: typeof active) => {
  active = r;
};

// Escritura del panel: por la cola si el motor está activo; si no (bandera apagada, modo simulado, sitio público), directa.
export const mutate = <T>(type: string, input: unknown, direct: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> =>
  active ? active.mutate<T>(type, input) : direct();

// Lectura que no está en AdminData: la última respuesta queda guardada para consultarla sin conexión.
export async function cachedGet<T>(key: string, read: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  if (!active) return read();
  const { cache } = active;
  try {
    const r = await read();
    if (r.status === 200) await cache.set(`get:${key}`, r.data);
    return r;
  } catch (e) {
    const saved = await cache.get<T>(`get:${key}`);
    if (saved === undefined) throw e;
    return { status: 200, data: saved };
  }
}

type FileRef = { url: string; mime: string; fileName: string };
const MAX_FILE_BYTES = 15 * 1024 * 1024;

// Archivo privado (comprobante): la URL firmada dura minutos, así que se guarda el archivo. Sin conexión se abre esa copia.
export async function cachedFile(key: string, read: () => Promise<ApiResult<FileRef>>, { keep = true } = {}): Promise<ApiResult<FileRef>> {
  if (!active) return read();
  const { cache } = active;
  try {
    const r = await read();
    if (keep && r.status === 200 && r.data && !(await cache.get(`file:${key}`))) {
      const { url, mime, fileName } = r.data;
      void fetch(url, { cache: "no-store" })
        .then((res) => (res.ok ? res.blob() : null))
        .then((blob) => (blob && blob.size <= MAX_FILE_BYTES ? cache.set(`file:${key}`, { blob, mime, fileName }) : null))
        .catch(() => {});
    }
    return r;
  } catch (e) {
    const saved = await cache.get<{ blob: Blob; mime: string; fileName: string }>(`file:${key}`);
    if (!saved) throw e;
    return { status: 200, data: { url: URL.createObjectURL(saved.blob), mime: saved.mime, fileName: saved.fileName } };
  }
}
