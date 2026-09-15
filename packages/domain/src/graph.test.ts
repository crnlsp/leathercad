import { PathOps, uniformRadii } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, type Feature, type Project, type Run } from './feature.js';
import { dependentsOf, derivationRefusal, followRefusal, graphProblems } from './graph.js';

// ——— Builders ————————————————————————————————————————————————————————————

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false });

const square = (closed: boolean) =>
  PathOps.polyline(
    [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 0, y: 50 },
    ],
    closed,
  );

function outline(id: string, role: 'outer' | 'inner' = 'outer'): Feature {
  return {
    ...base(id, `Outline ${id}`),
    kind: 'cut-contour',
    role,
    source: {
      kind: 'shape',
      shape: {
        type: 'rect',
        origin: { x: 0, y: 0 },
        width: 100,
        height: 60,
        radii: uniformRadii(0),
        rotation: 0,
      },
    },
  };
}

function inset(id: string, from: string, run: Run = { kind: 'whole' }): Feature {
  return {
    ...base(id, `Stitch ${id}`),
    kind: 'stitch-line',
    source: {
      kind: 'derived',
      sourceId: from,
      op: { type: 'offset', distanceMm: 3.5, side: 'inward', run },
    },
  };
}

function holes(id: string, from: string): Feature {
  return {
    ...base(id, `Holes ${id}`),
    kind: 'stitch-hole-set',
    source: {
      kind: 'derived',
      sourceId: from,
      op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'hole-at-corner' },
    },
  };
}

function drawnStitch(id: string, closed: boolean): Feature {
  return {
    ...base(id, `Seam ${id}`),
    kind: 'stitch-line',
    source: { kind: 'path', path: square(closed) },
  };
}

function allowance(id: string, from: string, run: Run = { kind: 'whole' }): Feature {
  return {
    ...base(id, `Outline ${id}`),
    kind: 'cut-contour',
    role: 'outer',
    source: {
      kind: 'derived',
      sourceId: from,
      op: { type: 'offset', distanceMm: 4, side: 'outward', run },
    },
  };
}

function fold(id: string): Feature {
  return {
    ...base(id, `Fold ${id}`),
    kind: 'fold-line',
    direction: 'valley',
    source: { kind: 'path', path: square(false) },
  };
}

function project(...parts: Feature[][]): Project {
  return {
    id: 'proj',
    name: 'Test',
    settings: DEFAULT_SETTINGS,
    parts: parts.map((features, i) => ({
      id: `part-${i}`,
      name: `Part ${i}`,
      quantity: 1,
      features,
    })),
  };
}

/** The card-holder chain: outline → stitch line → holes. */
const chain = (): Project =>
  project([outline('cut'), inset('stitch', 'cut'), holes('holes', 'stitch')]);

// ——— dependentsOf ————————————————————————————————————————————————————————

describe('dependentsOf', () => {
  it('follows the chain all the way down', () => {
    expect(dependentsOf(chain(), ['cut'])).toEqual(['stitch', 'holes']);
  });

  it('starts from where it is asked, not from the top', () => {
    expect(dependentsOf(chain(), ['stitch'])).toEqual(['holes']);
    expect(dependentsOf(chain(), ['holes'])).toEqual([]);
  });

  it('never lists a feature that was itself asked for', () => {
    // Deleting the outline and its stitch line together: only the holes are
    // collateral, and the dialog must not ask about something the user named.
    expect(dependentsOf(chain(), ['cut', 'stitch'])).toEqual(['holes']);
  });

  it('crosses parts, because a derivation may', () => {
    const p = project([outline('cut')], [inset('other-stitch', 'cut')]);
    expect(dependentsOf(p, ['cut'])).toEqual(['other-stitch']);
  });

  it('leaves unrelated features out', () => {
    const p = project([outline('cut'), inset('stitch', 'cut')], [outline('elsewhere')]);
    expect(dependentsOf(p, ['elsewhere'])).toEqual([]);
  });
});

