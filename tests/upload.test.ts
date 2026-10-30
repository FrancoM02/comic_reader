import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setBusy } from '../src/auth';

vi.mock('../src/auth', async (orig) => {
  const a = await orig<typeof import('../src/auth')>();
  return { ...a, setBusy: vi.fn(a.setBusy) };
});
import { cleanupOrphans, deleteSeries, deleteVolume, findDuplicate, uploadVolume } from '../src/upload';
import { createStore } from '../src/store';
import type { Drive, DriveFile } from '../src/drive';
import type { Library, Volume } from '../src/types';

type Node = { id: string; name: string; parent?: string; folder: boolean; data?: unknown; createdTime?: string };

function fakeDrive(opts: { delay?: boolean } = {}) {
  let n = 0;
  const nodes = new Map<string, Node>();
  const stats = { inflight: 0, maxInflight: 0, uploads: [] as string[], deleted: [] as string[], trashed: [] as string[] };
  const drive: Drive = {
    async findOrCreateFolder(name, parentId) {
      for (const x of nodes.values()) if (x.folder && x.name === name && x.parent === parentId) return x.id;
      const id = `id${++n}`;
      nodes.set(id, { id, name, parent: parentId, folder: true, createdTime: new Date().toISOString() });
      return id;
    },
    async findFile(name, parentId) {
      for (const x of nodes.values()) if (!x.folder && x.name === name && x.parent === parentId) return x.id;
      return null;
    },
    async readJson<T>(id: string) {
      return structuredClone(nodes.get(id)!.data) as T;
    },
    async writeJson(name, parentId, data, fileId) {
      const id = fileId ?? `id${++n}`;
      nodes.set(id, { id, name, parent: parentId, folder: false, data: structuredClone(data) });
      return id;
    },
    async uploadBlob(name, parentId) {
      stats.inflight++;
      stats.maxInflight = Math.max(stats.maxInflight, stats.inflight);
      if (opts.delay) await new Promise((r) => setTimeout(r, 5));
      stats.inflight--;
      const id = `id${++n}`;
      nodes.set(id, { id, name, parent: parentId, folder: false });
      stats.uploads.push(name);
      return id;
    },
    async downloadBlob() { return new Blob(); },
    async listChildren(folderId): Promise<DriveFile[]> {
      return [...nodes.values()].filter((x) => x.parent === folderId).map((x) => ({ id: x.id, name: x.name, mimeType: x.folder ? 'application/vnd.google-apps.folder' : 'x', createdTime: x.createdTime }));
    },
    async deleteFile(id) {
      stats.deleted.push(id);
      nodes.delete(id);
    },
    async trashFile(id) {
      stats.trashed.push(id);
      nodes.delete(id);
    },
  };
  return { drive, nodes, stats };
}

const pageBlob = (type: string) => new Blob(['x'], { type });
function fakeExtract(total: number, type = 'image/jpeg') {
  return async () => ({
    total,
    pages: (async function* () {
      for (let i = 0; i < total; i++) yield { index: i, blob: pageBlob(i === 1 ? 'image/png' : type) };
    })(),
  });
}
const fakeThumb = async () => new Blob(['t'], { type: 'image/jpeg' });
const file = new File(['z'], 'x.cbz');

async function setup(opts: { delay?: boolean } = {}) {
  const f = fakeDrive(opts);
  const store = createStore(f.drive);
  const { volumesId } = await store.init();
  return { ...f, store, deps: { drive: f.drive, store, volumesId, extract: fakeExtract(7), thumb: fakeThumb } };
}

const vol = (o: Partial<Volume>): Volume => ({
  id: 'v', seriesId: 's', number: 1, label: 'T01', pageCount: 1, folderId: 'f', pageFileIds: [], thumbFileId: 't', uploadedAt: 0, ...o,
});

beforeEach(() => localStorage.clear());

