#!/usr/bin/env node
/**
 * `node tools/perf-retention.mjs [label] [--project file.lcp] [--app dir]` — what the renderer
 * still holds of a project it no longer needs, in the real Electron app (PERF-010).
 *
 * Build first (`pnpm build`): it drives `apps/desktop/out`, or the `apps/desktop` of another
 * checkout given as `--app`, so a build before a change can run beside one after it. The
 * project — by default `fixtures/perf/strap-5800.lcp`, the 5.8 m strap on 33 A4 sheets — is
 * opened from a copy and shown on Sheets, then on Design with the pointer over it, so the Sheets
 * pages and the snap index are built. Then:
 *
 *   empty    the start screen the app opens on, before any project
 *   open     the project open, back on Design
 *   edit     a panel drawn on Design: the revision before it has no more use for its pages
 *   reload   *Reload from disk*, which replaces the tab's document in place
 *   close    its tab closed, back on the start screen
 *
 * Each figure is the heap the renderer uses after two full collections (`HeapProfiler.
 * collectGarbage`, then `Runtime.getHeapUsage`): what is still reachable, not what is waiting to
 * be collected. `reachable` says whether the project the step left behind still is, read through a
 * `WeakRef` to it; for a reload, again once Sheets and Design have been shown since.
 *
 * Electron draws nothing for a window the desktop covers, and then waits: run it under Xvfb, in
 * the pinned Playwright container as `tools/visual.mjs` does, where a run takes ten seconds.
 */
/* global document */
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : resolve(args.splice(at, 2)[1] ?? '');
};
const source = option('--project', resolve(root, 'fixtures/perf/strap-5800.lcp'));
const appDir = option('--app', resolve(root, 'apps/desktop'));
const label = args[0] ?? 'run';
const project = join(mkdtempSync(join(tmpdir(), 'lc-perf-retention-')), 'Project.lcp');
copyFileSync(source, project);

const app = await electron.launch({
  // A window behind another stops getting animation frames, and with them Playwright's checks
  // and the board's paints: keep it running as if it were in front.
  args: [
    '.',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling',
  ],
  cwd: appDir,
  env: {
    ...process.env,
    XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'lc-perf-')),
    XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'lc-perf-state-')),
  },
});
const window = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000));
await window.waitForTimeout(1500);
const cdp = await window.context().newCDPSession(window);

async function heap() {
  await window.waitForTimeout(300);
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return usedSize / 2 ** 20;
}

/** Keeps a `WeakRef` to the project the board shows, found through React's fiber on the canvas. */
const watchProject = () =>
  window.evaluate(() => {
    const canvas = document.querySelector('[data-testid="editor-canvas"]');
    const key = Object.keys(canvas).find((name) => name.startsWith('__reactFiber'));
    let fiber = canvas[key];
    while (fiber.memoizedProps?.cameras === undefined) fiber = fiber.return;
    window.__watched = new WeakRef(fiber.memoizedProps.store.getState().document.project);
  });
const reachable = async () => {
  await heap();
  return window.evaluate(() => window.__watched.deref() !== undefined);
};

const canvas = window.getByTestId('editor-canvas');
/** Every view's caches built: the Sheets pages, then the snap index under a pointer on Design. */
async function useEveryView() {
  await window.keyboard.press('Control+2');
  await window.waitForTimeout(800);
  await window.keyboard.press('Control+1');
  await window.waitForTimeout(300);
  const box = await canvas.boundingBox();
  for (let i = 0; i < 10; i++) {
    await window.mouse.move(box.x + 200 + i * 40, box.y + 300);
    await window.waitForTimeout(30);
  }
  await window.waitForTimeout(300);
}

const result = { empty: await heap() };

await app.evaluate(({ dialog }, path) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
}, project);
await window.keyboard.press('Control+o');
await window.getByTestId('part-count').waitFor();
await window.waitForTimeout(500);
await useEveryView();
result.open = await heap();

await window.getByTestId('tool-rectangle').click({ force: true });
const box = await canvas.boundingBox();
await window.mouse.move(box.x + 150, box.y + 650);
await window.mouse.down();
await window.mouse.move(box.x + 300, box.y + 760, { steps: 5 });
await window.mouse.up();
await window.waitForTimeout(500);
result.edit = await heap();

await watchProject();
await window.getByTestId('project-tab').first().click({ button: 'right', force: true });
await window.getByTestId('tab-reload').click({ force: true });
await window.getByTestId('unsaved-discard').click({ force: true });
await window.waitForTimeout(800);
result.reload = await heap();
result.reloadReachable = await reachable();

await useEveryView();
result.reloadReachableAfterUse = await reachable();
await watchProject();
await window.keyboard.press('Control+w');
await window.getByTestId('part-count').waitFor({ state: 'detached' });
await window.waitForTimeout(500);
result.close = await heap();
result.closeReachable = await reachable();

const mib = (n) => `${n.toFixed(1)} MiB`;
console.log(
  `${label}: empty ${mib(result.empty)}, open ${mib(result.open)}, edit ${mib(result.edit)}, ` +
    `reload ${mib(result.reload)} (replaced project reachable: ${String(result.reloadReachable)}, ` +
    `and after using the board: ${String(result.reloadReachableAfterUse)}), ` +
    `close ${mib(result.close)} (closed project reachable: ${String(result.closeReachable)})`,
);
console.log(JSON.stringify({ label, ...result }));
// Nothing here needs a clean quit, and a plain kill leaves Electron waiting a minute and a half for
// Playwright's debugger to disconnect, over the next run.
app.process().kill('SIGKILL');
process.exit(0);
