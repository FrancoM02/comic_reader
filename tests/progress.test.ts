import { describe, it, expect } from 'vitest';
import { mergeProgress, mergeProgressFiles } from '../src/lib/progress';
import type { VolumeProgress } from '../src/types';

const p = (o: Partial<VolumeProgress> = {}): VolumeProgress => ({
  maxPage: 0, totalPages: 100, finished: false, resetGen: 0, updatedAt: 0, deviceId: 'a', ...o,
});

describe('mergeProgress', () => {
  it('misma resetGen: gana maxPage mayor aunque su updatedAt sea más viejo', () => {
    const phone = p({ maxPage: 50, updatedAt: 100, deviceId: 'phone' });
    const tablet = p({ maxPage: 10, updatedAt: 200, deviceId: 'tablet' });
    const r = mergeProgress(tablet, phone);
    expect(r.maxPage).toBe(50);
    expect(mergeProgress(phone, tablet).maxPage).toBe(50);
    expect(r.updatedAt).toBe(200);
    expect(r.deviceId).toBe('tablet');
  });
  it('finished true en cualquiera de los dos → true', () => {
    expect(mergeProgress(p({ finished: true }), p()).finished).toBe(true);
    expect(mergeProgress(p(), p({ finished: true })).finished).toBe(true);
  });
  it('resetGen mayor gana aunque su maxPage sea menor', () => {
    const reset = p({ resetGen: 2, maxPage: 0, finished: false, updatedAt: 5 });
    const old = p({ resetGen: 1, maxPage: 90, finished: true, updatedAt: 999 });
    expect(mergeProgress(old, reset)).toEqual(reset);
    expect(mergeProgress(reset, old)).toEqual(reset);
  });
  it('updatedAt del resultado = max de ambos', () => {
    expect(mergeProgress(p({ updatedAt: 3 }), p({ updatedAt: 8 })).updatedAt).toBe(8);
  });
});

describe('mergeProgressFiles', () => {
  it('une claves presentes en uno solo', () => {
    const r = mergeProgressFiles(
      { version: 1, volumes: { a: p({ maxPage: 1 }), c: p({ maxPage: 5 }) } },
      { version: 1, volumes: { b: p({ maxPage: 2 }), c: p({ maxPage: 9 }) } },
    );
    expect(Object.keys(r.volumes).sort()).toEqual(['a', 'b', 'c']);
    expect(r.volumes.c.maxPage).toBe(9);
  });
});
