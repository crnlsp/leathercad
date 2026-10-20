import { expect, test, type Locator, type Page } from '@playwright/test';

import { withSample } from './launchApp.js';
import { resizeWindow } from './windowSize.js';

/**
 * U.11, R-11: the work bar's one long sentence is short hints — a key as a cap
 * and a few words, per tool and state — the lowest-ranked dropping first as the
 * bar narrows, "? all keys" never, and none cut short by the edge.
 */

const hints = (window: Page): Locator => window.getByTestId('tool-how-to').locator('.work-hint');
const words = (window: Page): Promise<string[]> =>
  hints(window).evaluateAll((items) => items.map((item) => item.textContent ?? ''));
const hint = (window: Page, key: string): Locator =>
  window.getByTestId('tool-how-to').locator(`[data-hint="${key}"]`);

/** The hints that are shown, each wholly inside the room the bar gives them. */
async function expectWhole(window: Page): Promise<void> {
  // The row refits from a ResizeObserver, which sets React state: it renders
  // a task after the resize, so the hints the last width kept can still be
  // there when the window has its new size. Asked again until it settles.
  await expect(async () => {
    const slot = (await window.getByTestId('tool-how-to').locator('..').boundingBox())!;
    for (const box of await hints(window).evaluateAll((items) =>
      items.map((item) => {
        const { left, right } = item.getBoundingClientRect();
        return { left, right, clipped: item.scrollWidth > item.clientWidth };
      }),
    )) {
      expect(box.clipped).toBe(false);
      expect(box.left).toBeGreaterThanOrEqual(slot.x - 0.5);
      expect(box.right).toBeLessThanOrEqual(slot.x + slot.width + 0.5);
    }
  }).toPass({ timeout: 5_000 });
}

test('Select says what a click, a key and a drag do, and what a selection adds (U.11)', async () => {
  await withSample(async (window) => {
    await window.getByTestId('tool-select').click();
    // Nothing selected: the way in, as the mockup draws it, keys as caps.
    await expect(hint(window, 'hints.clickSelects')).toHaveText('Click selects');
    await expect(hint(window, 'hints.addsOrRemoves').locator('kbd')).toHaveText('Shift');
    await expect(hint(window, 'hints.dragBox')).toHaveText('Drag a box to select');
    await expect(hint(window, 'hints.deletes')).toHaveCount(0);
    await expect(hints(window).last().locator('kbd')).toHaveText('?');
    await expect(hints(window).last()).toHaveText('? all keys');

    // An outline selected: Enter opens its sizes, Del deletes.
    await window.getByTestId('feature-row-outer-outline').click();
    await expect(hint(window, 'hints.editsSizes').locator('kbd')).toHaveText('Enter');
    await expect(hint(window, 'hints.deletes').locator('kbd')).toHaveText('Del');
    await expect(hint(window, 'hints.clickSelects')).toHaveCount(0);

    // Something that has no sizes on the board: Del and Esc, no Enter.
    await window.getByTestId('feature-row-outer-stitch').click();
    await expect(hint(window, 'hints.deletes')).toBeVisible();
    await expect(hint(window, 'hints.editsSizes')).toHaveCount(0);
  });
});

test('every tool has its hints, and a tool that needs a selection says how to get one (U.11)', async () => {
  await withSample(async (window) => {
    for (const tool of [
      'rectangle',
      'circle',
      'arc',
      'line',
      'polyline',
      'hardware',
      'text',
      'measure',
      'points',
      'rotate',
      'scale',
    ]) {
      await window.getByTestId(`tool-${tool}`).click();
      const shown = await words(window);
      expect(shown.length, tool).toBeGreaterThanOrEqual(3);
      expect(shown.at(-1), tool).toBe('? all keys');
    }

    // Nothing is selected on the sample: Rotate cannot turn anything yet.
    await window.getByTestId('tool-rotate').click();
    await expect(hint(window, 'hints.rotatePick').locator('kbd')).toHaveText('V');
    await window.getByTestId('feature-row-outer-outline').click();
    await expect(hint(window, 'hints.rotateDrag')).toBeVisible();
    await expect(hint(window, 'hints.rotatePick')).toHaveCount(0);
  });
});

