import type { ElectronApplication } from '@playwright/test';

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
