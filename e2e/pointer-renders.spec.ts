import { expect, test, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { launchApp } from './launchApp.js';
import { countRenders, installRenderCounter, nextFrame } from './renderCount.js';

/**
 * PERF-007: a pointer moving over the board changes the cursor readout, the hover halo and the
 * rulers' tick, and nothing else. The halo and the tick are painted, not rendered. So React
 * renders the readout for each move, and nothing of the window around the board: not App, not a
 * panel, not the tool bar.
 */

/** As many moves as a second of a real pointer, one a frame. */
const MOVES = 60;

/**
 * Component renders allowed for the whole sweep: one a move, the readout. The window rendered
 * whole for every move, about three hundred components each time, misses this three hundred
 * times over.
 */
const RENDERS = MOVES;

async function openWallet(window: Page): Promise<void> {
  await window.getByTestId('start-template').click();
  await window.getByTestId('template-builtin:bifold-wallet').dblclick();
  await expect(window.getByTestId('part-count')).toHaveText('3');
  await window.getByTestId('tool-select').click();
}

test('a pointer moving over the board renders the cursor readout, not the window around it (PERF-007)', async () => {
  const app = await launchApp({ startScreen: true });
  try {
    const window = await app.firstWindow();
    await installRenderCounter(window);
    await openWallet(window);
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    // Across the wallet, over its edges and stitching, so the halo comes and goes.
    const move = async (i: number): Promise<void> => {
      await window.mouse.move(
        box.x + box.width * (0.2 + (0.6 * i) / MOVES),
        box.y + box.height / 2,
      );
      await nextFrame(window);
    };
    await move(0);
    const readout = window.getByTestId('cursor-readout');
    const first = await readout.textContent();

    const counts = await countRenders(window, async () => {
      for (let i = 1; i <= MOVES; i++) await move(i);
    });

    expect
      .soft(counts.by['App'] ?? 0, 'App renders, for moves that change only the readout')
      .toBe(0);
    expect
      .soft(counts.renders, `component renders over ${String(MOVES)} moves`)
      .toBeLessThanOrEqual(RENDERS);
    // The readout still follows the pointer.
    await expect(readout).not.toHaveText(first ?? '');
    await expect(readout).toHaveText(/^-?\d/);
  } finally {
    await closeApp(app);
  }
});
