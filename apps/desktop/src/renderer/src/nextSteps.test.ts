import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DocumentStore,
  addAllowancePart,
  addDrawnStitchLine,
  addFoldLine,
  addPart,
  addStitchHoles,
  addStitchLine,
  mirrorAcrossFold,
  mirrorAxisFor,
  mirrorFeatures,
  setFeatureVisible,
  emptyDocument,
  rectShape,
  selectionOf,
  shapePart,
  type Command,
  type Selection,
} from '@leathercad/document';
import { diagnose, type Feature, type Project } from '@leathercad/domain';
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
const done = (project: Project, chain: StitchChain | null) =>
  chain === null
    ? null
    : nextSteps(project, chain).map((step) => [step.id, step.status === 'done']);

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
    expect(done(project, stitchChain(project, pick('o')))).toEqual([
      ['stitchLine', true],
      ['holes', false],
      ['allowance', true],
    ]);
  });
});

describe('nextSteps', () => {
  it('has the outer done, and a new outline with all three to do, the stitch line first', () => {
    const project = sample();
    expect(done(project, stitchChain(project, pick('outer-holes')))).toEqual([
      ['stitchLine', true],
      ['holes', true],
      ['allowance', true],
    ]);
    const fresh = build(newOutline());
    expect(done(fresh, stitchChain(fresh, pick('o')))).toEqual([
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
    expect(done(project, chain)).toEqual([
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
      const first = nextSteps(project, chain).find((each) => each.status !== 'done')!;
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
    expect(done(project, stitchChain(project, store.getState().selection))).toEqual([
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
            const before = nextSteps(project, chain);
            const first = before.find((each) => each.status !== 'done');
            if (first === undefined) break;
            runStep(store, () => `new-${String(++n)}`, chain, first.id, TOOLS);
            const after = store.getState().document.project;
            const steps = nextSteps(after, stitchChain(after, store.getState().selection)!);
            // The step clicked is done, and every step done before still is.
            expect(steps.find((each) => each.id === first.id)?.status).toBe('done');
            for (const was of before.filter((each) => each.status === 'done')) {
              expect(steps.find((each) => each.id === was.id)?.status).toBe('done');
            }
          }
          const { project } = store.getState().document;
          const chain = stitchChain(project, store.getState().selection)!;
          expect(nextSteps(project, chain).every((each) => each.status === 'done')).toBe(true);
        },
      ),
    );
  });
});

/** A pocket stitched and punched: outline `o`, stitch line `s` 4 mm in, holes `h`. */
const stitched = (w = 80, h = 50): Command[] => [
  newOutline(w, h),
  addStitchLine('p', 's', 'o', 4),
  addStitchHoles('p', 'h', 's'),
];

describe('a counterpart reads as its original (review of U.17)', () => {
  // Found on review: a piece made by Mirror is derived from the original's
  // features, in the original's part, so its stitch line follows the
  // original's outline, not its own. It read "No stitching yet", and one click
  // made a second stitch line over the mirrored one — duplicate holes on paper.
  const mirrored = (...extra: Command[]): Project => {
    const before = build(...stitched(), ...extra);
    const axis = mirrorAxisFor(before, ['o', 's', 'h'], 'horizontal')!;
    return build(
      ...stitched(),
      ...extra,
      mirrorFeatures(['o', 's', 'h'], ['mo', 'ms', 'mh'], axis, ['p2']),
    );
  };

  it('finds a mirrored piece’s own stitch line and holes, from any of them or its heading', () => {
    const project = mirrored();
    const chain = { part: 'p2', outline: 'mo', stitch: 'ms', holes: 'mh' };
    for (const id of ['mo', 'ms', 'mh']) {
      expect(ids(stitchChain(project, pick(id)))).toEqual(chain);
      expect(done(project, stitchChain(project, pick(id)))).toEqual([
        ['stitchLine', true],
        ['holes', true],
        ['allowance', true],
      ]);
    }
    expect(ids(stitchChain(project, { parts: new Set(['p2']), features: new Set() }))).toEqual(
      chain,
    );
  });

  it('still offers a stitch line on a piece whose outline alone was mirrored', () => {
    const before = build(...stitched());
    const axis = mirrorAxisFor(before, ['o'], 'vertical')!;
    const project = build(...stitched(), mirrorFeatures(['o'], ['mo'], axis, ['p2']));
    expect(ids(stitchChain(project, pick('mo')))).toEqual({
      part: 'p2',
      outline: 'mo',
      stitch: null,
      holes: null,
    });
  });

  it('takes a stitch line mirrored across a fold with its own mirrored holes, never the original’s', () => {
    const fold = addFoldLine('p', 'f', {
      kind: 'path',
      path: PathOps.polyline(
        [
          { x: 40, y: -10 },
          { x: 40, y: 60 },
        ],
        false,
      ),
    });
    // A seam on one half, drawn, and its holes; mirrored to the other half.
    const seam = addDrawnStitchLine('p', 'd', {
      kind: 'path',
      path: PathOps.polyline(
        [
          { x: 10, y: 10 },
          { x: 30, y: 10 },
        ],
        false,
      ),
    });
    const base = [newOutline(), fold, seam, addStitchHoles('p', 'dh', 'd')];
    const both = build(...base, mirrorAcrossFold(['d', 'dh'], ['fd', 'fdh'], 'f'));
    expect(feature(both, 'fd').source).toMatchObject({ kind: 'derived', sourceId: 'd' });
    expect(ids(stitchChain(both, pick('fd')))?.holes).toBe('fdh');
    expect(ids(stitchChain(both, pick('fdh')))?.stitch).toBe('fd');

    // The line alone mirrored: its holes are still to make, not the original's.
    const line = build(...base, mirrorAcrossFold(['d'], ['fd'], 'f'));
    expect(ids(stitchChain(line, pick('fd')))?.holes).toBeNull();
  });

  it('reads every mirrored piece as its original reads, whatever it carries', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 30, max: 200, noNaN: true }),
        fc.double({ min: 30, max: 200, noNaN: true }),
        fc.integer({ min: 1, max: 3 }),
        fc.constantFrom('horizontal' as const, 'vertical' as const),
        (w, h, depth, direction) => {
          const commands = stitched(w, h).slice(0, depth);
          const which = ['o', 's', 'h'].slice(0, depth);
          const before = build(...commands);
          const axis = mirrorAxisFor(before, which, direction)!;
          const made = which.map((id) => `m${id}`);
          const project = build(...commands, mirrorFeatures(which, made, axis, ['p2']));
          for (const [original, counterpart] of which.map((id, i) => [id, made[i]!])) {
            expect(done(project, stitchChain(project, pick(counterpart!)))).toEqual(
              done(project, stitchChain(project, pick(original!))),
            );
          }
        },
      ),
    );
  });
});

describe('a step that failed or is hidden is not done (review of U.17)', () => {
  it('says a stitch line that could not be made failed, with Problems’ own problem, and offers nothing after it', () => {
    // 6 mm in from a 10 mm square leaves no line.
    const project = build(newOutline(10, 10), addStitchLine('p', 's', 'o', 6));
    const steps = nextSteps(project, stitchChain(project, pick('o'))!);
    const [line] = steps;
    expect(line).toMatchObject({ id: 'stitchLine', status: 'failed' });
    const reported = diagnose(project).find((d) => d.featureId === 's');
    expect(line!.status === 'failed' && line!.problem).toEqual(reported?.problem);
  });

  it('counts a hidden hole set as the board’s caption does: not as holes made', () => {
    const project = build(...stitched(), setFeatureVisible(['h'], false));
    expect(nextSteps(project, stitchChain(project, pick('o'))!)).toEqual([
      { id: 'stitchLine', status: 'done' },
      { id: 'holes', status: 'hidden' },
      { id: 'allowance', status: 'done' },
    ]);
  });
});
