import { expect, test } from 'vitest';
import { continueReading, nextVolume, sortVolumes, volumeState } from '../src/lib/library-view';
import type { Library, Series, Volume, VolumeProgress } from '../src/types';

const s = (id: string): Series => ({ id, name: id, kind: 'manga', dir: 'rtl', mode: 'paged', createdAt: 0 });
const v = (id: string, number: number | null, seriesId = 's1', uploadedAt = 0): Volume => ({
  id, seriesId, number, label: '', pageCount: 10, folderId: 'f', pageFileIds: [], thumbFileId: 't', uploadedAt,
});
const p = (o: Partial<VolumeProgress>): VolumeProgress => ({ maxPage: 0, totalPages: 10, finished: false, resetGen: 0, updatedAt: 0, deviceId: 'd', ...o });

test('sortVolumes: números ascendentes, null al final por uploadedAt', () => {
  const r = sortVolumes([v('3', 3), v('n2', null, 's1', 20), v('1', 1), v('n1', null, 's1', 10), v('2.5', 2.5)]);
  expect(r.map((x) => x.id)).toEqual(['1', '2.5', '3', 'n1', 'n2']);
});

test('volumeState', () => {
  expect(volumeState(undefined)).toBe('unread');
  expect(volumeState(p({ maxPage: 0 }))).toBe('unread');
  expect(volumeState(p({ maxPage: 4 }))).toBe('reading');
  expect(volumeState(p({ maxPage: 9, finished: true }))).toBe('read');
});

test('nextVolume: siguiente en orden dentro de la serie', () => {
  const lib: Library = { version: 1, series: [s('s1'), s('s2')], volumes: [v('b', 2), v('a', 1), v('x', 1, 's2')] };
  expect(nextVolume(lib, 'a')?.id).toBe('b');
  expect(nextVolume(lib, 'b')).toBeUndefined();
  expect(nextVolume(lib, 'nope')).toBeUndefined();
});

test('continueReading: en curso, por updatedAt desc, con pct', () => {
  const lib: Library = { version: 1, series: [s('s1')], volumes: [v('a', 1), v('b', 2), v('c', 3), v('d', 4)] };
  const prog = {
    version: 1 as const,
    volumes: {
      a: p({ maxPage: 4, updatedAt: 1 }),
      b: p({ maxPage: 9, finished: true, updatedAt: 5 }),
      c: p({ maxPage: 0, updatedAt: 9 }),
      d: p({ maxPage: 1, updatedAt: 7 }),
      gone: p({ maxPage: 3, updatedAt: 8 }),
    },
  };
  const r = continueReading(lib, prog);
  expect(r.map((x) => x.volume.id)).toEqual(['d', 'a']);
  expect(r[1].pct).toBe(50);
  expect(r[0].series.id).toBe('s1');
});

import { makeVolumeLabel } from '../src/lib/library-view';
test('makeVolumeLabel', () => {
  expect(makeVolumeLabel(3, 'v01', 'manga')).toBe('v03');
  expect(makeVolumeLabel(2.5, '#001', 'comic')).toBe('#002.5');
  expect(makeVolumeLabel(7, '', 'comic')).toBe('#007');
  expect(makeVolumeLabel(7, '', 'manga')).toBe('v07');
  expect(makeVolumeLabel(null, 'v01', 'manga')).toBe('');
});
