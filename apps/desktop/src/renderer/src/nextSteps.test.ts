import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DocumentStore,
  addAllowancePart,
  addDrawnStitchLine,
  addPart,
  emptyDocument,
  rectShape,
  selectionOf,
  shapePart,
  type Command,
  type Selection,
} from '@leathercad/document';
import type { Feature, Project } from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import { loadProject } from '@leathercad/persist';
import { STARTER_IRONS } from '@leathercad/platform';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { MakerTools } from './irons.js';
import { nextSteps, runStep, stepRefusal, stitchChain, type StitchChain } from './nextSteps.js';

/**
 * The selection bar's second line (R-14, U.17): which piece's stitching a
 * selection is about, which of Stitch line › Stitch holes › Seam allowance it
 * has, and the one click that makes the first it has not — read from the
 * derivation graph, so a piece drawn as *Stitch + allowance*, whose outline
 * follows its stitch line, reads the right way round.
 */

const SAMPLE = resolve(import.meta.dirname, '../../../../../fixtures/projects/bifold-wallet.lcp');

const TOOLS: MakerTools = {
  irons: STARTER_IRONS,
  defaultIronId: 'crimson-3.0',
  stitchMarginMm: 4,
  leatherThicknessMm: null,
};

function sample(...commands: Command[]): Project {
  const { project } = loadProject(new Uint8Array(readFileSync(SAMPLE)));
  return commands.reduce((document, command) => command.apply(document), { project }).project;
}

function build(...commands: Command[]): Project {
  return commands.reduce((document, command) => command.apply(document), emptyDocument('test'))
    .project;
}

const pick = (...ids: string[]): Selection => selectionOf(ids);
const ids = (chain: StitchChain | null) =>
  chain === null
    ? null
    : {
        part: chain.part.id,
        outline: chain.outline?.id ?? null,
        stitch: chain.stitch?.id ?? null,
        holes: chain.holes?.id ?? null,
      };
const done = (chain: StitchChain | null) =>
  chain === null ? null : nextSteps(chain).map((step) => [step.id, step.done]);

/** A new outline, as Draw as › Outline makes one: a piece with nothing on it yet. */
const newOutline = (w = 80, h = 50) =>
  addPart(shapePart('p', 'o', 'Pocket', rectShape({ x: 0, y: 0 }, w, h)));

function feature(project: Project, id: string): Feature {
  const found = project.parts.flatMap((part) => part.features).find((f) => f.id === id);
  if (found === undefined) throw new Error(`No feature ${id}.`);
  return found;
}

describe('stitchChain', () => {
  it('reads the outer’s stitching from its outline, its stitch line, its holes, or its heading', () => {
    const project = sample();
    const outer = {
      part: 'outer',
      outline: 'outer-outline',
      stitch: 'outer-stitch',
      holes: 'outer-holes',
    };
    for (const id of ['outer-outline', 'outer-stitch', 'outer-holes']) {
      expect(ids(stitchChain(project, pick(id)))).toEqual(outer);
    }
    expect(ids(stitchChain(project, { parts: new Set(['outer']), features: new Set() }))).toEqual(
      outer,
    );
  });

  it('finds the card pocket’s stitch line, drawn rather than inset, from its outline', () => {
    expect(ids(stitchChain(sample(), pick('pocket-outline')))).toEqual({
      part: 'pocket',
      outline: 'pocket-outline',
      stitch: 'pocket-stitch',
      holes: 'pocket-holes',
    });
  });

  it('has no bar for what is not a piece’s edge or its stitching, nor for two things at once', () => {
    const project = sample();
    for (const selection of [
      pick(),
      pick('outer-fold'),
      pick('lining-slot'),
      pick('pocket-width'),
      pick('outer-outline', 'pocket-outline'),
      { parts: new Set(['outer', 'pocket']), features: new Set<string>() },
    ]) {
      expect(stitchChain(project, selection)).toBeNull();
    }
  });

  it('reads a Stitch + allowance piece from either end: the outline follows the stitch line', () => {
    const square = PathOps.polyline(
      [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 40 },
        { x: 0, y: 40 },
      ],
      true,
    );
    const project = build(addAllowancePart('p', 's', 'o', { kind: 'path', path: square }, 3));
    const chain = { part: 'p', outline: 'o', stitch: 's', holes: null };
    expect(ids(stitchChain(project, pick('s')))).toEqual(chain);
    expect(ids(stitchChain(project, pick('o')))).toEqual(chain);
    // The stitch line and the allowance are there; the holes are next.
    expect(done(stitchChain(project, pick('o')))).toEqual([
      ['stitchLine', true],
      ['holes', false],
      ['allowance', true],
    ]);
  });
});

