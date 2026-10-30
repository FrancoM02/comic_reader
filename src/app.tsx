import { useEffect, useState } from 'preact/hooks';
import { createDrive } from './drive';
import { createStore } from './store';
import { SessionContext } from './session';
import { Home } from './ui/Home';
import { Reader } from './ui/Reader';
import { SeriesView } from './ui/SeriesView';
import { UploadView } from './ui/UploadView';
import { cleanupOrphans } from './upload';
import type { SessionDeps } from './upload';
import { getToken, isSignedIn, lastAuthError, needsRenewal, refreshIfIdle, signIn, signOut, subscribeAuth } from './auth';

function useHash() {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const f = () => setH(location.hash);
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return h;
}

/** `session` permite inyectar drive/store en tests. */
export function App({ session: injected }: { session?: SessionDeps } = {}) {
  const [signedIn, setSignedIn] = useState(isSignedIn());
  const [error, setError] = useState(lastAuthError() ?? '');
  const [, setTick] = useState(0);
  const [session, setSession] = useState<SessionDeps | null>(injected ?? null);
  const [sessionError, setSessionError] = useState('');
  // Sube tras renovar la sesión o con "Reintentar": vuelve a correr la apertura de la biblioteca.
  const [initAttempt, setInitAttempt] = useState(0);
  const [cleaned, setCleaned] = useState<string[]>([]);
  const hash = useHash();

  useEffect(() => {
    if (!signedIn || session) return;
    let alive = true;
    (async () => {
      try {
        const drive = createDrive(getToken);
        const store = createStore(drive);
        const { volumesId } = await store.init();
        const deps = { drive, store, volumesId };
        const names = await cleanupOrphans(deps).catch(() => []);
        if (!alive) return;
        setCleaned(names);
        setSession(deps);
      } catch (e) {
        if (alive) setSessionError(`No se pudo abrir tu biblioteca: ${e instanceof Error ? e.message : 'error desconocido'}`);
      }
    })();
    return () => {
      alive = false;
    };
  }, [signedIn, session, initAttempt]);

  const retry = () => {
    setSessionError('');
    setInitAttempt((n) => n + 1);
  };

  useEffect(() => {
    const unsub = subscribeAuth(() => setTick((n) => n + 1));
    const onVisible = () => document.visibilityState === 'visible' && refreshIfIdle();
    document.addEventListener('visibilitychange', onVisible);
    refreshIfIdle();
    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  async function entrar() {
    setError('');
    try {
      await signIn();
      setSignedIn(isSignedIn());
      retry();
    } catch (e) {
      setError(`No se pudo iniciar sesión: ${e instanceof Error ? e.message : 'error desconocido'}`);
    }
  }

  const readId = hash.match(/^#\/read\/(.+)$/)?.[1];
  const banner = needsRenewal() && (
    <p role="alert" class={readId ? 'renew' : undefined}>
      Tu sesión venció.{' '}
      <button type="button" onClick={entrar}>
        Tocá para renovar
      </button>
    </p>
  );
  const err = error && <p role="alert">{error.startsWith('No se pudo') ? error : `No se pudo iniciar sesión: ${error}`}</p>;

  if (signedIn) {
    const salir = (
      <button
        type="button"
        onClick={() => {
          signOut();
          setSession(null);
          setSignedIn(false);
        }}
      >
        Salir
      </button>
    );
    if (!session) {
      return (
        <main class="home">
          {banner}
          {sessionError ? <p role="alert">{sessionError}</p> : <p>Cargando…</p>}
          {err}
          {sessionError && (
            <button type="button" onClick={retry}>
              Reintentar
            </button>
          )}{' '}
          {sessionError && salir}
        </main>
      );
    }
    const seriesId = hash.match(/^#\/series\/(.+)$/)?.[1];
    const extra = (
      <>
        {err}
        {cleaned.map((n) => (
          <p role="alert" key={n}>
            La subida de {n} se cortó, elegí el archivo de nuevo
          </p>
        ))}
        {salir}
      </>
    );
    const route =
      hash === '#/upload' ? (
        <UploadView cleaned={cleaned} />
      ) : seriesId ? (
        <SeriesView id={decodeURIComponent(seriesId)} />
      ) : readId ? (
        <Reader key={readId} volumeId={decodeURIComponent(readId!)} />
      ) : (
        <Home extra={extra} />
      );
    return (
      <SessionContext.Provider value={session}>
        {banner}
        {route}
      </SessionContext.Provider>
    );
  }
  return (
    <main class="signin">
      <h1>Comic Reader</h1>
      <button type="button" onClick={entrar}>
        Entrar con Google
      </button>
      {banner}
      {err}
    </main>
  );
}
