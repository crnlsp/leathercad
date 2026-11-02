import { expect, type ElectronApplication } from '@playwright/test';

/**
 * Ends a test's app without the unsaved-work question (slice 5.3a).
 *
 * Closing a window with unsaved work now asks first, and a test that drew
 * something and is finished is not a maker closing the window. `destroy()`
 * closes without running the page's unload, so the question is never raised;
 * the question itself is tested in `unsaved-changes.spec.ts`.
 */
export async function closeApp(app: ElectronApplication | undefined): Promise<void> {
  if (app === undefined) return;
  await app
    .evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.destroy();
    })
    .catch(() => undefined);
  await app.close().catch(() => undefined);
}

/**
 * Kills a test's app outright, as a crash would: no unload, no quit handlers.
 *
 * By the pid its main process reports, not the process Playwright started: on
 * Windows the two differ, and killing the one Playwright started left the app
 * running, its recovery copy still a live session's (A6). Resolves once the
 * main process is gone.
 */
export async function crashApp(app: ElectronApplication): Promise<void> {
  const started = app.process();
  const pid = await app.evaluate(() => process.pid);
  process.kill(pid, 'SIGKILL');
  await expect.poll(() => isRunning(pid)).toBe(false);
  // Where it is not the main process, it would otherwise outlive the test.
  started.kill('SIGKILL');
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}
