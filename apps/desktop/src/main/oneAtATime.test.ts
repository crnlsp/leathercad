import { describe, expect, it } from 'vitest';

import { OneAtATime } from './oneAtATime.js';

/** One file dialog at a time (8.12): a second asked for while one is up is not shown. */
describe('one task at a time', () => {
  it('answers a task asked for while another runs with `busy`, without running it', async () => {
    const one = new OneAtATime();
    let finish: (path: string) => void = () => undefined;
    const first = one.run<string | null>(null, () => new Promise((done) => (finish = done)));
    let ran = false;
    const second = await one.run<string | null>(null, () => {
      ran = true;
      return Promise.resolve('/p/other.lcp');
    });
    expect(second).toBeNull();
    expect(ran).toBe(false);

    finish('/p/Wallet.lcp');
    expect(await first).toBe('/p/Wallet.lcp');
  });

  it('runs the next once the first is answered, or has failed', async () => {
    const one = new OneAtATime();
    await expect(one.run(null, () => Promise.reject(new Error('no display')))).rejects.toThrow();
    expect(await one.run<string | null>(null, () => Promise.resolve('/p/Belt.lcp'))).toBe(
      '/p/Belt.lcp',
    );
  });
});
