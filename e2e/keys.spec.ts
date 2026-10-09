import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { launchApp } from './launchApp.js';

/**
 * Keys by where they are, shown as caps, and tooltips that fit (U.3, §2
 * *Shortcuts*, R-10).
 *
 * Another keyboard layout is played with synthetic key events: a German or a
 * French keyboard's press is a `code` — where the key is — and the `key` that
 * layout types there. The layout the app shows keys in is
 * `navigator.keyboard.getLayoutMap()`, stubbed here with a German one.
 */

async function withSample(body: (window: Page, app: ElectronApplication) => Promise<void>) {
  const app = await launchApp({
    env: { XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'leathercad-e2e-')) },
  });
  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId('app-version')).not.toBeEmpty();
    await window.getByTestId('open-sample').click();
    await expect(window.getByTestId('part-count')).not.toHaveText('0');
    await body(window, app);
  } finally {
    await closeApp(app);
  }
}

async function resize(app: ElectronApplication, width: number, height: number): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]?.setSize(size[0], size[1]),
    [width, height] as const,
  );
}

/** A key press as a keyboard of another layout sends it. */
async function press(
  window: Page,
  init: { code: string; key: string; ctrlKey?: boolean; shiftKey?: boolean },
): Promise<void> {
  await window.evaluate((event) => {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { ...event, bubbles: true, cancelable: true }),
    );
  }, init);
}

test('a tooltip at the window’s right edge is one line, 8 px inside it (R-10, mockup 16)', async () => {
  await withSample(async (window, app) => {
    await resize(app, 860, 600);
    await expect.poll(() => window.evaluate(() => innerWidth)).toBe(860);

    await window.getByTestId('view-sheets').hover();
    const tip = window.getByRole('tooltip', { name: /See the pieces on the sheets/ });
    await expect(tip).toBeVisible();
    const box = (await tip.boundingBox())!;
    // It was a 68 px column, five lines tall, flush with the edge.
    expect(box.x + box.width).toBeCloseTo(860 - 8, 0);
    expect(box.width).toBeLessThanOrEqual(360);
    expect(box.height).toBeLessThan(36);
    await expect(tip.locator('kbd')).toHaveText('Ctrl+2');
  });
});

test('near the window’s foot, a tooltip opens above its control (R-10)', async () => {
  await withSample(async (window, app) => {
    await resize(app, 1280, 600);
    await expect.poll(() => window.evaluate(() => innerHeight)).toBe(600);
    // The lining has no stitching: Properties offers to add a stitch line,
    // and its hint is two lines. Scrolled to the panel's foot, by the status bar.
    await window.getByTestId('parts-list').getByText('Outline').nth(1).click();
    const add = window.getByTestId('add-stitch-line');
    await add.evaluate((button) => button.scrollIntoView({ block: 'end' }));
    await add.hover();
    const tip = window.getByRole('tooltip', { name: /follows this edge/ });
    await expect(tip).toBeVisible();
    const [tipBox, addBox] = [(await tip.boundingBox())!, (await add.boundingBox())!];
    expect(addBox.y + addBox.height + 4 + tipBox.height, 'no room below').toBeGreaterThan(600 - 8);
    expect(tipBox.y + tipBox.height).toBeLessThanOrEqual(addBox.y);
    expect(tipBox.y).toBeGreaterThanOrEqual(8);
  });
});

test('a tooltip waits 500 ms for the pointer, comes at once for the keyboard, and Escape hides it (R-10)', async () => {
  await withSample(async (window) => {
    const save = window.getByTestId('save');
    const tip = window.getByRole('tooltip', { name: /Save the project/ });
    await save.hover();
    await window.waitForTimeout(300);
    await expect(tip).toHaveCount(0);
    await expect(tip).toBeVisible();
    await expect(tip.locator('kbd')).toHaveText('Ctrl+S');
    // Escape dismisses it where it stands, without moving the pointer.
    await window.keyboard.press('Escape');
    await expect(tip).toHaveCount(0);

    await window.mouse.move(600, 500);
    await window.getByTestId('project-name').focus();
    await window.keyboard.press('Tab');
    await expect(save).toBeFocused();
    await expect(tip).toBeVisible({ timeout: 200 });
    await window.keyboard.press('Escape');
    await expect(tip).toHaveCount(0);
    await expect(save).toBeFocused();
  });
});

