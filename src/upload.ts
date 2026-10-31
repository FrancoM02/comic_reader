import { AuthInteractionRequired, setBusy } from './auth';
import type { Drive } from './drive';
import { extractPages, makeThumb } from './extract';
import type { Extraction } from './extract';
import type { Store } from './store';
import type { Library, SeriesKind, Volume } from './types';

export class SessionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export interface SessionDeps {
  drive: Drive;
  store: Store;
  volumesId: string;
}
export interface UploadDeps extends SessionDeps {
  /** Inyectables para tests. */
  extract?: (file: File) => Promise<Extraction>;
  thumb?: (page: Blob) => Promise<Blob>;
}
export interface UploadArgs {
  file: File;
  seriesId: string;
  /** Si se pasa, la serie se crea en la misma operación que agrega el tomo. */
  newSeries?: { name: string; kind: SeriesKind };
  number: number | null;
  label: string;
  replaceVolumeId?: string;
}

const PENDING_KEY = 'cr.pendingUpload';
const CONCURRENCY = 3;
const ORPHAN_AGE_MS = 24 * 3600_000;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

export function findDuplicate(lib: Library, seriesId: string, number: number | null): Volume | undefined {
  if (number === null) return undefined;
  return lib.volumes.find((v) => v.seriesId === seriesId && v.number === number);
}

