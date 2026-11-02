import { runLcpJob, type LcpJob, type LcpReply } from './lcpJob.js';

/**
 * The `.lcp` writer's worker (PERF-009): a job in, its file out, one after
 * another in the order asked, for as long as the window lives. The file is
 * moved back to the window, not copied.
 */
self.addEventListener('message', (event: MessageEvent<LcpJob>) => {
  // A dedicated worker hears only the page that started it, through the
  // worker's own port, where a message has no origin or the app's own. One
  // from anywhere else is not that page's, and is not answered.
  if (event.origin !== '' && event.origin !== self.location.origin) return;
  let reply: LcpReply;
  try {
    reply = { ok: true, bytes: runLcpJob(event.data) };
  } catch (error) {
    reply = { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(reply, reply.ok ? { transfer: [reply.bytes.buffer] } : {});
});