test('a shape under way offers Esc, and the keys of that run (U.11)', async () => {
  await withSample(async (window) => {
    const board = (await window.getByTestId('editor-canvas').boundingBox())!;
    const at = { x: board.x + board.width * 0.3, y: board.y + board.height * 0.6 };

    await window.getByTestId('tool-rectangle').click();
    await expect(hint(window, 'hints.rectangleDrag')).toBeVisible();
    await expect(hint(window, 'hints.cancels')).toHaveCount(0);
    await window.mouse.move(at.x, at.y);
    await window.mouse.click(at.x, at.y);
    await window.mouse.move(at.x + 80, at.y - 60);
    await expect(hint(window, 'hints.rectangleCorner')).toBeVisible();
    await expect(hint(window, 'hints.cancels').locator('kbd')).toHaveText('Esc');
    await window.keyboard.press('Escape');
    await expect(hint(window, 'hints.rectangleDrag')).toBeVisible();
    await expect(hint(window, 'hints.cancels')).toHaveCount(0);

    // A polyline: A, Enter and Backspace work only once a point is down.
    await window.getByTestId('tool-polyline').click();
    await expect(hint(window, 'hints.polylinePoints')).toBeVisible();
    await expect(hint(window, 'hints.arcsNext')).toHaveCount(0);
    await window.mouse.click(at.x, at.y);
    await window.mouse.move(at.x + 80, at.y - 60);
    await expect(hint(window, 'hints.finishes').locator('kbd')).toHaveText('Enter');
    await expect(hint(window, 'hints.takesBack').locator('kbd')).toHaveText('Backspace');
    await expect(hint(window, 'hints.arcsNext').locator('kbd')).toHaveText('A');
    // Switching tool leaves the run, and the hints are the new tool's.
    await window.getByTestId('tool-circle').click();
    await expect(hint(window, 'hints.circleDrag')).toBeVisible();
    await expect(hint(window, 'hints.finishes')).toHaveCount(0);
  });
});

test('as the bar narrows the lowest-ranked hints go first, whole, and "all keys" stays (U.11)', async () => {
  await withSample(async (window, app) => {
    // The rectangle's options take most of the bar: the hints are what is left.
    await window.getByTestId('tool-rectangle').click();
    const counts: number[] = [];
    for (const width of [1920, 1280, 1100, 1024, 900, 860]) {
      await resizeWindow(app, window, width, 700);
      await expectWhole(window);
      const shown = await words(window);
      counts.push(shown.length);
      expect(shown.at(-1), `${String(width)} px`).toBe('? all keys');
    }
    // Never more hints in less room, and at the minimum window only "all keys" is left.
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(counts[0]).toBe(5);
    expect(counts.at(-1)).toBe(1);

    // Which go first is the rank's, not the width's: at 1100 the first rank-ordered ones stay.
    await resizeWindow(app, window, 1100, 700);
    const kept = await hints(window).evaluateAll((items) =>
      items.map((item) => item.getAttribute('data-hint')),
    );
    const order = [
      'hints.rectangleDrag',
      'hints.keepSquare',
      'hints.typeSize',
      'hints.backToSelect',
    ];
    const droppedAt = order.findIndex((key) => !kept.includes(key));
    if (droppedAt >= 0) {
      for (const later of order.slice(droppedAt)) expect(kept).not.toContain(later);
    }

    // Wider again, they come back.
    await resizeWindow(app, window, 1920, 1080);
    await expect(hints(window)).toHaveCount(5);
  });
});

test('the Sheets view has its hints too, with the keys as caps (U.11)', async () => {
  await withSample(async (window) => {
    await window.getByTestId('view-sheets').click();
    const bar = window.getByTestId('sheets-hint');
    await expect(bar).toContainText('Click a piece to see where it prints');
    await expect(bar.locator('kbd').first()).toHaveText('Ctrl+P');
    await expect(bar.locator('kbd').last()).toHaveText('?');
  });
});
