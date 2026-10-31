import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, test } from 'vitest';
import { SessionContext } from '../src/session';
import type { Library, ProgressFile, Series, Volume } from '../src/types';
import { Home } from '../src/ui/Home';

const serie = (id: string, name: string): Series => ({ id, name, kind: 'comic', dir: 'ltr', mode: 'paged', createdAt: 0 });
const tomo = (id: string, seriesId: string, n: number): Volume => ({
  id, seriesId, number: n, label: `#${String(n).padStart(3, '0')}`, pageCount: 10, folderId: 'f', pageFileIds: [], thumbFileId: `t${id}`, uploadedAt: n,
});

function renderHome(lib: Library, prog: ProgressFile = { version: 1, volumes: {} }) {
  const session = {
    drive: { downloadBlob: async () => new Blob() } as never,
    store: { loadLibrary: async () => lib, loadProgress: async () => prog } as never,
    volumesId: 'v',
  };
  return render(
    <SessionContext.Provider value={session}>
      <Home onSignOut={() => {}} />
    </SessionContext.Provider>,
  );
}
const lib = (series: Series[], volumes: Volume[] = []): Library => ({ version: 1, series, volumes });

const width = innerWidth;
afterEach(() => {
  innerWidth = width;
});

test('filtra series con el buscador', async () => {
  renderHome(lib([serie('a', 'Pokémon'), serie('b', 'Berserk')]));
  await screen.findByText('Berserk');
  fireEvent.input(screen.getByPlaceholderText('Buscar serie'), { target: { value: 'pokemon' } });
  expect(screen.getByText('Pokémon')).toBeTruthy();
  expect(screen.queryByText('Berserk')).toBeNull();
});

test('muestra los sin leer en la portada', async () => {
  const progress: ProgressFile = {
    version: 1,
    volumes: { v1: { maxPage: 9, totalPages: 10, finished: true, resetGen: 0, updatedAt: 1, deviceId: 'd' } },
  };
  renderHome(lib([serie('a', 'Batman')], [tomo('v1', 'a', 1), tomo('v2', 'a', 2), tomo('v3', 'a', 3)]), progress);
  const cover = (await screen.findByText('Batman')).closest('a')!;
  expect(cover.querySelector('.badge')!.textContent).toBe('2');
  expect(screen.getByRole('link', { name: /^Batman\s*2 sin leer$/ })).toBe(cover);
});

test('biblioteca vacía invita a subir', async () => {
  renderHome(lib([]));
  expect(await screen.findByText('Subí tu primer cómic')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Series' })).toBeNull();
});

test('nombres largos llevan ellipsis', async () => {
  const name = 'x'.repeat(60);
  renderHome(lib([serie('a', name)]));
  expect((await screen.findByText(name)).classList.contains('ellipsis')).toBe(true);
});

test('seguir leyendo muestra tomo y página', async () => {
  const progress: ProgressFile = {
    version: 1,
    volumes: { v4: { maxPage: 111, totalPages: 180, finished: false, resetGen: 0, updatedAt: 1, deviceId: 'd' } },
  };
  const v = { ...tomo('v4', 'a', 4), label: 'v04' };
  renderHome(lib([serie('a', 'Berserk')], [v]), progress);
  expect(await screen.findByText('Tomo 4 · p. 112/180')).toBeTruthy();
  expect(document.getElementById('seguir')).not.toBeNull();
});

test('en celular Salir está en el menú ⋮', async () => {
  innerWidth = 375;
  dispatchEvent(new Event('resize'));
  renderHome(lib([serie('a', 'Berserk')]));
  await screen.findByText('Berserk');
  expect(screen.queryByText('Salir')).toBeNull();
  fireEvent.click(screen.getByLabelText('Más opciones'));
  await waitFor(() => expect(screen.getByText('Salir')).toBeTruthy());
});

test('biblioteca vacía en PC no muestra buscador ni Subir en la barra', async () => {
  innerWidth = 1280;
  dispatchEvent(new Event('resize'));
  renderHome(lib([]));
  await screen.findByText('Subí tu primer cómic');
  expect(screen.queryByLabelText('Buscar serie')).toBeNull();
  expect(screen.getAllByRole('link', { name: 'Subir' })).toHaveLength(1);
});

test('en celular la lupa abre el buscador con foco, cada vez', async () => {
  innerWidth = 375;
  dispatchEvent(new Event('resize'));
  renderHome(lib([serie('a', 'Berserk')]));
  await screen.findByText('Berserk');
  for (let i = 0; i < 2; i++) {
    fireEvent.click(screen.getByLabelText('Buscar'));
    expect(document.activeElement).toBe(screen.getByLabelText('Buscar serie'));
    fireEvent.click(screen.getByLabelText('Cerrar búsqueda'));
  }
});
