import { createTransport } from './auth-transports';

const STORAGE_KEY = 'cr.token';
const MARGIN_MS = 5 * 60_000;

export interface TokenResult {
  accessToken: string;
  /** segundos hasta el vencimiento */
  expiresIn: number;
}

/** Cómo se consigue un token. `interactive=false` = renovación silenciosa. */
export interface TokenTransport {
  request(interactive: boolean): Promise<TokenResult>;
  /** Si la página volvió de una redirección con token, lo devuelve (y limpia la URL). */
  consumeReturn?(): TokenResult | null;
}

interface Stored {
  accessToken: string;
  expiresAt: number;
}

let transport: TokenTransport | null = null;
let pending: Promise<string> | null = null;

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function store(r: TokenResult): string {
  const s: Stored = { accessToken: r.accessToken, expiresAt: Date.now() + r.expiresIn * 1000 };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* sin storage: la sesión dura lo que dure la pestaña */
  }
  return s.accessToken;
}

export async function initAuth(clientId: string, t: TokenTransport = createTransport(clientId)): Promise<void> {
  transport = t;
  pending = null;
  const returned = t.consumeReturn?.();
  if (returned) store(returned);
}

export function isSignedIn(): boolean {
  return read() !== null;
}

function renew(interactive: boolean): Promise<string> {
  if (!transport) return Promise.reject(new Error('initAuth no fue llamado'));
  if (!pending) {
    pending = transport
      .request(interactive)
      .then(store)
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export async function signIn(): Promise<void> {
  await renew(true);
}

export async function getToken(opts: { forceRefresh?: boolean } = {}): Promise<string> {
  const s = read();
  if (!s) throw new Error('No hay sesión iniciada');
  if (!opts.forceRefresh && s.expiresAt - Date.now() > MARGIN_MS) return s.accessToken;
  return renew(false);
}

export function signOut(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nada */
  }
}
