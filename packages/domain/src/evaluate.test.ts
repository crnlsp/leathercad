import { RESOURCE_LIMITS, ResourceLimitError } from '@leathercad/core';
import { PathOps, uniformRadii } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { evaluate, evaluationErrors, resolvedFeatures } from './evaluate.js';
import type { CutContour, Feature, Part, Project } from './feature.js';
import { DEFAULT_SETTINGS, roleOf } from './feature.js';
import { mirrorChain, tracedOutline } from './workloads.js';

function rectFeature(id: string, width: number, height: number, radius = 0): CutContour {
  return {
    id,
    kind: 'cut-contour',
    role: 'outer',
    name: 'Outline',
    visible: true,
    locked: false,
    source: {
      kind: 'shape',
      shape: {
        type: 'rect',
        origin: { x: 0, y: 0 },
        width,
        height,
        radii: uniformRadii(radius),
        rotation: 0,
      },
    },
  };
}

function projectWith(features: Feature[]): Project {
  const part: Part = { id: 'part-1', name: 'Panel', quantity: 1, features };
  return { id: 'p', name: 'Test', settings: DEFAULT_SETTINGS, parts: [part] };
}

describe('evaluate', () => {
  it('turns stored parameters into concrete geometry', () => {
    const resolved = evaluate(projectWith([rectFeature('f1', 105, 75, 8)]));
    const [feature] = [...resolvedFeatures(resolved)];

    expect(feature).toBeDefined();
    expect(feature!.role).toBe('cut');
    // 105 x 75 with 8 mm corners: straights shortened by 2r, plus one circle.
    const expected = 2 * (105 - 16) + 2 * (75 - 16) + 2 * Math.PI * 8;
    expect(PathOps.length(feature!.path)).toBeCloseTo(expected, 6);
  });

  it('stores no geometry in the project itself', () => {
    // CLAUDE.md invariant 4. The file holds parameters; evaluation recomputes.
    const project = projectWith([rectFeature('f1', 105, 75, 8)]);
    const serialised = JSON.stringify(project);

    expect(serialised).toContain('"width":105');
    expect(serialised).not.toContain('segments');
  });

  it('is deterministic', () => {
    const project = projectWith([rectFeature('f1', 50, 40, 5)]);
    const a = [...resolvedFeatures(evaluate(project))][0]!;
    const b = [...resolvedFeatures(evaluate(project))][0]!;
    expect(PathOps.length(a.path)).toBe(PathOps.length(b.path));
  });

  it('reuses the cached path for an unchanged feature', () => {
    // Structural sharing makes an unchanged feature literally the same object
    // between revisions, so identity is a sound memoisation key.
    const feature = rectFeature('f1', 50, 40, 5);
    const first = [...resolvedFeatures(evaluate(projectWith([feature])))][0]!;
    const second = [...resolvedFeatures(evaluate(projectWith([feature])))][0]!;
    expect(second.path).toBe(first.path);
  });

  it('recomputes when the feature is replaced', () => {
    const first = [...resolvedFeatures(evaluate(projectWith([rectFeature('f1', 50, 40)])))][0]!;
    const second = [...resolvedFeatures(evaluate(projectWith([rectFeature('f1', 60, 40)])))][0]!;
    expect(PathOps.length(second.path)).not.toBe(PathOps.length(first.path));
  });

  it('reports a bad shape per feature instead of failing the project', () => {
    // A blank canvas because of one bad number is the wrong failure mode for
    // a drawing tool.
    const broken: CutContour = {
      ...rectFeature('bad', 10, 10),
      source: {
        kind: 'shape',
        shape: {
          type: 'rect',
          origin: { x: 0, y: 0 },
          width: Number.NaN,
          height: 10,
          radii: uniformRadii(0),
          rotation: 0,
        },
      },
    };

    const resolved = evaluate(projectWith([broken, rectFeature('good', 20, 20)]));

    expect(evaluationErrors(resolved)).toHaveLength(1);
    expect(evaluationErrors(resolved)[0]!.problem).toMatchObject({
      code: 'PARAMETER_INVALID',
      facts: { parameter: 'width', requirement: 'finite' },
    });
    // The healthy feature still resolves.
    expect([...resolvedFeatures(resolved)]).toHaveLength(1);
  });

  it('carries a freehand path through unchanged', () => {
    const path = PathOps.polyline(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      true,
    );
    const feature: CutContour = {
      ...rectFeature('f1', 1, 1),
      source: { kind: 'path', path },
    };
    const [resolved] = [...resolvedFeatures(evaluate(projectWith([feature])))];
    expect(resolved!.path).toBe(path);
  });

  it('handles an empty project', () => {
    const empty: Project = { id: 'p', name: '', settings: DEFAULT_SETTINGS, parts: [] };
    expect([...resolvedFeatures(evaluate(empty))]).toHaveLength(0);
    expect(evaluationErrors(evaluate(empty))).toHaveLength(0);
  });
});

