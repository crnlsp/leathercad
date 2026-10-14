import AxeBuilder from '@axe-core/playwright';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { readoutAt } from './cursorReadout.js';
import { launchApp } from './launchApp.js';
import { resizeWindow } from './windowSize.js';

/**
 * U.5 (R-04, the requirements' §5): Parts and Properties fold to 40 px strips
 * with `[` and `]`, `\` is focus mode, the status bar always has three chips,
 * and the board gets §5's widths at every window size. Nothing becomes
 * unreachable, and the maker's folds are remembered.
 */

async function launch(
  configHome = mkdtempSync(join(tmpdir(), 'leathercad-e2e-panels-')),
): Promise<{ app: ElectronApplication; window: Page; configHome: string }> {
  const app = await launchApp({ env: { XDG_CONFIG_HOME: configHome } });
  const window = await app.firstWindow();
  window.on('dialog', (dialog) => void dialog.dismiss().catch(() => undefined));
  await window.waitForLoadState('domcontentloaded');
  await expect(window.getByTestId('app-version')).not.toBeEmpty();
  return { app, window, configHome };
}

async function withSample(run: (window: Page, app: ElectronApplication) => Promise<void>) {
  const { app, window } = await launch();
  try {
    await window.getByTestId('open-sample').click();
    await expect(window.getByTestId('part-count')).toHaveText('3');
    await run(window, app);
  } finally {
    await closeApp(app);
  }
}

/** Resized, and laid out for the new size before anything is pressed. */
const resize = resizeWindow;

/** The board's width, in CSS pixels. */
const boardWidth = (window: Page): Promise<number> =>
  window.getByTestId('editor-canvas').evaluate((canvas) => canvas.getBoundingClientRect().width);

/** A key as a keyboard of another layout sends it: German `[` is the ü key. */
async function press(window: Page, code: string, key: string): Promise<void> {
  await window.evaluate(
    (init) =>
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true }),
      ),
    { code, key },
  );
}

const SIZES = [
  [1920, 1080, 1280],
  [1440, 900, 800],
  [1280, 800, 640],
  [1024, 700, 720],
  [860, 600, 804],
] as const;

test('the board is 1280, 800, 640, 720 and 804 px wide at §5’s five window sizes', async () => {
  // Before U.5: 1260, 780, 620, 488 and 808.
  await withSample(async (window, app) => {
    for (const [width, height, board] of SIZES) {
      await resize(app, window, width, height);
      await expect.poll(() => boardWidth(window), { message: `at ${String(width)}` }).toBe(board);
    }
    await resize(app, window, 1440, 900);
    await window.keyboard.press('Backslash');
    await expect.poll(() => boardWidth(window), { message: 'focus mode at 1440' }).toBe(1384);
  });
});

test('[ folds Parts, ] Properties and \\ both, and Esc leaves focus mode (R-04)', async () => {
  await withSample(async (window, app) => {
    await resize(app, window, 1920, 1080);
    const parts = window.getByTestId('parts-list');
    const properties = window.getByTestId('property-panel');
    const rail = window.getByTestId('tool-rail');

    await window.keyboard.press('BracketLeft');
    await expect(window.getByTestId('parts-strip')).toBeVisible();
    await expect(parts).toBeHidden();
    await expect(window.getByTestId('toggle-parts')).toHaveClass(/hiding/);
    await window.keyboard.press('BracketLeft');
    await expect(parts).toBeVisible();
    await expect(window.getByTestId('parts-strip')).toHaveCount(0);

    await window.keyboard.press('BracketRight');
    await expect(window.getByTestId('properties-strip')).toBeVisible();
    await expect(properties).toBeHidden();
    await window.keyboard.press('BracketRight');
    await expect(properties).toBeVisible();

    // Focus mode over a folded Properties: leaving it restores exactly that.
    await window.keyboard.press('BracketRight');
    await window.keyboard.press('Backslash');
    await expect(parts).toBeHidden();
    await expect(window.getByTestId('properties-strip')).toHaveCount(0);
    await expect(rail).toHaveClass(/collapsed/);
    await expect(window.getByTestId('rail-toggle')).toHaveCount(0);
    for (const chip of ['toggle-parts', 'toggle-focus', 'toggle-properties']) {
      await expect(window.getByTestId(chip)).toHaveClass(/hiding/);
    }
    await window.keyboard.press('Escape');
    await expect(parts).toBeVisible();
    await expect(window.getByTestId('properties-strip')).toBeVisible();
    await expect(rail).not.toHaveClass(/collapsed/);
    await expect(window.getByTestId('toggle-focus')).not.toHaveClass(/hiding/);
  });
});