describe('nextSteps', () => {
  it('has the outer done, and a new outline with all three to do, the stitch line first', () => {
    const project = sample();
    expect(done(stitchChain(project, pick('outer-holes')))).toEqual([
      ['stitchLine', true],
      ['holes', true],
      ['allowance', true],
    ]);
    const fresh = build(newOutline());
    expect(done(stitchChain(fresh, pick('o')))).toEqual([
      ['stitchLine', false],
      ['holes', false],
      ['allowance', false],
    ]);
  });

  it('offers the seam allowance only where the piece has no edge yet, and says why when it cannot', () => {
    // A seam drawn on its own, closed: its edge is the step left.
    const ring = PathOps.polyline(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 30 },
      ],
      true,
    );
    const project = build(
      addPart({ id: 'p', name: 'Pocket', quantity: 1, features: [] }),
      addDrawnStitchLine('p', 's', { kind: 'path', path: ring }),
    );
    const chain = stitchChain(project, pick('s'))!;
    expect(done(chain)).toEqual([
      ['stitchLine', true],
      ['holes', false],
      ['allowance', false],
    ]);
    expect(stepRefusal(project, chain, 'allowance')).toBeNull();

    // Open, it encloses nothing to cut: refused, with the panel's own reason.
    const open = build(
      addPart({ id: 'p', name: 'Pocket', quantity: 1, features: [] }),
      addDrawnStitchLine('p', 's', { kind: 'path', path: { ...ring, closed: false } }),
    );
    expect(stepRefusal(open, stitchChain(open, pick('s'))!, 'allowance')).not.toBeNull();
  });
});

describe('runStep', () => {
  it('makes the first step left with My tools’ values, selects it, and one undo takes it back', () => {
    const store = new DocumentStore({ project: build(newOutline()) });
    let n = 0;
    const nextId = () => `new-${String(++n)}`;

    const step = (): void => {
      const { project } = store.getState().document;
      const chain = stitchChain(project, store.getState().selection)!;
      const first = nextSteps(chain).find((each) => !each.done)!;
      runStep(store, nextId, chain, first.id, TOOLS);
    };

    store.select(['o']);
    step();
    const line = feature(store.getState().document.project, 'new-1');
    expect(line.kind).toBe('stitch-line');
    expect(line.source).toMatchObject({ sourceId: 'o', op: { type: 'offset', distanceMm: 4 } });
    expect([...store.getState().selection.features]).toEqual(['new-1']);

    step();
    const holes = feature(store.getState().document.project, 'new-2');
    expect(holes.source).toMatchObject({
      sourceId: 'new-1',
      op: { type: 'stitch-holes', pitchMm: 3, ironLabel: 'Crimson Hides 3.0 mm' },
    });
    const { project } = store.getState().document;
    expect(done(stitchChain(project, store.getState().selection))).toEqual([
      ['stitchLine', true],
      ['holes', true],
      ['allowance', true],
    ]);

    store.undo();
    expect(store.getState().document.project.parts[0]!.features.map((f) => f.id)).toEqual([
      'o',
      'new-1',
    ]);
  });

  it('on any new outline, each click does the first step left, and none is ever undone by the next', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 20, max: 300, noNaN: true }),
        fc.double({ min: 20, max: 300, noNaN: true }),
        (w, h) => {
          const store = new DocumentStore({ project: build(newOutline(w, h)) });
          let n = 0;
          store.select(['o']);
          for (let click = 0; click < 3; click++) {
            const { project } = store.getState().document;
            const chain = stitchChain(project, store.getState().selection)!;
            const before = nextSteps(chain);
            const first = before.find((each) => !each.done);
            if (first === undefined) break;
            runStep(store, () => `new-${String(++n)}`, chain, first.id, TOOLS);
            const after = store.getState().document.project;
            const steps = nextSteps(stitchChain(after, store.getState().selection)!);
            // The step clicked is done, and every step done before still is.
            expect(steps.find((each) => each.id === first.id)?.done).toBe(true);
            for (const was of before.filter((each) => each.done)) {
              expect(steps.find((each) => each.id === was.id)?.done).toBe(true);
            }
          }
          const { project } = store.getState().document;
          const chain = stitchChain(project, store.getState().selection)!;
          expect(nextSteps(chain).every((each) => each.done)).toBe(true);
        },
      ),
    );
  });
});
