import { useState } from 'preact/hooks';
import { isSignedIn, signIn, signOut } from './auth';

export function App() {
  const [signedIn, setSignedIn] = useState(isSignedIn());
  const [error, setError] = useState('');

  async function entrar() {
    setError('');
    try {
      await signIn();
      setSignedIn(isSignedIn());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo entrar');
    }
  }

  if (signedIn) {
    return (
      <main class="home">
        <h1>Biblioteca</h1>
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
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
