import { render, screen } from '@testing-library/preact';
import { expect, test } from 'vitest';
import { App } from '../src/app';

test('muestra el botón de entrar con Google', () => {
  render(<App />);
  expect(screen.getByText('Entrar con Google')).toBeTruthy();
});
