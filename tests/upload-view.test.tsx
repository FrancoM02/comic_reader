import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { beforeEach, expect, test, vi } from 'vitest';
import { setBusy, signIn, tokenMinutesLeft, usesRedirect } from '../src/auth';
import { SessionContext } from '../src/session';
import type { Library } from '../src/types';
import { uploadVolume } from '../src/upload';

vi.mock('../src/auth', async (orig) => ({
  ...(await orig<typeof import('../src/auth')>()),
  setBusy: vi.fn(),
  signIn: vi.fn(async () => {}),
  tokenMinutesLeft: vi.fn(() => 60),
  usesRedirect: vi.fn(() => false),
}));
vi.mock('../src/upload', async (orig) => ({
  ...(await orig<typeof import('../src/upload')>()),
  uploadVolume: vi.fn(async () => ({})),
}));
import { UploadView } from '../src/ui/UploadView';
import { SeriesView } from '../src/ui/SeriesView';

const lib: Library = {
  version: 1,
  series: [{ id: 'S', name: 'Batman', kind: 'comic', dir: 'ltr', mode: 'paged', createdAt: 0 }],
  volumes: [],
};
const session = (l: Library = lib) => ({
  drive: { downloadBlob: async () => new Blob() } as never,
  store: { loadLibrary: async () => l, loadProgress: async () => ({ version: 1, volumes: {} }) } as never,
  volumesId: 'v',
});

async function renderWith(names: string[], l: Library = lib) {
  render(
    <SessionContext.Provider value={session(l)}>
      <UploadView />
    </SessionContext.Provider>,
  );
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: names.map((n) => new File(['z'], n)), configurable: true });
  await act(async () => {
    fireEvent.change(input);
  });
}
async function subir() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Subir \d+ archivos?$/ }));
  });
  await waitFor(() => expect(screen.queryByText(/^Subiendo/)).toBeNull());
}
const editAll = () => screen.getAllByRole('button', { name: /^Editar / }).forEach((b) => fireEvent.click(b));
const labels = () => vi.mocked(uploadVolume).mock.calls.map((c) => c[0].label);

beforeEach(() => {
  vi.mocked(uploadVolume).mockClear();
  vi.mocked(setBusy).mockClear();
  vi.mocked(signIn).mockClear();
  vi.mocked(tokenMinutesLeft).mockReturnValue(60);
  vi.mocked(usesRedirect).mockReturnValue(false);
});

test('la etiqueta sale del número editado y del tipo de la serie (existente o nueva)', async () => {
  await renderWith(['Berserk v01.cbz', 'Batman 5.cbz', 'Suelto.cbz']);
  editAll();
  const nums = Array.from(document.querySelectorAll('input[type=number]')) as HTMLInputElement[];
  fireEvent.input(nums[0], { target: { value: '3' } }); // serie nueva, manga (por defecto)
  fireEvent.input(nums[1], { target: { value: '12' } }); // serie existente, cómic
  fireEvent.input(nums[2], { target: { value: '2' } }); // sin número en el nombre, nueva → elegimos cómic
  const kinds = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
  fireEvent.change(kinds[kinds.length - 1], { target: { value: 'comic' } });
  await subir();
  expect(labels()).toEqual(['v03', '#012', '#002']);
});

test('setBusy cubre todo el lote, no cada tomo', async () => {
  await renderWith(['A v01.cbz', 'A v02.cbz']);
  await subir();
  expect(uploadVolume).toHaveBeenCalledTimes(2);
  expect(vi.mocked(setBusy).mock.calls.map((c) => c[0])).toEqual([true, false]);
});

test('con GIS y menos de 30 min de token, renueva (un toque) antes de subir', async () => {
  vi.mocked(tokenMinutesLeft).mockReturnValue(10);
  const order: string[] = [];
  vi.mocked(signIn).mockImplementationOnce(async () => void order.push('signIn'));
  vi.mocked(uploadVolume).mockImplementationOnce(async () => (order.push('upload'), {}) as never);
  await renderWith(['A v01.cbz']);
  await subir();
  expect(order).toEqual(['signIn', 'upload']);
});

test('con redirección o con token de sobra no pide renovar', async () => {
  vi.mocked(tokenMinutesLeft).mockReturnValue(10);
  vi.mocked(usesRedirect).mockReturnValue(true);
  await renderWith(['A v01.cbz']);
  await subir();
  expect(signIn).not.toHaveBeenCalled();
  expect(uploadVolume).toHaveBeenCalledTimes(1);
});

test('el botón dice cuántos archivos sube', async () => {
  await renderWith(['A v01.cbz']);
  expect(screen.getByRole('button', { name: 'Subir 1 archivo' })).toBeTruthy();
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [new File(['z'], 'A v02.cbz')], configurable: true });
  await act(async () => {
    fireEvent.change(input);
  });
  expect(screen.getByRole('button', { name: 'Subir 2 archivos' })).toBeTruthy();
});

test('duplicado usa el diálogo', async () => {
  const l: Library = {
    ...lib,
    volumes: [{ id: 'V1', seriesId: 'S', number: 1, label: '#001', pageCount: 10, folderId: 'f', pageFileIds: [], thumbFileId: 't', uploadedAt: 0 }],
  };
  await renderWith(['Batman 001.cbz'], l);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Subir \d+ archivos?$/ }));
  });
  const dialog = await screen.findByRole('dialog');
  expect(uploadVolume).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reemplazar' }));
  });
  await waitFor(() => expect(uploadVolume).toHaveBeenCalledTimes(1));
  expect(vi.mocked(uploadVolume).mock.calls[0][0].replaceVolumeId).toBe('V1');
});

test('serie vacía abre la tarjeta y bloquea Subir', async () => {
  await renderWith(['#1.cbz']); // el nombre no trae serie
  expect(screen.getByLabelText('Serie')).toBeTruthy();
  expect((screen.getByRole('button', { name: /^Subir \d+ archivos?$/ }) as HTMLButtonElement).disabled).toBe(true);
});

test('SeriesView muestra el porcentaje leído', async () => {
  const l: Library = {
    ...lib,
    volumes: [{ id: 'a', seriesId: 'S', number: 1, label: '#001', pageCount: 10, folderId: 'f', pageFileIds: [], thumbFileId: 't', uploadedAt: 0 }],
  };
  const s = {
    ...session(),
    store: {
      loadLibrary: async () => l,
      loadProgress: async () => ({ version: 1, volumes: { a: { maxPage: 4, totalPages: 10, finished: false, resetGen: 0, updatedAt: 0, deviceId: 'd' } } }),
    } as never,
  };
  URL.createObjectURL = vi.fn(() => 'blob:x');
  render(
    <SessionContext.Provider value={s}>
      <SeriesView id="S" />
    </SessionContext.Provider>,
  );
  expect(await screen.findByText('50%')).toBeTruthy();
});
