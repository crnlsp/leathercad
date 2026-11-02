import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { launchApp, openSample, withApp, expectNoViolations } from './launchApp.js';
import { resizeWindow } from './windowSize.js';

/**
 * U.6, R-05: Properties in the order of the work. A hole set reads iron,
 * pitch, fit and corners, then what they came out as and whether the spacing
 * is the iron's pitch, then its name, then Arrange; Delete waits alone at the
 * foot, in view however far the rest scrolls. With nothing selected it says
 * what the job is.
 */

const withSample = (
  size: readonly [number, number],
  run: (window: Page, app: ElectronApplication) => Promise<void>,
): Promise<void> =>
  withApp(async (window, app) => {
    // Opened first: below 900 px the empty Parts panel that offers it folds.
    await openSample(window);
    await resizeWindow(app, window, size[0], size[1]);
    await run(window, app);
  });

const top = async (window: Page, testId: string): Promise<number> =>
  (await window.getByTestId('property-panel').getByTestId(testId).boundingBox())!.y;

test('a hole set reads in the order of the work, and says how its spacing came out (R-05)', async () => {
  await withSample([1440, 900], async (window) => {
    await window.getByTestId('feature-row-outer-holes').click();
    const panel = window.getByTestId('property-panel');

    // Where it is, under its name: the piece and its Cut, then what it follows.
    await expect(panel.getByTestId('property-trail')).toHaveText(
      'Outer · Cut ×1 › Stitch line › Stitch holes',
    );

    // Iron, pitch, fit, corners · holes, spacing, runs · the spacing line ·
    // name, follows · Arrange · Delete.
    const order = [
      'iron-preset',
      'hole-mode',
      'corner-policy',
      'hole-count',
      'achieved-spacing',
      'spacing-line',
      'follows',
      'flip-horizontal',
      'mirror-horizontal',
      'delete-feature',
    ];
    const tops = [];
    for (const id of order) tops.push(await top(window, id));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    await expect(panel.getByTestId('hole-count')).toHaveText('146');

    // The sample's outer is 562.57 mm round over 146 gaps: 3.8532 mm, shown
    // as 3.85 under its 3.85 iron — so the line says it matches, as the two
    // numbers above it do, and Problems is silent.
    const line = panel.getByTestId('spacing-line');
    await expect(panel.getByTestId('achieved-spacing')).toHaveText('3.85 mm');
    await expect(line).toHaveText('Spacing matches the pitch');
    await expect(line).toHaveAttribute('data-glyph', 'check');
    await expect(panel.getByTestId('feature-problems')).toHaveCount(0);

    // Arrange: icon pairs, each named, a disabled pair still saying why.
    await expect(panel.getByRole('button', { name: 'Flip ↔' })).toBeDisabled();
    // In one short line, so it no longer takes Arrange's first rows (U.6, U.19).
    const reason = panel.getByTestId('arrange').getByTestId('reason');
    await expect(reason).toHaveText('Follows Outline: move that instead.');
    // An inline span: one client rect per line it takes.
    expect(await reason.evaluate((el) => el.getClientRects().length)).toBe(1);
    await expect(panel.getByRole('button', { name: 'Mirror ↕' })).toBeEnabled();
    await expect(panel.getByRole('button', { name: 'Mirror across fold' })).toHaveText(
      'Across fold',
    );

    // Delete, alone at the foot, with its key.
    const footer = panel.locator('.panel-footer');
    await expect(footer.getByTestId('delete-feature')).toHaveText(/^Delete\s*Del$/);

    // Name and Cut are the piece's: only for its outline (or the piece itself).
    await expect(panel.getByTestId('part-name')).toHaveCount(0);
    await window.getByTestId('feature-row-outer-stitch').click();
    await expect(panel.getByTestId('property-trail')).toHaveText('Outer · Cut ×1 › Stitch line');
    await expect(panel.getByTestId('part-name')).toHaveCount(0);
    await window.getByTestId('feature-row-outer-outline').click();
    await expect(panel.getByTestId('part-name')).toHaveValue('Outer');
    // Two names, never both called Name: the outline's own, and the piece's.
    await expect(panel.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Outline');
    await expect(panel.getByRole('textbox', { name: 'Piece', exact: true })).toHaveValue('Outer');
    await expect(panel.getByTestId('part-name')).toHaveAccessibleName('Piece');
    await window.getByTestId('feature-row-pocket-holes').click();
    await expect(panel.getByTestId('property-trail')).toHaveText(
      'Card pocket · Cut ×2 › Stitch line › Stitch holes',
    );

    await window.getByTestId('feature-row-outer-holes').click();
    await expectNoViolations(window, 'a hole set in Properties');
  });
});

test('the spacing line says when the spacing is the pitch, and by how much it is not', async () => {
  const app = await launchApp();
  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId('app-version')).not.toBeEmpty();
    const panel = window.getByTestId('property-panel');
    const set = async (label: string, value: string): Promise<void> => {
      const input = panel.locator('label', { hasText: new RegExp(`^${label}`) }).locator('input');
      await input.fill(value);
      await input.press('Enter');
    };

    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box.x + 150, box.y + 150);
    await window.mouse.down();
    await window.mouse.move(box.x + 330, box.y + 270, { steps: 5 });
    await window.mouse.up();
    // 3.5 mm in from 107 × 47 is a 100 × 40 stitch line: sides of 25 and 10
    // gaps on a 4 mm iron, exactly.
    await set('Width', '107');
    await set('Height', '47');
    await panel.getByTestId('add-stitch-line').click();
    await expect(panel.locator('label', { hasText: /^Edge margin/ }).locator('input')).toHaveValue(
      '3.5',
    );
    await panel.getByTestId('add-stitch-holes').click();
    await set('Pitch', '4');
    const line = panel.getByTestId('spacing-line');
    await expect(line).toHaveText('Spacing matches the pitch');
    await expect(line).toHaveAttribute('data-glyph', 'check');

    // On a 3.85 iron the sides take 26 and 10 gaps: 280 mm over 72, 3.889 mm,
    // 1.01 % wide of the iron — said, and not a warning: Problems is silent.
    await set('Pitch', '3.85');
    await expect(line).toHaveText('Spacing is stretched 1 %');
    await expect(line).toHaveAttribute('data-glyph', 'stretched');
    await expect(panel.getByTestId('feature-problems')).toHaveCount(0);

    // A 100 mm iron on it puts one gap on each side: 280 mm over 4, 70 mm,
    // 30 % short. Problems warns, and the line says it with the same glyph.
    await set('Pitch', '100');
    await expect(line).toHaveText('Spacing is squeezed 30 %');
    await expect(line).toHaveAttribute('data-glyph', 'warning');
    await expect(line.locator('[data-glyph="warning"]')).toBeVisible();
    await expect(panel.getByTestId('feature-problems')).toBeVisible();
  } finally {
    await closeApp(app);
  }
});

