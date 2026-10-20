import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { openApp } from './launchApp.js';

/**
 * U.18, R-16: while a Draw tool would make a new piece, Properties shows
 * *After the outline* — the stitch margin and the iron from My tools. They are
 * My tools' values, not a copy: editing them here edits Settings, and
 * *Stitch + allowance* and the selection bar's next steps make things with them.
 */

const launch = (configHome: string) =>
  openApp({ env: { XDG_CONFIG_HOME: configHome }, size: [1440, 900] });

const freshConfig = (): string => mkdtempSync(join(tmpdir(), 'leathercad-e2e-defaults-'));
const section = (window: Page): Locator => window.getByTestId('drawing-defaults');
const margin = (window: Page): Locator => section(window).getByLabel('Stitch line');
const iron = (window: Page): Locator => section(window).getByLabel('Holes');

async function myTools(window: Page): Promise<Locator> {
  await window.getByTestId('settings').click();
  await window.getByTestId('settings-tab-tools').click();
  return window.getByTestId('settings-pane-tools');
}

test('while drawing, Properties shows My tools’ margin and iron, and editing either edits My tools (U.18)', async () => {
  const configHome = freshConfig();
  const first = await launch(configHome);
  try {
    const { window } = first;
    await window.getByTestId('tool-rectangle').click();
    await expect(section(window)).toBeVisible();
    await expect(section(window)).toContainText('After the outline');
    await expect(margin(window)).toHaveValue('3.5');
    await expect(iron(window).locator('option:checked')).toHaveText('KS Blade 3.85 mm');

    // Only where a new piece is drawn: not for Select, a placing tool, or a
    // line drawn onto a piece.
    await window.getByTestId('tool-select').click();
    await expect(section(window)).toHaveCount(0);
    await window.getByTestId('tool-hardware').click();
    await expect(section(window)).toHaveCount(0);
    await window.getByTestId('tool-polyline').click();
    await expect(section(window)).toBeVisible();
    await window.getByTestId('draw-as-fold').click();
    await expect(section(window)).toHaveCount(0);
    await window.getByTestId('draw-as-stitch-allowance').click();
    await expect(section(window)).toBeVisible();
    await window.getByTestId('draw-as-outline').click();

    // Edited here …
    await margin(window).fill('5');
    await margin(window).press('Enter');
    await iron(window).selectOption({ index: 1 });
    const chosen = (await iron(window).locator('option:checked').textContent())!;
    expect(chosen).not.toBe('KS Blade 3.85 mm');

    // … is edited in My tools.
    const pane = await myTools(window);
    const setting = pane.getByTestId('setting-margin').getByRole('textbox');
    await expect(setting).toHaveValue('5');
    const row = pane.locator('tbody tr', { has: window.locator(`input[value="${chosen}"]`) });
    await expect(row.getByRole('radio')).toBeChecked();

    // And the other way round.
    await setting.fill('4.5');
    await setting.press('Enter');
    await window.getByTestId('settings-close').click();
    await expect(margin(window)).toHaveValue('4.5');

    // Still there between the rectangle's two clicks, beside its sizes.
    await window.getByTestId('tool-rectangle').click();
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
    await window.mouse.move(box.x + box.width * 0.4 + 120, box.y + box.height * 0.5 - 80);
    await expect(window.getByTestId('drawing-sizes')).toBeVisible();
    await expect(section(window)).toBeVisible();
    await window.keyboard.press('Escape');
  } finally {
    await closeApp(first.app);
  }

  // Kept with My tools, in preferences.json.
  const second = await launch(configHome);
  try {
    await second.window.getByTestId('tool-rectangle').click();
    await expect(margin(second.window)).toHaveValue('4.5');
    await expect(iron(second.window).locator('option:checked')).not.toHaveText('KS Blade 3.85 mm');
  } finally {
    await closeApp(second.app);
  }
});

