import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test, type CDPSession, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { drawAPanel, launchApp } from './launchApp.js';

/**
 * PERF-010: what the window derives from a project for the screen goes with
 * that project. The largest of it is the Sheets view's pages — about 18 MiB
 * for the audit's 5.8 m strap on 33 sheets — which the board used to keep
 * after an edit or a reload until Sheets was shown again, and which nothing
 * may keep once the project's tab is closed.
 *
 * Measured as the renderer's heap after a full collection, which counts what
 * is still reachable: the same to a twentieth of a MiB run after run, and
 * moved by no load. Each bound is half the pages this run measured, so it
 * holds on any machine, and keeping the pages misses it twice over.
 */
const STRAP = resolve(import.meta.dirname, '../fixtures/perf/strap-5800.lcp');

/** The renderer's heap after two full collections, in MiB. */
async function heapMiB(cdp: CDPSession): Promise<number> {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return usedSize / 2 ** 20;
}

/** Shows the Sheets view, which builds its pages, and goes back to Design. */
async function visitSheets(window: Page): Promise<void> {
  const canvas = window.getByTestId('editor-canvas');
  await window.getByTestId('view-sheets').click();
  await expect(canvas).toHaveAttribute('data-view', 'sheets');
  await window.getByTestId('view-design').click();
  await expect(canvas).toHaveAttribute('data-view', 'design');
}

test('a project’s Sheets pages go with it once it is edited, reloaded or closed (PERF-010)', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'leathercad-e2e-')), 'Strap.lcp');
  copyFileSync(STRAP, file);
  const app = await launchApp({ startScreen: true });
  try {
    const window = await app.firstWindow();
    const cdp = await window.context().newCDPSession(window);
    await expect(window.getByTestId('start-screen')).toBeVisible();
    const empty = await heapMiB(cdp);

    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, file);
    await window.getByTestId('start-open').click();
    await expect(window.getByTestId('part-count')).toHaveText('1');
    // On Design the board has the plan, for the tape joins, and no pages.
    const shown = await heapMiB(cdp);
    await visitSheets(window);
    const pages = (await heapMiB(cdp)) - shown;
    expect(pages, 'the strap’s Sheets pages, the thing measured').toBeGreaterThan(10);
    const bound = pages / 2;

    // An edit makes a new plan: the last revision's pages have no more use.
    await drawAPanel(window, { parts: '2' });
    const edited = (await heapMiB(cdp)) - shown;
    expect.soft(edited, 'over the project, after an edit').toBeLessThan(bound);

    // A reload replaces the project in its tab.
    await window.getByTestId('project-tab').first().click({ button: 'right' });
    await window.getByTestId('tab-reload').click();
    await window.getByTestId('unsaved-discard').click();
    await expect(window.getByTestId('part-count')).toHaveText('1');
    const reloaded = (await heapMiB(cdp)) - shown;
    expect.soft(reloaded, 'over the project, after a reload').toBeLessThan(bound);

    // Its tab closed, with its pages built again, nothing of it is kept.
    await visitSheets(window);
    await window.keyboard.press('Control+w');
    await expect(window.getByTestId('start-screen')).toBeVisible();
    const closed = (await heapMiB(cdp)) - empty;
    expect.soft(closed, 'over the start screen, closed').toBeLessThan(bound);
  } finally {
    await closeApp(app);
  }
});
