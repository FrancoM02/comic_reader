import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDoublePref } from '../src/lib/prefs';
import { SessionContext } from '../src/session';
import { Reader } from '../src/ui/Reader';
import type { Library, ProgressFile, Series } from '../src/types';

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

const size = { w: innerWidth, h: innerHeight };
afterEach(() => {
  innerWidth = size.w;
  innerHeight = size.h;
  localStorage.clear();
  location.hash = '';
});

/** Lector de v1 con un store espía: updateLibrary aplica el op sobre la biblioteca y lo devuelve. */
function renderReader(maxPage = 2) {
  let current = lib;
  const prog: ProgressFile = { version: 1, volumes: { v1: { maxPage, totalPages: 4, finished: false, resetGen: 0, updatedAt: 0, deviceId: 'x' } } };
  const downloadBlob = vi.fn(async (id: string) => Object.assign(new Blob(['x']), { id }));
  const updateLibrary = vi.fn(async (op: (l: Library) => Library) => (current = op(current)));
  const store = { loadLibrary: async () => current, loadProgress: async () => prog, saveProgress: vi.fn(async () => {}), resetProgress: vi.fn(), updateLibrary };
  render(
    <SessionContext.Provider value={{ drive: { downloadBlob } as never, store: store as never, volumesId: 'v' }}>
      <Reader volumeId="v1" />
    </SessionContext.Provider>,
  );
  const series = (): Series => current.series[0];
  return { updateLibrary, series };
}

/** Toque en el centro del escenario, como lo ve useZoom: el toque simple llega a los 280 ms (reloj falso, dentro de act). */
async function openMenu() {
  const stage = document.querySelector('.stage') as HTMLElement;
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800, x: 0, y: 0, toJSON() {} });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 500, clientY: 400 });
    fireEvent.pointerUp(stage, { pointerId: 1, clientX: 500, clientY: 400 });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
  } finally {
    vi.useRealTimers();
  }
  expect(document.querySelector('.reader-menu')).toBeTruthy();
}

test('Sentido desde el menú guarda la serie', async () => {
  const { updateLibrary, series } = renderReader();
  await screen.findByAltText('Página 3');
  await openMenu();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Sentido/ }));
  });
  expect(updateLibrary).toHaveBeenCalledTimes(1);
  expect(series().dir).toBe('ltr');
  expect(screen.getByRole('button', { name: /Sentido/ }).textContent).toContain('izq. a der.');
});

test('pasar a vertical mantiene la página', async () => {
  const { updateLibrary, series } = renderReader(2);
  await screen.findByAltText('Página 3');
  await openMenu();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Modo: páginas/ }));
  });
  expect(updateLibrary).toHaveBeenCalledTimes(1);
  expect(series().mode).toBe('vertical');
  expect(document.querySelector('.vstrip')).toBeTruthy();
  expect(screen.getByAltText('Página 3')).toBeTruthy();
  expect(screen.getByText('3', { selector: '.reader-num' })).toBeTruthy();
});

test('en rtl el número de página va junto al inicio del slider (a la derecha) y el total a la izquierda', async () => {
  renderReader(2);
  await screen.findByAltText('Página 3');
  await openMenu();
  const nums = [...document.querySelectorAll('.reader-num')].map((n) => n.textContent);
  expect(nums).toEqual(['4', '3']);
});

test('F alterna pantalla completa', async () => {
  Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
  const requestFullscreen = vi.fn(async () => {});
  document.documentElement.requestFullscreen = requestFullscreen;
  renderReader();
  await screen.findByAltText('Página 3');
  fireEvent.keyDown(window, { key: 'f' });
  expect(requestFullscreen).toHaveBeenCalledTimes(1);
  await openMenu();
  expect(screen.getByLabelText('Pantalla completa')).toBeTruthy();
});

test('F mantenida (auto-repetición) alterna una sola vez', async () => {
  Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
  const requestFullscreen = vi.fn(async () => {});
  document.documentElement.requestFullscreen = requestFullscreen;
  renderReader();
  await screen.findByAltText('Página 3');
  fireEvent.keyDown(window, { key: 'f' });
  fireEvent.keyDown(window, { key: 'f', repeat: true });
  expect(requestFullscreen).toHaveBeenCalledTimes(1);
});

test('la ayuda de PC solo menciona F si hay pantalla completa', async () => {
  innerWidth = 1280;
  for (const enabled of [true, false]) {
    Object.defineProperty(document, 'fullscreenEnabled', { value: enabled, configurable: true });
    renderReader();
    await screen.findByAltText('Página 3');
    await openMenu();
    expect(document.querySelector('.reader-hint')!.textContent!.includes('F pantalla completa')).toBe(enabled);
    cleanup();
  }
});

test('sin pantalla completa disponible no hay botón', async () => {
  Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true });
  const requestFullscreen = vi.fn(async () => {});
  document.documentElement.requestFullscreen = requestFullscreen;
  renderReader();
  await screen.findByAltText('Página 3');
  await openMenu();
  expect(screen.queryByLabelText('Pantalla completa')).toBeNull();
  fireEvent.keyDown(window, { key: 'f' });
  expect(requestFullscreen).not.toHaveBeenCalled();
});

test('doble página nunca muestra una sola', async () => {
  innerWidth = 1400;
  innerHeight = 800;
  setDoublePref('nunca');
  renderReader(2);
  await screen.findByAltText('Página 3');
  expect(document.querySelectorAll('.ppage img')).toHaveLength(1);
  await openMenu();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Doble/ }));
  });
  expect(document.querySelectorAll('.ppage img')).toHaveLength(2);
});

test('Esc con el menú abierto lo cierra sin salir', async () => {
  location.hash = '#/read/v1';
  renderReader();
  await screen.findByAltText('Página 3');
  await openMenu();
  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(document.querySelector('.reader-menu')).toBeNull());
  expect(location.hash).toBe('#/read/v1');
});
