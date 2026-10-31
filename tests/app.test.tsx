import { fireEvent, render, screen } from '@testing-library/preact';
import { beforeEach, expect, test } from 'vitest';
import { App } from '../src/app';

beforeEach(() => localStorage.clear());

test('muestra el botón de entrar con Google', () => {
  render(<App />);
  expect(screen.getByText('Entrar con Google')).toBeTruthy();
});

test('con sesión muestra la biblioteca y Salir vuelve al login', () => {
  localStorage.setItem('cr.token', JSON.stringify({ accessToken: 't', expiresAt: Date.now() + 3600_000 }));
  render(<App session={{ drive: {} as never, store: { loadLibrary: async () => ({ version: 1, series: [], volumes: [] }), loadProgress: async () => ({ version: 1, volumes: {} }) } as never, volumesId: 'v' }} />);
  expect(screen.getByRole('heading', { name: 'Biblioteca' })).toBeTruthy();
  for (const a of screen.getAllByText('Subir')) expect(a.closest('a')!.getAttribute('href')).toBe('#/upload');
  fireEvent.click(screen.getByText('Salir'));
  expect(screen.getByText('Entrar con Google')).toBeTruthy();
});
