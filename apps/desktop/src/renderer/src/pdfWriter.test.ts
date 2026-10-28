import type { SheetPlan } from '@leathercad/export';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PdfJob, PdfReply } from './pdfJob.js';
import { PdfWriterError, writePdf } from './pdfWriter.js';

/**
 * The page's side of the PDF worker (PERF-002). The worker is the boundary, so
 * it is the one thing faked: a stand-in that answers when the test says.
 */
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((event: { data: PdfReply }) => void) | null = null;
  onerror: ((event: { message: string; preventDefault: () => void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  received: PdfJob | undefined;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(job: PdfJob): void {
    this.received = job;
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(data: PdfReply): void {
    this.onmessage?.({ data });
  }
}

const job = { plan: {} as SheetPlan, applicationVersion: '1' };
const BYTES = new Uint8Array([37, 80, 68, 70]);

beforeEach(() => {
  FakeWorker.all = [];
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => vi.unstubAllGlobals());

describe('writing a PDF in a worker', () => {
  it('resolves with the bytes the worker answers, and ends the worker', async () => {
    const written = writePdf(job);
    const [worker] = FakeWorker.all;
    expect(worker?.received).toMatchObject({ ...job, at: expect.any(Number) });

    worker?.reply({ ok: true, bytes: BYTES });

    await expect(written).resolves.toBe(BYTES);
    expect(worker?.terminated).toBe(true);
  });

  it('ends the worker mid-write when cancelled, and never delivers a late answer', async () => {
    const cancel = new AbortController();
    const written = writePdf(job, cancel.signal);
    const [worker] = FakeWorker.all;

    cancel.abort();
    worker?.reply({ ok: true, bytes: BYTES });

    await expect(written).rejects.toBe(cancel.signal.reason);
    expect(worker?.terminated).toBe(true);
  });

  it('starts no worker for a cancellation that has already happened', async () => {
    const cancel = new AbortController();
    cancel.abort();

    await expect(writePdf(job, cancel.signal)).rejects.toBe(cancel.signal.reason);
    expect(FakeWorker.all).toHaveLength(0);
  });

  it('reports what the writer said when it throws', async () => {
    const written = writePdf(job);
    FakeWorker.all[0]?.reply({ ok: false, message: 'correction must be within ±2 %' });

    await expect(written).rejects.toMatchObject({
      name: 'PdfWriterError',
      kind: 'failed',
      detail: 'correction must be within ±2 %',
    });
    expect(FakeWorker.all[0]?.terminated).toBe(true);
  });

  it('reports a worker that did not start as unavailable', async () => {
    const written = writePdf(job);
    const preventDefault = vi.fn();
    FakeWorker.all[0]?.onerror?.({ message: '', preventDefault });

    await expect(written).rejects.toMatchObject({ kind: 'unavailable' });
    expect(preventDefault).toHaveBeenCalled();
    expect(FakeWorker.all[0]?.terminated).toBe(true);
  });

  it('reports a worker the browser refuses to build as unavailable, with no fallback', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('blocked by the content security policy');
        }
      },
    );

    const failure: unknown = await writePdf(job).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PdfWriterError);
    expect(failure).toMatchObject({ kind: 'unavailable' });
  });
});
