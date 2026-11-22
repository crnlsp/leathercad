import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  emptyDocument,
  mirrorAxisFor,
  mirrorFeatures,
  setPartVisible,
  type Command,
} from '@leathercad/document';
import type { Feature, Project } from '@leathercad/domain';
import { loadProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { jobTotals, selectedCount, trailOf } from './propertyFacts.js';
import { sheetPlanFor } from './sheets.js';

/**
 * What Properties says about the project with nothing selected (R-05, the
 * spec's §7 question 4) — the sheets to print — and
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
  it('reads the sample as mockup 01 does: 2 sheets of A4, portrait', () => {
    expect(jobTotals(sample())).toEqual({
      sheets: 2,
      paper: 'A4',
      orientation: 'portrait',
      scaleCheckOnly: false,
    });
  });

  it('counts the sheets the PDF writes, a hidden piece left off them', () => {
    const project = sample(setPartVisible('pocket', false));
    expect(jobTotals(project).sheets).toBe(sheetPlanFor(project).sheets.length);
  });

  it('says an empty project prints the scale check alone', () => {
    expect(jobTotals(emptyDocument('empty').project)).toEqual({
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

describe('selectedCount', () => {
  const project = sample();
  const outlines = project.parts.flatMap((part) =>
    part.features.filter((f) => f.kind === 'cut-contour' && f.role === 'outer').map((f) => f.id),
  );
  const none = new Set<string>();

  it('counts the pieces whose outlines are selected as pieces (X9)', () => {
    expect(outlines).toHaveLength(3);
    expect(selectedCount(project, new Set(outlines), none)).toEqual({ of: 'pieces', count: 3 });
  });

  it('counts pieces picked by their headings as pieces', () => {
    expect(selectedCount(project, none, new Set(['outer', 'pocket']))).toEqual({
      of: 'pieces',
      count: 2,
    });
  });

  it('counts an outline with anything else as features', () => {
    const other = project.parts[0]?.features.find((f) => !outlines.includes(f.id));
    if (other === undefined) throw new Error('the sample has more than an outline');
    expect(selectedCount(project, new Set([outlines[1] ?? '', other.id]), none)).toEqual({
      of: 'features',
      count: 2,
    });
  });
});