describe('roleOf', () => {
  it('maps each feature kind to exactly one layer role', () => {
    const base = { id: 'x', name: '', visible: true, locked: false } as const;
    const path = { kind: 'path', path: PathOps.polyline([], false) } as const;

    expect(roleOf({ ...base, kind: 'cut-contour', role: 'outer', source: path })).toBe('cut');
    expect(roleOf({ ...base, kind: 'stitch-line', source: path })).toBe('stitch');
    expect(roleOf({ ...base, kind: 'fold-line', direction: 'mountain', source: path })).toBe(
      'fold',
    );
    expect(roleOf({ ...base, kind: 'marking-line', purpose: 'other', source: path })).toBe('mark');
  });
});

describe('a text label', () => {
  const label = (text: string, sizeMm: number, rotationRad = 0): Feature => ({
    id: 'label-1',
    kind: 'text-label',
    name: 'Label',
    visible: true,
    locked: false,
    source: { kind: 'text', text, at: { x: 10, y: 5 }, sizeMm, rotationRad },
  });

  it('resolves to laid-out words and the box they occupy', () => {
    const [entry] = evaluate(projectWith([label('Glue here', 4)])).parts[0]!.features;

    expect(entry?.ok).toBe(true);
    if (entry?.ok !== true) return;
    expect(entry.role).toBe('annotation');
    expect(entry.text?.layout.text).toBe('Glue here');
    expect(entry.path.closed).toBe(true);
  });

  it('turns the box with the words', () => {
    const upright = evaluate(projectWith([label('Glue here', 4)])).parts[0]!.features[0]!;
    const turned = evaluate(projectWith([label('Glue here', 4, Math.PI / 2)])).parts[0]!
      .features[0]!;

    if (!upright.ok || !turned.ok) throw new Error('both should resolve');
    const wide = PathOps.bbox(upright.path)!;
    const tall = PathOps.bbox(turned.path)!;

    expect(wide.maxX - wide.minX).toBeGreaterThan(wide.maxY - wide.minY);
    expect(tall.maxY - tall.minY).toBeGreaterThan(tall.maxX - tall.minX);
  });

  it('names the parameter when the size is not usable', () => {
    const errors = evaluationErrors(evaluate(projectWith([label('Glue here', 0)])));

    expect(errors[0]?.problem).toMatchObject({
      code: 'PARAMETER_INVALID',
      facts: { parameter: 'text size', requirement: 'positive', value: 0 },
    });
  });
});

