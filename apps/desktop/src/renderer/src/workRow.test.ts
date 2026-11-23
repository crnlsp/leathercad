import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { fitWorkRow, type WorkRowFit, type WorkRowWidths } from './workRow.js';

/**
 * Row 3 on a narrow window (MS.7): "? all keys" goes first, then the group
 * names Cut, Stitch and Mark, and only then do the Draw as choices become the
 * select — the spec's order, at every width and in every language.
 */

const EVERYTHING: WorkRowFit = { allKeys: true, groupNames: true, choices: 'chips' };

/** English at 1024 px, as measured: the rail narrow, so the head is 56 px. */
const ENGLISH: WorkRowWidths = {
  head: 102,
  drawAs: 45,
  groupNames: 103,
  choices: 623,
  allKeys: 64,
};

describe('fitWorkRow', () => {
  it('shows everything when the row has room for it, the edge itself included', () => {
    expect(fitWorkRow(ENGLISH, 937)).toEqual(EVERYTHING);
    expect(fitWorkRow(ENGLISH, 5000)).toEqual(EVERYTHING);
  });

  it('gives way one step at a time at each boundary', () => {
    expect(fitWorkRow(ENGLISH, 936)).toEqual({ ...EVERYTHING, allKeys: false });
    expect(fitWorkRow(ENGLISH, 873)).toEqual({ ...EVERYTHING, allKeys: false });
    expect(fitWorkRow(ENGLISH, 872)).toEqual({
      allKeys: false,
      groupNames: false,
      choices: 'chips',
    });
    expect(fitWorkRow(ENGLISH, 770)).toEqual({
      allKeys: false,
      groupNames: false,
      choices: 'chips',
    });
    expect(fitWorkRow(ENGLISH, 769)).toEqual({
      allKeys: false,
      groupNames: false,
      choices: 'select',
    });
  });

  const width = fc.integer({ min: 1, max: 600 });
  const widths = fc.record({
    head: width,
    drawAs: width,
    groupNames: width,
    choices: width,
    allKeys: width,
  });

  /** The steps in the spec's order: how many have given way. */
  const given = (fit: WorkRowFit): number =>
    [!fit.allKeys, !fit.groupNames, fit.choices === 'select'].lastIndexOf(true) + 1;

  it("gives way in the spec's order", () => {
    fc.assert(
      fc.property(widths, (row) => {
        const full = row.head + row.drawAs + row.groupNames + row.choices + row.allKeys;
        expect(fitWorkRow(row, full)).toEqual(EVERYTHING);
        let before = 0;
        for (let room = full; room >= 0; room -= 1) {
          const fit = fitWorkRow(row, room);
          // A step is taken only after every step before it…
          if (!fit.groupNames) expect(fit.allKeys, `${String(room)} px`).toBe(false);
          if (fit.choices === 'select') expect(fit.groupNames, `${String(room)} px`).toBe(false);
          // …and nothing that has given way comes back as the room shrinks.
          expect(given(fit), `${String(room)} px`).toBeGreaterThanOrEqual(before);
          before = given(fit);
        }
        expect(before).toBe(3);
      }),
    );
  });
});
