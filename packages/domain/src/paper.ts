import type { Mm } from '@leathercad/core';

/**
 * The paper a project prints on.
 *
 * **Why this is in the domain and not in `packages/export`.** The sheet a
 * maker prints on is part of their project — it is saved, it survives a
 * reopen, and four separate things have to agree on it: the export dialog,
 * pagination, the print preview, and the on-canvas paper reference. Four
 * consumers and no stored answer is how a product ends up with two paper
 * settings that disagree, and the user discovers it when A3 comes out of the
 * printer as A4.
 *
 * So the **stored vocabulary** lives here, where `ProjectSettings` can name it.
 * Everything *derived* from it stays in `packages/export`, which is where it
 * belongs and where it already is: margins, the verification footer,
 * `PageSetup`, `contentAreaMm`, `paperOptionsFitting`. `export` imports this;
 * `domain` could not import `export` even if it wanted to.
 *
 * The dimensions come with the name because a name without them is not a
 * paper size — it is a string that some other module has to know how to
 * resolve, which is the second source of truth this exists to prevent.
 */
export interface PaperSize {
  readonly name: string;
  readonly widthMm: Mm;
  readonly heightMm: Mm;
}

/**
 * The sizes a leatherworker prints on. ISO A for most of the world, Letter and
 * Legal for North America.
 *
 * Deliberately not a free number. A custom size is a later decision with its
 * own consequences — a printer that cannot feed it, a verification block that
 * no longer fits — and every size here is one a desktop printer takes.
 */
export const PAPER_SIZES = {
  A5: { name: 'A5', widthMm: 148, heightMm: 210 },
  A4: { name: 'A4', widthMm: 210, heightMm: 297 },
  A3: { name: 'A3', widthMm: 297, heightMm: 420 },
  Letter: { name: 'Letter', widthMm: 215.9, heightMm: 279.4 },
  Legal: { name: 'Legal', widthMm: 215.9, heightMm: 355.6 },
} as const satisfies Record<string, PaperSize>;

export type PaperName = keyof typeof PAPER_SIZES;

export type Orientation = 'portrait' | 'landscape';

/**
 * Every name and orientation, for the schema and for the paper control (6.4a).
 *
 * Deliberately no `isPaperName` guard and no sheet-size helper here. The zod
 * enum validates on the way in, and `packages/export` owns everything derived
 * from a sheet: it already had `sheetSizeMm`, and a second one in the domain
 * would be a second answer to the same question.
 */
export const PAPER_NAMES = Object.keys(PAPER_SIZES) as readonly PaperName[];

export const ORIENTATIONS: readonly Orientation[] = ['portrait', 'landscape'];