test('on a German keyboard the keys are ü, + and #, by their place', async () => {
  await withSample(async (window, app) => {
    await resize(app, window, 1920, 1080);
    await press(window, 'BracketLeft', 'ü');
    await expect(window.getByTestId('parts-strip')).toBeVisible();
    await press(window, 'BracketRight', '+');
    await expect(window.getByTestId('properties-strip')).toBeVisible();
    await press(window, 'Backslash', '#');
    await expect(window.getByTestId('tool-rail')).toHaveClass(/collapsed/);
    await expect(window.getByTestId('parts-strip')).toHaveCount(0);
    await press(window, 'Backslash', '#');
    await expect(window.getByTestId('parts-strip')).toBeVisible();
  });
});

test('Esc gives up a drawing in progress before it leaves focus mode', async () => {
  await withSample(async (window, app) => {
    await resize(app, window, 1440, 900);
    await window.keyboard.press('Backslash');
    await window.getByTestId('tool-rectangle').click();
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    // A rectangle begun with a click, waiting for its second corner.
    await window.mouse.click(box.x + 200, box.y + 200);
    await window.mouse.move(box.x + 320, box.y + 300);

    await window.keyboard.press('Escape');
    await expect(window.getByTestId('toggle-focus')).toHaveAttribute('aria-pressed', 'true');
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('toggle-focus')).toHaveAttribute('aria-pressed', 'false');
    // And the rectangle was given up, not drawn.
    await expect(window.getByTestId('part-count')).toHaveText('3');
  });
});

test('a folded Parts strip selects any piece, a locked one too; Properties’ strip names it', async () => {
  await withSample(async (window, app) => {
    await resize(app, window, 1920, 1080);
    // Locked, the outline is out of the board's reach (F.2).
    await window.getByTestId('feature-locked-outer-outline').click();
    await window.getByTestId('fold-parts').click();
    const strip = window.getByTestId('parts-strip');
    await expect(strip.locator('[data-testid^="strip-part-"]')).toHaveCount(3);
    await expect(window.getByTestId('strip-part-pocket')).toHaveAccessibleName('Card pocket ×2');
    await expect(window.getByTestId('strip-part-pocket').locator('svg path')).toHaveAttribute(
      'd',
      /^M /,
    );

    await window.getByTestId('strip-part-outer').click();
    await expect(window.getByTestId('selected-count')).toHaveText('1');
    await expect(window.getByTestId('strip-part-outer')).toHaveAttribute('aria-pressed', 'true');
    await expect(window.getByTestId('property-header')).toContainText('Outer');

    await window.getByTestId('fold-properties').click();
    await expect(window.getByTestId('strip-selection')).toHaveAccessibleName('Outer');
    await window.getByTestId('strip-part-pocket').click();
    await expect(window.getByTestId('strip-selection')).toHaveAccessibleName('Card pocket ×2');
    // From the strip, the panel opens docked again on a wide window.
    await window.getByTestId('strip-selection').click();
    await expect(window.getByTestId('properties-strip')).toHaveCount(0);
    await expect(window.getByTestId('property-header')).toContainText('Card pocket');
  });
});

test('a panel over the board takes focus, gives it back, and closes on Esc or a press on the board', async () => {
  await withSample(async (window, app) => {
    // At 1024 Properties is a strip, and opens over the board (§5).
    await resize(app, window, 1024, 700);
    await window.getByTestId('tool-select').click();
    await window.getByTestId('part-heading-outer').click();
    const panel = window.getByTestId('property-panel');
    const chip = window.getByTestId('toggle-properties');
    await expect(window.getByTestId('properties-strip')).toBeVisible();
    await expect(panel).toBeHidden();

    await chip.focus();
    await window.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    await expect(panel).toBeFocused();
    // Still a strip: opening it over the board chose nothing.
    await expect(window.getByTestId('properties-strip')).toBeVisible();
    await window.keyboard.press('Tab');
    await expect(panel.getByTestId('fold-properties')).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(chip).toBeFocused();

    // By the pointer: from the strip, then a press on the board.
    await window.getByTestId('strip-selection').click();
    await expect(panel).toBeVisible();
    await expect(panel).toBeFocused();
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.mouse.click(box.x + 40, box.y + box.height - 40);
    await expect(panel).toBeHidden();

    // `]` opens it too, and Esc in a field being typed in is the field's.
    await window.getByTestId('part-heading-outer').click();
    await window.keyboard.press('BracketRight');
    await expect(panel).toBeVisible();
    const name = panel.locator('input').first();
    await name.focus();
    await name.press('Escape');
    await expect(panel).toBeVisible();
    await panel.focus();
    await window.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });
});