test('at 860 × 600 Properties scrolls and Delete stays at its foot (R-05, §5)', async () => {
  await withSample([860, 600], async (window) => {
    await window.getByTestId('toggle-parts').click();
    await window.getByTestId('feature-row-outer-holes').click();
    const toggle = window.getByTestId('toggle-properties');
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();

    const panel = window.getByTestId('property-panel');
    const remove = panel.getByTestId('delete-feature');
    const fits = await panel.evaluate((node) => node.scrollHeight > node.clientHeight);
    expect(fits, 'the hole set is taller than the panel at 600 px').toBe(true);

    const inView = async (): Promise<void> => {
      const button = (await remove.boundingBox())!;
      const frame = (await panel.boundingBox())!;
      expect(button.y).toBeGreaterThanOrEqual(frame.y);
      expect(button.y + button.height).toBeLessThanOrEqual(frame.y + frame.height);
      expect(button.y + button.height).toBeLessThanOrEqual(600);
    };
    await inView();
    const atTop = (await remove.boundingBox())!.y;
    await panel.evaluate((node) => node.scrollTo(0, node.scrollHeight));
    await inView();
    expect((await remove.boundingBox())!.y).toBeCloseTo(atTop, 0);
  });
});

test('"A hole on each corner" fits at 264 px, even while the panel scrolls (R-05)', async () => {
  await withSample([1024, 700], async (window) => {
    await window.getByTestId('feature-row-outer-holes').click();
    // A strip at 1024 (U.5): `]` opens it over the board, at the same 264 px.
    await window.keyboard.press('BracketRight');
    const panel = window.getByTestId('property-panel');
    expect((await panel.boundingBox())!.width).toBe(264);
    expect(await panel.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    const corners = panel.getByTestId('corner-policy');
    await expect(corners.locator('option:checked')).toHaveText('A hole on each corner');
    // The select's own width for its words, against the width it was given.
    const room = await corners.evaluate((select) => {
      const given = select.getBoundingClientRect().width;
      select.style.flex = 'none';
      const needed = select.getBoundingClientRect().width;
      select.style.flex = '';
      return { given, needed };
    });
    expect(room.needed).toBeLessThanOrEqual(room.given);
  });
});

test('with nothing selected, Properties says what the job is (R-05, §7 question 4)', async () => {
  await withSample([1440, 900], async (window) => {
    const totals = window.getByTestId('property-panel').getByTestId('job-totals');
    await expect(totals).toContainText('Bifold wallet');
    await expect(totals.getByTestId('job-pieces')).toHaveText('Pieces3 · 4 to cut');
    await expect(totals.getByTestId('job-holes')).toHaveText('Holes250 · 146 + 52 ×2');
    await expect(totals.getByTestId('job-sheets')).toHaveText('Sheets2 · A4, portrait');

    // A hidden piece is not printed, so it is not cut from these sheets.
    await window.getByTestId('part-visible-pocket').click();
    await expect(totals.getByTestId('job-pieces')).toHaveText('Pieces3 · 2 to cut');
    await expect(totals.getByTestId('job-holes')).toHaveText('Holes146');

    await expectNoViolations(window, 'the job, with nothing selected');
  });
});
