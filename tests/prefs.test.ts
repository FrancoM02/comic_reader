import { beforeEach, expect, test } from 'vitest';
import { getDoublePref, setDoublePref } from '../src/lib/prefs';

beforeEach(() => localStorage.clear());

test('doble página: por defecto auto, se guarda nunca', () => {
  expect(getDoublePref()).toBe('auto');
  setDoublePref('nunca');
  expect(getDoublePref()).toBe('nunca');
});
