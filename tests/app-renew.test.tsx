import { act, fireEvent, render, screen } from '@testing-library/preact';
import { beforeEach, expect, test, vi } from 'vitest';
import { AuthInteractionRequired, getToken, initAuth, type TokenTransport } from '../src/auth';
import type { Library } from '../src/types';

const lib: Library = {
  version: 1,
  series: [{ id: 's', name: 'Berserk', kind: 'manga', dir: 'rtl', mode: 'paged', createdAt: 0 }],
  volumes: [],
};

const h = vi.hoisted(() => ({ initFails: 0 }));

// drive/store falsos: init pide un token como lo haría Drive de verdad.
vi.mock('../src/drive', () => ({
  createDrive: (gt: () => Promise<string>) => ({ gt, listChildren: async () => [], trashFile: async () => {} }),
}));
vi.mock('../src/store', () => ({
  createStore: (drive: { gt: () => Promise<string> }) => ({
    init: async () => {
      if (h.initFails > 0) {
        h.initFails--;
        throw new TypeError('Failed to fetch');
      }
      await drive.gt();
      return { rootId: 'r', volumesId: 'v' };
    },
    loadLibrary: async () => lib,
    loadProgress: async () => ({ version: 1, volumes: {} }),
  }),
}));
import { App } from '../src/app';

function transport(): TokenTransport {
  return {
    request: vi.fn(async (interactive: boolean) => {
      if (!interactive) throw new AuthInteractionRequired();
      return { accessToken: 'nuevo', expiresIn: 3600 };
    }),
  };
}

beforeEach(() => {
  localStorage.clear();
  h.initFails = 0;
});

test('si la sesión venció al abrir, renovar con un toque vuelve a abrir la biblioteca', async () => {
  localStorage.setItem('cr.token', JSON.stringify({ accessToken: 'viejo', expiresAt: Date.now() - 1000 }));
  await initAuth('cid', transport());
  render(<App />);
  expect(await screen.findByText(/No se pudo abrir tu biblioteca/)).toBeTruthy();
  await act(async () => {
    fireEvent.click(screen.getByText('Tocá para renovar'));
  });
  expect(await screen.findByText('Berserk')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Biblioteca' })).toBeTruthy();
  expect(screen.queryByText(/No se pudo abrir/)).toBeNull();
  expect(screen.queryByText('Tocá para renovar')).toBeNull();
});

test('si abrir la biblioteca falla por la red, "Reintentar" vuelve a probar', async () => {
  localStorage.setItem('cr.token', JSON.stringify({ accessToken: 't', expiresAt: Date.now() + 3600_000 }));
  await initAuth('cid', transport());
  h.initFails = 1;
  render(<App />);
  expect(await screen.findByText(/No se pudo abrir tu biblioteca: Failed to fetch/)).toBeTruthy();
  await act(async () => {
    fireEvent.click(screen.getByText('Reintentar'));
  });
  expect(await screen.findByText('Berserk')).toBeTruthy();
  expect(screen.queryByText(/No se pudo abrir/)).toBeNull();
});

test('Home recarga la biblioteca cuando la sesión se renueva', async () => {
  localStorage.setItem('cr.token', JSON.stringify({ accessToken: 't', expiresAt: Date.now() + 3600_000 }));
  await initAuth('cid', transport());
  const loadLibrary = vi.fn(async () => lib);
  const store = { loadLibrary, loadProgress: async () => ({ version: 1, volumes: {} }) };
  render(<App session={{ drive: {} as never, store: store as never, volumesId: 'v' }} />);
  expect(await screen.findByText('Berserk')).toBeTruthy();
  await act(async () => {
    await getToken({ forceRefresh: true }).catch(() => {}); // vence: aparece el banner
  });
  const before = loadLibrary.mock.calls.length;
  await act(async () => {
    fireEvent.click(screen.getByText('Tocá para renovar'));
  });
  await act(async () => {});
  expect(loadLibrary.mock.calls.length).toBeGreaterThan(before);
});
