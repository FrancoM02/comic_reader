import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/preact';
import { setBusy } from '../src/auth';

vi.mock('../src/auth', async (orig) => {
  const a = await orig<typeof import('../src/auth')>();
  return { ...a, setBusy: vi.fn() };
});
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
    expect(store.saveProgress).not.toHaveBeenCalled();
  });

  it('salto con el slider y vuelta antes de 2 s: no cuenta como leído', async () => {
    const { result } = await setup();
    act(() => result.current.jumped(9));
    await act(async () => { vi.advanceTimersByTime(1500); });
    act(() => result.current.jumped(3));
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(store.saveProgress).not.toHaveBeenCalled();
  });

  it('salto con el slider y quedarse 2 s: cuenta como leído', async () => {
    const { result } = await setup();
    act(() => result.current.jumped(8));
    await act(async () => { vi.advanceTimersByTime(1999); });
    act(() => {});
    await act(async () => { vi.advanceTimersByTime(1 + 3000); });
    expect(store.saveProgress).toHaveBeenCalledTimes(1);
    expect(store.saveProgress.mock.calls[0][1]).toMatchObject({ maxPage: 8 });
  });

  it('un paso de página normal cancela el salto pendiente', async () => {
    const { result } = await setup();
    act(() => result.current.jumped(9));
    act(() => result.current.seen(6));
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(store.saveProgress).toHaveBeenCalledTimes(1);
    expect(store.saveProgress.mock.calls[0][1]).toMatchObject({ maxPage: 6, finished: false });
  });

  it('reset durante un guardado en curso espera a que termine y gana el reset', async () => {
    const order: string[] = [];
    let release!: () => void;
    store.saveProgress.mockImplementationOnce(() => new Promise<void>((r) => (release = () => { order.push('save'); r(); })));
    const reset = store.resetProgress.getMockImplementation() as (id: string, total: number) => Promise<void>;
    store.resetProgress.mockImplementation(async (...a: [string, number]) => { order.push('reset'); await reset(...a); });
    const { result } = await setup();
    act(() => result.current.seen(8));
    await act(async () => { vi.advanceTimersByTime(3000); });
    let pending!: Promise<void>;
    act(() => { pending = result.current.reset(); });
    await act(async () => {});
    expect(store.resetProgress).not.toHaveBeenCalled();
    await act(async () => { release(); await pending; });
    expect(order).toEqual(['save', 'reset']);
    act(() => result.current.seen(1));
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(store.saveProgress.mock.calls.at(-1)![1]).toMatchObject({ maxPage: 1, resetGen: 2 });
  });

  it('si el reset falla, rechaza y el estado local no cambia', async () => {
    store.resetProgress.mockRejectedValueOnce(new Error('red'));
    const { result } = await setup();
    act(() => result.current.seen(7));
    await act(async () => { await expect(result.current.reset()).rejects.toThrow('red'); });
    act(() => result.current.seen(6));
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(store.saveProgress.mock.calls.at(-1)![1]).toMatchObject({ maxPage: 7, resetGen: 1 });
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

  describe('setBusy (para que una renovación por redirección no pierda progreso)', () => {
    const calls = () => vi.mocked(setBusy).mock.calls.map((c) => c[0]);
    const settle = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
    beforeEach(() => vi.mocked(setBusy).mockClear());

    it('ocupado mientras hay algo sin guardar o un guardado en curso; libre al terminar', async () => {
      let release!: () => void;
      store.saveProgress.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
      const { result } = await setup();
      expect(calls()).toEqual([]);
      act(() => result.current.seen(7));
      expect(calls()).toEqual([true]);
      act(() => result.current.seen(8));
      expect(calls()).toEqual([true]);
      await act(async () => { vi.advanceTimersByTime(3000); });
      await settle();
      expect(store.saveProgress).toHaveBeenCalledTimes(1);
      expect(calls()).toEqual([true]); // guardado en curso
      await act(async () => { release(); });
      expect(calls()).toEqual([true, false]);
    });

    it('si el guardado falla queda ocupado y avisa "sin guardar"; al desmontar se libera', async () => {
      store.saveProgress.mockRejectedValueOnce(new Error('red'));
      const { result, unmount } = await setup();
      act(() => result.current.seen(7));
      await act(async () => { vi.advanceTimersByTime(3000); });
      await settle();
      expect(result.current.unsaved).toBe(true);
      expect(calls()).toEqual([true]);
      await act(async () => unmount());
      await settle();
      expect(store.saveProgress).toHaveBeenCalledTimes(2); // reintento al desmontar
      expect(calls()).toEqual([true, false]);
    });

    it('balanceado al desmontar con un cambio sin guardar, aunque el guardado final falle', async () => {
      store.saveProgress.mockRejectedValue(new Error('red'));
      const { result, unmount } = await setup();
      act(() => result.current.seen(8));
      await act(async () => unmount());
      await settle();
      expect(calls()).toEqual([true, false]);
    });

    it('un guardado exitoso borra el aviso "sin guardar"', async () => {
      store.saveProgress.mockRejectedValueOnce(new Error('red'));
      const { result } = await setup();
      act(() => result.current.seen(7));
      await act(async () => { vi.advanceTimersByTime(3000); });
      await settle();
      expect(result.current.unsaved).toBe(true);
      act(() => result.current.seen(8));
      await act(async () => { vi.advanceTimersByTime(3000); });
      await settle();
      expect(result.current.unsaved).toBe(false);
      expect(calls()).toEqual([true, false]);
    });
  });
});
