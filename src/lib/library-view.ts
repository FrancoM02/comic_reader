import type { Library, ProgressFile, Series, Volume, VolumeProgress } from '../types';

export function sortVolumes(vs: Volume[]): Volume[] {
  return [...vs].sort((a, b) => {
    if (a.number === null || b.number === null) {
      if (a.number === b.number) return a.uploadedAt - b.uploadedAt;
      return a.number === null ? 1 : -1;
    }
    return a.number - b.number;
  });
}

export function volumeState(p?: VolumeProgress): 'unread' | 'reading' | 'read' {
  if (!p) return 'unread';
  if (p.finished) return 'read';
  return p.maxPage > 0 ? 'reading' : 'unread';
}

export function nextVolume(lib: Library, volumeId: string): Volume | undefined {
  const cur = lib.volumes.find((x) => x.id === volumeId);
  if (!cur) return undefined;
  const list = sortVolumes(lib.volumes.filter((x) => x.seriesId === cur.seriesId));
  return list[list.findIndex((x) => x.id === volumeId) + 1];
}

export function continueReading(lib: Library, prog: ProgressFile): { volume: Volume; series: Series; pct: number }[] {
  const out: { volume: Volume; series: Series; pct: number; at: number }[] = [];
  for (const [id, p] of Object.entries(prog.volumes)) {
    if (p.maxPage <= 0 || p.finished) continue;
    const volume = lib.volumes.find((x) => x.id === id);
    const series = volume && lib.series.find((x) => x.id === volume.seriesId);
    if (!volume || !series) continue;
    out.push({ volume, series, pct: Math.round(((p.maxPage + 1) / p.totalPages) * 100), at: p.updatedAt });
  }
  return out.sort((a, b) => b.at - a.at).map(({ volume, series, pct }) => ({ volume, series, pct }));
}

/** Etiqueta con la misma convención que parseFilename: `vNN` (tomo) o `#NNN` (número). */
export function makeVolumeLabel(number: number | null, oldLabel: string, kind: Series['kind']): string {
  if (number === null) return '';
  const prefix = oldLabel.startsWith('#') || oldLabel.startsWith('v') ? oldLabel[0] : kind === 'manga' ? 'v' : '#';
  const [int, dec] = String(number).split('.');
  return prefix + int.padStart(prefix === 'v' ? 2 : 3, '0') + (dec !== undefined ? `.${dec}` : '');
}
