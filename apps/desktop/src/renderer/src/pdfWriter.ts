import type { PdfJob, PdfReply } from './pdfJob.js';

/**
 * Why a PDF was not written, as a fact the interface words (ADR 0018):
 * `unavailable` — the worker did not start or stopped without an answer — or
 * `failed`, with what the writer said.
 */
export class PdfWriterError extends Error {
  constructor(
    readonly kind: 'unavailable' | 'failed',
    readonly detail: string,
  ) {
    super(detail === '' ? `the PDF writer is ${kind}` : detail);
    this.name = 'PdfWriterError';
  }
}

/**
 * Writes the plan's PDF in a worker of its own (PERF-002), so the window keeps
 * painting and answering while a long pattern is written. A worker per file:
 * `signal` aborting ends it at once (`terminate()`), mid-write, and the
 * promise rejects with the signal's reason — a file for a plan nobody wants
 * any more is never delivered. The worker loads from the app's own origin
 * under its content security policy, like the pdf.js worker (R6).
 *
 * There is no fallback to the main thread: a worker that cannot start in a
 * packaged app is a packaging fault the packaged smoke test must see, and a
 * silent fallback would hide it. It rejects with a `PdfWriterError`, which the
 * callers show; nothing has been written at that point.
 */
export function writePdf(job: Omit<PdfJob, 'at'>, signal?: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason);
      return;
    }
    let worker: Worker | undefined;
    const end = (): void => {
      signal?.removeEventListener('abort', onAbort);
      worker?.terminate();
    };
    const onAbort = (): void => {
      end();
      reject(signal?.reason);
    };
    const fail = (error: PdfWriterError): void => {
      end();
      reject(error);
    };
    try {
      worker = new Worker(new URL('./pdfWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }: MessageEvent<PdfReply>): void => {
        if (data.ok) {
          end();
          resolve(data.bytes);
        } else fail(new PdfWriterError('failed', data.message));
      };
      worker.onerror = (event): void => {
        event.preventDefault();
        fail(new PdfWriterError('unavailable', event.message));
      };
      worker.onmessageerror = (): void => {
        fail(new PdfWriterError('unavailable', ''));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      worker.postMessage({ ...job, at: Date.now() } satisfies PdfJob);
    } catch (error) {
      fail(new PdfWriterError('unavailable', error instanceof Error ? error.message : ''));
    }
  });
}
