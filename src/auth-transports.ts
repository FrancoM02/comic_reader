import type { TokenResult, TokenTransport } from './auth';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';

/* Tipado mínimo de Google Identity Services. */
interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface GisClient {
  requestAccessToken(o: { prompt: string }): void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(c: {
            client_id: string;
            scope: string;
            callback: (r: GisTokenResponse) => void;
            error_callback: (e: { type: string }) => void;
          }): GisClient;
        };
      };
    };
  }
}

let gisLoading: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  gisLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoading = null;
      reject(new Error('No se pudo cargar Google Identity Services'));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

export function gisTransport(clientId: string): TokenTransport {
  let pendingResolve: ((r: TokenResult) => void) | null = null;
  let pendingReject: ((e: Error) => void) | null = null;
  let client: GisClient | null = null;

  async function getClient(): Promise<GisClient> {
    if (client) return client;
    await loadGis();
    client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.access_token) pendingResolve?.({ accessToken: r.access_token, expiresIn: r.expires_in ?? 3600 });
        else pendingReject?.(new Error(r.error ?? 'Google no devolvió token'));
      },
      error_callback: (e) => pendingReject?.(new Error(`Error de Google: ${e.type}`)),
    });
    return client;
  }

  return {
    async request() {
      const c = await getClient();
      return new Promise<TokenResult>((resolve, reject) => {
        pendingResolve = resolve;
        pendingReject = reject;
        // prompt '' = silencioso si ya hay consentimiento; si no, Google muestra lo que haga falta.
        c.requestAccessToken({ prompt: '' });
      });
    },
  };
}

const K_STATE = 'cr.oauth.state';
const K_ROUTE = 'cr.oauth.route';

export function redirectTransport(clientId: string): TokenTransport {
  return {
    request(interactive) {
      const state = crypto.randomUUID();
      try {
        sessionStorage.setItem(K_STATE, state);
        sessionStorage.setItem(K_ROUTE, location.hash);
      } catch {
        /* sin sessionStorage: se pierde la ruta, no la sesión */
      }
      const p = new URLSearchParams({
        response_type: 'token',
        client_id: clientId,
        redirect_uri: location.origin + location.pathname,
        scope: SCOPE,
        state,
        include_granted_scopes: 'true',
      });
      if (!interactive) p.set('prompt', 'none');
      location.href = `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
      return new Promise<TokenResult>(() => {}); // la página se va; al volver lo toma consumeReturn
    },
    consumeReturn() {
      const params = new URLSearchParams(location.hash.replace(/^#/, ''));
      if (!params.has('access_token') && !params.has('error')) return null;
      let expected: string | null = null;
      let route = '';
      try {
        expected = sessionStorage.getItem(K_STATE);
        route = sessionStorage.getItem(K_ROUTE) ?? '';
        sessionStorage.removeItem(K_STATE);
        sessionStorage.removeItem(K_ROUTE);
      } catch {
        /* nada */
      }
      history.replaceState(null, '', location.pathname + location.search + route);
      const token = params.get('access_token');
      if (!token || !expected || params.get('state') !== expected) return null;
      return { accessToken: token, expiresIn: Number(params.get('expires_in')) || 3600 };
    },
  };
}

export function isIosStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function createTransport(clientId: string): TokenTransport {
  return isIosStandalone() ? redirectTransport(clientId) : gisTransport(clientId);
}
