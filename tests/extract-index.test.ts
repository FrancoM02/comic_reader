import { expect, test, vi } from 'vitest';

test('si el chunk del extractor no carga (deploy nuevo), explica que hay que recargar', async () => {
  vi.doMock('../src/extract/rar', () => {
    throw new Error('error loading dynamically imported module');
  });
  const { extractPages } = await import('../src/extract');
  await expect(extractPages(new File(['x'], 'a.cbr'))).rejects.toThrow(/La app se actualizó/);
  vi.doUnmock('../src/extract/rar');
});
