import type { Drive } from './drive';
import { mergeProgress } from './lib/progress';
import type { Library, ProgressFile, VolumeProgress } from './types';

const ROOT = 'ComicReader';
const LIB = 'library.json';
const PROG = 'progress.json';

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem('cr.deviceId');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('cr.deviceId', id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

export interface Store {
  init(): Promise<{ rootId: string; volumesId: string }>;
  loadLibrary(): Promise<Library>;
  updateLibrary(op: (lib: Library) => Library): Promise<Library>;
  loadProgress(): Promise<ProgressFile>;
  saveProgress(volumeId: string, p: VolumeProgress): Promise<void>;
  resetProgress(volumeId: string, totalPages: number): Promise<void>;
  removeProgress(volumeIds: string[]): Promise<void>;
}

export function createStore(drive: Drive, now: () => number = () => Date.now()): Store {
  let rootId = '';
  let volumesId = '';
  let libId = '';
  let progId = '';

  async function ensureFile(name: string, empty: unknown): Promise<string> {
    return (await drive.findFile(name, rootId)) ?? (await drive.writeJson(name, rootId, empty));
  }

  const ready = () => {
    if (!libId) throw new Error('Store no inicializado: llamar init()');
  };

  const readProgress = () => drive.readJson<ProgressFile>(progId);
  const writeProgress = async (f: ProgressFile) => {
    await drive.writeJson(PROG, rootId, f, progId);
  };

  return {
    async init() {
      rootId = await drive.findOrCreateFolder(ROOT);
      volumesId = await drive.findOrCreateFolder('volumes', rootId);
      libId = await ensureFile(LIB, { version: 1, series: [], volumes: [] } satisfies Library);
      progId = await ensureFile(PROG, { version: 1, volumes: {} } satisfies ProgressFile);
      return { rootId, volumesId };
    },
    async loadLibrary() {
      ready();
      return drive.readJson<Library>(libId);
    },
    async updateLibrary(op) {
      ready();
      const next = op(await drive.readJson<Library>(libId));
      await drive.writeJson(LIB, rootId, next, libId);
      return next;
    },
    async loadProgress() {
      ready();
      return readProgress();
    },
    async saveProgress(volumeId, p) {
      ready();
      const f = await readProgress();
      const cur = f.volumes[volumeId];
      f.volumes[volumeId] = cur ? mergeProgress(cur, p) : p;
      await writeProgress(f);
    },
    async resetProgress(volumeId, totalPages) {
      ready();
      const f = await readProgress();
      f.volumes[volumeId] = {
        maxPage: 0,
        totalPages,
        finished: false,
        resetGen: (f.volumes[volumeId]?.resetGen ?? 0) + 1,
        updatedAt: now(),
        deviceId: getDeviceId(),
      };
      await writeProgress(f);
    },
    async removeProgress(volumeIds) {
      ready();
      const f = await readProgress();
      for (const id of volumeIds) delete f.volumes[id];
      await writeProgress(f);
    },
  };
}
