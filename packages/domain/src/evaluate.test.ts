import { PathOps, uniformRadii } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { evaluate, evaluationErrors, resolvedFeatures } from './evaluate.js';
import type { CutContour, Feature, Part, Project } from './feature.js';
import { DEFAULT_SETTINGS, roleOf } from './feature.js';

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
