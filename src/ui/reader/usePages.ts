import { useEffect, useRef, useState } from 'preact/hooks';
import type { Drive } from '../../drive';

const KEEP = 5;

type Entry = { url?: string; ctrl?: AbortController; error?: boolean };

/**
 * Object URLs de las páginas, por índice. Descarga las de `want` y libera
 * (revoca o aborta) las que quedan a más de 5 de `center`.
 */
export function usePages(drive: Drive, fileIds: string[], want: number[], center: number) {
  const cache = useRef(new Map<number, Entry>());
  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
  const key = want.join(','); // dependencia estable aunque `want` sea un array nuevo

  useEffect(() => {
    const c = cache.current;
    for (const [i, e] of c) {
      if (Math.abs(i - center) <= KEEP) continue;
      e.ctrl?.abort();
      if (e.url) URL.revokeObjectURL(e.url);
      c.delete(i);
    }
    for (const i of want) {
      if (i < 0 || i >= fileIds.length || Math.abs(i - center) > KEEP || c.has(i)) continue;
      const ctrl = new AbortController();
      const e: Entry = { ctrl };
      c.set(i, e);
      drive.downloadBlob(fileIds[i], ctrl.signal).then(
        (b) => {
          if (c.get(i) !== e) return;
          e.url = URL.createObjectURL(b);
          e.ctrl = undefined;
          bump();
        },
        () => {
          if (c.get(i) !== e || ctrl.signal.aborted) return;
          e.error = true;
          e.ctrl = undefined;
          bump();
        },
      );
    }
  }, [drive, fileIds, key, center, tick]);

  useEffect(() => {
    const c = cache.current;
    return () => {
      for (const e of c.values()) {
        e.ctrl?.abort();
        if (e.url) URL.revokeObjectURL(e.url);
      }
      c.clear();
    };
  }, [fileIds]);

  return {
    url: (i: number) => cache.current.get(i)?.url,
    failed: (i: number) => !!cache.current.get(i)?.error,
    retry: (i: number) => {
      cache.current.delete(i);
      bump();
    },
  };
}