// ——— derivationRefusal: the compatibility table ———————————————————————————

describe('derivationRefusal', () => {
  const allowed: Array<[string, Project, string]> = [
    ['a stitch line inset from an outline', chain(), 'stitch'],
    ['holes along a stitch line', chain(), 'holes'],
    [
      'a stitch line inset from a cut-out',
      project([outline('win', 'inner'), inset('s', 'win')]),
      's',
    ],
    [
      'a partial run inset from an outline',
      project([outline('cut'), inset('s', 'cut', { kind: 'between', fromAnchor: 0, toAnchor: 2 })]),
      's',
    ],
    [
      'an outline offset outward from a closed stitch line',
      project([drawnStitch('seam', true), allowance('out', 'seam')]),
      'out',
    ],
  ];

  it.each(allowed)('allows %s', (_, p, id) => {
    const feature = p.parts.flatMap((part) => part.features).find((f) => f.id === id)!;
    expect(derivationRefusal(p, feature)).toBeNull();
  });

  const refused: Array<[string, Project, string, RegExp]> = [
    ['holes along an outline', project([outline('cut'), holes('h', 'cut')]), 'h', /stitch line/i],
    [
      'a stitch line inset from a fold line',
      project([fold('f'), inset('s', 'f')]),
      's',
      /outline|cut-out/i,
    ],
    [
      'an outline offset outward from an open stitch line',
      project([drawnStitch('seam', false), allowance('out', 'seam')]),
      'out',
      /closed/i,
    ],
    [
      'an outline offset outward along part of a stitch line',
      project([
        drawnStitch('seam', true),
        allowance('out', 'seam', { kind: 'between', fromAnchor: 0, toAnchor: 1 }),
      ]),
      'out',
      /whole/i,
    ],
    [
      'a cut-out offset outward from a stitch line',
      project([
        drawnStitch('seam', true),
        { ...allowance('out', 'seam'), kind: 'cut-contour', role: 'inner' } as Feature,
      ]),
      'out',
      /outer/i,
    ],
    ['a source that does not exist', project([inset('s', 'nowhere')]), 's', /does not exist/i],
  ];

  it.each(refused)('refuses %s, saying why', (_, p, id, reason) => {
    const feature = p.parts.flatMap((part) => part.features).find((f) => f.id === id)!;
    expect(derivationRefusal(p, feature)).toMatch(reason);
  });

  it('has nothing to say about a feature that is not derived', () => {
    expect(derivationRefusal(chain(), chain().parts[0]!.features[0]!)).toBeNull();
  });
});

// ——— followRefusal: re-pointing ——————————————————————————————————————————

describe('followRefusal', () => {
  it('allows re-pointing a stitch line at another outline', () => {
    const p = project([outline('cut'), inset('stitch', 'cut')], [outline('other')]);
    expect(followRefusal(p, 'stitch', 'other')).toBeNull();
  });

  it('refuses a re-point that would close a loop, naming both', () => {
    // outline ← seam allowance ← stitch line: pointing the drawn stitch line's
    // own derived outline back at itself would loop. Built directly as an
    // inset from the allowance to make the loop reachable.
    const p = project([drawnStitch('seam', true), allowance('out', 'seam'), inset('inner', 'out')]);
    const reason = followRefusal(p, 'out', 'inner');
    expect(reason).toMatch(/Outline out/);
    expect(reason).toMatch(/Stitch inner/);
  });

  it('refuses following itself', () => {
    expect(followRefusal(chain(), 'stitch', 'stitch')).toMatch(/itself/i);
  });

  it('refuses a re-point the compatibility table does not allow', () => {
    const p = project([outline('cut'), inset('stitch', 'cut'), fold('f')]);
    expect(followRefusal(p, 'stitch', 'f')).toMatch(/outline|cut-out/i);
  });

  it('refuses re-pointing a feature that is not derived', () => {
    expect(followRefusal(chain(), 'cut', 'stitch')).toMatch(/does not follow/i);
  });
});

