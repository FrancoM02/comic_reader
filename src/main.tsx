import { render } from 'preact';
import { App } from './app';
import { initAuth } from './auth';
import { GOOGLE_CLIENT_ID } from './config';
import './ui/styles.css';

initAuth(GOOGLE_CLIENT_ID).finally(() => render(<App />, document.getElementById('app')!));
