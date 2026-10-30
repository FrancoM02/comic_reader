import type { Extraction, Page } from './types';

const WIDTH = 1800;

export async function extractPdf(file: File): Promise<Extraction> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;

  async function* gen(): AsyncGenerator<Page> {
    try {
      for (let index = 0; index < doc.numPages; index++) {
        const page = await doc.getPage(index + 1);
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
    } finally {
      await task.destroy();
    }
  }
  return { total: doc.numPages, pages: gen() };
}
