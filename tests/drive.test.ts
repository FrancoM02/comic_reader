import { describe, expect, it, vi } from 'vitest';
import { createDrive, DriveError } from '../src/drive';

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const errBody = (reason: string) => ({ error: { errors: [{ reason }] } });

function setup(responses: Response[]) {
  const queue = [...responses];
  const fetchFn = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => queue.shift()!);
  const sleep = vi.fn(async (_ms: number) => {});
  const getToken = vi.fn(async (o?: { forceRefresh?: boolean }) => (o?.forceRefresh ? 'new' : 'old'));
  return { fetchFn, sleep, getToken, drive: createDrive(getToken, fetchFn as unknown as typeof fetch, sleep) };
}

describe('drive', () => {
  it('reintenta 429 con backoff y tiene éxito al 3er intento', async () => {
    const { drive, fetchFn, sleep } = setup([json(429), json(429), json(200, { id: 'x' })]);
    expect(await drive.findFile('a', 'p')).toBe(null);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    const [d1, d2] = sleep.mock.calls.map((c) => c[0]);
    expect(d1).toBeGreaterThanOrEqual(500);
    expect(d2).toBeGreaterThanOrEqual(1000);
    expect(d2).toBeLessThanOrEqual(16000);
  });

  it('reintenta 403 con rateLimit, pero no otros 403', async () => {
    for (const reason of ['rateLimitExceeded', 'userRateLimitExceeded']) {
      const { drive, fetchFn } = setup([json(403, errBody(reason)), json(200, { files: [] })]);
      await drive.findFile('a', 'p');
      expect(fetchFn).toHaveBeenCalledTimes(2);
    }
    const { drive, fetchFn } = setup([json(403, errBody('forbidden'))]);
    await expect(drive.findFile('a', 'p')).rejects.toMatchObject({ status: 403, reason: 'forbidden' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('reintenta 5xx hasta 5 veces y luego lanza error', async () => {
    const { drive, fetchFn } = setup(Array.from({ length: 6 }, () => json(503)));
    const p = drive.deleteFile('f');
    await expect(p).rejects.toBeInstanceOf(DriveError);
    await expect(p).rejects.toMatchObject({ status: 503 });
    expect(fetchFn).toHaveBeenCalledTimes(6);
  });

  it('ante 401 llama getToken({forceRefresh:true}) una vez y reintenta con el token nuevo', async () => {
    const { drive, fetchFn, getToken } = setup([json(401), json(200, { files: [] })]);
    await drive.findFile('a', 'p');
    expect(getToken).toHaveBeenCalledWith({ forceRefresh: true });
    expect(getToken.mock.calls.filter((c) => c[0]?.forceRefresh)).toHaveLength(1);
    const h = (i: number) => (fetchFn.mock.calls[i][1]!.headers as Record<string, string>).Authorization;
    expect(h(0)).toBe('Bearer old');
    expect(h(1)).toBe('Bearer new');
  });

  it('un segundo 401 lanza error', async () => {
    const { drive, getToken } = setup([json(401), json(401)]);
    await expect(drive.findFile('a', 'p')).rejects.toMatchObject({ status: 401 });
    expect(getToken.mock.calls.filter((c) => c[0]?.forceRefresh)).toHaveLength(1);
  });

  it('propaga el error de getToken sin reintentar', async () => {
    const err = new Error('tap');
    const getToken = vi.fn().mockRejectedValue(err);
    const fetchFn = vi.fn();
    const d = createDrive(getToken, fetchFn as unknown as typeof fetch, async () => {});
    await expect(d.findFile('a', 'p')).rejects.toBe(err);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('listChildren sigue nextPageToken hasta agotar', async () => {
    const { drive, fetchFn } = setup([
      json(200, { files: [{ id: '1', name: 'a', mimeType: 'm' }], nextPageToken: 'T' }),
      json(200, { files: [{ id: '2', name: 'b', mimeType: 'm' }] }),
    ]);
    const r = await drive.listChildren('F');
    expect(r.map((f) => f.id)).toEqual(['1', '2']);
    expect(String(fetchFn.mock.calls[1][0])).toContain('pageToken=T');
  });

  it('findOrCreateFolder no crea si ya existe, escapa comillas y filtra trashed', async () => {
    const { drive, fetchFn } = setup([json(200, { files: [{ id: 'F1' }] })]);
    expect(await drive.findOrCreateFolder("it's", 'P')).toBe('F1');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const q = new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('q')!;
    expect(q).toContain("name='it\\'s'");
    expect(q).toContain("'P' in parents");
    expect(q).toContain('trashed=false');
  });

  it('findOrCreateFolder crea si no existe', async () => {
    const { drive, fetchFn } = setup([json(200, { files: [] }), json(200, { id: 'N' })]);
    expect(await drive.findOrCreateFolder('c')).toBe('N');
    const init = fetchFn.mock.calls[1][1]!;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({
      name: 'c',
      mimeType: 'application/vnd.google-apps.folder',
    });
  });

  it('writeJson crea (multipart) o actualiza (PATCH media)', async () => {
    const { drive, fetchFn } = setup([json(200, { id: 'a' }), json(200, { id: 'b' })]);
    expect(await drive.writeJson('x.json', 'P', { k: 1 })).toBe('a');
    expect(String(fetchFn.mock.calls[0][0])).toContain('/upload/drive/v3/files?uploadType=multipart');
    expect(await drive.writeJson('x.json', 'P', { k: 2 }, 'b')).toBe('b');
    expect(String(fetchFn.mock.calls[1][0])).toContain('/upload/drive/v3/files/b?uploadType=media');
    expect(fetchFn.mock.calls[1][1]!.method).toBe('PATCH');
  });

  it('readJson, downloadBlob y deleteFile', async () => {
    const { drive, fetchFn } = setup([json(200, { a: 1 }), new Response('zz', { status: 200 }), new Response(null, { status: 204 })]);
    expect(await drive.readJson('f')).toEqual({ a: 1 });
    expect(String(fetchFn.mock.calls[0][0])).toContain('alt=media');
    const b = await drive.downloadBlob('f');
    expect(await b.text()).toBe('zz');
    await drive.deleteFile('f');
    expect(fetchFn.mock.calls[2][1]!.method).toBe('DELETE');
  });

  it('uploadBlob usa multipart', async () => {
    const { drive, fetchFn } = setup([json(200, { id: 'u' })]);
    expect(await drive.uploadBlob('p.jpg', 'P', new Blob(['x'], { type: 'image/jpeg' }))).toBe('u');
    expect(String(fetchFn.mock.calls[0][0])).toContain('uploadType=multipart');
  });
});
