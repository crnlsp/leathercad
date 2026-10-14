import { expect, type ElectronApplication, type Page } from '@playwright/test';

/**
 * The room the window gives the panels at a width (U.5's `roomAt`): wide from
 * 1280 px, narrow from 900, cramped below.
 */
function roomAt(width: number): 'wide' | 'narrow' | 'cramped' {
  return width >= 1280 ? 'wide' : width >= 900 ? 'narrow' : 'cramped';
}

/**
 * Resizes the window and waits until the app is laid out for the new size.
 *
 * `innerWidth` changes as soon as the window does, but the app learns its
 * room from media queries, which Chromium evaluates only when it next renders
 * — a frame later, longer on a loaded machine. A key pressed in between is
 * heard by the old layout: at 860 px, the Parts chip's Enter folded Parts as
 * if the window were still wide, instead of opening it over the board. So
 * this waits for the frame's own `data-room` too.
 */
export async function resizeWindow(
  app: ElectronApplication,
  window: Page,
  width: number,
  height: number,
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]?.setSize(size[0], size[1]),
    [width, height] as const,
  );
  await expect.poll(() => window.evaluate(() => innerWidth)).toBe(width);
  await expect(window.locator('.workspace')).toHaveAttribute('data-room', roomAt(width));
}
