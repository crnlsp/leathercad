import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

import { parseNumber } from '../packages/core/src/index.js';

import { drawAPanel, expectNoViolations, withApp } from './launchApp.js';
import { resizeWindow } from './windowSize.js';

async function number(window: Page, label: string, value: number): Promise<void> {
  const field = window.getByTestId('property-panel').getByLabel(label);
  await field.fill(String(value));
  await field.press('Enter');
}

test('all thirteen tools and the rail toggle fit the shortest supported window (3.10)', async () => {
  await withApp(async (window, app) => {
    for (const width of [1280, 860]) {
      await resizeWindow(app, window, width, 600);
      const rail = window.getByTestId('tool-rail');
      await expect
        .poll(() => rail.evaluate((element) => element.scrollHeight - element.clientHeight))
        .toBeLessThanOrEqual(1);
      await expect(window.getByTestId('tool-scale')).toBeInViewport();
      await expect(window.getByTestId('tool-guide')).toBeInViewport();
    }
  });
});

test('guides can be placed, edited diagonally, undone, saved and reopened (3.10)', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'leathercad-guides-'));
  const file = join(directory, 'Guided pattern.lcp');
  try {
    await withApp(async (window, app) => {
      await window.keyboard.press('g');
      await expect(window.getByTestId('tool-guide')).toHaveClass(/active/);
      const canvas = window.getByTestId('editor-canvas');
      const box = await canvas.boundingBox();
      if (box === null) throw new Error('canvas is missing');
      await window.mouse.click(box.x + 220, box.y + 200);
      await expect(window.getByTestId('guide-editor')).toBeVisible();
      await expect(window.getByTestId('selected-count')).toHaveText('1');
      await number(window, 'Guide x', 25);
      await number(window, 'Guide y', 30);
      await number(window, 'Guide angle', 45);
      await window.getByTestId('undo').click();
      await expect(window.getByLabel('Guide angle')).toHaveValue('0');
      await window.getByTestId('redo').click();
      await expect(window.getByLabel('Guide angle')).toHaveValue('45');
      await expectNoViolations(window, 'guide controls');
      await app.evaluate(({ dialog }, path) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      }, file);
      await window.getByTestId('save').click();
      await expect(window.getByTestId('save-state')).toHaveText('Saved');
    });
    await withApp(
      async (window) => {
        await window.getByTestId('tool-guide').click();
        await window.locator('[data-testid^="guide-"][aria-pressed]').click();
        await expect(window.getByLabel('Guide x')).toHaveValue('25');
        await expect(window.getByLabel('Guide y')).toHaveValue('30');
        await expect(window.getByLabel('Guide angle')).toHaveValue('45');
        await window.getByTestId('guide-delete').click();
        await expect(window.getByTestId('guide-editor')).toHaveCount(0);
        await window.getByTestId('undo').click();
        await expect(window.getByTestId('guide-editor')).toBeVisible();
      },
      { args: [file] },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('dragging a guide from a ruler is one undo step and Escape cancels creation (3.10)', async () => {
  await withApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();
    if (box === null) throw new Error('canvas is missing');
    await window.mouse.move(box.x + 180, box.y + 8);
    await window.mouse.down();
    await window.mouse.move(box.x + 180, box.y + 200, { steps: 5 });
    await window.mouse.up();
    await expect(window.getByTestId('guide-editor')).toBeVisible();
    await expect(window.getByLabel('Guide angle')).toHaveValue('0');
    await window.getByTestId('undo').click();
    await expect(window.getByTestId('guide-editor')).toHaveCount(0);
    await window.getByTestId('redo').click();
    await expect(window.getByTestId('guide-editor')).toBeVisible();
    const count = window.locator('[data-testid^="guide-"][aria-pressed]');
    await expect(count).toHaveCount(1);
    await window.mouse.move(box.x + 8, box.y + 180);
    await window.mouse.down();
    await window.mouse.move(box.x + 250, box.y + 180, { steps: 5 });
    await window.keyboard.press('Escape');
    await window.mouse.up();
    await expect(count).toHaveCount(1);
  });
});

test('independent pieces align and distribute with equal gaps, and undo restores them (3.10)', async () => {
  await withApp(async (window) => {
    const canvas = window.getByTestId('editor-canvas');
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('canvas is missing');
    for (const [x, y, width] of [
      [100, 180, 60],
      [250, 280, 90],
      [440, 350, 70],
    ]) {
      if (x === undefined || y === undefined || width === undefined)
        throw new Error('missing rectangle size');
      await window.mouse.move(box.x + x, box.y + y);
      await window.mouse.down();
      await window.mouse.move(box.x + x + width, box.y + y + 60, { steps: 5 });
      await window.mouse.up();
    }
    await expect(window.getByTestId('part-count')).toHaveText('3');
    const selectAll = async () => {
      await window.getByTestId('tool-select').click();
      await window.mouse.move(box.x + 65, box.y + 100);
      await window.mouse.down();
      await window.mouse.move(box.x + 580, box.y + 500, { steps: 5 });
      await window.mouse.up();
      await expect(window.getByTestId('arrange-panel')).toBeVisible();
    };
    await selectAll();
    await window.getByTestId('arrange-y-max').click();
    const rows = window.locator('[data-testid^="feature-row-"]');
    const positions: number[] = [];
    for (let index = 0; index < 3; index++) {
      await rows.nth(index).click();
      positions.push(
        parseNumber(await window.getByTestId('property-panel').getByLabel('Y').inputValue()),
      );
    }
    expect(positions[1]).toBeCloseTo(positions[0] ?? 0, 2);
    expect(positions[2]).toBeCloseTo(positions[0] ?? 0, 2);
    await selectAll();
    await window.getByTestId('arrange-x-distribute').click();
    const edges: { x: number; width: number }[] = [];
    for (let index = 0; index < 3; index++) {
      await rows.nth(index).click();
      const panel = window.getByTestId('property-panel');
      edges.push({
        x: parseNumber(await panel.getByLabel('X').inputValue()),
        width: parseNumber(await panel.getByLabel('Width').inputValue()),
      });
    }
    const [first, middle, last] = edges;
    if (first === undefined || middle === undefined || last === undefined)
      throw new Error('missing piece');
    expect(middle.x - first.x - first.width).toBeCloseTo(last.x - middle.x - middle.width, 1);
    await window.getByTestId('undo').click();
    await window.getByTestId('undo').click();
    await selectAll();
    await expectNoViolations(window, 'alignment controls');
  });
});

