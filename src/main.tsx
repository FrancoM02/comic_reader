import { render } from 'preact';
import { App } from './app';
import { initAuth } from './auth';
import { GOOGLE_CLIENT_ID } from './config';
import './ui/styles.css';

const root = document.getElementById('app')!;

if (import.meta.env.DEV && location.hash.startsWith('#/dev/extract')) {
  import('./ui/DevExtract').then(({ DevExtract }) => render(<DevExtract />, root));
} else if (import.meta.env.DEV && location.hash.startsWith('#/dev/mock')) {
  import('./ui/DevMock').then(({ DevMock }) => render(<DevMock />, root));
} else {
  initAuth(GOOGLE_CLIENT_ID).finally(() => render(<App />, root));
}
