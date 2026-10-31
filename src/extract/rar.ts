import { createExtractorFromData } from 'node-unrar-js';
import wasmUrl from 'node-unrar-js/dist/js/unrar.wasm?url';
import { imageMime, isImageEntry, naturalCompare } from '../lib/sort';
import type { Extraction, Page } from './types';

// unrar oficial compilado a WASM. libarchive.js cortaba algunos RAR5 válidos a mitad del archivo
// (errores sin mensaje desde la entrada ~78), y la subida fallaba en silencio.
export async function extractRar(file: File): Promise<Extraction> {
  const [data, wasmBinary] = await Promise.all([file.arrayBuffer(), fetch(wasmUrl).then((r) => r.arrayBuffer())]);
  const ex = await createExtractorFromData({ data, wasmBinary });
  const paths = [...ex.getFileList().fileHeaders]
    .filter((h) => !h.flags.directory && isImageEntry(h.name))
    .map((h) => h.name)
    .sort(naturalCompare);
  const indexOf = new Map(paths.map((p, i) => [p, i]));

  // Una sola pasada en el orden del archivo (en un RAR sólido, extraer de a uno descomprimiría todo cada vez).
  // Las páginas salen en ese orden con su índice ya ordenado: la subida no necesita recibirlas en orden.
  async function* gen(): AsyncGenerator<Page> {
    const { files } = ex.extract({ files: (h) => indexOf.has(h.name) });
    for (const f of files) {
      if (!f.extraction) throw new Error(`No se pudo extraer ${f.fileHeader.name}`);
      yield { index: indexOf.get(f.fileHeader.name)!, blob: new Blob([f.extraction as Uint8Array<ArrayBuffer>], { type: imageMime(f.fileHeader.name) }) };
    }
  }
  return { total: paths.length, pages: gen() };
}
