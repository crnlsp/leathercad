#!/usr/bin/env node
/**
 * `node tools/perf-folds.mjs [label] [--app dir] [--cycles n]` — how many folded pieces the
 * window holds for Parts, in the real Electron app, as projects open and close (PERF-016).
 *
 * Build first (`pnpm build`): it drives `apps/desktop/out`, or the `apps/desktop` of another
 * checkout given as `--app`, so a build before a change can run beside one after it. A bifold
 * wallet from its template stays open throughout, folding nothing: the start screen unmounts
 * Parts, so only a window that keeps a project open shows what it keeps. Each cycle: another
 * wallet in a tab of its own (the template gives its pieces the same ids every time), each piece
 * it shows open folded, a panel drawn and folded too — a piece with an id of its own — and the
 * tab closed, its work discarded. After the cycles, one more wallet.
 *
 *   held     the fold set Parts holds after each cycle's folds, read off React's fiber
 *   kept     the same, back in the wallet that stayed, once the cycle's tab is closed
 *   fresh    the same, in the wallet opened after the last cycle
 *   shown    how many of the pieces the tree shows folded there, where none was folded
 *
 * Counts, not time: a run gives the same figures every time. Electron draws nothing for a window
 * the desktop covers, and then waits: run it under Xvfb, in the pinned Playwright container, as
 * `tools/perf-retention.mjs` says.
 */
/* global document, requestAnimationFrame */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : (args.splice(at, 2)[1] ?? fallback);
};
const appDir = resolve(option('--app', resolve(root, 'apps/desktop')));
const cycles = Number(option('--cycles', '5'));
const label = args[0] ?? 'run';

const app = await electron.launch({
  // A window behind another stops getting animation frames, and with them Playwright's checks:
  // keep it running as if it were in front.
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
await window.getByTestId('start-screen').waitFor();

/** Two frames: React has committed what the last input asked for. */
const settle = () =>
  window.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );

/**
 * The fold set's size: the first Set-valued state of the `PartsList` that holds the tree. Found
 * from the root down, where every fiber is the one on screen: a DOM node's own may be the last
 * render's but one, whose state is older.
 */
async function held() {
  await settle();
  return window.evaluate(() => {
    const tree = document.querySelector('[data-testid="parts-list"]');
    let fiber = tree[Object.keys(tree).find((name) => name.startsWith('__reactFiber'))];
    while (fiber.tag !== 3) fiber = fiber.return;
    const stack = [fiber.stateNode.current];
    while (stack.length > 0) {
      const at = stack.pop();
      if (at.type?.name === 'PartsList') {
        let hook = at.memoizedState;
        while (hook !== null && !(hook.memoizedState instanceof Set)) hook = hook.next;
        return hook === null ? null : hook.memoizedState.size;
      }
      if (at.sibling) stack.push(at.sibling);
      if (at.child) stack.push(at.child);
    }
    return null;
  });
}
const pieces = () =>
  window.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="part-fold-"]')].map((fold) =>
      fold.getAttribute('data-testid').slice('part-fold-'.length),
    ),
  );

/** A wallet in a tab of its own: the first from the start screen, the rest from the Project menu. */
async function openWallet({ first = false } = {}) {
  if (first) await window.getByTestId('start-template').click();
  else {
    await window.getByTestId('project-menu').click();
    await window.getByTestId('new-template').click();
  }
  await window.getByTestId('template-builtin:bifold-wallet').dblclick();
  await window.getByTestId('part-count').filter({ hasText: '3' }).waitFor();
  if (first) await window.getByTestId('start-screen').waitFor({ state: 'detached' });
}

/** Folds every piece the tree shows open: one already shown folded would open again. */
async function foldOpen(ids) {
  for (const id of ids) {
    const heading = window.getByTestId(`part-heading-${id}`);
    if ((await heading.getAttribute('aria-expanded')) === 'true') {
      await window.getByTestId(`part-fold-${id}`).click();
      await window.locator(`[data-testid="part-heading-${id}"][aria-expanded="false"]`).waitFor();
    }
  }
}

async function shownFolded() {
  await settle();
  return window.locator('[data-testid^="part-heading-"][aria-expanded="false"]').count();
}

await openWallet({ first: true });
const tabs = window.getByTestId('project-tab');
const result = { held: [], kept: [] };
for (let cycle = 0; cycle < cycles; cycle++) {
  await openWallet();
  await tabs.nth(1).waitFor();
  const wallet = await pieces();
  await foldOpen(wallet);
  await window.getByTestId('tool-rectangle').click();
  const box = await window.getByTestId('editor-canvas').boundingBox();
  await window.mouse.move(box.x + 150, box.y + 150);
  await window.mouse.down();
  await window.mouse.move(box.x + 300, box.y + 260, { steps: 5 });
  await window.mouse.up();
  await window.getByTestId('part-count').filter({ hasText: '4' }).waitFor();
  await foldOpen((await pieces()).filter((id) => !wallet.includes(id)));
  result.held.push(await held());
  await window.keyboard.press('Control+w');
  await window.getByTestId('unsaved-discard').click();
  await window.getByTestId('part-count').filter({ hasText: '3' }).waitFor();
  result.kept.push(await held());
}
result.keptShown = await shownFolded();
await openWallet();
result.fresh = await held();
result.shown = await shownFolded();

console.log(
  `${label}: held after each cycle ${result.held.join(', ')}; in the wallet that stayed ` +
    `${result.kept.join(', ')}, ${String(result.keptShown)} pieces shown folded; a wallet opened ` +
    `after ${String(cycles)} cycles holds ${String(result.fresh)} and shows ` +
    `${String(result.shown)} of its pieces folded`,
);
console.log(JSON.stringify({ label, cycles, ...result }));
// A plain kill leaves Electron waiting a minute and a half for Playwright's debugger to disconnect.
app.process().kill('SIGKILL');
process.exit(0);
