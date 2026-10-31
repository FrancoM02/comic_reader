import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, expect, test, vi } from 'vitest';
import { SessionContext } from '../src/session';
import type { Library, ProgressFile, Volume } from '../src/types';
import { deleteVolume } from '../src/upload';

vi.mock('../src/upload', async (orig) => ({
  ...(await orig<typeof import('../src/upload')>()),
  deleteVolume: vi.fn(async () => {}),
}));
import { SeriesView } from '../src/ui/SeriesView';

const tomo = (id: string, n: number): Volume => ({
  id, seriesId: 'S', number: n, label: `v0${n}`, pageCount: 10, folderId: 'f', pageFileIds: [], thumbFileId: `t${id}`, uploadedAt: n,
});
const done = { maxPage: 9, totalPages: 10, finished: true, resetGen: 0, updatedAt: 1, deviceId: 'd' };
let lib: Library;
const updateLibrary = vi.fn();

function renderSerie(prog: ProgressFile = { version: 1, volumes: {} }) {
  updateLibrary.mockImplementation(async (f: (l: Library) => Library) => void (lib = f(lib)));
  const session = {
    drive: { downloadBlob: async () => new Blob() } as never,
    store: { loadLibrary: async () => lib, loadProgress: async () => prog, updateLibrary } as never,
    volumesId: 'v',
  };
  return render(
    <SessionContext.Provider value={session}>
      <SeriesView id="S" />
    </SessionContext.Provider>,
  );
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  vi.mocked(deleteVolume).mockClear();
  updateLibrary.mockReset();
  lib = {
    version: 1,
    series: [
      { id: 'S', name: 'Berserk', kind: 'manga', dir: 'rtl', mode: 'paged', createdAt: 0 },
      { id: 'T', name: 'Batman', kind: 'comic', dir: 'ltr', mode: 'paged', createdAt: 0 },
    ],
    volumes: [tomo('a', 1), tomo('b', 2)],
  };
});

async function abrirMenuTomo(label: string) {
  fireEvent.click(await screen.findByLabelText(`Opciones de ${label}`));
}

test('el botón Seguir abre el tomo en lectura', async () => {
  renderSerie({ version: 1, volumes: { a: done, b: { ...done, maxPage: 4, finished: false } } });
  const link = (await screen.findByText(/^Seguir/)).closest('a')!;
  expect(link.getAttribute('href')).toBe('#/read/b');
  expect(link.textContent).toContain('Tomo 2, p. 5');
});

test('todo leído ofrece Leer de nuevo', async () => {
  renderSerie({ version: 1, volumes: { a: done, b: done } });
  const link = (await screen.findByText('Leer de nuevo')).closest('a')!;
  expect(link.getAttribute('href')).toBe('#/read/a');
});

test('borrar tomo pide confirmación', async () => {
  renderSerie();
  await abrirMenuTomo('Tomo 2');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Borrar tomo' }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(deleteVolume).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Borrar' }));
  await waitFor(() => expect(deleteVolume).toHaveBeenCalledTimes(1));
  expect(vi.mocked(deleteVolume).mock.calls[0][0]).toBe('b');
});

test('cancelar el diálogo no borra', async () => {
  renderSerie();
  await abrirMenuTomo('Tomo 2');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Borrar tomo' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(deleteVolume).not.toHaveBeenCalled();
});

test('cambiar número usa el diálogo', async () => {
  renderSerie();
  await abrirMenuTomo('Tomo 2');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Cambiar número' }));
  const input = screen.getByRole('dialog').querySelector('input')!;
  fireEvent.input(input, { target: { value: '7' } });
  await act(async () => {
    fireEvent.keyDown(input, { key: 'Enter' });
  });
  await waitFor(() => expect(updateLibrary).toHaveBeenCalled());
  expect(lib.volumes.find((v) => v.id === 'b')!.number).toBe(7);
});

test('Tipo cómic pone izquierda a derecha', async () => {
  renderSerie();
  fireEvent.click(await screen.findByRole('button', { name: 'Ajustes de la serie' }));
  await act(async () => {
    fireEvent.click(screen.getByRole('radio', { name: 'Cómic' }));
  });
  await waitFor(() => expect(updateLibrary).toHaveBeenCalled());
  expect(lib.series[0]).toMatchObject({ kind: 'comic', dir: 'ltr' });
});
