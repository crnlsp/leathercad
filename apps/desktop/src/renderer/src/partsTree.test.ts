import type { Feature, Part } from '@leathercad/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { revealed, treeMove, treeRows, type TreeRow } from './partsTree.js';

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false });

const outline = (id: string): Feature => ({
  ...base(id, 'Outline'),
  kind: 'cut-contour',
  role: 'outer',
  source: { kind: 'shape', shape: { type: 'circle', centre: { x: 0, y: 0 }, radius: 30 } },
});

const stitchLine = (id: string, from: string): Feature => ({
  ...base(id, 'Stitch line'),
  kind: 'stitch-line',
  source: {
    kind: 'derived',
    sourceId: from,
    op: { type: 'offset', distanceMm: 3.5, side: 'inward', run: { kind: 'whole' } },
  },
});

const holes = (id: string, from: string): Feature => ({
  ...base(id, 'Stitch holes'),
  kind: 'stitch-hole-set',
  source: {
    kind: 'derived',
    sourceId: from,
    op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'continuous' },
  },
});

const fold = (id: string): Feature => ({
  ...base(id, 'Fold (valley)'),
  kind: 'fold-line',
  direction: 'valley',
  source: {
    kind: 'path',
    path: { segments: [{ kind: 'line', a: { x: 0, y: -30 }, b: { x: 0, y: 30 } }], closed: false },
  },
});

const part = (id: string, ...features: Feature[]): Part => ({
  id,
  name: id,
  quantity: 1,
  features,
});

/** Mockup 09: Outer › Outline › Stitch line › Stitch holes, and a fold; Lining; an empty piece. */
const OUTER = part(
  'outer',
  outline('o-cut'),
  stitchLine('o-stitch', 'o-cut'),
  holes('o-holes', 'o-stitch'),
  fold('o-fold'),
);
const LINING = part('lining', outline('l-cut'), fold('l-fold'));
const EMPTY = part('empty');
const PARTS = [OUTER, LINING, EMPTY];
const NONE = new Set<string>();

/** Each row as `level key`, so a test reads like the tree. */
const shape = (rows: readonly TreeRow[]): string[] =>
  rows.map((row) => `${String(row.level)} ${row.key}`);

describe('treeRows', () => {
  it('nests each feature under what it follows, and the pieces at the top', () => {
    expect(shape(treeRows(PARTS, NONE))).toEqual([
      '1 part:outer',
      '2 feature:o-cut',
      '3 feature:o-stitch',
      '4 feature:o-holes',
      '2 feature:o-fold',
      '1 part:lining',
      '2 feature:l-cut',
      '2 feature:l-fold',
      '1 part:empty',
    ]);
  });

  it('leaves a closed piece’s features out, and says which pieces fold', () => {
    const rows = treeRows(PARTS, new Set(['outer']));
    expect(shape(rows)).toEqual([
      '1 part:outer',
      '1 part:lining',
      '2 feature:l-cut',
      '2 feature:l-fold',
      '1 part:empty',
    ]);
    expect(rows.map((row) => row.expanded)).toEqual([false, true, undefined, undefined, undefined]);
  });

  it('names each row’s parent, and its place among its siblings', () => {
    const rows = treeRows([OUTER], NONE);
    expect(rows.map((row) => [row.key, row.parent, row.position, row.siblings])).toEqual([
      ['part:outer', null, 1, 1],
      ['feature:o-cut', 'part:outer', 1, 2],
      ['feature:o-stitch', 'feature:o-cut', 1, 1],
      ['feature:o-holes', 'feature:o-stitch', 1, 1],
      ['feature:o-fold', 'part:outer', 2, 2],
    ]);
  });

  it('keeps a piece and a feature of the same id apart', () => {
    const rows = treeRows([part('x', outline('x'))], NONE);
    expect(rows.map((row) => row.key)).toEqual(['part:x', 'feature:x']);
  });
});

