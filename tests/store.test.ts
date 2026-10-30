import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, getDeviceId } from '../src/store';
import type { Drive, DriveFile } from '../src/drive';
import type { Library, Volume, VolumeProgress } from '../src/types';

function fakeDrive() {
  let n = 0;
  const nodes = new Map<string, { id: string; name: string; parent?: string; folder: boolean; data?: unknown }>();
  const drive: Drive = {
    async findOrCreateFolder(name, parentId) {
      for (const x of nodes.values()) if (x.folder && x.name === name && x.parent === parentId) return x.id;
      const id = `id${++n}`;
      nodes.set(id, { id, name, parent: parentId, folder: true });
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
    async uploadBlob() { return 'x'; },
    async downloadBlob() { return new Blob(); },
    async listChildren(): Promise<DriveFile[]> { return []; },
    async deleteFile() {},
  };
  return { drive, nodes };
}

const vol = (id: string): Volume => ({
  id, seriesId: 's', number: 1, label: id, pageCount: 1, folderId: 'f', pageFileIds: [], thumbFileId: 't', uploadedAt: 0,
});
const prog = (o: Partial<VolumeProgress> = {}): VolumeProgress => ({
  maxPage: 0, totalPages: 100, finished: false, resetGen: 0, updatedAt: 0, deviceId: 'x', ...o,
});

describe('store', () => {
  let h: ReturnType<typeof fakeDrive>;
  beforeEach(() => { h = fakeDrive(); localStorage.clear(); });

  it('init en Drive vacío crea carpetas y JSON; segunda llamada no duplica', async () => {
    const s = createStore(h.drive);
    const a = await s.init();
    const count = h.nodes.size;
    expect(count).toBe(4);
    const b = await s.init();
    expect(b).toEqual(a);
    expect(h.nodes.size).toBe(count);
    expect(await s.loadLibrary()).toEqual({ version: 1, series: [], volumes: [] });
    expect(await s.loadProgress()).toEqual({ version: 1, volumes: {} });
    const s2 = createStore(h.drive);
    await s2.init();
    expect(h.nodes.size).toBe(count);
  });

  it('updateLibrary relee el remoto: ops de dos clientes se conservan', async () => {
    const pc = createStore(h.drive);
    const phone = createStore(h.drive);
    await pc.init();
    await phone.init();
    await pc.updateLibrary((l) => ({ ...l, volumes: [...l.volumes, vol('B')] }));
    await phone.loadLibrary();
    await pc.updateLibrary((l) => ({ ...l, volumes: [...l.volumes, vol('A')] }));
    const lib: Library = await phone.updateLibrary((l) => ({ ...l, volumes: l.volumes.filter((v) => v.id !== 'B') }));
    expect(lib.volumes.map((v) => v.id)).toEqual(['A']);
    expect((await pc.loadLibrary()).volumes.map((v) => v.id)).toEqual(['A']);
  });

  it('saveProgress no baja maxPage si el remoto ya tiene uno mayor', async () => {
    const s = createStore(h.drive);
    await s.init();
    await s.saveProgress('v', prog({ maxPage: 50 }));
    await s.saveProgress('v', prog({ maxPage: 10, updatedAt: 99 }));
    expect((await s.loadProgress()).volumes.v.maxPage).toBe(50);
  });

  it('resetProgress luego de saveProgress con página vieja de otro device → queda en 0', async () => {
    const s = createStore(h.drive, () => 1000);
    await s.init();
    await s.saveProgress('v', prog({ maxPage: 50, finished: true }));
    await s.resetProgress('v', 120);
    let v = (await s.loadProgress()).volumes.v;
    expect(v).toMatchObject({ maxPage: 0, finished: false, resetGen: 1, totalPages: 120, updatedAt: 1000 });
    expect(v.deviceId).toBe(getDeviceId());
    await s.saveProgress('v', prog({ maxPage: 60, resetGen: 0, deviceId: 'stale' }));
    v = (await s.loadProgress()).volumes.v;
    expect(v.maxPage).toBe(0);
    expect(v.resetGen).toBe(1);
  });

  it('removeProgress borra las claves indicadas', async () => {
    const s = createStore(h.drive);
    await s.init();
    await s.saveProgress('a', prog({ maxPage: 1 }));
    await s.saveProgress('b', prog({ maxPage: 2 }));
    await s.removeProgress(['a', 'zzz']);
    expect(Object.keys((await s.loadProgress()).volumes)).toEqual(['b']);
  });

  it('getDeviceId persiste un UUID en localStorage', () => {
    const id = getDeviceId();
    expect(id.length).toBeGreaterThan(8);
    expect(localStorage.getItem('cr.deviceId')).toBe(id);
    expect(getDeviceId()).toBe(id);
  });
});
