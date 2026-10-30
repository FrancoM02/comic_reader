import { describe, expect, it } from 'vitest';
import { isImageEntry, naturalCompare } from '../src/lib/sort';

describe('naturalCompare', () => {
  it('ordena numeros de forma natural', () => {
    expect(['10.jpg', '2.jpg', '1.jpg'].sort(naturalCompare)).toEqual(['1.jpg', '2.jpg', '10.jpg']);
  });
  it('ordena por ruta completa', () => {
    expect(['Vol 1/010.jpg', 'Vol 1/002.jpg', 'Vol 2/001.jpg'].sort(naturalCompare)).toEqual([
      'Vol 1/002.jpg',
      'Vol 1/010.jpg',
      'Vol 2/001.jpg',
    ]);
  });
});

describe('isImageEntry', () => {
  it('acepta imagenes sin distinguir mayusculas', () => {
    for (const e of ['a.jpg', 'a.JPEG', 'dir/a.png', 'a.WebP', 'a.gif', 'a.AVIF']) expect(isImageEntry(e)).toBe(true);
  });
  it('rechaza no imagenes y ocultos', () => {
    for (const e of ['ComicInfo.xml', 'Thumbs.db', '__MACOSX/._001.jpg', '.hidden.jpg', 'dir/.hidden.jpg', 'dir/'])
      expect(isImageEntry(e)).toBe(false);
  });
});
