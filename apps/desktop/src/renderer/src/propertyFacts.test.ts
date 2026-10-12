import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  addPart,
  addStitchHoles,
  emptyDocument,
  mirrorAxisFor,
  mirrorFeatures,
  rectShape,
  setFeatureVisible,
  setPartQuantity,
  setPartVisible,
  shapePart,
  type Command,
} from '@leathercad/document';
import type { Feature, Project } from '@leathercad/domain';
import { loadProject } from '@leathercad/persist';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { jobTotals, trailOf } from './propertyFacts.js';
import { sheetPlanFor } from './sheets.js';

/**
 * What Properties says about the project with nothing selected (R-05, the
 * spec's §7 question 4) — pieces to cut, holes to punch, sheets to print — and
 * the trail under a feature's name: "Outer · Cut ×1 › Stitch line › Stitch
 * holes".
 */

const SAMPLE = resolve(import.meta.dirname, '../../../../../fixtures/projects/bifold-wallet.lcp');

/** The sample wallet, as Help opens it: Outer, Lining, and a Card pocket cut twice. */
function sample(...commands: Command[]): Project {
  const { project } = loadProject(new Uint8Array(readFileSync(SAMPLE)));
  return commands.reduce((document, command) => command.apply(document), { project }).project;
}

function feature(project: Project, id: string): Feature {
  const found = project.parts.flatMap((part) => part.features).find((f) => f.id === id);
  if (found === undefined) throw new Error(`No feature ${id}.`);
  return found;
}

describe('jobTotals', () => {
  it('reads the sample as mockup 01 does: 3 pieces, 4 to cut, 146 + 52 ×2 holes, 2 sheets of A4', () => {
    expect(jobTotals(sample())).toEqual({
      pieces: 3,
      toCut: 4,
      holes: 250,
      holeSets: [
        { holes: 146, cut: 1 },
        { holes: 52, cut: 2 },
      ],
      sheets: 2,
      paper: 'A4',
      orientation: 'portrait',
      scaleCheckOnly: false,
    });
  });

  it('counts each piece as many times as it is cut, and its holes with it', () => {
    const totals = jobTotals(sample(setPartQuantity('outer', 3)));
    expect(totals.toCut).toBe(6);
    expect(totals.holes).toBe(3 * 146 + 2 * 52);
    expect(totals.holeSets[0]).toEqual({ holes: 146, cut: 3 });
  });

  it('counts any Cut, on any piece, into the pieces and the holes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 50 }),
        (outer, pocket) => {
          const totals = jobTotals(
            sample(setPartQuantity('outer', outer), setPartQuantity('pocket', pocket)),
          );
          expect(totals.pieces).toBe(3);
          expect(totals.toCut).toBe(outer + 1 + pocket);
          expect(totals.holes).toBe(146 * outer + 52 * pocket);
          expect(totals.holes).toBe(
            totals.holeSets.reduce((sum, set) => sum + set.holes * set.cut, 0),
          );
        },
      ),
      { numRuns: 25 },
    );
  });

  it('leaves a hidden piece out of what is cut and punched, since it does not print', () => {
    const project = sample(setPartVisible('pocket', false));
    const totals = jobTotals(project);
    expect(totals.pieces).toBe(3);
    expect(totals.toCut).toBe(2);
    expect(totals.holes).toBe(146);
    expect(totals.holeSets).toEqual([{ holes: 146, cut: 1 }]);
    expect(totals.sheets).toBe(sheetPlanFor(project).sheets.length);
  });

  it('leaves out a hidden hole set on a piece that prints', () => {
    const totals = jobTotals(sample(setFeatureVisible(['outer-holes'], false)));
    expect(totals.toCut).toBe(4);
    expect(totals.holes).toBe(104);
    expect(totals.holeSets).toEqual([{ holes: 52, cut: 2 }]);
  });

  it('lists every hole set, whatever its iron, in the order the parts list them', () => {
    const project = sample(
      addStitchHoles('pocket', 'pocket-holes-fine', 'pocket-stitch', { pitchMm: 2.7 }),
    );
    const totals = jobTotals(project);
    const fine = totals.holeSets[2]!;
    expect(totals.holeSets.slice(0, 2)).toEqual([
      { holes: 146, cut: 1 },
      { holes: 52, cut: 2 },
    ]);
    expect(fine.cut).toBe(2);
    expect(fine.holes).toBeGreaterThan(52);
    expect(totals.holes).toBe(146 + 2 * 52 + 2 * fine.holes);
  });

  it('counts no holes on a piece without stitching', () => {
    const project = addPart(
      shapePart('panel', 'panel-outline', 'Panel', rectShape({ x: 0, y: 0 }, 80, 50)),
    ).apply(emptyDocument('plain')).project;
    expect(jobTotals(project)).toMatchObject({
      pieces: 1,
      toCut: 1,
      holes: 0,
      holeSets: [],
      sheets: 1,
      scaleCheckOnly: false,
    });
  });

  it('says an empty project prints the scale check alone', () => {
    expect(jobTotals(emptyDocument('empty').project)).toEqual({
      pieces: 0,
      toCut: 0,
      holes: 0,
      holeSets: [],
      sheets: 1,
      paper: 'A4',
      orientation: 'portrait',
      scaleCheckOnly: true,
    });
  });
});

describe('trailOf', () => {
  it('names what a hole set follows, without the outline the piece stands for', () => {
    const project = sample();
    expect(trailOf(project, feature(project, 'outer-holes'))).toEqual(['Stitch line']);
  });

  it('is empty for the outline itself and for what follows it directly', () => {
    const project = sample();
    expect(trailOf(project, feature(project, 'outer-outline'))).toEqual([]);
    expect(trailOf(project, feature(project, 'outer-stitch'))).toEqual([]);
  });

  it('keeps a stitch line drawn by hand, which is not the piece', () => {
    const project = sample();
    expect(trailOf(project, feature(project, 'pocket-holes'))).toEqual(['Stitch line']);
  });

  it('names what a counterpart mirrors', () => {
    const project = sample();
    expect(trailOf(project, feature(project, 'lining-slot-mirrored'))).toEqual(['Cut-out']);
  });

  it("names another piece's outline by its piece", () => {
    const base = sample();
    const axis = mirrorAxisFor(base, ['outer-outline'], 'horizontal');
    if (axis === null) throw new Error('The outer can be mirrored.');
    const project = sample(mirrorFeatures(['outer-outline'], ['copy-outline'], axis, ['copy']));
    expect(trailOf(project, feature(project, 'copy-outline'))).toEqual(['Outer']);
  });
});
