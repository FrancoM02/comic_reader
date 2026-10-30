import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { extractZip } from '../src/extract/zip';

describe('extractZip', () => {
  it('devuelve las imagenes en orden natural, de a una', async () => {
    const bytes = zipSync({
      'ComicInfo.xml': strToU8('<x/>'),
      'sub/2.png': strToU8('two'),
      'sub/10.png': strToU8('ten'),
      'sub/1.png': strToU8('one'),
    });
    const file = new File([bytes as BlobPart], 'a.cbz');
    const { total, pages } = await extractZip(file);
    expect(total).toBe(3);
    const texts: string[] = [];
    const idx: number[] = [];
    for await (const p of pages) {
      idx.push(p.index);
      expect(p.blob.type).toBe('image/png');
      texts.push(new TextDecoder().decode(new Uint8Array(await p.blob.arrayBuffer())));
    }
    expect(texts).toEqual(['one', 'two', 'ten']);
    expect(idx).toEqual([0, 1, 2]);
  });
});