test('the margin typed mid-draw goes to the field, and the rectangle under way keeps its sizes and chips (U.18)', async () => {
  const { app, window } = await launch(freshConfig());
  try {
    const widthChip = window.getByTestId('value-chip-width').locator('input');
    await window.getByTestId('tool-rectangle').click();
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    const corner = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.6 };
    await window.mouse.move(corner.x, corner.y);
    await window.mouse.click(corner.x, corner.y);
    const other = { x: corner.x + 160, y: corner.y - 100 };
    await window.mouse.move(other.x, other.y);
    await expect(window.getByTestId('value-chips')).toBeVisible();
    const sizes = await window.getByTestId('drawing-sizes').textContent();
    const width = await widthChip.inputValue();

    // Into the field by a click, its text replaced by keys pressed one at a
    // time: on the board the first digit would open the width chip (U.16).
    await margin(window).click();
    await window.keyboard.press('ControlOrMeta+A');
    for (const key of '4.5') {
      await window.keyboard.press(key);
      await expect(margin(window)).toBeFocused();
      await expect(widthChip).not.toBeFocused();
      await expect(widthChip).toHaveValue(width);
    }
    await expect(margin(window)).toHaveValue('4.5');
    // Enter is the field's: it stores the margin and does not make the shape.
    await window.keyboard.press('Enter');
    await expect(margin(window)).toHaveValue('4.5');
    await expect(window.getByTestId('part-count')).toHaveText('0');

    // The draft is as it was: its sizes in Properties, its chips on the board.
    await expect(window.getByTestId('drawing-sizes')).toHaveText(sizes!);
    await expect(window.getByTestId('value-chips')).toBeVisible();
    await expect(widthChip).toHaveValue(width);
    await expect(widthChip).not.toBeFocused();

    // And it is still under way: the second click makes it, at that size.
    await window.mouse.move(other.x, other.y);
    await window.mouse.click(other.x, other.y);
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('property-panel').getByLabel('Width')).toHaveValue(
      width.replace(/\.?0+$/, ''),
    );
  } finally {
    await closeApp(app);
  }
});

test('Stitch + allowance and the next steps make things with the values set in Properties (U.18)', async () => {
  const { app, window } = await launch(freshConfig());
  try {
    const panel = window.getByTestId('property-panel');
    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    const drag = async (from: [number, number], to: [number, number]): Promise<void> => {
      await window.mouse.move(box.x + from[0], box.y + from[1]);
      await window.mouse.down();
      await window.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
      await window.mouse.up();
    };

    await window.getByTestId('tool-rectangle').click();
    await margin(window).fill('6');
    await margin(window).press('Enter');
    await iron(window).selectOption({ index: 1 });
    const chosen = (await iron(window).locator('option:checked').textContent())!;

    // Stitch + allowance: the edge grows by the margin set here.
    await window.getByTestId('draw-as-stitch-allowance').click();
    await drag([380, 160], [560, 300]);
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await window.getByTestId('parts-list').locator('[data-testid^="feature-row-"]').last().click();
    await expect(panel.getByTestId('follows')).toBeVisible();
    await expect(panel.locator('label', { hasText: /^Edge margin/ }).locator('input')).toHaveValue(
      '6',
    );

    // An outline, then the bar's steps: the stitch line at the margin, the
    // holes from the iron chosen here.
    await window.getByTestId('tool-rectangle').click();
    await window.getByTestId('draw-as-outline').click();
    await drag([80, 160], [300, 360]);
    await window.getByTestId('tool-select').click();
    const step = window.getByTestId('selection-bar-step');
    await expect(step).toHaveAttribute('data-step', 'stitchLine');
    await step.click();
    await expect(panel.locator('label', { hasText: /^Edge margin/ }).locator('input')).toHaveValue(
      '6',
    );
    await expect(step).toHaveAttribute('data-step', 'holes');
    await step.click();
    await expect(panel.getByTestId('iron-preset').locator('option:checked')).toHaveText(chosen);
  } finally {
    await closeApp(app);
  }
});
