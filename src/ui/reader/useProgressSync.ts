import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { getDeviceId } from '../../store';
import type { Store } from '../../store';
import type { VolumeProgress } from '../../types';

const DEBOUNCE_MS = 3000;

/** Dónde abrir: en maxPage; un tomo terminado abre en 0 (sin tocar el progreso guardado). */
export function startPage(p: VolumeProgress | undefined, total: number): number {
  if (!p || p.finished) return 0;
  return Math.max(0, Math.min(p.maxPage, total - 1));
}

/** Registro a guardar: nunca por debajo de lo que ya había en Drive. */
export function savePayload(a: {
  remoteMax: number; remoteFinished: boolean; maxSeen: number; total: number; resetGen: number; now: number; deviceId: string;
}): VolumeProgress {
  const maxPage = Math.max(a.remoteMax, a.maxSeen);
  return {
    maxPage,
    totalPages: a.total,
    finished: a.remoteFinished || maxPage >= a.total - 1,
    resetGen: a.resetGen,
    updatedAt: a.now,
    deviceId: a.deviceId,
  };
}

type ProgressStore = Pick<Store, 'loadProgress' | 'saveProgress' | 'resetProgress'>;

/**
 * Carga el progreso de Drive al abrir y lo guarda 3 s después del último avance,
 * al pasar a segundo plano, en pagehide y al desmontar. `seen(i)` = última página mostrada.
 */
export function useProgressSync(store: ProgressStore, volumeId: string, total: number) {
  const [start, setStart] = useState<number | null>(null);
  const [error, setError] = useState('');
  const s = useRef({ remoteMax: 0, remoteFinished: false, maxSeen: 0, resetGen: 0, dirty: false, timer: 0 as ReturnType<typeof setTimeout> | 0 });

  const flush = useCallback(() => {
    const st = s.current;
    if (st.timer) clearTimeout(st.timer);
    st.timer = 0;
    if (!st.dirty) return;
    st.dirty = false;
    const p = savePayload({ ...st, total, now: Date.now(), deviceId: getDeviceId() });
    st.remoteMax = p.maxPage;
    st.remoteFinished = p.finished;
    store.saveProgress(volumeId, p).catch(() => {
      st.dirty = true; // se reintenta en el próximo guardado
    });
  }, [store, volumeId, total]);

  useEffect(() => {
    let alive = true;
    store.loadProgress().then(
      (f) => {
        if (!alive) return;
        const p = f.volumes[volumeId];
        Object.assign(s.current, { remoteMax: p?.maxPage ?? 0, remoteFinished: p?.finished ?? false, resetGen: p?.resetGen ?? 0 });
        setStart(startPage(p, total));
      },
      (e) => alive && setError(`No se pudo cargar el progreso: ${e instanceof Error ? e.message : 'error desconocido'}`),
    );
    const onHidden = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHidden);
    addEventListener('pagehide', flush);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onHidden);
      removeEventListener('pagehide', flush);
      flush();
    };
  }, [store, volumeId, total, flush]);

  const seen = useCallback(
    (page: number) => {
      const st = s.current;
      st.maxSeen = Math.max(st.maxSeen, page);
      const reachedEnd = st.maxSeen >= total - 1 && !st.remoteFinished;
      if (st.maxSeen <= st.remoteMax && !reachedEnd) return;
      st.dirty = true;
      if (st.timer) clearTimeout(st.timer);
      st.timer = setTimeout(flush, DEBOUNCE_MS);
    },
    [flush, total],
  );

  const reset = useCallback(async () => {
    const st = s.current;
    if (st.timer) clearTimeout(st.timer);
    Object.assign(st, { timer: 0, dirty: false, maxSeen: 0, remoteMax: 0, remoteFinished: false, resetGen: st.resetGen + 1 });
    await store.resetProgress(volumeId, total);
    // La resetGen real la decide Drive (otro dispositivo pudo resetear también).
    const p = (await store.loadProgress()).volumes[volumeId];
    if (p) st.resetGen = p.resetGen;
  }, [store, volumeId, total]);

  return { start, error, seen, reset };
}
