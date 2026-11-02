import { runLcpJob, type LcpJob, type LcpReply } from './lcpJob.js';

/** What the encoder uses of a `Worker`. */
export type LcpWorker = Pick<
  Worker,
  'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'
>;

/**
 * How long the oldest job may wait for the worker before the window stops
 * waiting and makes it, and everything after it, itself. A worker the system
 * ends may never say so, and a save waiting for it would never finish; this is
 * far past what any project takes — the audit's path-heavy one, 120 ms.
 */
export const WORKER_PATIENCE_MS = 30_000;

interface Waiting {
  readonly job: LcpJob;
  readonly resolve: (bytes: Uint8Array) => void;
  readonly reject: (error: unknown) => void;
}

/**
 * Makes a project into the bytes of a `.lcp` in a worker (PERF-009), so that
 * saving, a recovery copy or a kept copy of a large project no longer stops
 * the window: the audit's 40 traced outlines took 100–140 ms to encode, with
 * nothing painted and no click answered.
 *
 * - **One worker, kept.** It answers in the order it was asked, so two saves
 *   of a tab, or a save and a copy, reach the disk in the order they were
 *   asked, as they did when each was made on the spot.
 * - **The project saved is the one asked for.** `postMessage` clones it as the
 *   save is asked, whatever is edited while the worker works; the time it was
 *   asked comes with it.
 * - **A missing worker never costs a save.** One that cannot start, that stops,
 *   or that goes quiet for `WORKER_PATIENCE_MS`, has what was waiting for it,
 *   and everything after, made on the window's thread instead, in the order
 *   asked. A save is the maker's work: unlike the PDF writer, which refuses
 *   rather than hide a packaging fault, this falls back, and
 *   `e2e/lcp-worker.spec.ts` is what sees the fault.
 */
export function createLcpEncoder(start: () => LcpWorker): (job: LcpJob) => Promise<Uint8Array> {
  /** Undefined until the first job; null once there is none to be had. */
  let worker: LcpWorker | null | undefined;
  const waiting: Waiting[] = [];
  let patience: ReturnType<typeof setTimeout> | undefined;

  /** Times the oldest job's wait afresh, or stops timing when none is waiting. */
  const watch = (): void => {
    clearTimeout(patience);
    patience = waiting.length > 0 ? setTimeout(fallBack, WORKER_PATIENCE_MS) : undefined;
  };

  const here = ({ job, resolve, reject }: Waiting): void => {
    try {
      resolve(runLcpJob(job));
    } catch (error) {
      reject(error);
    }
  };

  /** The window's thread takes over: what was waiting, in order, and all that follows. */
  const fallBack = (): void => {
    worker?.terminate();
    worker = null;
    for (const each of waiting.splice(0)) here(each);
    watch();
  };

  const started = (): LcpWorker | null => {
    if (worker !== undefined) return worker;
    try {
      const fresh = start();
      fresh.onmessage = ({ data }: MessageEvent<LcpReply>): void => {
        const each = waiting.shift();
        watch();
        if (each === undefined) return;
        // What the worker could not make is tried here, so the save says why
        // as it always did.
        if (data.ok) each.resolve(data.bytes);
        else here(each);
      };
      fresh.onerror = (event): void => {
        event.preventDefault();
        fallBack();
      };
      fresh.onmessageerror = fallBack;
      worker = fresh;
    } catch {
      worker = null;
    }
    return worker;
  };

  return (job) =>
    new Promise((resolve, reject) => {
      const each = { job, resolve, reject };
      const at = started();
      if (at === null) {
        here(each);
        return;
      }
      waiting.push(each);
      if (patience === undefined) watch();
      try {
        at.postMessage(job);
      } catch {
        // A project the structured clone refuses: made here, after what was
        // already waiting, so the order holds.
        fallBack();
      }
    });
}

/** The app's encoder. Its worker loads from the app's own origin, as the PDF writer's does (R6). */
export const encodeProject = createLcpEncoder(
  () => new Worker(new URL('./lcpWorker.ts', import.meta.url), { type: 'module' }),
);
