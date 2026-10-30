import { AuthInteractionRequired, type TokenResult, type TokenTransport } from './auth';

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
          revoke?(token: string, done?: () => void): void;
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
  let interactiveNow = false;
  let client: GisClient | null = null;

  const fail = (msg: string) =>
    pendingReject?.(interactiveNow ? new Error(msg) : new AuthInteractionRequired(msg));

  async function getClient(): Promise<GisClient> {
    if (client) return client;
    await loadGis();
    client ??= window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.access_token) pendingResolve?.({ accessToken: r.access_token, expiresIn: r.expires_in ?? 3600 });
        else fail(r.error ?? 'Google no devolvió token');
      },
      error_callback: (e) => fail(`Error de Google: ${e.type}`),
    });
    return client;
  }

  function ask(c: GisClient, interactive: boolean) {
    // GIS tiene un solo callback: un pedido nuevo deja huérfano al anterior, que se rechaza para no colgarlo.
    fail('Pedido de token reemplazado por otro');
    return new Promise<TokenResult>((resolve, reject) => {
      pendingResolve = (r) => {
        pendingResolve = pendingReject = null;
        resolve(r);
      };
      pendingReject = (e) => {
        pendingResolve = pendingReject = null;
        reject(e);
      };
      interactiveNow = interactive;
      c.requestAccessToken({ prompt: '' });
    });
  }

  return {
    consumeReturn: () => {
      stripAuthHash();
      return null;
    },
    preload: async () => void (await getClient()),
    // Si el cliente ya está listo, requestAccessToken corre sincrónico dentro del gesto del usuario.
    request: (interactive) => (client ? ask(client, interactive) : getClient().then((c) => ask(c, interactive))),
  };
}

const K_STATE = 'cr.oauth.state';
const K_ROUTE = 'cr.oauth.route';

/**
 * Si la URL trae un `#access_token`/`#error` de OAuth, lo saca del hash (restaurando la ruta guardada)
 * y devuelve sus parámetros junto con el state esperado. Si no, null.
 */
function stripAuthHash(): { params: URLSearchParams; expected: string | null } | null {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (!params.has('access_token') && !params.has('error')) return null;
  let expected: string | null = null;
  let route = '';
  try {
    expected = localStorage.getItem(K_STATE);
    route = localStorage.getItem(K_ROUTE) ?? '';
    localStorage.removeItem(K_STATE);
    localStorage.removeItem(K_ROUTE);
  } catch {
    /* nada */
  }
  history.replaceState(null, '', location.pathname + location.search + route);
  return { params, expected };
}

function authUrl(clientId: string, interactive: boolean): string {
  const state = crypto.randomUUID();
  try {
    localStorage.setItem(K_STATE, state);
    localStorage.setItem(K_ROUTE, location.hash);
  } catch {
    /* sin storage: se pierde la ruta, no la sesión */
  }
  const p = new URLSearchParams({
    response_type: 'token',
    client_id: clientId,
    redirect_uri: new URL('./', document.baseURI).href,
    scope: SCOPE,
    state,
    include_granted_scopes: 'true',
  });
  if (!interactive) p.set('prompt', 'none');
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export function redirectTransport(clientId: string): TokenTransport {
  return {
    request(interactive) {
      // Una renovación silenciosa nunca navega: podría cortar una subida. Solo un toque del usuario.
      if (!interactive) return Promise.reject(new AuthInteractionRequired());
      location.href = authUrl(clientId, true);
      return new Promise<TokenResult>(() => {}); // la página se va; al volver lo toma consumeReturn
    },
    navigateRefresh() {
      location.href = authUrl(clientId, false);
    },
    consumeReturn() {
      const r = stripAuthHash();
      if (!r) return null;
      const { params, expected } = r;
      if (!expected || params.get('state') !== expected) return null;
      const error = params.get('error');
      if (error) return { error };
      const token = params.get('access_token');
      if (!token) return null;
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