describe('uploadVolume', () => {
  it('sube páginas con concurrencia máxima 3 y escribe library.json sólo al final', async () => {
    const { deps, stats, store, nodes } = await setup({ delay: true });
    let libAtFirstUpload: Library | null = null;
    const orig = deps.drive.uploadBlob;
    deps.drive.uploadBlob = async (...a) => {
      libAtFirstUpload ??= await store.loadLibrary();
      return orig(...a);
    };
    const progress: number[] = [];
    const v = await uploadVolume(
      { file, seriesId: 'S1', newSeries: { name: 'Berserk', kind: 'manga' }, number: 1, label: 'T01' },
      deps,
      (d) => progress.push(d),
    );
    expect(stats.maxInflight).toBe(3);
    expect(libAtFirstUpload!.volumes).toEqual([]);
    expect(libAtFirstUpload!.series).toEqual([]);
    expect(stats.uploads).toContain('0001.jpg');
    expect(stats.uploads).toContain('0002.png');
    expect(stats.uploads).toContain('thumb.jpg');
    expect(v.pageCount).toBe(7);
    expect(v.pageFileIds).toHaveLength(7);
    expect(nodes.get(v.pageFileIds[1])!.name).toBe('0002.png');
    expect(nodes.get(v.folderId)!.name).toBe(v.id);
    expect(progress[progress.length - 1]).toBe(7);
    const lib = await store.loadLibrary();
    expect(lib.volumes).toHaveLength(1);
    expect(lib.series[0]).toMatchObject({ id: 'S1', name: 'Berserk', kind: 'manga', dir: 'rtl', mode: 'paged' });
  });

  it("durante la subida existe localStorage 'cr.pendingUpload'; al terminar se borra", async () => {
    const { deps } = await setup();
    let seen: unknown = null;
    const orig = deps.drive.uploadBlob;
    deps.drive.uploadBlob = async (...a) => {
      seen ??= JSON.parse(localStorage.getItem('cr.pendingUpload')!);
      return orig(...a);
    };
    const v = await uploadVolume({ file, seriesId: 'S', newSeries: { name: 'A', kind: 'comic' }, number: 1, label: 'x' }, deps, () => {});
    expect(seen).toEqual({ folderId: v.folderId, fileName: 'x.cbz' });
    expect(localStorage.getItem('cr.pendingUpload')).toBeNull();
  });

  it('con replaceVolumeId, al terminar se elimina el tomo viejo, su carpeta y su progreso', async () => {
    const { deps, store, drive, stats } = await setup();
    const oldFolder = await drive.findOrCreateFolder('old', deps.volumesId);
    await store.updateLibrary((l) => ({
      ...l,
      series: [{ id: 'S', name: 'A', kind: 'comic', dir: 'ltr', mode: 'paged', createdAt: 0 }],
      volumes: [vol({ id: 'old', seriesId: 'S', folderId: oldFolder })],
    }));
    await store.resetProgress('old', 10);
    const v = await uploadVolume({ file, seriesId: 'S', number: 1, label: 'T01', replaceVolumeId: 'old' }, deps, () => {});
    const lib = await store.loadLibrary();
    expect(lib.volumes.map((x) => x.id)).toEqual([v.id]);
    expect(stats.deleted).toContain(oldFolder);
    expect((await store.loadProgress()).volumes.old).toBeUndefined();
  });

  it('si falla no toca library.json y deja el marcador', async () => {
    const { deps, store } = await setup();
    deps.drive.uploadBlob = async () => { throw new Error('boom'); };
    await expect(uploadVolume({ file, seriesId: 'S', newSeries: { name: 'A', kind: 'comic' }, number: 1, label: 'x' }, deps, () => {})).rejects.toThrow('boom');
    expect((await store.loadLibrary()).series).toEqual([]);
    expect(localStorage.getItem('cr.pendingUpload')).not.toBeNull();
  });
});

