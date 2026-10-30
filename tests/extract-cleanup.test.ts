import { describe, expect, it, vi } from 'vitest';
import { withCleanup } from '../src/extract/cleanup';
import type { Page } from '../src/extract/types';

async function* two(): AsyncGenerator<Page> {
  yield { index: 0, blob: new Blob(['a']) };
  yield { index: 1, blob: new Blob(['b']) };
}

describe('withCleanup', () => {
  it('limpia si se llama return() antes del primer next()', async () => {
    const cleanup = vi.fn();
    const g = withCleanup(two(), cleanup);
    await g.return(undefined);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
  it('limpia una sola vez al terminar', async () => {
    const cleanup = vi.fn();
    for await (const _ of withCleanup(two(), cleanup)) void _;
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
  it('limpia al cortar el for-await y al fallar', async () => {
    const c1 = vi.fn();
    for await (const _ of withCleanup(two(), c1)) { void _; break; }
    expect(c1).toHaveBeenCalledTimes(1);
    const c2 = vi.fn();
    async function* bad(): AsyncGenerator<Page> { throw new Error('x'); }
    await expect(withCleanup(bad(), c2).next()).rejects.toThrow('x');
    expect(c2).toHaveBeenCalledTimes(1);
  });
});