describe('treeMove', () => {
  const rows = treeRows(PARTS, NONE);

  it('moves down and up the rows shown, and stops at the ends', () => {
    expect(treeMove(rows, 'part:outer', 'ArrowDown')).toEqual({ focus: 'feature:o-cut' });
    expect(treeMove(rows, 'feature:o-fold', 'ArrowDown')).toEqual({ focus: 'part:lining' });
    expect(treeMove(rows, 'part:lining', 'ArrowUp')).toEqual({ focus: 'feature:o-fold' });
    expect(treeMove(rows, 'part:outer', 'ArrowUp')).toBeNull();
    expect(treeMove(rows, 'part:empty', 'ArrowDown')).toBeNull();
    expect(treeMove(rows, 'feature:o-holes', 'Home')).toEqual({ focus: 'part:outer' });
    expect(treeMove(rows, 'part:outer', 'End')).toEqual({ focus: 'part:empty' });
  });

  it('Right opens a closed piece, then goes into it', () => {
    const closed = treeRows(PARTS, new Set(['outer']));
    expect(treeMove(closed, 'part:outer', 'ArrowRight')).toEqual({ open: 'outer' });
    expect(treeMove(rows, 'part:outer', 'ArrowRight')).toEqual({ focus: 'feature:o-cut' });
    // A feature something follows: into what follows it. One nothing follows, and an empty piece: nowhere.
    expect(treeMove(rows, 'feature:o-cut', 'ArrowRight')).toEqual({ focus: 'feature:o-stitch' });
    expect(treeMove(rows, 'feature:o-holes', 'ArrowRight')).toBeNull();
    expect(treeMove(rows, 'part:empty', 'ArrowRight')).toBeNull();
  });

  it('Left closes an open piece, and goes from a feature to what it nests under', () => {
    expect(treeMove(rows, 'part:outer', 'ArrowLeft')).toEqual({ close: 'outer' });
    expect(treeMove(rows, 'feature:o-holes', 'ArrowLeft')).toEqual({ focus: 'feature:o-stitch' });
    expect(treeMove(rows, 'feature:o-fold', 'ArrowLeft')).toEqual({ focus: 'part:outer' });
    expect(treeMove(treeRows(PARTS, new Set(['outer'])), 'part:outer', 'ArrowLeft')).toBeNull();
  });

  it('ignores other keys, and a row that is not shown', () => {
    expect(treeMove(rows, 'part:outer', 'Enter')).toBeNull();
    expect(treeMove(rows, 'feature:gone', 'ArrowDown')).toBeNull();
  });

  /** A forest of pieces: each feature follows one before it in its piece, or nothing. */
  const forests = fc
    .array(fc.array(fc.option(fc.nat(), { nil: undefined }), { maxLength: 6 }), {
      minLength: 1,
      maxLength: 4,
    })
    .map((pieces) =>
      pieces.map((links, p) =>
        part(
          `p${String(p)}`,
          ...links.map((link, f) => {
            const id = `p${String(p)}f${String(f)}`;
            return link === undefined || f === 0
              ? outline(id)
              : stitchLine(id, `p${String(p)}f${String(link % f)}`);
          }),
        ),
      ),
    );
  const forestAndFolds = forests.chain((parts) =>
    fc.tuple(fc.constant(parts), fc.subarray(parts.map((p) => p.id))),
  );

  it('reaches every row shown with Down from the first, and back with Up', () => {
    fc.assert(
      fc.property(forestAndFolds, ([parts, closed]) => {
        const shown = treeRows(parts, new Set(closed));
        const seen = [shown[0]!.key];
        for (let move = treeMove(shown, seen[0]!, 'ArrowDown'); move !== null;) {
          if (!('focus' in move)) return false;
          seen.push(move.focus);
          move = treeMove(shown, move.focus, 'ArrowDown');
        }
        expect(seen).toEqual(shown.map((row) => row.key));
        for (let index = 1; index < shown.length; index++) {
          expect(treeMove(shown, shown[index]!.key, 'ArrowUp')).toEqual({
            focus: shown[index - 1]!.key,
          });
        }
        return true;
      }),
    );
  });

  it('Left from any feature reaches its piece, one level at a time', () => {
    fc.assert(
      fc.property(forestAndFolds, ([parts, closed]) => {
        const shown = treeRows(parts, new Set(closed));
        for (const row of shown.filter((r) => r.kind === 'feature')) {
          let at = row;
          while (at.kind === 'feature') {
            const move = treeMove(shown, at.key, 'ArrowLeft');
            expect(move).not.toBeNull();
            const next = shown.find(
              (r) => move !== null && 'focus' in move && r.key === move.focus,
            );
            expect(next?.level).toBe(at.level - 1);
            at = next!;
          }
          expect(at.key).toBe(`part:${row.partId}`);
        }
      }),
    );
  });
});

describe('revealed', () => {
  it('opens the pieces that hold a selected feature, and only those', () => {
    const closed = new Set(['outer', 'lining']);
    expect([...revealed(PARTS, closed, new Set(['o-holes']))]).toEqual(['lining']);
  });

  it('is the same set when nothing needs opening', () => {
    const closed = new Set(['outer']);
    expect(revealed(PARTS, closed, new Set(['l-cut']))).toBe(closed);
    expect(revealed(PARTS, closed, NONE)).toBe(closed);
  });
});