test('every key shown is a cap from the keymap: tooltips, the rail, menus, the list (U.3)', async () => {
  await withSample(async (window) => {
    await expect(window.getByTestId('tool-rectangle').locator('kbd')).toHaveText('R');
    await window.getByTestId('tool-rectangle').hover();
    await expect(window.getByRole('tooltip').locator('kbd')).toHaveText('R');

    await window.getByTestId('project-menu').click();
    await expect(window.getByTestId('new').locator('kbd')).toHaveText('Ctrl+N');
    await expect(window.getByTestId('save-as').locator('kbd')).toHaveText('Ctrl+Shift+S');
    await window.keyboard.press('Escape');

    await window.getByTestId('settings').click();
    await window.getByTestId('settings-tab-shortcuts').click();
    const zoomIn = window.locator('.shortcut-row', { hasText: 'Zoom in' });
    await expect(zoomIn.locator('kbd')).toHaveText(['Ctrl+=']);
  });
});

test('on a German or French keyboard, every window key does what it does on a US one (U.3)', async () => {
  await withSample(async (window) => {
    // French AZERTY: A is where a US keyboard has Q. A tool follows its letter.
    await press(window, { code: 'KeyQ', key: 'a' });
    await expect(window.getByTestId('tool-arc')).toHaveClass(/active/);
    await press(window, { code: 'KeyA', key: 'q' });
    await expect(window.getByTestId('tool-arc')).toHaveClass(/active/);
    // Russian: no Latin letters, so R is where it is on a US keyboard.
    await press(window, { code: 'KeyR', key: 'к' });
    await expect(window.getByTestId('tool-rectangle')).toHaveClass(/active/);

    // Ctrl+2 and Ctrl+1 from the digit keys, whatever they type: & and é in French.
    await press(window, { code: 'Digit2', key: 'é', ctrlKey: true });
    await expect(window.getByTestId('view-sheets')).toHaveAttribute('aria-pressed', 'true');
    await press(window, { code: 'Digit1', key: '&', ctrlKey: true });
    await expect(window.getByTestId('view-design')).toHaveAttribute('aria-pressed', 'true');

    // German QWERTZ: Z is where a US keyboard has Y, and Ctrl+Z still undoes.
    const features = window.getByTestId('feature-count');
    const before = await features.textContent();
    await window.getByTestId('tool-select').click();
    await window.getByTestId('parts-list').getByText('Stitch holes').first().click();
    await window.keyboard.press('Delete');
    await expect(features).not.toHaveText(before ?? '');
    await press(window, { code: 'KeyY', key: 'z', ctrlKey: true });
    await expect(features).toHaveText(before ?? '');

    // ? is Shift with ß in Germany: it still opens the list.
    await press(window, { code: 'Minus', key: '?', shiftKey: true });
    await expect(window.getByTestId('settings-pane-shortcuts')).toBeVisible();
  });
});

test('a key is shown as the maker’s keyboard prints it (U.3)', async () => {
  await withSample(async (window) => {
    // A German keyboard, as Chromium's layout map reads it, then the window
    // coming back into focus, which is when the app reads it again.
    await window.evaluate(() => {
      const german = new Map([
        ['Minus', 'ß'],
        ['Equal', "'"],
        ['BracketLeft', 'ü'],
        ['Slash', '-'],
        ['Comma', ','],
      ]);
      Object.defineProperty(navigator, 'keyboard', {
        configurable: true,
        value: { getLayoutMap: () => Promise.resolve(german) },
      });
      window.dispatchEvent(new Event('focus'));
    });
    await window.getByTestId('settings').click();
    await window.getByTestId('settings-tab-shortcuts').click();
    const row = (text: string) => window.locator('.shortcut-row', { hasText: text }).locator('kbd');
    await expect(row('Zoom out')).toHaveText(['Ctrl+ß']);
    await expect(row('Keyboard shortcuts')).toHaveText(['Ctrl+-', '?']);
    // Letters and digits as every keyboard prints them.
    await expect(row('Undo')).toHaveText(['Ctrl+Z']);
    await expect(row('Design:')).toHaveText(['Ctrl+1']);
  });
});
