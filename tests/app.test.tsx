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
  render(<App />);
  expect(screen.getByText('Biblioteca')).toBeTruthy();
  fireEvent.click(screen.getByText('Salir'));
  expect(screen.getByText('Entrar con Google')).toBeTruthy();
});
