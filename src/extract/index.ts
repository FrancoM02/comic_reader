import type { Extraction } from './types';

export type { Page, Extraction } from './types';

// Tras un deploy, una pestaña abierta de antes pide chunks que ya no existen (falla, o da undefined
// si el aviso de vite:preloadError lo frenó).
async function load<T>(p: Promise<T>): Promise<T> {
  const m = await p.catch(() => undefined);
  if (!m) throw new Error('La app se actualizó mientras la tenías abierta: recargá la página y volvé a elegir el archivo');
  return m;
}

export async function extractPages(file: File): Promise<Extraction> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'cbz' || ext === 'zip') return (await load(import('./zip'))).extractZip(file);
  if (ext === 'cbr' || ext === 'rar') return (await load(import('./rar'))).extractRar(file);
  if (ext === 'pdf') return (await load(import('./pdf'))).extractPdf(file);
  throw new Error('Formato no soportado');
}

const THUMB_WIDTH = 400;

export async function makeThumb(page: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(page);
  try {
    const w = Math.min(THUMB_WIDTH, bmp.width);
    const h = Math.max(1, Math.round((bmp.height * w) / bmp.width));
    if (typeof OffscreenCanvas !== 'undefined') {
      const c = new OffscreenCanvas(w, h);
      c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
      return await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.8));
    c.width = 0;
    c.height = 0;
    if (!blob) throw new Error('No se pudo crear la miniatura');
    return blob;
  } finally {
    bmp.close();
  }
}
