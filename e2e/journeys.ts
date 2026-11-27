import { existsSync, readFileSync } from 'node:fs';

import { expect, type ElectronApplication, type Locator, type Page } from '@playwright/test';

import { diagnose, evaluate, seamVerdict, type Project } from '../packages/domain/src/index.js';
import { loadProject } from '../packages/persist/src/index.js';
import {
  differences,
  type Expected,
} from '../tests/smart-features/src/harness/expectDiagnostics.js';
import { fromProjectMenu } from './projectMenu.js';

/**
 * What R16's manufacturing journeys share: a maker's steps through the real
 * app, and what is read back afterwards — the saved file, through `persist`
 * and `domain`, and the exported PDF, through `pdfPieces.ts`.
 */

export const panel = (window: Page): Locator => window.getByTestId('property-panel');

/**
 * Types a number into a field and presses Enter, and waits until it reads
 * back as a millimetre field shows it: to two decimals, with a true minus.
 */
export async function enter(field: Locator, value: string): Promise<void> {
  await field.fill(value);
  await field.press('Enter');
  await expect(field).toHaveValue(String(Number(Number(value).toFixed(2))).replace('-', '−'));
}

/** Draws a rectangle with the Rectangle tool, between two points on the board in window pixels. */
export async function drawRectangle(
  window: Page,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
): Promise<void> {
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  await window.getByTestId('tool-rectangle').click();
  await window.mouse.move(box.x + x0, box.y + y0);
  await window.mouse.down();
  await window.mouse.move(box.x + x1, box.y + y1, { steps: 5 });
  await window.mouse.up();
}

/**
 * The rectangle just drawn, typed to its size, corner radii and name in
 * Properties — top-left, top-right, bottom-left, bottom-right.
 */
export async function shapePiece(
  window: Page,
  piece: {
    readonly name: string;
    readonly width: number;
    readonly height: number;
    readonly radii?: readonly [number, number, number, number];
  },
): Promise<void> {
  const fields = panel(window);
  await enter(fields.getByLabel('Width'), String(piece.width));
  await enter(fields.getByLabel('Height'), String(piece.height));
  const corners = ['Top-left', 'Top-right', 'Bottom-left', 'Bottom-right'];
  for (const [i, radius] of (piece.radii ?? []).entries()) {
    await enter(
      fields.getByRole('textbox', { name: `${corners[i]!} corner radius mm` }),
      String(radius),
    );
  }
  await fields.getByTestId('part-name').fill(piece.name);
}

/**
 * The selection bar's next steps on a selected outline: a stitch line at
 * `margin`, its sides chosen by `sides` (*Stitched sides*), then its holes.
 */
export async function stitchAndPunch(window: Page, margin: number, sides?: string): Promise<void> {
  const step = window.getByTestId('selection-bar-step');
  await expect(step).toHaveAttribute('data-step', 'stitchLine');
  await step.click();
  await enter(panel(window).getByLabel('Edge margin'), String(margin));
  if (sides !== undefined) {
    await panel(window).getByTestId('stitch-run').selectOption({ label: sides });
  }
  await expect(step).toHaveAttribute('data-step', 'holes');
  await step.click();
}

/** A feature in the Parts list, by its piece and its own name. */
export function featureRow(window: Page, piece: string, feature: string): Locator {
  return window
    .locator('[data-testid^="part-section-"]')
    .filter({ has: window.locator('[data-testid^="part-heading-"]', { hasText: piece }) })
    .locator('[data-testid^="feature-row-"]')
    .filter({ hasText: feature });
}

/** One side of a seam, as the seam panel's fields choose it. */
type SideChoice =
  | { readonly holes: string; readonly between: readonly [string, string] }
  | { readonly holes: string; readonly from: string; readonly toward: 'next' | 'previous' };

/**
 * *Sew together* on two hole sets already selected, each side's run chosen
 * in the panel, committed.
 */
