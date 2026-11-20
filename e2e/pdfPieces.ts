import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

import { PRINT_STYLES } from '../packages/export/src/index.js';

/**
 * The pieces on an exported PDF (R16), read from its content streams by hand:
 * nothing here knows how the file was written beyond the PDF operators
 * themselves, and nothing is taken from the project's coordinates.
 *
 * A piece is a cut outline — a stroked, round-capped path at the cut line's
 * width — that no other cut line on its page encloses; a hole is a hole
 * marker's small closed circle, counted to the piece whose outline encloses
 * its centre. Sizes are in millimetres, from the outline's on-curve points,
 * which for a rounded rectangle or a circle are its true extent.
 *
 * It reads a page's content as one stream, as `exportPdf` writes it. A piece
 * tiled over several sheets is on each of them, and is reported per sheet.
 */

interface PdfPiece {
  /** The PDF page it is on, from 1, in the order the pages' streams appear. */
  readonly page: number;
  readonly widthMm: number;
  readonly heightMm: number;
  /** Hole markers whose centres are inside it. */
  readonly holes: number;
  /** Cut lines inside it: its cut-outs. */
  readonly cutOuts: number;
}

interface Box {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const MM_PER_PT = 25.4 / 72;
const ptOf = (mm: number) => mm / MM_PER_PT;

/** Every stroked subpath on each page, with the width and cap it was stroked at. */
function strokesByPage(
  file: string,
): Array<Array<{ width: number; cap: number; box: Box; closed: boolean }>> {
  const bytes = readFileSync(file);
  const text = bytes.toString('latin1');
  const pages: Array<Array<{ width: number; cap: number; box: Box; closed: boolean }>> = [];
  for (const match of text.matchAll(/<<([^]*?)>>\s*stream\r?\n/g)) {
    const start = match.index + match[0].length;
    const end = text.indexOf('endstream', start);
    const raw = bytes.subarray(start, end);
    const body = /\/FlateDecode/.test(match[1]!)
      ? inflateSync(raw).toString('latin1')
      : raw.toString('latin1');
    // A page's content: an object stream or a font never strokes.
    if (!/\bS\b/.test(body) || !/\bw\b/.test(body)) continue;
    pages.push(strokesOf(body));
  }
  return pages;
}

function strokesOf(content: string) {
  const found: Array<{ width: number; cap: number; box: Box; closed: boolean }> = [];
  const stack: Array<{ width: number; cap: number }> = [];
  let state = { width: 1, cap: 0 };
  let operands: number[] = [];
  let subpaths: Array<{ points: Array<[number, number]>; closed: boolean }> = [];
  const current = () => subpaths.at(-1);
  for (const token of content.replace(/[[\]]/g, ' ').split(/\s+/)) {
    if (token === '') continue;
    const value = Number(token);
    if (!Number.isNaN(value)) {
      operands.push(value);
      continue;
    }
    const n = operands;
    operands = [];
    if (token === 'q') stack.push(state);
    else if (token === 'Q') state = stack.pop() ?? { width: 1, cap: 0 };
    else if (token === 'w') state = { ...state, width: n[0]! };
    else if (token === 'J') state = { ...state, cap: n[0]! };
    else if (token === 'm') subpaths.push({ points: [[n[0]!, n[1]!]], closed: false });
    else if (token === 'l') current()?.points.push([n[0]!, n[1]!]);
    else if (token === 'c') current()?.points.push([n[4]!, n[5]!]);
    else if (token === 'h') {
      const last = current();
      if (last !== undefined) last.closed = true;
    } else if (token === 'S') {
      for (const path of subpaths)
        found.push({ ...state, box: boxOf(path.points), closed: path.closed });
      subpaths = [];
    } else if (token === 'f' || token === 'n' || token === 'B' || token === 'b') subpaths = [];
  }
  return found;
}

function boxOf(points: ReadonlyArray<[number, number]>): Box {
  const xs = points.map(([x]) => x * MM_PER_PT);
  const ys = points.map(([, y]) => y * MM_PER_PT);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;
const inside = (box: Box, x: number, y: number) =>
  x > box.minX && x < box.maxX && y > box.minY && y < box.maxY;
const encloses = (outer: Box, inner: Box) =>
  outer !== inner &&
  outer.minX <= inner.minX &&
  outer.maxX >= inner.maxX &&
  outer.minY <= inner.minY &&
  outer.maxY >= inner.maxY;

/** The pieces on every page of an exported PDF, in page order, then left to right. */
export function piecesInPdf(file: string): PdfPiece[] {
  const cutWidth = ptOf(PRINT_STYLES.cut.widthMm);
  const holeWidth = ptOf(PRINT_STYLES['stitch-holes'].widthMm);
  return strokesByPage(file).flatMap((strokes, index) => {
    // The pattern's own lines are round-capped; the page's gauge and joins are not.
    const pattern = strokes.filter((s) => s.cap === 1);
    const cuts = pattern.filter((s) => s.closed && near(s.width, cutWidth)).map((s) => s.box);
    const holes = pattern
      .filter((s) => s.closed && near(s.width, holeWidth) && s.box.maxX - s.box.minX < 2)
      .map((s) => s.box);
    return cuts
      .filter((box) => !cuts.some((other) => encloses(other, box)))
      .sort((a, b) => a.minX - b.minX)
      .map((box) => ({
        page: index + 1,
        widthMm: box.maxX - box.minX,
        heightMm: box.maxY - box.minY,
        holes: holes.filter((h) => inside(box, (h.minX + h.maxX) / 2, (h.minY + h.maxY) / 2))
          .length,
        cutOuts: cuts.filter((other) => encloses(box, other)).length,
      }));
  });
}
