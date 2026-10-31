export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
/** URL del Worker de `worker/`. Si está, el login usa refresh token y no hay que reloguear cada hora. */
export const AUTH_WORKER_URL: string = import.meta.env.VITE_AUTH_WORKER_URL ?? '';