test('three chips, always, and every panel reached by the keyboard at every size', async () => {
  await withSample(async (window, app) => {
    await resize(app, window, 1920, 1080);
    await window.keyboard.press('BracketLeft');
    await window.keyboard.press('BracketRight');
    for (const [width, height] of SIZES) {
      await resize(app, window, width, height);
      for (const chip of ['toggle-parts', 'toggle-focus', 'toggle-properties']) {
        await expect(window.getByTestId(chip), `${chip} at ${String(width)}`).toBeInViewport();
      }
    }

    // Both folded on a wide window: Tab reaches each strip and each chip.
    await resize(app, window, 1920, 1080);
    const reached = new Set<string>();
    await window.getByTestId('tool-select').focus();
    for (let step = 0; step < 60; step++) {
      await window.keyboard.press('Tab');
      const id = await window.evaluate(() => document.activeElement?.getAttribute('data-testid'));
      if (id !== null && id !== undefined) reached.add(id);
    }
    for (const id of [
      'unfold-parts',
      'strip-part-outer',
      'strip-part-lining',
      'strip-part-pocket',
      'unfold-properties',
      'toggle-parts',
      'toggle-focus',
      'toggle-properties',
    ]) {
      expect([...reached], id).toContain(id);
    }

    // At 860 both are only chips: from the keyboard, to a locked feature's row.
    await resize(app, window, 860, 600);
    await window.getByTestId('toggle-parts').focus();
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('parts-list')).toBeFocused();
    await window.getByTestId('feature-row-outer-holes').focus();
    await window.keyboard.press('Enter');
    await expect(window.getByTestId('selected-count')).toHaveText('1');
  });
});

test('the maker’s folds survive a restart, and a narrow window’s never overwrite them', async () => {
  const first = await launch();
  try {
    await resize(first.app, first.window, 1920, 1080);
    await first.window.getByTestId('fold-parts').click();
    await expect(first.window.getByTestId('parts-strip')).toBeVisible();
    // Narrow: Properties folds by itself, and `]` opens it over the board.
    await resize(first.app, first.window, 1024, 700);
    await expect(first.window.getByTestId('properties-strip')).toBeVisible();
    await first.window.keyboard.press('BracketRight');
    await expect(first.window.getByTestId('property-panel')).toBeVisible();
    await first.window.keyboard.press('Escape');
  } finally {
    await closeApp(first.app);
  }
  const stored = JSON.parse(
    readFileSync(join(first.configHome, 'leathercad', 'preferences.json'), 'utf8'),
  ) as Record<string, unknown>;
  expect(stored).toMatchObject({ partsFolded: true, propertiesFolded: false });

  const second = await launch(first.configHome);
  try {
    await resize(second.app, second.window, 1920, 1080);
    await expect(second.window.getByTestId('parts-strip')).toBeVisible();
    await expect(second.window.getByTestId('property-panel')).toBeVisible();
    await expect(second.window.getByTestId('properties-strip')).toHaveCount(0);
  } finally {
    await closeApp(second.app);
  }
});

test('folding a panel, or focus mode, does not move the drawing (F.3)', async () => {
  await withSample(async (window, app) => {
    await resize(app, window, 1440, 900);
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    // Right of the board's middle, on the board in every shape of the frame.
    const probe = { x: box.x + box.width - 120, y: box.y + 140 };
    const reading = (): Promise<string> => readoutAt(window, probe.x, probe.y);
    const before = await reading();

    await window.keyboard.press('BracketLeft');
    await expect(window.getByTestId('parts-strip')).toBeVisible();
    expect(await reading()).toBe(before);
    await window.keyboard.press('Backslash');
    await expect(window.getByTestId('parts-strip')).toHaveCount(0);
    expect(await reading()).toBe(before);
    await window.keyboard.press('Backslash');
    await window.keyboard.press('BracketLeft');
    await expect(window.getByTestId('parts-list')).toBeVisible();
    expect(await reading()).toBe(before);
  });
});