export async function sew(window: Page, a: SideChoice, b: SideChoice): Promise<void> {
  await window.getByTestId('sew-together').click();
  const sides = window.getByTestId('seam-panel').getByTestId('seam-side');
  for (const [i, side] of [a, b].entries()) {
    const fields = sides.nth(i);
    await fields.getByTestId('seam-holes').selectOption({ label: side.holes });
    if ('between' in side) {
      await fields.getByTestId('seam-where').selectOption('between');
      await fields.getByLabel('From', { exact: true }).selectOption(side.between[0]);
      await fields.getByLabel('To', { exact: true }).selectOption(side.between[1]);
    } else {
      await fields.getByTestId('seam-where').selectOption('from');
      await fields.getByLabel('From', { exact: true }).selectOption(side.from);
      await fields.getByLabel('Direction', { exact: true }).selectOption(side.toward);
    }
  }
  await window.getByTestId('seam-commit').click();
}

/** Has the next save dialog answer `file`, and the system viewer open nothing. */
async function answerSaveWith(app: ElectronApplication, file: string): Promise<void> {
  await app.evaluate(({ dialog, shell }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    shell.openPath = async () => '';
  }, file);
}

/** *Save as…* to `file`, and the project as it reads back from it. */
export async function saveAs(
  app: ElectronApplication,
  window: Page,
  file: string,
): Promise<Project> {
  await answerSaveWith(app, file);
  await fromProjectMenu(window, 'save-as');
  await expect(window.getByTestId('announce-save')).toHaveText('Saved');
  return loadProject(readFileSync(file)).project;
}

/** *Export PDF* to `pdf`, waited for until it is on disk. */
export async function exportPdfTo(
  app: ElectronApplication,
  window: Page,
  pdf: string,
): Promise<void> {
  await answerSaveWith(app, pdf);
  await window.getByTestId('export-pdf').click();
  await expect.poll(() => existsSync(pdf), { timeout: 10_000 }).toBe(true);
  await expect(window.getByTestId('file-error')).toHaveCount(0);
  expect(readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-');
}

/** Each hole set's hole count in a project, by piece and hole set name: "Outer › Stitch holes". */
export function holeCounts(project: Project): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const part of evaluate(project).parts) {
    for (const entry of part.features) {
      if (entry.ok && entry.holes !== undefined) {
        counts[`${part.part.name} › ${entry.feature.name}`] = entry.holes.count;
      }
    }
  }
  return counts;
}

/** Each declared seam's verdict, as the domain gives it: counts, and the drift to 0.01 mm. */
export function seamVerdicts(project: Project): string[] {
  return (project.seams ?? []).map((seam) => {
    const verdict = seamVerdict(project, seam);
    return verdict.ok
      ? `${verdict.countA}/${verdict.countB} ${verdict.driftMm.toFixed(2)} ${verdict.severity}`
      : verdict.problem.code;
  });
}

/** A width and height, the larger first, rounded to 0.001 mm: a piece however the sheet turns it. */
export function size(widthMm: number, heightMm: number): string {
  const [a, b] = [widthMm, heightMm].sort((x, y) => y - x);
  return `${a!.toFixed(3)} × ${b!.toFixed(3)}`;
}

/**
 * The project's whole diagnostic list is exactly `expected`, compared as the
 * Smart Features scenarios compare it (tests/smart-features): nothing missing,
 * nothing more, each with its severity, subject and the facts named.
 */
export function expectDiagnostics(project: Project, expected: readonly Expected[]): void {
  expect(differences(diagnose(project), expected).map((d) => d.line)).toEqual([]);
}

/** A feature's id in a saved project, by its piece's name and its own. */
export function featureId(project: Project, piece: string, feature: string): string {
  const found = project.parts
    .find((part) => part.name === piece)
    ?.features.find((each) => each.name === feature);
  if (found === undefined) throw new Error(`no ${piece} › ${feature} in the project`);
  return found.id;
}