describe('uploadVolume: errores', () => {
  it('si falla una página, no empiezan más subidas y setBusy(false) va después de frenar todo', async () => {
    const { deps } = await setup({ delay: true });
    const calls: string[] = [];
    const orig = deps.drive.uploadBlob;
    let started = 0;
    deps.drive.uploadBlob = async (name, ...a) => {
      const n = ++started;
      calls.push(name);
      if (n === 2) throw new Error('boom');
      return orig(name, ...a);
    };
    vi.mocked(setBusy).mockClear();
    await expect(uploadVolume({ file, seriesId: 'S', newSeries: { name: 'A', kind: 'comic' }, number: 1, label: 'x' }, deps, () => {})).rejects.toThrow('boom');
    const after = calls.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.length).toBe(after);
    expect(after).toBeLessThan(7);
    expect(vi.mocked(setBusy).mock.calls.map((c) => c[0])).toEqual([true, false]);
  });

  it('si la carpeta desapareció antes de confirmar, falla y no toca library.json', async () => {
    const { deps, store, nodes } = await setup();
    const orig = deps.drive.uploadBlob;
    deps.drive.uploadBlob = async (name, parent, b) => {
      const id = await orig(name, parent, b);
      if (name === 'thumb.jpg') nodes.delete(parent);
      return id;
    };
    await expect(uploadVolume({ file, seriesId: 'S', newSeries: { name: 'A', kind: 'comic' }, number: 1, label: 'x' }, deps, () => {})).rejects.toThrow('desapareció');
    expect((await store.loadLibrary()).volumes).toEqual([]);
  });
});

describe('findDuplicate', () => {
  const lib: Library = { version: 1, series: [], volumes: [vol({ id: 'a', number: 1 }), vol({ id: 'b', number: null })] };
  it('encuentra mismo seriesId+number; number null nunca es duplicado', () => {
    expect(findDuplicate(lib, 's', 1)?.id).toBe('a');
    expect(findDuplicate(lib, 's', 2)).toBeUndefined();
    expect(findDuplicate(lib, 'otra', 1)).toBeUndefined();
    expect(findDuplicate(lib, 's', null)).toBeUndefined();
  });
});

describe('cleanupOrphans', () => {
  const age = (nodes: Map<string, Node>, id: string, h: number) => {
    nodes.get(id)!.createdTime = new Date(Date.now() - h * 3600_000).toISOString();
  };

  it('manda a la papelera la carpeta de pendingUpload (sin borrar) y devuelve el fileName', async () => {
    const { deps, drive, store, stats } = await setup();
    const keep = await drive.findOrCreateFolder('keep', deps.volumesId);
    const orphan = await drive.findOrCreateFolder('orphan', deps.volumesId);
    await store.updateLibrary((l) => ({ ...l, volumes: [vol({ id: 'keep', folderId: keep })] }));
    localStorage.setItem('cr.pendingUpload', JSON.stringify({ folderId: orphan, fileName: 'a.cbz' }));
    const names = await cleanupOrphans(deps);
    expect(names).toEqual(['a.cbz']);
    expect(stats.trashed).toEqual([orphan]);
    expect(stats.deleted).toEqual([]);
    expect(localStorage.getItem('cr.pendingUpload')).toBeNull();
  });

  it('sin pendingUpload no devuelve nombres pero igual manda a la papelera las huérfanas viejas incompletas', async () => {
    const { deps, drive, stats, nodes } = await setup();
    const orphan = await drive.findOrCreateFolder('orphan', deps.volumesId);
    await drive.uploadBlob('0001.jpg', orphan, new Blob());
    age(nodes, orphan, 25);
    expect(await cleanupOrphans(deps)).toEqual([]);
    expect(stats.trashed).toEqual([orphan]);
    expect(stats.deleted).toEqual([]);
  });

  it('una carpeta vieja sin listar pero con thumb.jpg (subida completa) se deja', async () => {
    const { deps, drive, stats, nodes } = await setup();
    const done = await drive.findOrCreateFolder('done', deps.volumesId);
    await drive.uploadBlob('0001.jpg', done, new Blob());
    await drive.uploadBlob('thumb.jpg', done, new Blob());
    age(nodes, done, 48);
    expect(await cleanupOrphans(deps)).toEqual([]);
    expect(stats.trashed).toEqual([]);
    expect(stats.deleted).toEqual([]);
    expect(nodes.has(done)).toBe(true);
  });

  it('una carpeta sin listar y joven (otro dispositivo subiendo) se conserva', async () => {
    const { deps, drive, stats } = await setup();
    await drive.findOrCreateFolder('young', deps.volumesId);
    expect(await cleanupOrphans(deps)).toEqual([]);
    expect(stats.deleted).toEqual([]);
    expect(stats.trashed).toEqual([]);
  });
});

