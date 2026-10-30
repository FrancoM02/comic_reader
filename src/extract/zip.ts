import { unzipSync } from 'fflate';
import { imageMime, isImageEntry, naturalCompare } from '../lib/sort';
import type { Extraction, Page } from './types';

export async function extractZip(file: File): Promise<Extraction> {
  const data = new Uint8Array(await file.arrayBuffer());
  // Primera pasada: el filtro solo lee el directorio central y no descomprime nada.
  const names: string[] = [];
  unzipSync(data, {
    filter: (f) => {
      if (isImageEntry(f.name)) names.push(f.name);
      return false;
    },
  });
  names.sort(naturalCompare);

  async function* gen(): AsyncGenerator<Page> {
    for (let index = 0; index < names.length; index++) {
      const name = names[index];
      // Se descomprime una sola entrada por vez.
      const out = unzipSync(data, { filter: (f) => f.name === name });
      yield { index, blob: new Blob([out[name] as BlobPart], { type: imageMime(name) }) };
    }
  }
  return { total: names.length, pages: gen() };
}
