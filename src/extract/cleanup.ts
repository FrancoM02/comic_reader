import type { Page } from './types';

/**
 * Envuelve un generador para que `cleanup` corra exactamente una vez: al terminar,
 * al fallar, o cuando se llama return()/throw() aunque nunca se haya llamado next().
 */
export function withCleanup(inner: AsyncGenerator<Page>, cleanup: () => unknown): AsyncGenerator<Page> {
  let cleaned: Promise<void> | null = null;
  const clean = () => (cleaned ??= Promise.resolve().then(cleanup).then(() => undefined));
  const w = {
    async next() {
      try {
        const r = await inner.next();
        if (r.done) await clean();
        return r;
      } catch (e) {
        await clean();
        throw e;
      }
    },
    async return(v?: unknown) {
      try {
        await inner.return(v);
      } finally {
        await clean();
      }
      return { done: true, value: v };
    },
    async throw(e?: unknown) {
      try {
        await inner.return(undefined);
      } finally {
        await clean();
      }
      throw e;
    },
    [Symbol.asyncIterator]() {
      return w as unknown as AsyncGenerator<Page>;
    },
  };
  return w as unknown as AsyncGenerator<Page>;
}