describe('each source resolved once an evaluation (PERF-015)', () => {
  const at = (x: number, y: number) => ({ x, y });
  const base = (id: string) => ({ id, name: id, visible: true, locked: false });

  /** One feature of a random graph: what it is, and whom it follows. */
  interface Spec {
    readonly kind: 'outline' | 'drawn' | 'fold' | 'offset' | 'mirror' | 'folded' | 'holes';
    /** Index of what it follows, or past the end for one that is not there. */
    readonly from: number;
    readonly fold: number;
    readonly part: number;
  }

  function featureOf(spec: Spec, i: number, n: number): Feature {
    const ref = (k: number) => (k < n ? `f${k}` : `missing-${k}`);
    const id = `f${i}`;
    const square = PathOps.polyline([at(i, 0), at(i + 40, 0), at(i + 40, 30), at(i, 30)], true);
    switch (spec.kind) {
      case 'outline':
        return {
          ...base(id),
          kind: 'cut-contour',
          role: 'outer',
          source: { kind: 'path', path: square },
        };
      case 'drawn':
        return {
          ...base(id),
          kind: 'stitch-line',
          source: { kind: 'path', path: PathOps.polyline([at(i, 5), at(i + 30, 12)], false) },
        };
      case 'fold':
        return {
          ...base(id),
          kind: 'fold-line',
          direction: 'valley',
          source: { kind: 'path', path: PathOps.polyline([at(60 + i, 0), at(60 + i, 40)], false) },
        };
      case 'offset':
        return {
          ...base(id),
          kind: 'stitch-line',
          source: {
            kind: 'derived',
            sourceId: ref(spec.from),
            op: { type: 'offset', distanceMm: 3, side: 'inward', run: { kind: 'whole' } },
          },
        };
      case 'mirror':
      case 'folded':
        return {
          ...base(id),
          kind: 'stitch-line',
          source: {
            kind: 'derived',
            sourceId: ref(spec.from),
            op: {
              type: 'mirror',
              axis:
                spec.kind === 'mirror'
                  ? { kind: 'line', origin: at(100, 0), angleRad: Math.PI / 2 }
                  : { kind: 'fold', foldId: ref(spec.fold) },
              glideMm: 0,
            },
          },
        };
      case 'holes':
        return {
          ...base(id),
          kind: 'stitch-hole-set',
          source: {
            kind: 'derived',
            sourceId: ref(spec.from),
            op: { type: 'stitch-holes', pitchMm: 4, mode: 'fit-whole', corners: 'continuous' },
          },
        };
    }
  }

  /**
   * Features following any feature, before or after them, in any part, or one
   * that is not there, or themselves: chains, shared ancestry, branches through
   * a fold, and cycles.
   */
  const arbProject: fc.Arbitrary<Project> = fc
    .array(
      fc.record({
        kind: fc.constantFrom('outline', 'drawn', 'fold', 'offset', 'mirror', 'folded', 'holes'),
        from: fc.nat({ max: 14 }),
        fold: fc.nat({ max: 14 }),
        part: fc.nat({ max: 2 }),
      }),
      { minLength: 1, maxLength: 12 },
    )
    .map((specs) => {
      const features = specs.map((spec, i) => featureOf(spec, i, specs.length));
      const parts: Part[] = [0, 1, 2].map((k) => ({
        id: `part-${k}`,
        name: `Part ${k}`,
        quantity: 1,
        features: features.filter((_, i) => specs[i]!.part === k),
      }));
      return { id: 'p', name: 'Graph', settings: DEFAULT_SETTINGS, parts };
    });

  /** Each feature's resolved entry, by id. */
  const byId = (project: Project) =>
    new Map([...resolvedOrNot(evaluate(project))].map((entry) => [entry.feature.id, entry]));
  const resolvedOrNot = (resolved: ReturnType<typeof evaluate>) =>
    resolved.parts.flatMap((part) => part.features);

  /** What a feature follows or reads, all the way up. */
  function closureOf(project: Project, id: string): Set<string> {
    const all = new Map(project.parts.flatMap((part) => part.features).map((f) => [f.id, f]));
    const found = new Set<string>();
    const frontier = [id];
    while (frontier.length > 0) {
      const at = frontier.pop()!;
      const feature = all.get(at);
      if (feature === undefined || found.has(at)) continue;
      found.add(at);
      if (feature.source.kind === 'derived') {
        frontier.push(feature.source.sourceId);
        const op = feature.source.op;
        if (op.type === 'mirror' && op.axis.kind === 'fold') frontier.push(op.axis.foldId);
      }
    }
    return found;
  }

  it('resolves each feature as a copy sharing no object, alone, and in reverse order do', () => {
    fc.assert(
      fc.property(arbProject, (project) => {
        const whole = byId(project);
        const copied = byId(structuredClone(project));
        const reversed = byId({
          ...project,
          parts: project.parts.map((part) => ({ ...part, features: [...part.features].reverse() })),
        });
        for (const [id, entry] of whole) {
          const keep = closureOf(project, id);
          const alone = byId({
            ...project,
            parts: project.parts.map((part) => ({
              ...part,
              features: part.features.filter((f) => keep.has(f.id)),
            })),
          });
          expect(copied.get(id)).toEqual(entry);
          expect(alone.get(id)).toEqual(entry);
          expect(reversed.get(id)).toEqual(entry);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('walks a chain of five hundred sources once, not once for each feature down it', () => {
    // A work bound, not a timing: the guard against each feature's evaluation
    // walking every source above it again. The audit's deepest mirror chain,
    // a stitch line mirrored and mirrored back 500 times; every read of a
    // feature's source counts, the second time it is evaluated, when every
    // feature is the same object and nothing need be built. Walking the chain
    // for each feature read the sources 630,261 times; once is about two
    // reads a feature. The bound, ten a feature, is an eightieth of that.
    const reads = { count: 0 };
    const chain = counted(mirrorChain(500), reads);
    evaluate(chain);
    reads.count = 0;

    evaluate({ ...chain, parts: chain.parts.map((part) => ({ ...part, name: 'Renamed' })) });

    expect(reads.count).toBeLessThan(10 * 502);
  });
});

/** The project with each feature counting the reads of its `source`. */
function counted(project: Project, reads: { count: number }): Project {
  return {
    ...project,
    parts: project.parts.map((part) => ({
      ...part,
      features: part.features.map(
        (feature) =>
          new Proxy(feature, {
            get(target, key, receiver) {
              if (key === 'source') reads.count++;
              return Reflect.get(target, key, receiver) as unknown;
            },
          }),
      ),
    })),
  };
}

describe('evaluation work limits (PERF-012)', () => {
  function holeFeatures(count: number): Feature[] {
    return [
      {
        id: 'line',
        kind: 'stitch-line',
        name: 'Line',
        visible: true,
        locked: false,
        source: {
          kind: 'path',
          path: PathOps.polyline([
            { x: 0, y: 0 },
            { x: 50_000, y: 0 },
          ]),
        },
      },
      ...Array.from({ length: count }, (_, i): Feature => ({
        id: `holes-${i}`,
        kind: 'stitch-hole-set',
        name: `Holes ${i}`,
        visible: true,
        locked: false,
        source: {
          kind: 'derived',
          sourceId: 'line',
          op: {
            type: 'stitch-holes',
            pitchMm: 0.5,
            mode: 'fit-whole',
            corners: 'continuous',
          },
        },
      })),
    ];
  }

  it('counts cached hole sets too, refusing the whole evaluation rather than dropping holes', () => {
    const features = holeFeatures(3);
    // Each fits on its own. The full request does not, even when every entry is cached.
    for (const hole of features.slice(1)) evaluate(projectWith([features[0]!, hole]));
    expect(() => evaluate(projectWith(features))).toThrowError(ResourceLimitError);
  });

  it('refuses excessive stored segments before building anchors or derived paths', () => {
    const path = PathOps.polyline([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const feature: Feature = {
      id: 'many',
      name: 'Many',
      kind: 'marking-line',
      purpose: 'alignment',
      visible: true,
      locked: false,
      source: {
        kind: 'path',
        path: {
          closed: false,
          segments: Array.from({ length: RESOURCE_LIMITS.segments + 1 }, () => path.segments[0]!),
        },
      },
    };
    expect(() => evaluate(projectWith([feature]))).toThrowError(ResourceLimitError);
  });
});

it('bounds features in aggregate before indexing them (PERF-012)', () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 50 }), (extra) => {
      const feature = rectFeature('f', 50, 40);
      const project = projectWith(
        Array.from({ length: RESOURCE_LIMITS.features + extra }, () => feature),
      );
      expect(() => evaluate(project)).toThrowError(ResourceLimitError);
    }),
  );
});

it('still evaluates forty 500-point traced parts whole (PERF-012)', () => {
  const base = tracedOutline(500);
  const project: Project = {
    ...base,
    parts: Array.from({ length: 40 }, (_, i): Part => ({
      ...base.parts[0]!,
      id: `part-${i}`,
      features: base.parts[0]!.features.map((feature): Feature => {
        const id = `${i}-${feature.id}`;
        if (feature.kind === 'measurement' || feature.kind === 'text-label')
          return { ...feature, id };
        return {
          ...feature,
          id,
          source:
            feature.source.kind === 'derived'
              ? { ...feature.source, sourceId: `${i}-${feature.source.sourceId}` }
              : feature.source,
        };
      }),
    })),
  };
  const resolved = evaluate(project);
  expect(evaluationErrors(resolved)).toEqual([]);
  const holes = [...resolvedFeatures(resolved)].reduce(
    (sum, feature) => sum + (feature.holes?.count ?? 0),
    0,
  );
  expect(holes).toBeGreaterThan(18_000);
  expect(resolved.parts).toHaveLength(40);
});