test('the status bar keeps its 28 px, chips and all, folded or not, at every width', async () => {
  // Its content set its height: 28 px before U.5, 29 with the chips, and the
  // pixel lost moved the board, the Sheets fit and every pixel reference. At
  // 860 its old narrow-window chips had made it 37.
  await withSample(async (window, app) => {
    const barHeight = (): Promise<number> =>
      window.getByTestId('status-bar').evaluate((bar) => bar.getBoundingClientRect().height);
    for (const keys of [[], ['BracketLeft'], ['BracketLeft', 'BracketRight'], ['Backslash']]) {
      await resize(app, window, 1920, 1080);
      for (const key of keys) await window.keyboard.press(key);
      for (const [width, height] of SIZES) {
        await resize(app, window, width, height);
        expect(await barHeight(), `${keys.join('+') || 'none'} at ${String(width)}`).toBe(28);
      }
      await resize(app, window, 1920, 1080);
      for (const key of [...keys].reverse()) await window.keyboard.press(key);
    }
  });
});

test('a feature’s row in Parts is one line at 1024, where Parts is 208 px', async () => {
  // At 220 px "Stitch holes" fit on one line; at U.5's 208 it wrapped. The
  // names wrap rather than truncate (F.6), but not one that fitted before.
  // "Cut-out mirrored" wraps at 220 too, and is left to U.8's rows.
  await withSample(async (window, app) => {
    await resize(app, window, 1024, 700);
    const lines = await window.getByTestId('parts-list').evaluate((parts) =>
      [...parts.querySelectorAll('.feature-name')]
        .filter((name) => name.textContent !== 'Cut-out mirrored')
        .map((name) => {
          const range = document.createRange();
          range.selectNodeContents(name);
          const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
          return `${name.textContent ?? ''}: ${String(tops.size)}`;
        }),
    );
    expect(lines.length).toBeGreaterThan(8);
    for (const line of lines) expect(line).toMatch(/: 1$/);
  });
});

test('no fold covers the zoom control or the legend, at any width', async () => {
  await withSample(async (window, app) => {
    /** Whether the middle of each is itself, where a press there lands. */
    const uncovered = (): Promise<boolean[]> =>
      window.evaluate(() =>
        ['zoom-control', 'canvas-legend'].map((id) => {
          const element = document.querySelector(`[data-testid="${id}"]`)!;
          const box = element.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return hit !== null && element.contains(hit);
        }),
      );
    const states: readonly (readonly string[])[] = [
      [],
      ['BracketLeft'],
      ['BracketRight'],
      ['BracketLeft', 'BracketRight'],
      ['Backslash'],
    ];
    for (const keys of states) {
      await resize(app, window, 1920, 1080);
      for (const key of keys) await window.keyboard.press(key);
      for (const [width, height] of SIZES) {
        await resize(app, window, width, height);
        await expect
          .poll(uncovered, { message: `${keys.join('+') || 'none'} at ${String(width)}` })
          .toEqual([true, true]);
      }
      await resize(app, window, 1920, 1080);
      for (const key of [...keys].reverse()) await window.keyboard.press(key);
    }
  });
});

test('both strips, an overlay and focus mode have no accessibility violations', async () => {
  await withSample(async (window, app) => {
    const scan = async (what: string): Promise<void> => {
      const results = await new AxeBuilder({ page: window })
        .setLegacyMode(true)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
        .analyze();
      const found = results.violations.map((violation) => ({
        rule: violation.id,
        first: violation.nodes[0]?.target.join(' '),
      }));
      expect(found, what).toEqual([]);
    };
    await resize(app, window, 1920, 1080);
    await window.getByTestId('part-heading-pocket').click();
    await window.keyboard.press('BracketLeft');
    await window.keyboard.press('BracketRight');
    await expect(window.getByTestId('strip-selection')).toBeVisible();
    await scan('both panels folded');
    await window.keyboard.press('Backslash');
    await window.keyboard.press('BracketLeft');
    await expect(window.getByTestId('parts-list')).toBeVisible();
    await scan('Parts over the board in focus mode');
  });
});
