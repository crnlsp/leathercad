import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import {
  addPart,
  emptyDocument,
  rectShape,
  rectanglePart,
} from '../packages/document/src/index.js';
import { saveProject } from '../packages/persist/src/index.js';
import { boardMap } from './boardMap.js';
import { drawAPanel, expectNoViolations, withApp } from './launchApp.js';
import { fromProjectMenu } from './projectMenu.js';
import { nextFrame } from './renderCount.js';

/**
 * U.24d: Parts, Properties and the selection bar, refined — new pieces told
 * apart by name (X35), the corner radius fields named for a screen reader
 * (X40), *Fit* clear of the legend (X32), and the bar clear of the next piece
 * (X33).
 */

interface Piece {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A project of plain panels, saved where the app can be launched on it. */
function projectFile(pieces: readonly Piece[]): string {
  const file = join(mkdtempSync(join(tmpdir(), 'leathercad-u24d-')), 'Pieces.lcp');
  let document = emptyDocument('u24d');
  for (const { id, x, y, w, h } of pieces) {
    document = addPart(rectanglePart(id, `${id}-outline`, id, rectShape({ x, y }, w, h))).apply(
      document,
    );
  }
  writeFileSync(
    file,
    saveProject(document.project, {
      applicationVersion: '1.7.0',
      now: () => new Date('2026-11-19T00:00:00Z'),
    }),
  );
  return file;
}

/** Where a piece lies on screen, from the board's own readout. */
async function onScreen(window: Page, { x, y, w, h }: Piece) {
  const map = await boardMap(window);
  const a = map({ x, y: y + h });
  const b = map({ x: x + w, y });
  return { left: a.x, top: a.y, right: b.x, bottom: b.y };
}

type Box = { left: number; top: number; right: number; bottom: number };
const boxOf = (b: { x: number; y: number; width: number; height: number }): Box => ({
  left: b.x,
  top: b.y,
  right: b.x + b.width,
  bottom: b.y + b.height,
});
const overlap = (a: Box, b: Box): boolean =>
  a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

test('a second drawn panel is "Panel 2", and its corners are named for a screen reader (X35, X40)', async () => {
  await withApp(async (window) => {
    await drawAPanel(window, { left: 150, parts: '1' });
    await drawAPanel(window, { left: 400, parts: '2' });
    const parts = window.getByTestId('parts-list');
    await expect(parts).toContainText('Panel 2');
    await expect(window.getByTestId('part-name')).toHaveValue('Panel 2');

    const panel = window.getByTestId('property-panel');
    for (const corner of ['Top-left', 'Top-right', 'Bottom-left', 'Bottom-right']) {
      await expect(
        panel.getByRole('textbox', { name: `${corner} corner radius`, exact: false }),
      ).toBeVisible();
    }
    // What is seen stays the glyph.
    await expect(panel.locator('.field-label', { hasText: '↖' })).toBeVisible();
    await expectNoViolations(window, 'a rectangle in Properties');
  });
});

test('Fit leaves the open legend’s corner clear of the drawing (X32)', async () => {
  await withApp(
    async (window, app) => {
      // A piece of the board's own shape, so Fit fills the board to its
      // margin on every side, as the bifold does at 1440 × 900.
      const board = (await window.getByTestId('editor-canvas').boundingBox())!;
      const piece: Piece = { id: 'Outer', x: 0, y: 0, w: board.width / 4, h: board.height / 4 };
      const file = projectFile([piece]);
      await app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
      }, file);
      await fromProjectMenu(window, 'open');
      await expect(window.getByTestId('part-count')).toHaveText('1');
      await expect(window.getByTestId('canvas-legend-toggle')).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await window.getByTestId('zoom-fit').click();
      await nextFrame(window);
      const legend = boxOf((await window.getByTestId('canvas-legend').boundingBox())!);
      expect(overlap(await onScreen(window, piece), legend)).toBe(false);
    },
    { size: [1440, 900] },
  );
});

test('the selection bar keeps off the piece under the selection (X33)', async () => {
  const top: Piece = { id: 'Front', x: 0, y: 0, w: 100, h: 60 };
  const under: Piece = { id: 'Back', x: 0, y: -70, w: 100, h: 60 };
  await withApp(
    async (window) => {
      await window.getByTestId('feature-row-Front-outline').click();
      await window.getByTestId('zoom-fit').click();
      // Two steps out: room over the selection, none under it but the next piece.
      const level = window.getByTestId('zoom-level');
      for (let i = 0; i < 2; i++) {
        const was = (await level.textContent()) ?? '';
        await window.getByTestId('zoom-out').click();
        await expect(level).not.toHaveText(was);
      }
      await nextFrame(window);
      const bar = window.getByTestId('selection-bar');
      await expect(bar).toBeVisible();
      await nextFrame(window);
      const placed = boxOf((await bar.boundingBox())!);
      await expect(bar).toHaveAttribute('data-side', 'above');
      expect(overlap(placed, await onScreen(window, under))).toBe(false);
      expect(overlap(placed, await onScreen(window, top))).toBe(false);
    },
    { args: [projectFile([top, under])], size: [1440, 900] },
  );
});
