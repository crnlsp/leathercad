import { RectOps } from '@leathercad/geometry';
import { DEFAULT_PAGE_SETUP, planSheets, type ExportPart } from '@leathercad/export';
import { describe, expect, it } from 'vitest';

import { leaveOut } from './printSheets.js';

function part(id: string, widthMm: number, heightMm: number): ExportPart {
  return {
    id,
    name: id,
    quantity: 1,
    boundsMm: RectOps.fromCorners({ x: 0, y: 0 }, { x: widthMm, y: heightMm }),
    paths: [],
    texts: [],
  };
}

// On A4 portrait: a panel packed on sheet 1; a gusset taped 2 × 3, its map on
// sheet 2 and its tiles on 3–8; a side taped 2 × 2, its map on 9 and its
// tiles on 10–13 (7.2).
const plan = planSheets(
  {
    projectName: 'Bag',
    parts: [part('panel', 80, 60), part('gusset', 400, 300), part('side', 300, 300)],
  },
  DEFAULT_PAGE_SETUP,
);
const GUSSET = [3, 4, 5, 6, 7, 8];
const SIDE = [10, 11, 12, 13];

/** Leaves these sheets out one at a time, as a maker unticks them. */
function untick(sheets: readonly number[], from: ReadonlySet<number> = new Set()) {
  return sheets.reduce<ReadonlySet<number>>((out, n) => leaveOut(plan, out, n, false), from);
}

const sorted = (set: ReadonlySet<number>) => [...set].sort((a, b) => a - b);

describe('leaving sheets out of a print (7.2)', () => {
  it('lays the plan out as this test reads it', () => {
    expect(plan.sheets[1]!.assembly?.part.id).toBe('gusset');
    expect(plan.sheets[8]!.assembly?.part.id).toBe('side');
    expect(plan.parts.get('gusset')!.sheets).toEqual(GUSSET);
    expect(plan.parts.get('side')!.sheets).toEqual(SIDE);
  });

  it('leaves a part’s map out with the last of its tiles, and no other part’s', () => {
    expect(sorted(untick(GUSSET.slice(0, -1)))).toEqual(GUSSET.slice(0, -1));
    expect(sorted(untick(GUSSET))).toEqual([2, ...GUSSET]);
    expect(sorted(untick(SIDE))).toEqual([9, ...SIDE]);
  });

  it('puts the map back with the first of its tiles', () => {
    const out = leaveOut(plan, untick(GUSSET), 5, true);
    expect(sorted(out)).toEqual([3, 4, 6, 7, 8]);
  });

  it('leaves a map out, or puts it back, on its own', () => {
    expect(sorted(untick([2]))).toEqual([2]);
    expect(sorted(leaveOut(plan, untick([2, 9]), 2, true))).toEqual([9]);
    // A map left out alone stays out while its tiles come and go.
    expect(sorted(leaveOut(plan, untick([2, 3]), 3, true))).toEqual([2]);
  });

  it('moves no map for a packed sheet', () => {
    expect(sorted(untick([1]))).toEqual([1]);
  });
});