test('drawing snaps to a selected guide and the snap-suspension modifier releases it (3.10)', async () => {
  await withApp(async (window) => {
    const box = await window.getByTestId('editor-canvas').boundingBox();
    if (box === null) throw new Error('canvas is missing');
    await window.mouse.move(box.x + 8, box.y + 180);
    await window.mouse.down();
    await window.mouse.move(box.x + 250, box.y + 180, { steps: 5 });
    await window.mouse.up();
    const guideX = parseNumber(await window.getByLabel('Guide x').inputValue());
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box.x + 252, box.y + 200);
    await window.mouse.down();
    await window.mouse.move(box.x + 350, box.y + 260, { steps: 5 });
    await window.mouse.up();
    const x = () =>
      window.getByTestId('property-panel').getByLabel('X').inputValue().then(parseNumber);
    expect(await x()).toBeCloseTo(guideX, 2);
    await window.keyboard.down('Control');
    try {
      await window.mouse.move(box.x + 252, box.y + 380);
      await window.mouse.down();
      await window.mouse.move(box.x + 350, box.y + 440, { steps: 5 });
      await window.mouse.up();
    } finally {
      await window.keyboard.up('Control');
    }
    expect(Math.abs((await x()) - guideX)).toBeGreaterThan(0.2);
  });
});

test('a guide dragged from a ruler snaps to a corner, and Ctrl releases it (3.10)', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { parts: '1' });
    const panel = window.getByTestId('property-panel');
    const top =
      parseNumber(await panel.getByLabel('Y').inputValue()) +
      parseNumber(await panel.getByLabel('Height').inputValue());
    const bottom = parseNumber(await panel.getByLabel('Y').inputValue());
    const box = await window.getByTestId('editor-canvas').boundingBox();
    if (box === null) throw new Error('canvas is missing');
    const dragFromTopRuler = async (y: number) => {
      await window.mouse.move(box.x + 300, box.y + 8);
      await window.mouse.down();
      await window.mouse.move(box.x + 151, box.y + y, { steps: 5 });
      await window.mouse.up();
      return parseNumber(await window.getByLabel('Guide y').inputValue());
    };
    // Pressed a pixel off the panel's top-left corner: the guide takes the corner.
    // The fields show hundredths, and Y and Height are each rounded before they
    // are added, so the corner read from them can be a hundredth off the guide's.
    const snapped = await dragFromTopRuler(151);
    expect(Math.min(Math.abs(snapped - top), Math.abs(snapped - bottom))).toBeLessThan(0.0101);
    await window.keyboard.down('Control');
    try {
      const free = await dragFromTopRuler(153);
      expect(Math.min(Math.abs(free - top), Math.abs(free - bottom))).toBeGreaterThan(0.2);
    } finally {
      await window.keyboard.up('Control');
    }
  });
});

test('the Guides tool drags a guide through two points, and Properties adds a parallel one (3.10)', async () => {
  await withApp(async (window) => {
    await window.getByTestId('tool-guide').click();
    const box = await window.getByTestId('editor-canvas').boundingBox();
    if (box === null) throw new Error('canvas is missing');
    await window.mouse.move(box.x + 200, box.y + 300);
    await window.mouse.down();
    await window.mouse.move(box.x + 300, box.y + 200, { steps: 5 });
    await window.mouse.up();
    await expect(window.getByLabel('Guide angle')).toHaveValue('45');
    const y = parseNumber(await window.getByLabel('Guide y').inputValue());
    const x = parseNumber(await window.getByLabel('Guide x').inputValue());

    await number(window, 'Parallel distance', 15);
    await window.getByTestId('guide-parallel-above').click();
    await expect(window.locator('[data-testid^="guide-"][aria-pressed]')).toHaveCount(2);
    await expect(window.getByLabel('Guide angle')).toHaveValue('45');
    const movedX = parseNumber(await window.getByLabel('Guide x').inputValue()) - x;
    const movedY = parseNumber(await window.getByLabel('Guide y').inputValue()) - y;
    // Fifteen millimetres across a 45° guide, towards the top of the board, as
    // near as the fields' two decimals read.
    expect(movedY).toBeGreaterThan(0);
    expect(Math.hypot(movedX, movedY)).toBeCloseTo(15, 1);
    await window.getByTestId('undo').click();
    await expect(window.locator('[data-testid^="guide-"][aria-pressed]')).toHaveCount(1);
    await expectNoViolations(window, 'parallel guide controls');
  });
});