describe('uploadVolume: verificación de library.json', () => {
  const args = { file, seriesId: 'S', newSeries: { name: 'A', kind: 'comic' as const }, number: 1, label: 'x' };

  it('si otro dispositivo pisó la escritura, reintenta updateLibrary una vez', async () => {
    const { deps, store } = await setup();
    const orig = store.updateLibrary.bind(store);
    const update = vi.spyOn(store, 'updateLibrary');
    let first = true;
    update.mockImplementation(async (op) => {
      const r = await orig(op);
      if (first) {
        first = false;
        await orig((l) => ({ ...l, volumes: [] })); // escritura perdida
      }
      return r;
    });
    const v = await uploadVolume(args, deps, () => {});
    expect(update).toHaveBeenCalledTimes(2);
    expect((await store.loadLibrary()).volumes.map((x) => x.id)).toEqual([v.id]);
    expect(localStorage.getItem('cr.pendingUpload')).toBeNull();
  });

  it('si el tomo sigue sin aparecer tras el reintento, falla', async () => {
    const { deps, store } = await setup();
    const orig = store.updateLibrary.bind(store);
    const update = vi.spyOn(store, 'updateLibrary').mockImplementation(async (op) => {
      const r = await orig(op);
      await orig((l) => ({ ...l, volumes: [] }));
      return r;
    });
    await expect(uploadVolume(args, deps, () => {})).rejects.toThrow('No se pudo registrar');
    expect(update).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('cr.pendingUpload')).not.toBeNull();
  });

  it('si falla borrar el tomo reemplazado, la subida igual sale bien (console.warn)', async () => {
    const { deps, store } = await setup();
    await store.updateLibrary((l) => ({
      ...l,
      series: [{ id: 'S', name: 'A', kind: 'comic', dir: 'ltr', mode: 'paged', createdAt: 0 }],
      volumes: [vol({ id: 'old', seriesId: 'S', folderId: 'OLD' })],
    }));
    deps.drive.deleteFile = async () => { throw new Error('red'); };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const v = await uploadVolume({ file, seriesId: 'S', number: 1, label: 'T01', replaceVolumeId: 'old' }, deps, () => {});
    expect((await store.loadLibrary()).volumes.map((x) => x.id)).toEqual([v.id]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('delete', () => {
  it('deleteVolume borra carpeta, tomo y progreso', async () => {
    const { deps, store, stats } = await setup();
    await store.updateLibrary((l) => ({ ...l, volumes: [vol({ id: 'a', folderId: 'FA' })] }));
    await store.resetProgress('a', 3);
    await deleteVolume('a', deps);
    expect((await store.loadLibrary()).volumes).toEqual([]);
    expect(stats.deleted).toEqual(['FA']);
    expect((await store.loadProgress()).volumes.a).toBeUndefined();
  });

  it('deleteSeries borra todas las carpetas de sus tomos y la serie', async () => {
    const { deps, store, stats } = await setup();
    const s = (id: string) => ({ id, name: id, kind: 'comic' as const, dir: 'ltr' as const, mode: 'paged' as const, createdAt: 0 });
    await store.updateLibrary((l) => ({
      ...l,
      series: [s('S'), s('T')],
      volumes: [vol({ id: 'a', seriesId: 'S', folderId: 'FA' }), vol({ id: 'b', seriesId: 'S', folderId: 'FB' }), vol({ id: 'c', seriesId: 'T', folderId: 'FC' })],
    }));
    await deleteSeries('S', deps);
    const lib = await store.loadLibrary();
    expect(lib.series.map((x) => x.id)).toEqual(['T']);
    expect(lib.volumes.map((x) => x.id)).toEqual(['c']);
    expect(stats.deleted.sort()).toEqual(['FA', 'FB']);
  });
});
