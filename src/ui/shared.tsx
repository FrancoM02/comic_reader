import { useCallback, useEffect, useState } from 'preact/hooks';
import { needsRenewal, subscribeAuth } from '../auth';
import { useSession } from '../session';
import type { Library, ProgressFile } from '../types';

const urls = new Map<string, string>();

/** Miniatura de Drive; las URLs se cachean toda la sesión. */
export function Thumb({ fileId, alt = '' }: { fileId: string; alt?: string }) {
  const { drive } = useSession();
  const [src, setSrc] = useState(urls.get(fileId) ?? '');
  useEffect(() => {
    if (urls.has(fileId)) return setSrc(urls.get(fileId)!);
    let alive = true;
    drive.downloadBlob(fileId).then(
      (b) => {
        const u = urls.get(fileId) ?? URL.createObjectURL(b);
        urls.set(fileId, u);
        if (alive) setSrc(u);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [fileId, drive]);
  return src ? <img src={src} alt={alt} loading="lazy" /> : <div class="thumb-ph" />;
}

/** Biblioteca + progreso; recarga al volver la pestaña a primer plano y al renovar la sesión. */
export function useLibraryData() {
  const { store } = useSession();
  const [lib, setLib] = useState<Library | null>(null);
  const [prog, setProg] = useState<ProgressFile>({ version: 1, volumes: {} });
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([store.loadLibrary(), store.loadProgress()]);
      setLib(l);
      setProg(p);
      setError('');
    } catch (e) {
      setError(`No se pudo cargar la biblioteca: ${e instanceof Error ? e.message : 'error desconocido'}`);
    }
  }, [store]);
  useEffect(() => {
    reload();
    const f = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', f);
    let expired = needsRenewal();
    const unsub = subscribeAuth(() => {
      const now = needsRenewal();
      if (expired && !now) reload();
      expired = now;
    });
    return () => {
      document.removeEventListener('visibilitychange', f);
      unsub();
    };
  }, [reload]);
  return { lib, prog, error, reload };
}
