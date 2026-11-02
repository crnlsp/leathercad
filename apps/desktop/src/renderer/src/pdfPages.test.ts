import { beforeEach, describe, expect, it, vi } from 'vitest';

import { limitConcurrency, openPdf } from './pdfPages.js';

/**
 * pdf.js is the boundary faked here: a loading task whose file is read when
 * the test says, and which records being destroyed — what ends its worker.
 */
const pdfjs = vi.hoisted(() => {
  const tasks: Array<{
    destroyed: number;
    open: (doc: unknown) => void;
    fail: (error: unknown) => void;
  }> = [];
  return {
    tasks,
    getDocument: () => {
      let open!: (doc: unknown) => void;
      let fail!: (error: unknown) => void;
      const promise = new Promise((resolve, reject) => {
        open = resolve;
        fail = reject;
      });
      const task = { destroyed: 0, open, fail };
      tasks.push(task);
      return {
        promise,
        destroy: () => {
          task.destroyed += 1;
          fail(new Error('Loading aborted'));
          return Promise.resolve();
        },
      };
    },
  };
});
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  RenderingCancelledException: class extends Error {},
  getDocument: pdfjs.getDocument,
}));

beforeEach(() => {
  pdfjs.tasks.length = 0;
});

const bytes = new Uint8Array([37, 80, 68, 70]);

describe('openPdf (PERF-013)', () => {
  it('ends the load at once when the preview no longer wants it, mid-read', async () => {
    const ended = new AbortController();
    const opening = openPdf(bytes, ended.signal);
    ended.abort();
    expect(pdfjs.tasks[0]?.destroyed).toBe(1);
    await expect(opening).rejects.toThrow('Loading aborted');
  });

  it('never starts a worker it keeps for a preview already gone', async () => {
    const ended = new AbortController();
    ended.abort();
    await expect(openPdf(bytes, ended.signal)).rejects.toThrow();
    expect(pdfjs.tasks[0]?.destroyed).toBe(1);
  });

  it('ends the load when pdf.js cannot read the file', async () => {
    const opening = openPdf(bytes, new AbortController().signal);
    pdfjs.tasks[0]?.fail(new Error('Invalid PDF structure'));
    await expect(opening).rejects.toThrow('Invalid PDF structure');
    expect(pdfjs.tasks[0]?.destroyed).toBe(1);
  });

  it('keeps an open document until the preview is done with it', async () => {
    const ended = new AbortController();
    const opening = openPdf(bytes, ended.signal);
    const doc = {};
    pdfjs.tasks[0]?.open(doc);
    await expect(opening).resolves.toBe(doc);
    expect(pdfjs.tasks[0]?.destroyed).toBe(0);
    ended.abort();
    expect(pdfjs.tasks[0]?.destroyed).toBe(1);
  });
});

describe('limitConcurrency (PERF-013)', () => {
  it('runs every task, never more than the limit at once, the waiting in order', async () => {
    const run = limitConcurrency(3);
    let running = 0;
    let most = 0;
    const order: number[] = [];
    const releases: Array<() => void> = [];
    const all = Array.from({ length: 33 }, (_, i) =>
      run(async () => {
        running += 1;
        most = Math.max(most, running);
        order.push(i);
        await new Promise<void>((resolve) => releases.push(resolve));
        running -= 1;
        return i;
      }),
    );
    // Each settled task lets the next in; release them as they start.
    for (let released = 0; released < 33; released++) {
      await vi.waitFor(() => expect(releases.length).toBeGreaterThan(released));
      releases[released]?.();
    }
    expect(await Promise.all(all)).toEqual(order);
    expect(order).toEqual(Array.from({ length: 33 }, (_, i) => i));
    expect(most).toBe(3);
  });

  it('frees the slot of a task that failed', async () => {
    const run = limitConcurrency(1);
    await expect(run(() => Promise.reject(new Error('cancelled')))).rejects.toThrow('cancelled');
    await expect(run(() => Promise.resolve('next'))).resolves.toBe('next');
  });

  it('refuses a limit below one, naming it', () => {
    expect(() => limitConcurrency(0)).toThrow(/not 0/);
  });
});
