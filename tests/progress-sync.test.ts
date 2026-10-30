import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/preact';
import { savePayload, startPage, useProgressSync } from '../src/ui/reader/useProgressSync';
import type { ProgressFile, VolumeProgress } from '../src/types';

const p = (o: Partial<VolumeProgress> = {}): VolumeProgress => ({
  maxPage: 0, totalPages: 10, finished: false, resetGen: 0, updatedAt: 0, deviceId: 'x', ...o,
});

describe('startPage', () => {
  it('sin progreso abre en 0; con progreso en maxPage; terminado abre en 0', () => {
    expect(startPage(undefined, 10)).toBe(0);
    expect(startPage(p({ maxPage: 4 }), 10)).toBe(4);
    expect(startPage(p({ maxPage: 9, finished: true }), 10)).toBe(0);
    expect(startPage(p({ maxPage: 50 }), 10)).toBe(9);
  });
});

describe('savePayload', () => {
  const base = { remoteMax: 0, remoteFinished: false, maxSeen: 0, total: 10, resetGen: 0, now: 5, deviceId: 'd' };
  it('nunca baja maxPage respecto del remoto', () => {
    expect(savePayload({ ...base, remoteMax: 7, maxSeen: 3 }).maxPage).toBe(7);
    expect(savePayload({ ...base, remoteMax: 2, maxSeen: 3 }).maxPage).toBe(3);
  });
  it('llegar a la última página marca terminado; un terminado sigue terminado', () => {
    expect(savePayload({ ...base, maxSeen: 9 }).finished).toBe(true);
    expect(savePayload({ ...base, maxSeen: 8 }).finished).toBe(false);
    expect(savePayload({ ...base, remoteFinished: true }).finished).toBe(true);
  });
  it('arma el registro completo', () => {
    expect(savePayload({ ...base, maxSeen: 3, resetGen: 2 })).toEqual({
      maxPage: 3, totalPages: 10, finished: false, resetGen: 2, updatedAt: 5, deviceId: 'd',
    });
  });
});

describe('useProgressSync', () => {
  let file: ProgressFile;
  let store: { loadProgress: ReturnType<typeof vi.fn>; saveProgress: ReturnType<typeof vi.fn>; resetProgress: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    vi.useFakeTimers();
    file = { version: 1, volumes: { v1: p({ maxPage: 5, resetGen: 1 }) } };
    store = {
      loadProgress: vi.fn(async () => structuredClone(file)),
      saveProgress: vi.fn(async () => {}),
      resetProgress: vi.fn(async (id: string, total: number) => {
        file.volumes[id] = p({ totalPages: total, resetGen: (file.volumes[id]?.resetGen ?? 0) + 1 });
      }),
    };
  });
  afterEach(() => vi.useRealTimers());

  async function setup() {
    const r = renderHook(() => useProgressSync(store as never, 'v1', 10));
    await act(async () => {});
    return r;
  }

  it('carga de Drive y expone la página de inicio', async () => {
    const { result } = await setup();
    expect(store.loadProgress).toHaveBeenCalled();
    expect(result.current.start).toBe(5);
  });

  it('guarda 3 s después del último cambio, con el máximo visto, sin retroceder', async () => {
    const { result } = await setup();
    act(() => result.current.seen(7));
    act(() => result.current.seen(6));
    await act(async () => { vi.advanceTimersByTime(2999); });
    expect(store.saveProgress).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(store.saveProgress).toHaveBeenCalledTimes(1);
    expect(store.saveProgress.mock.calls[0][0]).toBe('v1');
    expect(store.saveProgress.mock.calls[0][1]).toMatchObject({ maxPage: 7, totalPages: 10, resetGen: 1, finished: false });
  });

  it('volver atrás no guarda un progreso menor', async () => {
    const { result } = await setup();
    act(() => result.current.seen(2));
    await act(async () => { vi.advanceTimersByTime(3000); });
    for (const c of store.saveProgress.mock.calls) expect(c[1].maxPage).toBeGreaterThanOrEqual(5);
  });

  it('guarda al pasar a segundo plano y al desmontar', async () => {
    const { result, unmount } = await setup();
    act(() => result.current.seen(8));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(store.saveProgress).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => result.current.seen(9));
    await act(async () => unmount());
    expect(store.saveProgress).toHaveBeenCalledTimes(2);
    expect(store.saveProgress.mock.calls[1][1]).toMatchObject({ maxPage: 9, finished: true });
  });

  it('Empezar de nuevo: resetea en Drive y los guardados siguientes usan la resetGen nueva desde 0', async () => {
    const { result } = await setup();
    act(() => result.current.seen(8));
    await act(async () => result.current.reset());
    expect(store.resetProgress).toHaveBeenCalledWith('v1', 10);
    act(() => result.current.seen(0));
    act(() => result.current.seen(1));
    await act(async () => { vi.advanceTimersByTime(3000); });
    const last = store.saveProgress.mock.calls.at(-1)![1];
    expect(last).toMatchObject({ maxPage: 1, resetGen: 2, finished: false });
  });
});
