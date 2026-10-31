/**
 * Worker de Cloudflare que guarda el client_secret y hace el flujo de código de Google.
 * Así la app consigue un refresh token y renueva sin popup ni redirección.
 * El refresh token vive en el navegador (localStorage); sin el secret de acá no sirve solo.
 *
 * GET  /login?state=…   → Google (access_type=offline)
 * GET  /callback        → canjea el código y vuelve a APP_URL#access_token=…&refresh_token=…&state=…
 * POST /refresh         → {refresh_token} ⇒ {access_token, expires_in}; 401 si Google ya no lo acepta
 */

export interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** URL exacta de la app, con barra final. Único destino de la vuelta: evita redirecciones abiertas. */
  APP_URL: string;
}

const SCOPE = 'https://www.googleapis.com/auth/drive.file';

interface GoogleToken {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
}

async function google(env: Env, body: Record<string, string>): Promise<{ status: number; data: GoogleToken }> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...body }),
  });
  return { status: r.status, data: (await r.json().catch(() => ({}))) as GoogleToken };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const callback = `${url.origin}/callback`;
    const cors = {
      'Access-Control-Allow-Origin': new URL(env.APP_URL).origin,
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (url.pathname === '/login') {
      const p = new URLSearchParams({
        response_type: 'code',
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: callback,
        scope: SCOPE,
        access_type: 'offline',
        prompt: 'consent', // sin esto Google no repite el refresh token en logins posteriores
        include_granted_scopes: 'true',
        state: url.searchParams.get('state') ?? '',
      });
      return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${p}`, 302);
    }

    if (url.pathname === '/callback') {
      // El state lo valida la app contra su localStorage: acá solo se reenvía.
      const back = new URLSearchParams({ state: url.searchParams.get('state') ?? '' });
      const code = url.searchParams.get('code');
      if (!code) back.set('error', url.searchParams.get('error') ?? 'sin_codigo');
      else {
        const { data } = await google(env, { grant_type: 'authorization_code', code, redirect_uri: callback });
        if (data.access_token && data.refresh_token) {
          back.set('access_token', data.access_token);
          back.set('expires_in', String(data.expires_in ?? 3600));
          back.set('refresh_token', data.refresh_token);
        } else back.set('error', data.error ?? 'sin_refresh_token');
      }
      return Response.redirect(`${env.APP_URL}#${back}`, 302);
    }

    if (url.pathname === '/refresh') {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (req.method !== 'POST') return new Response(null, { status: 405, headers: cors });
      const body = (await req.json().catch(() => ({}))) as { refresh_token?: unknown };
      if (typeof body.refresh_token !== 'string') return Response.json({ error: 'falta_refresh_token' }, { status: 400, headers: cors });
      const { status, data } = await google(env, { grant_type: 'refresh_token', refresh_token: body.refresh_token });
      if (data.access_token) return Response.json({ access_token: data.access_token, expires_in: data.expires_in ?? 3600 }, { headers: cors });
      // invalid_grant = revocado o vencido: hay que volver a entrar. Otro error (Google caído) no borra la sesión.
      return Response.json({ error: data.error ?? 'error' }, { status: data.error === 'invalid_grant' ? 401 : status >= 500 ? 502 : 400, headers: cors });
    }

    return new Response('Not found', { status: 404 });
  },
};
