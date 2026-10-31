import { App } from '../app';
import type { Drive } from '../drive';
import { mergeProgress } from '../lib/progress';
import type { Store } from '../store';
import type { Library, ProgressFile, Series, Volume, VolumeProgress } from '../types';

// Maqueta solo para desarrollo (#/dev/mock): biblioteca falsa en memoria, portadas y páginas dibujadas en canvas.
const HUES = [10, 35, 150, 200, 260, 300, 340];
const SPECS: Array<[string, Series['kind'], Series['dir'], Series['mode'], number]> = [
  ['One Piece', 'manga', 'rtl', 'paged', 12],
  ['Berserk', 'manga', 'rtl', 'paged', 6],
  ['Pokémon', 'manga', 'rtl', 'paged', 3],
  ['Una serie con un nombre larguísimo de sesenta caracteres, sí', 'manga', 'rtl', 'paged', 2],
  ['Batman', 'comic', 'ltr', 'paged', 5],
  ['Saga', 'comic', 'ltr', 'paged', 1],
  ['Webtoon Vertical', 'manga', 'ltr', 'vertical', 4],
];
const PAGES = 24;
const now = Date.now();

function build() {
  const series: Series[] = [];
  const volumes: Volume[] = [];
  const progress: ProgressFile = { version: 1, volumes: {} };
  SPECS.forEach(([name, kind, dir, mode, n], si) => {
    const s: Series = { id: `s${si}`, name, kind, dir, mode, createdAt: now - si * 1e6 };
    series.push(s);
    for (let i = 1; i <= n; i++) {
      const id = `s${si}v${i}`;
      volumes.push({
        id, seriesId: s.id, number: i, label: kind === 'manga' ? `v${String(i).padStart(2, '0')}` : `#${String(i).padStart(3, '0')}`,
        pageCount: PAGES, folderId: `f-${id}`, pageFileIds: Array.from({ length: PAGES }, (_, p) => `page:${si}:${i}:${p + 1}`),
        thumbFileId: `cover:${si}:${i}`, uploadedAt: now - (si * 20 + i) * 1e5,
      });
      // tomo 1 terminado, tomo 2 en curso en las primeras series
      const base = { totalPages: PAGES, resetGen: 0, updatedAt: now - si * 3e5 - i * 1e3, deviceId: 'dev' };
      if (si < 5 && i === 1) progress.volumes[id] = { ...base, maxPage: PAGES - 1, finished: true };
      else if (si < 5 && i === 2) progress.volumes[id] = { ...base, maxPage: 5 + si * 3, finished: false };
      else if (si === 6 && i === 1) progress.volumes[id] = { ...base, maxPage: 9, finished: false };
    }
  });
  return { lib: { version: 1, series, volumes } as Library, progress };
}

function draw(w: number, h: number, hue: number, big: string, small: string): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = `hsl(${hue} 55% 38%)`;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.4)';
  g.lineWidth = w / 60;
  g.strokeRect(w / 30, w / 30, w - w / 15, h - w / 15);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.font = `bold ${w / 8}px sans-serif`;
  g.fillText(big, w / 2, h / 2, w * 0.9);
  g.font = `${w / 12}px sans-serif`;
  g.fillText(small, w / 2, h / 2 + w / 7, w * 0.9);
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.8));
}

const { lib, progress } = build();
let state = lib;
const prog = progress;

const drive: Drive = {
  async downloadBlob(id) {
    const [kind, si, v, p] = id.split(':');
    const hue = HUES[Number(si) % HUES.length];
    const name = SPECS[Number(si)][0];
    return kind === 'cover' ? draw(300, 450, hue, name.slice(0, 18), `Tomo ${v}`) : draw(1000, 1500, hue, `Página ${p}`, `${name.slice(0, 24)} · ${v}`);
  },
  findOrCreateFolder: async () => 'dev',
  findFile: async () => null,
  readJson: () => Promise.reject(new Error('maqueta')),
  writeJson: () => Promise.reject(new Error('maqueta')),
  uploadBlob: () => Promise.reject(new Error('maqueta: la subida no está disponible')),
  listChildren: async () => [],
  deleteFile: async () => {},
  trashFile: async () => {},
};
const store: Store = {
  init: async () => ({ rootId: 'dev', volumesId: 'dev' }),
  loadLibrary: async () => structuredClone(state),
  updateLibrary: async (op) => (state = op(structuredClone(state))),
  loadProgress: async () => structuredClone(prog),
  saveProgress: async (id, p: VolumeProgress) => {
    const cur = prog.volumes[id];
    prog.volumes[id] = cur ? mergeProgress(cur, p) : p;
  },
  resetProgress: async (id, totalPages) => {
    prog.volumes[id] = { maxPage: 0, totalPages, finished: false, resetGen: (prog.volumes[id]?.resetGen ?? 0) + 1, updatedAt: Date.now(), deviceId: 'dev' };
  },
  removeProgress: async (ids) => {
    for (const id of ids) delete prog.volumes[id];
  },
};

// El token falso no debe quedar en el navegador: se devuelve el anterior al salir de la página (recarga incluida).
const prevToken = localStorage.getItem('cr.token');
addEventListener('pagehide', () => (prevToken === null ? localStorage.removeItem('cr.token') : localStorage.setItem('cr.token', prevToken)));

export function DevMock() {
  localStorage.setItem('cr.token', JSON.stringify({ accessToken: 'dev', expiresAt: Date.now() + 3600_000 }));
  location.hash = '#/';
  return <App session={{ drive, store, volumesId: 'dev' }} />;
}
