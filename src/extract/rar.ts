import { imageMime, isImageEntry, naturalCompare } from '../lib/sort';
import { withCleanup } from './cleanup';
import type { Extraction, Page } from './types';

// El worker (módulo) carga libarchive.wasm junto a sí mismo. En build, el plugin de
// vite.config.ts los emite en libarchive/; en dev se sirven desde node_modules.
async function workerUrl(): Promise<string> {
  if (import.meta.env.DEV) return (await import('libarchive.js/dist/worker-bundle.js?url')).default;
  return new URL('libarchive/worker-bundle.js', document.baseURI).href;
}

export async function extractRar(file: File): Promise<Extraction> {
  const { Archive } = await import('libarchive.js');
  Archive.init({ workerUrl: await workerUrl() });
  const reader = await Archive.open(file);
  let items: { path: string; entry: { extract(): Promise<File> } }[];
  try {
    const all: { path: string; entry: { extract(): Promise<File> } }[] = (await reader.getFilesArray()).map(
    (e: { path: string; file: { name: string; extract(): Promise<File> } }) => ({
      path: e.path + e.file.name,
      entry: e.file,
    }),
  );
    items = all.filter((i) => isImageEntry(i.path)).sort((a, b) => naturalCompare(a.path, b.path));
  } catch (e) {
    await reader.close();
    throw e;
  }

  async function* gen(): AsyncGenerator<Page> {
    for (let index = 0; index < items.length; index++) {
      const f = await items[index].entry.extract();
      yield { index, blob: new Blob([f], { type: imageMime(items[index].path) }) };
    }
  }
  return { total: items.length, pages: withCleanup(gen(), () => reader.close()) };
}
