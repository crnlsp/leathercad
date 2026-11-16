import type { Page } from '@playwright/test';

import { readoutAt } from './cursorReadout.js';

/** Where a board point in millimetres is in the window, read from the cursor readout. */
export async function boardMap(window: Page): Promise<
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
