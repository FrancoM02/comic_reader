import { afterEach, expect, test, vi } from 'vitest';
import worker, { type Env } from '../worker/index';

const env: Env = { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec', APP_URL: 'https://app.example/cr/' };
const W = 'https://w.example';

function googleReplies(status: number, body: object) {
  const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', f);
  return f;
}
afterEach(() => vi.unstubAllGlobals());

test('/login manda a Google pidiendo offline y reenvía el state', async () => {
  const r = await worker.fetch(new Request(`${W}/login?state=abc`), env);
  const loc = new URL(r.headers.get('Location')!);
  expect(loc.origin).toBe('https://accounts.google.com');
  expect(loc.searchParams.get('access_type')).toBe('offline');
  expect(loc.searchParams.get('redirect_uri')).toBe(`${W}/callback`);
  expect(loc.searchParams.get('state')).toBe('abc');
});

test('/callback canjea el código con el secret y vuelve solo a APP_URL', async () => {
  const f = googleReplies(200, { access_token: 'A', expires_in: 3599, refresh_token: 'RT' });
  const r = await worker.fetch(new Request(`${W}/callback?code=C&state=abc`), env);
  const body = new URLSearchParams(f.mock.calls[0][1]!.body as URLSearchParams);
  expect(body.get('client_secret')).toBe('sec');
  expect(body.get('code')).toBe('C');
  const loc = r.headers.get('Location')!;
  expect(loc.startsWith('https://app.example/cr/#')).toBe(true);
  const back = new URLSearchParams(loc.split('#')[1]);
  expect(Object.fromEntries(back)).toEqual({ state: 'abc', access_token: 'A', expires_in: '3599', refresh_token: 'RT' });
});

test('/callback con error de Google lo pasa a la app', async () => {
  const r = await worker.fetch(new Request(`${W}/callback?error=access_denied&state=abc`), env);
  expect(new URLSearchParams(r.headers.get('Location')!.split('#')[1]).get('error')).toBe('access_denied');
});

test('/refresh: ok, invalid_grant = 401, Google caído = 502, CORS solo para la app', async () => {
  const post = (b: object) => new Request(`${W}/refresh`, { method: 'POST', body: JSON.stringify(b) });
  googleReplies(200, { access_token: 'B', expires_in: 3600 });
  let r = await worker.fetch(post({ refresh_token: 'RT' }), env);
  expect(await r.json()).toEqual({ access_token: 'B', expires_in: 3600 });
  expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example');
  googleReplies(400, { error: 'invalid_grant' });
  expect((await worker.fetch(post({ refresh_token: 'RT' }), env)).status).toBe(401);
  googleReplies(503, {});
  expect((await worker.fetch(post({ refresh_token: 'RT' }), env)).status).toBe(502);
  expect((await worker.fetch(post({}), env)).status).toBe(400);
});
