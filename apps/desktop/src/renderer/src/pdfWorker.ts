import { runPdfJob, type PdfJob, type PdfReply } from './pdfJob.js';

/**
 * The PDF writer's worker (PERF-002): one job in, one reply out, and the page
 * ends the worker with `terminate()` when it has the reply or no longer wants
 * it. pdf-lib compresses every content stream in one synchronous `save()`,
 * which yielding between pages cannot split, so a long pattern blocked the
 * window until the worker took it. No font is loaded here: text is vendored
 * glyph outlines (ADR 0011).
 */
self.addEventListener('message', (event: MessageEvent<PdfJob>) => {
  void runPdfJob(event.data).then(
    (bytes) => {
      const reply: PdfReply = { ok: true, bytes };
      // The file is moved to the page, not copied.
      self.postMessage(reply, { transfer: [bytes.buffer] });
    },
    (error: unknown) => {
      const reply: PdfReply = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(reply);
    },
  );
});
