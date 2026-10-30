import { withCleanup } from './cleanup';
import type { Extraction, Page } from './types';

const WIDTH = 1800;

export async function extractPdf(file: File): Promise<Extraction> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const url = URL.createObjectURL(file);
  const task = pdfjs.getDocument({ url });
  const cleanup = async () => {
    try {
      await task.destroy();
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    await cleanup();
    throw e;
  }
  const pdf = doc;

  async function* gen(): AsyncGenerator<Page> {
    for (let index = 0; index < pdf.numPages; index++) {
      const page = await pdf.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: WIDTH / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const blob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo renderizar la página'))), 'image/jpeg', 0.9),
      );
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      yield { index, blob };
    }
  }
  return { total: pdf.numPages, pages: withCleanup(gen(), cleanup) };
}
