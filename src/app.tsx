import { useEffect, useState } from 'preact/hooks';
import { createDrive } from './drive';
import { createStore } from './store';
import { SessionContext } from './session';
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
  }, [signedIn, session]);

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
    } catch (e) {
      setError(`No se pudo iniciar sesión: ${e instanceof Error ? e.message : 'error desconocido'}`);
    }
  }

  const banner = needsRenewal() && (
    <p role="alert">
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
          {sessionError && salir}
        </main>
      );
    }
    return (
      <SessionContext.Provider value={session}>
        {hash === '#/upload' ? (
          <UploadView cleaned={cleaned} />
        ) : (
          <main class="home">
            <h1>Biblioteca</h1>
            {banner}
            {err}
            {cleaned.map((n) => (
              <p role="alert" key={n}>
                La subida de {n} se cortó, elegí el archivo de nuevo
              </p>
            ))}
            <p>
              <a href="#/upload">Subir</a>
            </p>
            {salir}
          </main>
        )}
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