// ——— graphProblems: what the loader refuses ——————————————————————————————

describe('graphProblems', () => {
  it('finds nothing wrong with a sound project', () => {
    expect(graphProblems(chain())).toEqual([]);
  });

  it('names a feature following one that does not exist', () => {
    const problems = graphProblems(project([inset('s', 'gone')]));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ featureId: 's', code: 'MISSING_SOURCE' });
  });

  it('names every feature on a loop', () => {
    const p = project([
      { ...inset('a', 'b'), kind: 'stitch-line' } as Feature,
      { ...allowance('b', 'a') } as Feature,
    ]);
    const cycles = graphProblems(p).filter((problem) => problem.code === 'CYCLE');
    expect(cycles.map((c) => c.featureId).sort()).toEqual(['a', 'b']);
  });

  it('names a derivation the table does not allow', () => {
    const problems = graphProblems(project([outline('cut'), holes('h', 'cut')]));
    expect(problems).toEqual([expect.objectContaining({ featureId: 'h', code: 'INCOMPATIBLE' })]);
  });

  it('names a duplicated id', () => {
    const problems = graphProblems(project([outline('cut')], [outline('cut')]));
    expect(problems).toEqual([expect.objectContaining({ featureId: 'cut', code: 'DUPLICATE_ID' })]);
  });
});

// ——— Properties ——————————————————————————————————————————————————————————

/**
 * Random, sound card-holder projects: outlines, stitch lines inset from them,
 * and hole sets along those stitch lines, spread over several parts.
 */
const arbProject: fc.Arbitrary<Project> = fc
  .record({
    outlines: fc.integer({ min: 1, max: 4 }),
    stitches: fc.array(fc.nat(), { maxLength: 5 }),
    holeSets: fc.array(fc.nat(), { maxLength: 5 }),
  })
  .map(({ outlines, stitches, holeSets }) => {
    const parts: Feature[][] = Array.from({ length: outlines }, (_, i) => [outline(`o${i}`)]);
    const stitchIds: string[] = [];
    stitches.forEach((pick, i) => {
      const at = pick % outlines;
      parts[at]!.push(inset(`s${i}`, `o${at}`));
      stitchIds.push(`s${i}`);
    });
    holeSets.forEach((pick, i) => {
      if (stitchIds.length === 0) return;
      const line = stitchIds[pick % stitchIds.length]!;
      const part = parts.find((features) => features.some((f) => f.id === line))!;
      part.push(holes(`h${i}`, line));
    });
    return project(...parts);
  });

const allIds = (p: Project): string[] => p.parts.flatMap((part) => part.features.map((f) => f.id));

function without(p: Project, gone: ReadonlySet<string>): Project {
  return {
    ...p,
    parts: p.parts.map((part) => ({
      ...part,
      features: part.features.filter((f) => !gone.has(f.id)),
    })),
  };
}

