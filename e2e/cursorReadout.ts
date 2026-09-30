import { expect, type Page } from '@playwright/test';

/** The board's cursor readout with the pointer anywhere but on the board. */
const BLANK = '— , —';

/**
 * What the status bar's cursor readout says with the pointer at a window point
 * on the board.
 *
 * The readout is React state fed by a pointer event: `CanvasHost`'s `cursorMm`,
 * an effect, `onStatus`, then `App`'s `status`. So it trails the pointer by a
 * render or two, and read straight after a move it can still show the point
 * before. Waiting for it to show a number, or to change, passes on that stale
 * number. Off the board it is blank, so this leaves the board, sees the blank,
 * and comes back once: the first number it then shows is this point's.
 */
export async function readoutAt(window: Page, x: number, y: number): Promise<string> {
  const readout = window.getByTestId('cursor-readout');
  await window.getByTestId('status-bar').hover();
  await expect(readout).toHaveText(BLANK);
  await window.mouse.move(x, y);
  await expect(readout).not.toHaveText(BLANK);
  return (await readout.textContent()) ?? '';
}
