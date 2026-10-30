import { useEffect, useState } from 'preact/hooks';
import { isSignedIn, lastAuthError, needsRenewal, refreshIfIdle, signIn, signOut, subscribeAuth } from './auth';

export function App() {
  const [signedIn, setSignedIn] = useState(isSignedIn());
  const [error, setError] = useState(lastAuthError() ?? '');
  const [, setTick] = useState(0);

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
    return (
      <main class="home">
        <h1>Biblioteca</h1>
        {banner}
        {err}
        <button
          type="button"
          onClick={() => {
            signOut();
            setSignedIn(false);
          }}
        >
          Salir
        </button>
      </main>
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