describe('the reference graph, for any sound project', () => {
  it('is left sound by deleting a set together with its dependents', () => {
    // The guarantee "Delete them too" relies on: whatever the user names, taking
    // its dependents with it can never leave a feature following nothing.
    fc.assert(
      fc.property(arbProject, fc.nat(), (p, seed) => {
        const ids = allIds(p);
        const requested = ids.filter((_, i) => (seed >> i) & 1);
        const gone = new Set([...requested, ...dependentsOf(p, requested)]);
        return graphProblems(without(p, gone)).length === 0;
      }),
    );
  });

  it('never lists a dependent that does not actually lead back to what was named', () => {
    fc.assert(
      fc.property(arbProject, fc.nat(), (p, seed) => {
        const ids = allIds(p);
        const requested = new Set(ids.filter((_, i) => (seed >> i) & 1));
        const byId = new Map(p.parts.flatMap((part) => part.features).map((f) => [f.id, f]));

        return dependentsOf(p, requested).every((id) => {
          let at = byId.get(id);
          while (at !== undefined && at.source.kind === 'derived') {
            if (requested.has(at.source.sourceId)) return !requested.has(id);
            at = byId.get(at.source.sourceId);
          }
          return false;
        });
      }),
    );
  });

  it('stays sound under any re-point the query allows', () => {
    // The soundness of the query itself: if followRefusal says yes, applying
    // the re-point produces no graph problem. A query that let one bad edge
    // through would make the loader, not the command, the first to notice.
    fc.assert(
      fc.property(arbProject, fc.nat(), fc.nat(), (p, a, b) => {
        const ids = allIds(p);
        const featureId = ids[a % ids.length]!;
        const sourceId = ids[b % ids.length]!;
        if (followRefusal(p, featureId, sourceId) !== null) return true;

        const repointed: Project = {
          ...p,
          parts: p.parts.map((part) => ({
            ...part,
            features: part.features.map((f) =>
              f.id === featureId && f.source.kind === 'derived'
                ? { ...f, source: { ...f.source, sourceId } }
                : f,
            ),
          })),
        };
        return graphProblems(repointed).length === 0;
      }),
    );
  });
});

describe('an empty project', () => {
  it('has no dependents and nothing wrong with it', () => {
    const empty = project();
    expect(dependentsOf(empty, ['anything'])).toEqual([]);
    expect(graphProblems(empty)).toEqual([]);
  });

  it('refuses to re-point a feature that is not there', () => {
    expect(followRefusal(project(), 'missing', 'also-missing')).toMatch(/does not exist/);
  });
});

describe('the compatibility table, branch by branch', () => {
  // Each refusal is a message a user will read. Every branch is named here so
  // none of them can quietly change meaning, or stop being reachable.
  const featureIn = (p: Project, id: string): Feature =>
    p.parts.flatMap((part) => part.features).find((f) => f.id === id)!;

  it('refuses a stitch-holes derivation on anything but a hole set', () => {
    const p = project([
      outline('cut'),
      inset('s', 'cut'),
      { ...holes('h', 's'), kind: 'stitch-line' } as Feature,
    ]);
    expect(derivationRefusal(p, featureIn(p, 'h'))).toMatch(/Only a stitch hole set/);
  });

  it('refuses an inward offset on anything but a stitch line', () => {
    const p = project([
      outline('cut'),
      { ...inset('x', 'cut'), kind: 'cut-contour', role: 'inner' } as Feature,
    ]);
    expect(derivationRefusal(p, featureIn(p, 'x'))).toMatch(/Only a stitch line can be inset/);
  });

  it('refuses an outward offset on anything but an outline', () => {
    const p = project([
      drawnStitch('seam', true),
      { ...allowance('x', 'seam'), kind: 'stitch-line' } as Feature,
    ]);
    expect(derivationRefusal(p, featureIn(p, 'x'))).toMatch(
      /Only an outline can be offset outward/,
    );
  });

  it('refuses an outline offset outward from another outline', () => {
    const p = project([outline('cut'), allowance('x', 'cut')]);
    expect(derivationRefusal(p, featureIn(p, 'x'))).toMatch(/outward from a stitch line/);
  });

  it('reads closedness through a derivation: a whole inset of a closed outline is closed', () => {
    const p = project([outline('cut'), inset('s', 'cut')], [allowance('out', 's')]);
    expect(derivationRefusal(p, featureIn(p, 'out'))).toBeNull();
  });

  it('and a partial inset of it is not', () => {
    const p = project(
      [outline('cut'), inset('s', 'cut', { kind: 'between', fromAnchor: 0, toAnchor: 2 })],
      [allowance('out', 's')],
    );
    expect(derivationRefusal(p, featureIn(p, 'out'))).toMatch(/closed/);
  });
});
