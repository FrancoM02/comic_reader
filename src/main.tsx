import { render } from 'preact';
import { App } from './app';
import { initAuth } from './auth';
import { GOOGLE_CLIENT_ID } from './config';
import './ui/styles.css';

const root = document.getElementById('app')!;

// Tras un deploy, una pestaña vieja pide chunks que ya no existen: recargar trae la versión nueva.
// Una vez por minuto como mucho, para no entrar en bucle si el chunk falla por otra causa.
addEventListener('vite:preloadError', (e) => {
  try {
    if (Date.now() - Number(sessionStorage.getItem('cr.reloadedAt') ?? 0) < 60_000) return;
    sessionStorage.setItem('cr.reloadedAt', String(Date.now()));
  } catch {
    return;
  }
  e.preventDefault();
  location.reload();
});

if (import.meta.env.DEV && location.hash.startsWith('#/dev/extract')) {
  import('./ui/DevExtract').then(({ DevExtract }) => render(<DevExtract />, root));
} else if (import.meta.env.DEV && location.hash.startsWith('#/dev/mock')) {
  import('./ui/DevMock').then(({ DevMock }) => render(<DevMock />, root));
} else {
  initAuth(GOOGLE_CLIENT_ID).finally(() => render(<App />, root));
}
