import { expect, test, type Page } from '@playwright/test';

import { readoutAt } from './cursorReadout.js';
import { openSample, withApp } from './launchApp.js';

/**
 * 3.13: a click on a piece's body selects the piece (smart-guides spec §3). On
 * the sample bifold: the outer is 200 × 95 mm at the origin, folded at x = 100;
 * the lining below it has two 64 × 3 mm card slots, one at (18, −45).
 */

/** Where a board point in millimetres is in the window, read from the cursor readout. */
async function boardMap(window: Page): Promise<
  (mm: { x: number; y: number }) => {
    x: number;
    y: number;
  }
> {
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  const read = async (x: number, y: number) => {
    const [mx = NaN, my = NaN] =
      (await readoutAt(window, x, y))
        .replace(/−/g, '-')
        .match(/-?\d+(?:\.\d+)?/g)
        ?.map(Number) ?? [];
    return { mx, my };
  };
  const a = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.4 };
  const b = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.6 };
  const at = await read(a.x, a.y);
  const bt = await read(b.x, b.y);
  // Y is up on the board and down in the window: the map carries the sign.
  const sx = (b.x - a.x) / (bt.mx - at.mx);
  const sy = (b.y - a.y) / (bt.my - at.my);
  return (mm) => ({ x: a.x + (mm.x - at.mx) * sx, y: a.y + (mm.y - at.my) * sy });
}

/** Room for the whole bifold, framed as it opens. */
const ROOM = { size: [1600, 1000] } as const;

const header = (window: Page) => window.getByTestId('property-header');
const selected = (window: Page) => window.getByTestId('selected-count');

test('on the bifold, a click mid-panel selects the outer, on the fold the fold, in a slot nothing (3.13)', async () => {
  await withApp(async (window) => {
    await openSample(window);
    await window.getByTestId('tool-select').click();
    let board = await boardMap(window);

    // Mid-panel, away from the fold: the outer, as its heading in Parts picks it.
    const panel = board({ x: 150, y: 47.5 });
    await window.mouse.click(panel.x, panel.y);
    await expect(window.getByTestId('status-counts')).toContainText('1 part selected');
    await expect(header(window)).toContainText('Outer');

    // On the fold: the fold.
    const fold = board({ x: 100, y: 47.5 });
    await window.mouse.click(fold.x, fold.y);
    await expect(selected(window)).toHaveText('1');
    await expect(header(window)).toContainText('Fold');

    // In a card slot of the lining, close enough that its edges are farther
    // than the pick radius: nothing, and the selection is let go.
    const slot = board({ x: 50, y: -43.5 });
    await window.mouse.move(slot.x, slot.y);
    // Zoomed in about the slot until it is several pick radii tall.
    const zoom = async () =>
      Number(((await window.getByTestId('zoom-level').textContent()) ?? '').replace(/\D/g, ''));
    for (let step = 0; step < 20 && (await zoom()) < 500; step++) {
      const before = await zoom();
      await window.mouse.wheel(0, -200);
      await expect.poll(zoom).not.toBe(before);
    }
    expect(await zoom()).toBeGreaterThanOrEqual(500);
    board = await boardMap(window);
    const inSlot = board({ x: 50, y: -43.5 });
    await window.mouse.click(inSlot.x, inSlot.y);
    await expect(selected(window)).toHaveText('0');

    // Just below it, on the lining's leather: the lining.
    const below = board({ x: 50, y: -46.5 });
    await window.mouse.click(below.x, below.y);
    await expect(header(window)).toContainText('Lining');
  }, ROOM);
});

test('a drag from a piece’s body moves the piece whole, as one step of undo (3.13)', async () => {
  await withApp(async (window) => {
    await openSample(window);
    await window.getByTestId('tool-select').click();
    const board = await boardMap(window);
    const x = async (row: string): Promise<number> => {
      await window.getByTestId(`feature-row-${row}`).click();
      return Number(await window.getByTestId('property-panel').getByLabel('X').inputValue());
    };
    const outline = await x('outer-outline');
    await window.keyboard.press('Escape');

    const from = board({ x: 150, y: 47.5 });
    const to = board({ x: 170, y: 47.5 });
    await window.mouse.move(from.x, from.y);
    await window.mouse.down();
    await window.mouse.move(to.x, to.y, { steps: 6 });
    await window.mouse.up();

    // The piece moved about 20 mm (the board's snapping may land it a little
    // off), its fold with it: the fold is now where a press finds it.
    const moved = (await x('outer-outline')) - outline;
    expect(moved).toBeGreaterThan(15);
    expect(moved).toBeLessThan(25);
    await window.keyboard.press('Escape');
    const fold = board({ x: 100 + moved, y: 30 });
    await window.mouse.click(fold.x, fold.y);
    await expect(window.getByTestId('property-header')).toContainText('Fold');

    await window.getByTestId('undo').click();
    expect(await x('outer-outline')).toBeCloseTo(outline, 2);
  }, ROOM);
});
