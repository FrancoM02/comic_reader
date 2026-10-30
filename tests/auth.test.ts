import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { redirectTransport } from '../src/auth-transports';
import { getToken, initAuth, isSignedIn, signIn, signOut, type TokenTransport } from '../src/auth';

let n = 0;
function fakeTransport(expiresIn = 3600): TokenTransport & { request: ReturnType<typeof vi.fn> } {
  return {
    request: vi.fn(async () => ({ accessToken: `tok${++n}`, expiresIn })),
  };
}

beforeEach(() => {
  localStorage.clear();
  n = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});
afterEach(() => vi.useRealTimers());

test('signIn guarda la sesión y getToken devuelve el token cacheado si vence en más de 5 min', async () => {
  const t = fakeTransport();
  await initAuth('cid', t);
  expect(isSignedIn()).toBe(false);
  await signIn();
  expect(isSignedIn()).toBe(true);
  vi.setSystemTime(Date.now() + 50 * 60_000);
  expect(await getToken()).toBe('tok1');
  expect(t.request).toHaveBeenCalledTimes(1);
});

test('getToken renueva si vence en menos de 5 min', async () => {
  const t = fakeTransport();
  await initAuth('cid', t);
  await signIn();
  vi.setSystemTime(Date.now() + 56 * 60_000);
  expect(await getToken()).toBe('tok2');
  expect(t.request).toHaveBeenLastCalledWith(false);
});

test('getToken({forceRefresh:true}) siempre renueva', async () => {
  const t = fakeTransport();
  await initAuth('cid', t);
  await signIn();
  expect(await getToken({ forceRefresh: true })).toBe('tok2');
});

test('dos llamadas concurrentes a getToken disparan una sola renovación', async () => {
  const t = fakeTransport();
  await initAuth('cid', t);
  await signIn();
  const [a, b] = await Promise.all([getToken({ forceRefresh: true }), getToken({ forceRefresh: true })]);
  expect(a).toBe(b);
  expect(t.request).toHaveBeenCalledTimes(2);
});

test('signOut borra la sesión', async () => {
  const t = fakeTransport();
  await initAuth('cid', t);
  await signIn();
  signOut();
  expect(isSignedIn()).toBe(false);
  await expect(getToken()).rejects.toThrow();
});

test('la sesión sobrevive a un nuevo initAuth (localStorage)', async () => {
  await initAuth('cid', fakeTransport());
  await signIn();
  await initAuth('cid', fakeTransport());
  expect(isSignedIn()).toBe(true);
  expect(await getToken()).toBe('tok1');
});

test('redirect: al volver con #access_token valida state, guarda token y restaura la ruta', async () => {
  sessionStorage.setItem('cr.oauth.state', 'abc');
  sessionStorage.setItem('cr.oauth.route', '#/lector/1');
  history.replaceState(null, '', '/#access_token=XYZ&expires_in=3599&state=abc&token_type=Bearer');
  await initAuth('cid', redirectTransport('cid'));
  expect(location.hash).toBe('#/lector/1');
  expect(await getToken()).toBe('XYZ');
});

test('redirect: state que no coincide se descarta', async () => {
  sessionStorage.setItem('cr.oauth.state', 'abc');
  history.replaceState(null, '', '/#access_token=XYZ&expires_in=3599&state=otro');
  await initAuth('cid', redirectTransport('cid'));
  expect(isSignedIn()).toBe(false);
  expect(location.hash).toBe('');
});
