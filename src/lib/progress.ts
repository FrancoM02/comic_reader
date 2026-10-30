import type { ProgressFile, VolumeProgress } from '../types';

// El progreso nunca retrocede. updatedAt no se usa para resolver conflictos.
export function mergeProgress(a: VolumeProgress, b: VolumeProgress): VolumeProgress {
  if (a.resetGen !== b.resetGen) return a.resetGen > b.resetGen ? a : b;
  const lead = a.maxPage >= b.maxPage ? a : b;
  const newer = a.updatedAt >= b.updatedAt ? a : b;
  return {
    maxPage: lead.maxPage,
    totalPages: lead.totalPages,
    finished: a.finished || b.finished,
    resetGen: a.resetGen,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
    deviceId: newer.deviceId,
  };
}

export function mergeProgressFiles(a: ProgressFile, b: ProgressFile): ProgressFile {
  const volumes: Record<string, VolumeProgress> = { ...a.volumes };
  for (const [id, pb] of Object.entries(b.volumes)) {
    volumes[id] = id in volumes ? mergeProgress(volumes[id], pb) : pb;
  }
  return { version: 1, volumes };
}
