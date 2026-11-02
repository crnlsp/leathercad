import type { Page } from '@playwright/test';

/** Observe the same cold export as the responsiveness guard, without changing its budget. */
export function profilePdfExport(window: Page) {
  return window.evaluateHandle(() => {
    const started = performance.now();
    performance.mark('pdf-profile-start');
    const profile = {
      started,
      gap: 0,
      callbackGap: 0,
      frames: 0,
      click: 0,
      initial: {
        fonts: document.fonts.status,
        visibility: document.visibilityState,
        focus: document.hasFocus(),
        dpr: devicePixelRatio,
        width: innerWidth,
        height: innerHeight,
      },
      lateFrames: [] as Array<{ at: number; timestampGap: number; callbackGap: number }>,
      longTasks: [] as Array<{ at: number; duration: number }>,
      worker: [] as Array<{ phase: string; at: number; duration?: number }>,
    };
    const readTasks = (entries: PerformanceEntry[]): void => {
      for (const entry of entries)
        profile.longTasks.push({ at: entry.startTime, duration: entry.duration });
    };
    const observer = new PerformanceObserver((entries) => readTasks(entries.getEntries()));
    observer.observe({ entryTypes: ['longtask'] });
    const Native = globalThis.Worker;
    globalThis.Worker = class extends Native {
      private readonly pdf: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        const at = performance.now();
        super(url, options);
        this.pdf = /pdfWorker-/.test(String(url));
        if (this.pdf) {
          profile.worker.push({ phase: 'construct', at, duration: performance.now() - at });
          this.addEventListener('message', () =>
            profile.worker.push({ phase: 'reply', at: performance.now() }),
          );
        }
      }
      override postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ): void {
        const at = performance.now();
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
        if (this.pdf)
          profile.worker.push({ phase: 'postMessage', at, duration: performance.now() - at });
      }
    };
    const onClick = (event: MouseEvent): void => {
      if (
        event.target instanceof Element &&
        event.target.closest('[data-testid="export-pdf"]') !== null
      ) {
        profile.click = performance.now();
        performance.mark('pdf-profile-click');
      }
    };
    document.addEventListener('click', onClick, true);
    let last = started;
    let lastCallback = started;
    let pending: number;
    const frame = (now: number): void => {
      const callback = performance.now();
      const timestampGap = now - last;
      const callbackGap = callback - lastCallback;
      profile.gap = Math.max(profile.gap, timestampGap);
      profile.callbackGap = Math.max(profile.callbackGap, callbackGap);
      profile.frames += 1;
      if (timestampGap > 50 || callbackGap > 50)
        profile.lateFrames.push({ at: callback, timestampGap, callbackGap });
      last = now;
      lastCallback = callback;
      pending = requestAnimationFrame(frame);
    };
    pending = requestAnimationFrame(frame);
    return {
      stop: () => {
        cancelAnimationFrame(pending);
        readTasks(observer.takeRecords());
        observer.disconnect();
        globalThis.Worker = Native;
        document.removeEventListener('click', onClick, true);
        return { ...profile, ended: performance.now(), finalVisibility: document.visibilityState };
      },
    };
  });
}

/** Optional diagnostic trace; kept separate so normal E2E runs retain their timing. */
export async function tracePdfExport(window: Page) {
  const session = await window.context().newCDPSession(window);
  await session.send('Performance.enable');
  const before = await session.send('Performance.getMetrics');
  await session.send('Tracing.start', {
    categories: 'devtools.timeline,v8,blink.user_timing,cc,gpu',
    transferMode: 'ReturnAsStream',
  });
  return {
    stop: async () => {
      const after = await session.send('Performance.getMetrics');
      const complete = new Promise<{ stream?: string }>((resolve) =>
        session.once('Tracing.tracingComplete', resolve),
      );
      await session.send('Tracing.end');
      const { stream } = await complete;
      if (stream === undefined) throw new Error('Chromium returned no PDF profile trace');
      let trace = '';
      for (;;) {
        const chunk = await session.send('IO.read', { handle: stream });
        trace += chunk.base64Encoded
          ? Buffer.from(chunk.data, 'base64').toString('utf8')
          : chunk.data;
        if (chunk.eof) break;
      }
      await session.send('IO.close', { handle: stream });
      await session.detach();
      const metrics = Object.fromEntries(
        after.metrics.map(({ name, value }) => [
          name,
          value - (before.metrics.find((metric) => metric.name === name)?.value ?? 0),
        ]),
      );
      return {
        metrics,
        trace: trace
          .replaceAll(process.cwd(), '<checkout>')
          .replaceAll('/Users/runner', '<runner>'),
      };
    },
  };
}
