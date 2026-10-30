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
  consumeReturn?(): TokenResult | { error: string } | null;
  /** Empieza a cargar lo que haga falta para que el clic de signIn sea sincrónico hasta Google. */
  preload?(): Promise<void>;
  /** Renovación que navega la página (solo transporte por redirección). La página se va. */
  navigateRefresh?(): void;
}

/** La renovación silenciosa no es posible: hace falta un toque del usuario. */
export class AuthInteractionRequired extends Error {
  constructor(message = 'Hace falta volver a iniciar sesión') {
    super(message);
    this.name = 'AuthInteractionRequired';
  }
}

const NO_AUTO_KEY = 'cr.noAutoRefresh';
/** Margen para seguir usando el token guardado cuando la renovación necesita un toque. */
const STILL_VALID_MS = 10_000;
const REFRESH_AHEAD_MS = 15 * 60_000;
const SILENT_ERRORS = ['interaction_required', 'login_required', 'consent_required', 'account_selection_required'];

let needsInteraction = false;
let lastError: string | null = null;
let busy = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((f) => f());
}
export function subscribeAuth(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
/** true si la sesión venció y hay que tocar para renovar */
export function needsRenewal(): boolean {
  return needsInteraction;
}
export function lastAuthError(): string | null {
  return lastError;
}
/** Los flujos largos (subidas) lo marcan para que no se renueve por redirección. */
export function setBusy(b: boolean): void {
  busy = Math.max(0, busy + (b ? 1 : -1));
}
function flag(set?: boolean): boolean {
  try {
    if (set === true) localStorage.setItem(NO_AUTO_KEY, '1');
    else if (set === false) localStorage.removeItem(NO_AUTO_KEY);
    return localStorage.getItem(NO_AUTO_KEY) === '1';
  } catch {
    return false;
  }
}

interface Stored {
  accessToken: string;
  expiresAt: number;
}

let transport: TokenTransport | null = null;
let pendingSilent: Promise<string> | null = null;
let pendingInteractive: Promise<string> | null = null;

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
  pendingSilent = pendingInteractive = null;
  needsInteraction = false;
  lastError = null;
  busy = 0;
  const returned = t.consumeReturn?.();
  if (returned) {
    if ('error' in returned) {
      flag(true); // no reintentar solo hasta el próximo signIn interactivo
      if (SILENT_ERRORS.includes(returned.error)) needsInteraction = true;
      else lastError = returned.error;
    } else {
      store(returned);
      flag(false);
    }
  }
  t.preload?.().catch(() => {});
}

export function isSignedIn(): boolean {
  return read() !== null;
}

function renew(interactive: boolean): Promise<string> {
  if (!transport) return Promise.reject(new Error('initAuth no fue llamado'));
  if (interactive) {
    flag(false);
    pendingInteractive ??= transport
      .request(true)
      .then((r) => {
        needsInteraction = false;
        lastError = null;
        notify();
        return store(r);
      })
      .finally(() => {
        pendingInteractive = null;
      });
    return pendingInteractive;
  }
  if (pendingInteractive) return pendingInteractive;
  pendingSilent ??= transport
    .request(false)
    .then((r) => {
      needsInteraction = false;
      notify();
      return store(r);
    })
    .catch((e) => {
      if (e instanceof AuthInteractionRequired) {
        needsInteraction = true;
        notify();
      }
      throw e;
    })
    .finally(() => {
      pendingSilent = null;
    });
  return pendingSilent;
}

export async function signIn(): Promise<void> {
  await renew(true);
}

export async function getToken(opts: { forceRefresh?: boolean } = {}): Promise<string> {
  const s = read();
  if (!s) throw new Error('No hay sesión iniciada');
  if (opts.forceRefresh) return renew(false);
  if (s.expiresAt - Date.now() > MARGIN_MS) return s.accessToken;
  const stillValid = () => s.expiresAt > Date.now() + STILL_VALID_MS;
  // Ya se sabe que hace falta un toque: mientras el token sirva, no reintentar en silencio.
  if (needsInteraction && stillValid()) return s.accessToken;
  try {
    return await renew(false);
  } catch (e) {
    // El banner pide el toque (needsInteraction), pero el token de verdad todavía no venció.
    if (e instanceof AuthInteractionRequired && stillValid()) return s.accessToken;
    throw e;
  }
}

/** Minutos de vida que le quedan al token guardado (0 si no hay sesión). */
export function tokenMinutesLeft(): number {
  const s = read();
  return s ? Math.max(0, (s.expiresAt - Date.now()) / 60_000) : 0;
}

/** true si renovar navega la página (iPhone instalado): no se puede pedir un toque sin irse. */
export function usesRedirect(): boolean {
  return !!transport?.navigateRefresh;
}

/** Renueva de forma proactiva si es seguro (sin trabajo en curso). Con redirección, la página se va. */
export async function refreshIfIdle(): Promise<void> {
  const s = read();
  if (!s || !transport || busy > 0 || flag() || needsInteraction) return;
  if (s.expiresAt - Date.now() >= REFRESH_AHEAD_MS) return;
  if (transport.navigateRefresh) {
    flag(true); // se limpia al volver con token; si vuelve con error, evita el bucle
    transport.navigateRefresh();
    return;
  }
  await getToken({ forceRefresh: true }).catch(() => {});
}

export function signOut(): void {
  const token = read()?.accessToken;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('cr.pendingUpload');
  } catch {
    /* nada */
  }
  flag(false);
  needsInteraction = false;
  lastError = null;
  try {
    if (token) window.google?.accounts?.oauth2?.revoke?.(token, () => {});
  } catch {
    /* revocar es best-effort */
  }
  notify();
}
