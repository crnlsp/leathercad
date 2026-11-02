import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { emptyDocument } from '@leathercad/document';
import type { Project } from '@leathercad/domain';
import { loadProject } from '@leathercad/persist';
import { describe, expect, it, vi } from 'vitest';

import { createLcpEncoder, WORKER_PATIENCE_MS, type LcpWorker } from './lcpEncoder.js';
import { runLcpJob, type LcpJob, type LcpReply } from './lcpJob.js';

const wallet = loadProject(
  readFileSync(join(import.meta.dirname, '../../../../../fixtures/projects/bifold-wallet.lcp')),
).project;
const empty = emptyDocument('blank').project;

const job = (project: Project, at = '2026-11-02T10:00:00.000Z'): LcpJob => ({
  project,
  applicationVersion: '1.6.0',
  at,
});

/**
 * A worker that answers when it is told to: the thread boundary, faked. It
 * receives what `postMessage` would, a structured clone, and makes the file
 * as the real one does.
 */
class FakeWorker implements LcpWorker {
  onmessage: LcpWorker['onmessage'] = null;
  onerror: LcpWorker['onerror'] = null;
  onmessageerror: LcpWorker['onmessageerror'] = null;
  readonly asked: LcpJob[] = [];
  terminated = false;

  postMessage(message: LcpJob): void {
    this.asked.push(structuredClone(message));
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Answers the oldest job asked of it, as the worker does: in order. */
  answer(reply?: LcpReply): void {
    const next = this.asked.shift()!;
    const data = reply ?? { ok: true, bytes: runLcpJob(next) };
    this.onmessage?.call(this as unknown as Worker, { data } as MessageEvent<LcpReply>);
  }

  /** Stops, as a worker whose script did not load or that threw does. */
  fail(): void {
    this.onerror?.call(
      this as unknown as Worker,
      {
        message: 'stopped',
        preventDefault: () => undefined,
      } as ErrorEvent,
    );
  }
}

/** Every promise settled so far, in the order each settled. */
function recorder() {
  const settled: string[] = [];
  const track = (name: string, promise: Promise<Uint8Array>) =>
    promise.then(
      (bytes) => {
        settled.push(name);
        return bytes;
      },
      (error: unknown) => {
        settled.push(`${name} failed`);
        throw error;
      },
    );
  return { settled, track };
}

describe('the .lcp encoder (PERF-009)', () => {
  it('has the worker make every file, and makes none on the window’s thread', async () => {
    const worker = new FakeWorker();
    const encode = createLcpEncoder(() => worker);
    const { settled, track } = recorder();

    const first = track('wallet', encode(job(wallet)));
    const second = track('empty', encode(job(empty)));
    await Promise.resolve();

    // Nothing is ready until the worker answers: neither was made here.
    expect(worker.asked).toHaveLength(2);
    expect(settled).toEqual([]);

    worker.answer();
    worker.answer();

    expect(await first).toEqual(runLcpJob(job(wallet)));
    expect(await second).toEqual(runLcpJob(job(empty)));
    expect(settled).toEqual(['wallet', 'empty']);
  });

  it('keeps one worker for every file, which answers in the order they were asked', async () => {
    let started = 0;
    const worker = new FakeWorker();
    const encode = createLcpEncoder(() => {
      started += 1;
      return worker;
    });
    const { settled, track } = recorder();

    const saves = ['a', 'b', 'c'].map((name) => track(name, encode(job(wallet))));
    for (let i = 0; i < 3; i++) worker.answer();
    await Promise.all(saves);

    expect(started).toBe(1);
    expect(settled).toEqual(['a', 'b', 'c']);
  });

  it('makes the file on the window’s thread when no worker can be had', async () => {
    const encode = createLcpEncoder(() => {
      throw new Error('no worker');
    });

    expect(await encode(job(wallet))).toEqual(runLcpJob(job(wallet)));
  });

  it('makes what was waiting, and what follows, on the window’s thread once the worker stops', async () => {
    const worker = new FakeWorker();
    const encode = createLcpEncoder(() => worker);
    const { settled, track } = recorder();

    const done = track('done', encode(job(empty)));
    const waiting = track('waiting', encode(job(wallet)));
    worker.answer();
    worker.fail();
    const after = track('after', encode(job(empty, '2026-11-02T11:00:00.000Z')));

    expect(await done).toEqual(runLcpJob(job(empty)));
    expect(await waiting).toEqual(runLcpJob(job(wallet)));
    expect(await after).toEqual(runLcpJob(job(empty, '2026-11-02T11:00:00.000Z')));
    expect(settled).toEqual(['done', 'waiting', 'after']);
    expect(worker.terminated).toBe(true);
  });

  it('makes what was waiting on the window’s thread when the worker goes quiet, so no save waits for ever', async () => {
    // A worker the system ends may never say so. Long past what the largest
    // project takes, the window stops waiting and makes the files itself.
    vi.useFakeTimers();
    try {
      const worker = new FakeWorker();
      const encode = createLcpEncoder(() => worker);

      const saving = encode(job(wallet));
      vi.advanceTimersByTime(WORKER_PATIENCE_MS);

      expect(await saving).toEqual(runLcpJob(job(wallet)));
      expect(worker.terminated).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for a worker that is answering, however many files it has to make', async () => {
    vi.useFakeTimers();
    try {
      const worker = new FakeWorker();
      const encode = createLcpEncoder(() => worker);

      const saves = [encode(job(wallet)), encode(job(empty)), encode(job(wallet))];
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(WORKER_PATIENCE_MS - 1);
        worker.answer();
      }
      await Promise.all(saves);

      expect(worker.terminated).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tries the window’s thread for a file the worker could not make, and says why if that fails too', async () => {
    const worker = new FakeWorker();
    const encode = createLcpEncoder(() => worker);
    // A value JSON cannot write: no thread can make a file of it.
    const broken = job({ ...wallet, name: 10n } as unknown as Project);

    const saving = encode(broken);
    worker.answer({ ok: false, message: 'Do not know how to serialize a BigInt' });

    await expect(saving).rejects.toThrow(/BigInt/);
  });
});