function setPending(p: { folderId: string; fileName: string } | null) {
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* sin storage: la limpieza igual borra huérfanas de volumes/ */
  }
}
function getPending(): { folderId: string; fileName: string } | null {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export async function uploadVolume(
  args: UploadArgs,
  deps: UploadDeps,
  onProgress: (done: number, total: number) => void,
): Promise<Volume> {
  const { drive, store, volumesId } = deps;
  const { file, seriesId, newSeries, number, label, replaceVolumeId } = args;
  setBusy(true);
  let createdFolder: string | undefined;
  try {
    const { total, pages } = await (deps.extract ?? extractPages)(file);
    const volumeId = crypto.randomUUID();
    const folderId = await drive.findOrCreateFolder(volumeId, volumesId);
    createdFolder = folderId;
    setPending({ folderId, fileName: file.name });

    const pageFileIds: string[] = new Array(total);
    let first: Blob | null = null;
    let done = 0;
    onProgress(0, total);
    let aborted = false;
    const worker = async () => {
      try {
        while (!aborted) {
          const r = await pages.next();
          if (r.done || aborted) return;
          const { index, blob } = r.value;
          if (index === 0) first = blob;
          const ext = EXT[blob.type] ?? 'jpg';
          pageFileIds[index] = await drive.uploadBlob(`${String(index + 1).padStart(4, '0')}.${ext}`, folderId, blob);
          onProgress(++done, total);
        }
      } catch (e) {
        aborted = true;
        throw e;
      }
    };
    const results = await Promise.allSettled(Array.from({ length: Math.min(CONCURRENCY, Math.max(total, 1)) }, worker));
    await pages.return?.(undefined);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
    if (total === 0 || done !== total || !first) throw new Error('El archivo no tiene páginas');

    const thumbFileId = await drive.uploadBlob('thumb.jpg', folderId, await (deps.thumb ?? makeThumb)(first));

    const volume: Volume = {
      id: volumeId, seriesId, number, label, pageCount: total, folderId, pageFileIds, thumbFileId, uploadedAt: Date.now(),
    };
    // Otro dispositivo pudo limpiar la carpeta mientras subíamos: no confirmar un tomo sin carpeta.
    if (!(await drive.listChildren(volumesId)).some((c) => c.id === folderId)) {
      throw new Error('La carpeta de la subida desapareció, volvé a subir el archivo');
    }
    let oldFolderId: string | undefined;
    const register = (lib: Library): Library => {
      oldFolderId = lib.volumes.find((v) => v.id === replaceVolumeId)?.folderId ?? oldFolderId;
      const series =
        newSeries && !lib.series.some((s) => s.id === seriesId)
          ? [...lib.series, { id: seriesId, name: newSeries.name, kind: newSeries.kind, dir: newSeries.kind === 'manga' ? 'rtl' as const : 'ltr' as const, mode: 'paged' as const, createdAt: Date.now() }]
          : lib.series;
      return { ...lib, series, volumes: [...lib.volumes.filter((v) => v.id !== replaceVolumeId && v.id !== volumeId), volume] };
    };
    // library.json no tiene control de concurrencia: otro dispositivo pudo pisar la escritura. Se verifica.
    const registered = async () => (await store.loadLibrary()).volumes.some((v) => v.id === volumeId);
    await store.updateLibrary(register);
    if (!(await registered())) {
      await store.updateLibrary(register);
      if (!(await registered())) throw new Error('No se pudo registrar el tomo en la biblioteca, volvé a subir el archivo');
    }
    setPending(null);

    if (oldFolderId) {
      // El tomo nuevo ya está guardado: si falla borrar el viejo, la subida igual salió bien
      // (la carpeta vieja queda huérfana en volumes/; tiene thumb.jpg, así que la limpieza no la toca).
      try {
        await drive.deleteFile(oldFolderId);
        await store.removeProgress([replaceVolumeId!]);
      } catch (e) {
        console.warn('No se pudo borrar el tomo reemplazado', e);
      }
    }
    return volume;
  } catch (e) {
    if (e instanceof AuthInteractionRequired) {
      // El marcador queda: cleanupOrphans manda la carpeta parcial a la papelera en el próximo arranque.
      throw new SessionExpiredError('Tu sesión venció — tocá para renovar y volvé a subir el archivo');
    }
    // El error ya se muestra en la fila: limpiar ahora para que el próximo arranque no avise "se cortó".
    // Si la papelera falla (sin red), el marcador queda y lo limpia cleanupOrphans.
    if (createdFolder) {
      try {
        await drive.trashFile(createdFolder);
        setPending(null);
      } catch {
        /* queda para el próximo arranque */
      }
    }
    throw e;
  } finally {
    setBusy(false);
  }
}

/**
 * Manda a la papelera (no borra) las carpetas de volumes/ que no figuran en library.json:
 * la de la subida propia cortada (marcador) y las ajenas de más de 24 h que no terminaron de subir
 * (las que ya tienen thumb.jpg se dejan: son tomos completos que una escritura perdida sacó de la lista).
 */
export async function cleanupOrphans(deps: SessionDeps): Promise<string[]> {
  const { drive, store, volumesId } = deps;
  const names: string[] = [];
  const pending = getPending();
  const lib = await store.loadLibrary();
  const known = new Set(lib.volumes.map((v) => v.folderId));
  if (pending) {
    if (!known.has(pending.folderId)) {
      await drive.trashFile(pending.folderId).catch(() => {});
      names.push(pending.fileName);
    }
  }
  for (const c of await drive.listChildren(volumesId)) {
    if (c.id === pending?.folderId || known.has(c.id)) continue;
    // Puede ser la subida en curso de otro dispositivo: solo si es vieja.
    const created = c.createdTime ? Date.parse(c.createdTime) : NaN;
    if (!(Date.now() - created > ORPHAN_AGE_MS)) continue;
    const complete = await drive
      .listChildren(c.id)
      .then((files) => files.some((f) => f.name === 'thumb.jpg'))
      .catch(() => true); // ante la duda, no tocar
    if (complete) continue;
    await drive.trashFile(c.id).catch(() => {});
  }
  setPending(null);
  return names;
}

export async function deleteVolume(volumeId: string, deps: SessionDeps): Promise<void> {
  const lib = await deps.store.loadLibrary();
  const v = lib.volumes.find((x) => x.id === volumeId);
  await deps.store.updateLibrary((l) => ({ ...l, volumes: l.volumes.filter((x) => x.id !== volumeId) }));
  if (v) await deps.drive.deleteFile(v.folderId);
  await deps.store.removeProgress([volumeId]);
}

export async function deleteSeries(seriesId: string, deps: SessionDeps): Promise<void> {
  const lib = await deps.store.loadLibrary();
  const vols = lib.volumes.filter((v) => v.seriesId === seriesId);
  await deps.store.updateLibrary((l) => ({
    ...l,
    series: l.series.filter((s) => s.id !== seriesId),
    volumes: l.volumes.filter((v) => v.seriesId !== seriesId),
  }));
  for (const v of vols) await deps.drive.deleteFile(v.folderId);
  await deps.store.removeProgress(vols.map((v) => v.id));
}
