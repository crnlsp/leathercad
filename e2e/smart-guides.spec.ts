import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

import { loadProject } from '../packages/persist/src/index.js';

import { boardMap } from './boardMap.js';
import { withApp } from './launchApp.js';
import { fromProjectMenu } from './projectMenu.js';

/**
 * 3.16: a piece dragged near another's edge lines up with it exactly
 * (smart-guides spec §6). The card holder template: the outer is 105 × 70 mm at
 * the origin, the pocket 105 × 47.3487 mm below it, both with their left edge at
 * x = 0. The pocket is typed 7 mm right first, then dragged back by its body.
 */

const ROOM = { size: [1440, 1000] } as const;

const panel = (window: Page) => window.getByTestId('property-panel');
const left = (window: Page) => panel(window).getByTestId('position-fields').getByLabel('Left');

/** In the pocket's body, clear of its stitch line and holes. */
const BODY = { x: 60, y: -36 };

async function openCardHolder(
  window: Page,
): Promise<(mm: { x: number; y: number }) => { x: number; y: number }> {
  await fromProjectMenu(window, 'new-template');
  await window.getByTestId('template-builtin:card-holder').dblclick();
  await expect(window.getByTestId('project-name')).toHaveText('Card holder');
  await window.getByTestId('tool-select').click();
  const board = await boardMap(window);

  const body = board(BODY);
  await window.mouse.click(body.x, body.y);
  await expect(window.getByTestId('property-header')).toContainText('Pocket');
  await left(window).fill('7');
  await left(window).press('Enter');
  await expect(left(window)).toHaveValue('7');
  return board;
}

/**
 * Presses on the pocket's body and carries it 5.6 mm left, which raw would
 * leave its left edge 1.4 mm from the outer's — within the pick radius at any
 * zoom this window frames the template at.
 */
async function carry(
  window: Page,
  board: (mm: { x: number; y: number }) => { x: number; y: number },
  during: () => Promise<void> = async () => {},
): Promise<void> {
  const from = board({ x: BODY.x + 7, y: BODY.y });
  const to = board({ x: BODY.x + 7 - 5.6, y: BODY.y });
  await window.mouse.move(from.x, from.y);
  await window.mouse.down();
  await window.mouse.move(to.x, to.y, { steps: 8 });
  await during();
  await window.mouse.up();
}

test("dragging the pocket near the outer's left edge lines it up exactly, in one undo step (3.16)", async () => {
  await withApp(async (window, app) => {
    const board = await openCardHolder(window);

    await carry(window, board);
    await expect(left(window)).toHaveValue('0');
    // Each rectangle's own X, as stored: the pocket's equal to the outer's,
    // exact to the storage quantum the field shows.
    const x = async (row: string): Promise<string> => {
      await window.getByTestId(`feature-row-${row}`).click();
      return panel(window).getByLabel('X').inputValue();
    };
    expect(await x('pocket-outline')).toBe(await x('outer-outline'));
    expect(await x('pocket-outline')).toBe('0');
    // The field shows two decimals; the file holds what was stored.
    const file = join(mkdtempSync(join(tmpdir(), 'leathercad-smart-guides-')), 'aligned.lcp');
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, file);
    await fromProjectMenu(window, 'save-as');
    await expect(window.getByTestId('save-state')).toHaveText('Saved');
    const origin = (id: string): unknown => {
      const feature = loadProject(readFileSync(file))
        .project.parts.flatMap((part) => part.features)
        .find((each) => each.id === id);
      return feature?.source.kind === 'shape' && feature.source.shape.type === 'rect'
        ? feature.source.shape.origin.x
        : undefined;
    };
    expect(origin('pocket-outline')).toBe(origin('outer-outline'));

    await window.getByTestId('undo').click();
    expect(await x('pocket-outline')).toBe('7');
  }, ROOM);
});

test('Ctrl held while dragging suspends the guides (3.16)', async () => {
  await withApp(async (window) => {
    const board = await openCardHolder(window);
    const from = board({ x: BODY.x + 7, y: BODY.y });
    const to = board({ x: BODY.x + 7 - 5.6, y: BODY.y });
    await window.mouse.move(from.x, from.y);
    await window.mouse.down();
    await window.keyboard.down('Control');
    await window.mouse.move(to.x, to.y, { steps: 8 });
    await window.mouse.up();
    await window.keyboard.up('Control');

    // Where the pointer took it, about 1.4 mm in: not on the outer's edge.
    const value = Number((await left(window).inputValue()).replace('−', '-'));
    expect(value).toBeGreaterThan(0.5);
    expect(value).toBeLessThan(2.5);
  }, ROOM);
});

test('Escape while dragging puts the pocket back, and leaves nothing to undo (3.16)', async () => {
  await withApp(async (window) => {
    const board = await openCardHolder(window);
    await carry(window, board, () => window.keyboard.press('Escape'));
    // Escape lets the selection go too (U.5); the pocket is picked again to read it.
    const body = board({ x: BODY.x + 7, y: BODY.y });
    await window.mouse.click(body.x, body.y);
    await expect(left(window)).toHaveValue('7');

    // The one step left is the typed Left; undoing it puts the pocket at 0.
    await window.getByTestId('undo').click();
    await expect(left(window)).toHaveValue('0');
  }, ROOM);
});
