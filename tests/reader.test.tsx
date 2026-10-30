import { act, fireEvent, render, screen } from '@testing-library/preact';
import { beforeEach, expect, test, vi } from 'vitest';
import { SessionContext } from '../src/session';
import { Reader } from '../src/ui/Reader';
import type { Library, ProgressFile } from '../src/types';

const lib: Library = {
  version: 1,
  series: [{ id: 's', name: 'Berserk', kind: 'manga', dir: 'rtl', mode: 'paged', createdAt: 0 }],
  volumes: [
    { id: 'v1', seriesId: 's', number: 1, label: 'v01', pageCount: 4, folderId: 'f', pageFileIds: ['a', 'b', 'c', 'd'], thumbFileId: 't', uploadedAt: 0 },
    { id: 'v2', seriesId: 's', number: 2, label: 'v02', pageCount: 4, folderId: 'g', pageFileIds: ['e', 'f', 'g', 'h'], thumbFileId: 't', uploadedAt: 0 },
  ],
};

beforeEach(() => {
  URL.createObjectURL = vi.fn((b: Blob) => `blob:${(b as Blob & { id?: string }).id ?? 'x'}`);
  URL.revokeObjectURL = vi.fn();
});

test('abre en maxPage, en rtl la flecha izquierda avanza y al final ofrece el siguiente tomo', async () => {
  const prog: ProgressFile = { version: 1, volumes: { v1: { maxPage: 2, totalPages: 4, finished: false, resetGen: 0, updatedAt: 0, deviceId: 'x' } } };
  const downloadBlob = vi.fn(async (id: string) => Object.assign(new Blob(['x']), { id }));
  const store = { loadLibrary: async () => lib, loadProgress: async () => prog, saveProgress: vi.fn(async () => {}), resetProgress: vi.fn() };
  render(
    <SessionContext.Provider value={{ drive: { downloadBlob } as never, store: store as never, volumesId: 'v' }}>
      <Reader volumeId="v1" />
    </SessionContext.Provider>,
  );
  expect(await screen.findByAltText('Página 3')).toBeTruthy();
  expect(downloadBlob.mock.calls.map((c) => c[0])).toContain('d');
  await act(async () => {
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
  });
  expect(await screen.findByAltText('Página 4')).toBeTruthy();
  expect(screen.getByText('Siguiente tomo').getAttribute('href')).toBe('#/read/v2');
});
