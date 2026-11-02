#!/usr/bin/env node
/**
 * `node tools/perf-pointer.mjs [label] [--app dir] [--moves n]` — what React renders while the
 * pointer moves over the board and nothing else changes, in the real Electron app (PERF-007).
 *
 * Build first (`pnpm build`): it drives `apps/desktop/out`, or the `apps/desktop` of another
 * checkout given as `--app`. The bifold wallet is opened from its template, the Select tool
 * active, and the pointer moved `n` times (60 by default) along a line across the wallet, one
 * move a frame, as a real pointer sends them:
 *
 *   commits   React commits during the moves
 *   App       how many times App rendered, the window around the board
 *   renders   component renders in all, and the ten components rendered most
 *   scriptMs  the renderer's script time over the same moves, with nothing counted
 *
 * Renders are counted as React DevTools counts them, by `e2e/renderCount.ts`, which the E2E guard
 * for this (`e2e/pointer-renders.spec.ts`) uses too.
 *
 * Electron draws nothing for a window the desktop covers, and then waits: run it under Xvfb, in
 * the pinned Playwright container, as `tools/perf-retention.mjs` says.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron } from '@playwright/test';

import { countRenders, installRenderCounter, nextFrame } from '../e2e/renderCount.ts';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : (args.splice(at, 2)[1] ?? fallback);
};
const appDir = resolve(option('--app', resolve(root, 'apps/desktop')));
const moves = Number(option('--moves', '60'));
const label = args[0] ?? 'run';

const app = await electron.launch({
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

await installRenderCounter(window);
await window.getByTestId('start-screen').waitFor();
await window.getByTestId('start-template').click();
await window.getByTestId('template-builtin:bifold-wallet').dblclick();
await window.getByTestId('part-count').filter({ hasText: '3' }).waitFor();
await window.getByTestId('tool-select').click();

const frame = () => nextFrame(window);
const box = await window.getByTestId('editor-canvas').boundingBox();
/** The pointer at the `i`th of `moves` steps across the wallet, over its edges and stitching. */
async function moveTo(i) {
  await window.mouse.move(box.x + box.width * (0.2 + (0.6 * i) / moves), box.y + box.height / 2);
  await frame();
}
/** Every step across, one move a frame, from where the pointer was put first. */
async function sweep() {
  for (let i = 1; i <= moves; i++) await moveTo(i);
}

await moveTo(0);
const counts = await countRenders(window, sweep);

const cdp = await window.context().newCDPSession(window);
await cdp.send('Performance.enable');
const scriptSeconds = async () =>
  (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'ScriptDuration').value;
await moveTo(0);
const before = await scriptSeconds();
await sweep();
const scriptMs = (await scriptSeconds()) - before;

const top = Object.entries(counts.by)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);
const result = {
  label,
  moves,
  commits: counts.commits,
  app: counts.by['App'] ?? 0,
  renders: counts.renders,
  scriptMs: Math.round(scriptMs * 1e4) / 10,
  top,
};
console.log(
  `${label}: ${String(moves)} moves, ${String(result.commits)} commits, App ${String(result.app)}, ` +
    `${String(result.renders)} renders, ${String(result.scriptMs)} ms of script; ` +
    top.map(([name, n]) => `${name} ${String(n)}`).join(', '),
);
console.log(JSON.stringify(result));
// A plain kill leaves Electron waiting a minute and a half for Playwright's debugger to disconnect.
app.process().kill('SIGKILL');
process.exit(0);
