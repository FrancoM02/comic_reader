import type { Extraction } from './types';

export type { Page, Extraction } from './types';

export async function extractPages(file: File): Promise<Extraction> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'cbz' || ext === 'zip') return (await import('./zip')).extractZip(file);
  if (ext === 'cbr' || ext === 'rar') return (await import('./rar')).extractRar(file);
  if (ext === 'pdf') return (await import('./pdf')).extractPdf(file);
  throw new Error('Formato no soportado');
}

const THUMB_WIDTH = 400;

export async function makeThumb(page: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(page);
  try {
    const w = THUMB_WIDTH;
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
