import { approxEq, EPS_POINT, QUANTUM_MM, quantise } from '@leathercad/core';
import {
  evaluate,
  graphProblems,
  partStructureProblems,
  seamStructureProblems,
  type Feature,
  type FeatureId,
  type Part,
  type PartId,
  type Project,
  type SeamId,
} from '@leathercad/domain';
import { PathOps, RectOps, type Rect, type Vec2 } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  addCutOut,
  addFoldLine,
  addOverallSize,
  addPart,
  addStitchHoles,
  addStitchLine,
  circleShape,
  emptyDocument,
  mirrorAcrossFold,
  mirrorAxisFor,
  mirrorFeatures,
  rectShape,
  rectanglePart,
  setFeatureLocked,
  setFeatureVisible,
  setPartQuantity,
  translateFeatures,
} from './commands.js';
import type { Command, Document } from './document.js';
import { copyPieces, pastePieces, type CopiedPieces, type PasteIds } from './pieces.js';
import { addSeam } from './seams.js';
import { DocumentStore } from './store.js';

/**
 * How near the point a paste centres the copy: within half a quantum, since it
 * moves by whole quanta, and float noise in the box measured to check it.
 */
const HALF_QUANTUM = QUANTUM_MM / 2 + EPS_POINT;

const apply = (document: Document, ...commands: Command[]): Document =>
  commands.reduce((d, c) => c.apply(d), document);

const fid = (id: string) => id as FeatureId;
const pid = (id: string) => id as PartId;

/** A panel: its outline, the stitch line 3.5 mm in, and holes along it. */
function panel(document: Document, partId: string, x: number, stitched = true): Document {
  const cut = fid(`${partId}-cut`);
  const next = addPart(
    rectanglePart(pid(partId), cut, partId, rectShape({ x, y: 0 }, 80, 50)),
  ).apply(document);
  if (!stitched) return next;
  return apply(
    next,
    addStitchLine(pid(partId), fid(`${partId}-stitch`), cut),
    addStitchHoles(pid(partId), fid(`${partId}-holes`), fid(`${partId}-stitch`)),
  );
}

/** Fresh ids for everything a copy holds, prefixed so none can be the source's. */
function freshIds(pieces: CopiedPieces, prefix = 'new'): PasteIds {
  return {
    parts: pieces.parts.map((_, i) => pid(`${prefix}-part-${i}`)),
    features: pieces.parts.flatMap((p) => p.features).map((_, i) => fid(`${prefix}-f-${i}`)),
    seams: pieces.seams.map((_, i) => `${prefix}-seam-${i}` as SeamId),
  };
}

const allFeatures = (project: Project): Feature[] => project.parts.flatMap((p) => p.features);
const allIds = (project: Project): Set<string> =>
  new Set([
    ...project.parts.map((p) => p.id),
    ...allFeatures(project).map((f) => f.id),
    ...(project.seams ?? []).map((s) => s.id),
  ]);

/** Every id a feature points at. */
function referencesOf(feature: Feature): string[] {
  if (feature.source.kind === 'measurement') {
    return [feature.source.a.featureId, feature.source.b.featureId];
  }
  if (feature.source.kind !== 'derived') return [];
  const op = feature.source.op;
  return op.type === 'mirror' && op.axis.kind === 'fold'
    ? [feature.source.sourceId, op.axis.foldId]
    : [feature.source.sourceId];
}

/** The evaluated box of some parts, for where a paste lands. */
function boxOf(project: Project, partIds: readonly string[]): Rect | null {
  return RectOps.unionAll(
    evaluate(project)
      .parts.filter((entry) => partIds.includes(entry.part.id))
      .flatMap((entry) => entry.features)
      .flatMap((entry) => (entry.ok ? [PathOps.bbox(entry.path)] : []))
      .filter((box) => box !== null),
  );
}

/**
 * Two evaluations agree: every number within EPS_POINT, everything else equal.
 *
 * A hole's tangent is compared as a line, up to its sign. A mirrored hole set
 * evaluates its holes' points reflected and their tangents as the original's
 * (`evaluate.ts`), while a copy's holes placed along the copy's own frozen line
 * carry that line's tangents: the same holes, in the same order, the tangent
 * reversed along a reflected edge. Only the line of a tangent is read here.
 */
function expectClose(actual: unknown, expected: unknown, at = ''): void {
  if (at.endsWith('.tangent')) {
    const [a, e] = [actual as Vec2, expected as Vec2];
    expect(
      approxEq(Math.abs(a.x * e.x + a.y * e.y), 1, EPS_POINT),
      `${at}: not along ${JSON.stringify(e)}`,
    ).toBe(true);
    return;
  }
  if (typeof expected === 'number') {
    expect(typeof actual, at).toBe('number');
    expect(
      approxEq(actual as number, expected, EPS_POINT),
      `${at}: ${String(actual)} vs ${String(expected)}`,
    ).toBe(true);
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), at).toBe(true);
    expect((actual as unknown[]).length, at).toBe(expected.length);
    expected.forEach((e, i) => expectClose((actual as unknown[])[i], e, `${at}[${String(i)}]`));
    return;
  }
  if (typeof expected === 'object' && expected !== null) {
    expect(typeof actual, at).toBe('object');
    expect(Object.keys(actual as object).sort(), at).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) {
      expectClose((actual as Record<string, unknown>)[key], value, `${at}.${key}`);
    }
    return;
  }
  expect(actual, at).toBe(expected);
}

/** What a feature evaluates to, without the feature itself or its notes (which name ids). */
function geometryOf(project: Project): Map<string, unknown> {
  return new Map<string, unknown>(
    evaluate(project)
      .parts.flatMap((entry) => entry.features)
      .map((entry) => {
        if (!entry.ok) return [entry.feature.id, { ok: false }] as const;
        const { feature: _feature, notes: _notes, ...geometry } = entry;
        return [entry.feature.id, geometry] as const;
      }),
  );
}

describe('copyPieces and pastePieces', () => {
  it('pastes a piece into another project with new ids, its stitching following its own outline', () => {
    const source = panel(emptyDocument('source'), 'pocket', 0);
    const { pieces } = copyPieces(source.project, [pid('pocket')]);
    const target = emptyDocument('target');

    const next = pastePieces(pieces, freshIds(pieces), null).apply(target);

    const [part] = next.project.parts;
    expect(part?.id).toBe('new-part-0');
    expect(part?.features.map((f) => f.id)).toEqual(['new-f-0', 'new-f-1', 'new-f-2']);
    expect(part?.features.map(referencesOf)).toEqual([[], ['new-f-0'], ['new-f-1']]);
  });

  it('places the copy with its centre under the point it is pasted at', () => {
    const source = panel(emptyDocument('source'), 'pocket', 0);
    const { pieces } = copyPieces(source.project, [pid('pocket')]);

    const next = pastePieces(pieces, freshIds(pieces), { x: 300, y: -40 }).apply(
      emptyDocument('target'),
    );

    const box = boxOf(next.project, ['new-part-0'])!;
    expect(approxEq((box.minX + box.maxX) / 2, 300, HALF_QUANTUM)).toBe(true);
    expect(approxEq((box.minY + box.maxY) / 2, -40, HALF_QUANTUM)).toBe(true);
  });

  it('with no point, places the copy clear of everything, as Duplicate does', () => {
    const source = panel(emptyDocument('source'), 'pocket', 0);
    const { pieces } = copyPieces(source.project, [pid('pocket')]);

    const next = pastePieces(pieces, freshIds(pieces), null).apply(source);

    const original = boxOf(next.project, ['pocket'])!;
    const copy = boxOf(next.project, ['new-part-0'])!;
    expect(approxEq(copy.minX, original.maxX + 5)).toBe(true);
    expect(approxEq(copy.minY, original.minY)).toBe(true);
  });

  it('leaves the pieces already in the project exactly as they were', () => {
    const source = panel(emptyDocument('source'), 'pocket', 0);
    const target = panel(emptyDocument('target'), 'outer', 0);
    const { pieces } = copyPieces(source.project, [pid('pocket')]);

    const next = pastePieces(pieces, freshIds(pieces), null).apply(target);

    // The same objects, so evaluation re-reads none of them.
    next.project.parts[0]!.features.forEach((feature, i) => {
      expect(feature).toBe(target.project.parts[0]!.features[i]);
    });
  });

  it('keeps quantity, locks and hidden features, and still places a locked piece', () => {
    let source = panel(emptyDocument('source'), 'pocket', 0);
    source = apply(
      source,
      setPartQuantity(pid('pocket'), 2),
      setFeatureLocked([fid('pocket-cut')], true),
      setFeatureVisible([fid('pocket-holes')], false),
    );
    const { pieces } = copyPieces(source.project, [pid('pocket')]);

    const next = pastePieces(pieces, freshIds(pieces), { x: 500, y: 0 }).apply(
      emptyDocument('target'),
    );

    const [part] = next.project.parts;
    expect(part?.quantity).toBe(2);
    expect(part?.features.map((f) => [f.locked, f.visible])).toEqual([
      [true, true],
      [false, true],
      [false, false],
    ]);
    const box = boxOf(next.project, ['new-part-0'])!;
    expect(approxEq((box.minX + box.maxX) / 2, 500, HALF_QUANTUM)).toBe(true);
  });

  it('keeps fields a newer version wrote, on the part and on its features', () => {
    const source = panel(emptyDocument('source'), 'pocket', 0);
    const project: Project = {
      ...source.project,
      parts: source.project.parts.map((part) => ({
        ...part,
        future: 1,
        features: part.features.map((f) => ({ ...f, future: 2 })),
      })) as Part[],
    };
    const { pieces } = copyPieces(project, [pid('pocket')]);

    const next = pastePieces(pieces, freshIds(pieces), null).apply(emptyDocument('target'));

    const [part] = next.project.parts as unknown as {
      future: number;
      features: { future: number }[];
    }[];
    expect(part?.future).toBe(1);
    expect(part?.features.every((f) => f.future === 2)).toBe(true);
  });

  it('is one undo step, and undoing it leaves the project as it was', () => {
    const source = panel(emptyDocument('source'), 'pocket', 0);
    const { pieces } = copyPieces(source.project, [pid('pocket')]);
    const store = new DocumentStore(emptyDocument('target'));
    const before = store.getState().document;

    store.dispatch(pastePieces(pieces, freshIds(pieces), null));
    expect(store.getState().document.project.parts).toHaveLength(1);
    store.undo();

    expect(store.getState().document).toBe(before);
  });

  it('says what it pasted, by count, for Undo', () => {
    const source = panel(panel(emptyDocument('source'), 'a', 0), 'b', 100);
    const { pieces } = copyPieces(source.project, [pid('a'), pid('b')]);

    expect(pastePieces(pieces, freshIds(pieces), null).label).toEqual({
      action: 'paste',
      count: 2,
    });
  });

  it('refuses, changing nothing, when given too few ids', () => {
    const source = panel(emptyDocument('source'), 'pocket', 0);
    const { pieces } = copyPieces(source.project, [pid('pocket')]);
    const target = emptyDocument('target');
    const ids = freshIds(pieces);

    expect(
      pastePieces(pieces, { ...ids, features: ids.features.slice(1) }, null).apply(target),
    ).toBe(target);
    expect(pastePieces(pieces, { ...ids, parts: [] }, null).apply(target)).toBe(target);
  });

  it('refuses, changing nothing, to paste a copy of no pieces', () => {
    const target = emptyDocument('target');
    const { pieces } = copyPieces(target.project, []);

    expect(pastePieces(pieces, freshIds(pieces), { x: 1, y: 1 }).apply(target)).toBe(target);
  });

  it('pastes a piece that draws nothing where it was, having nothing to centre', () => {
    const source = addPart({ id: pid('empty'), name: 'Spare', quantity: 1, features: [] }).apply(
      emptyDocument('source'),
    );
    const { pieces } = copyPieces(source.project, [pid('empty')]);

    const next = pastePieces(pieces, freshIds(pieces), { x: 10, y: 10 }).apply(emptyDocument('t'));

    expect(next.project.parts).toEqual([
      { id: 'new-part-0', name: 'Spare', quantity: 1, features: [] },
    ]);
  });

  it('refuses a point that is not a number, naming it', () => {
    const { pieces } = copyPieces(panel(emptyDocument('s'), 'p', 0).project, [pid('p')]);

    expect(() => pastePieces(pieces, freshIds(pieces), { x: Number.NaN, y: 0 })).toThrow(
      RangeError,
    );
  });

  it('copies pieces in document order, whatever order they were asked for in', () => {
    const source = panel(panel(emptyDocument('source'), 'a', 0), 'b', 100);

    const { pieces } = copyPieces(source.project, [pid('b'), pid('a'), pid('nobody')]);

    expect(pieces.parts.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('copies a mirrored piece without its original as drawn geometry, its holes on its own stitching', () => {
    // The maker's left side, pasted without the right it mirrors: it keeps its
    // shape, and nothing in it names the piece left behind.
    let source = panel(emptyDocument('source'), 'right', 0);
    const ids = allFeatures(source.project).map((f) => f.id);
    const axis = mirrorAxisFor(source.project, ids, 'horizontal')!;
    source = mirrorFeatures(
      ids,
      ids.map((id) => fid(`${id}-m`)),
      axis,
      [pid('left')],
    ).apply(source);

    const copy = copyPieces(source.project, [pid('left')]);

    expect(copy.frozen.map((f) => f.featureName)).toEqual([
      'Outline mirrored',
      'Stitch line mirrored',
    ]);
    expect(copy.dropped).toEqual([]);
    const [outline, stitch, holes] = copy.pieces.parts[0]!.features;
    expect(outline?.source.kind).toBe('path');
    expect(outline?.frozenFrom).toBe('Outline');
    expect(stitch?.source.kind).toBe('path');
    // Holes have no drawn form: they follow the copy's own stitch line, made
    // the way the original's were.
    expect(holes?.source).toMatchObject({
      kind: 'derived',
      sourceId: stitch?.id,
      op: { type: 'stitch-holes' },
    });
    expectClose(
      geometryOf({ ...source.project, parts: copy.pieces.parts }).get(holes!.id),
      geometryOf(source.project).get(holes!.id),
    );
  });

  it('drops a dimension to another piece, and names it', () => {
    const source = panel(panel(emptyDocument('source'), 'a', 0, false), 'b', 100, false);
    const across: Feature = {
      id: fid('dim'),
      kind: 'measurement',
      name: 'Gap',
      visible: true,
      locked: false,
      source: {
        kind: 'measurement',
        measure: 'horizontal',
        a: { kind: 'extent', featureId: fid('a-cut'), x: 'max', y: 'min' },
        b: { kind: 'extent', featureId: fid('b-cut'), x: 'min', y: 'min' },
        offsetMm: 8,
        precision: 1,
      },
    };
    // A file from before the rule that a dimension stays in its piece (Q11).
    const project: Project = {
      ...source.project,
      parts: source.project.parts.map((p) =>
        p.id === 'a' ? { ...p, features: [...p.features, across] } : p,
      ),
    };

    const copy = copyPieces(project, [pid('a')]);

    expect(copy.pieces.parts[0]?.features.map((f) => f.id)).toEqual(['a-cut']);
    expect(copy.dropped).toEqual([{ featureName: 'Gap', partName: 'a' }]);
  });

  it('carries a seam when both its pieces come, and leaves one out that would sew to a piece left behind', () => {
    let source = panel(panel(panel(emptyDocument('source'), 'a', 0), 'b', 100), 'c', 200);
    const whole = { kind: 'whole' } as const;
    source = apply(
      source,
      addSeam({
        id: 'ab' as SeamId,
        a: { holeSetId: fid('a-holes'), stretch: whole },
        b: { holeSetId: fid('b-holes'), stretch: whole },
      }),
      addSeam({
        id: 'bc' as SeamId,
        a: { holeSetId: fid('b-holes'), stretch: whole },
        b: { holeSetId: fid('c-holes'), stretch: whole },
      }),
    );
    expect(source.project.seams).toHaveLength(2);

    const { pieces } = copyPieces(source.project, [pid('a'), pid('b')]);
    const next = pastePieces(pieces, freshIds(pieces), null).apply(emptyDocument('target'));

    expect(next.project.seams).toEqual([
      {
        id: 'new-seam-0',
        a: { holeSetId: 'new-f-2', stretch: whole },
        b: { holeSetId: 'new-f-5', stretch: whole },
      },
    ]);
  });

  it('moves a mirrored pair pasted together as one, rather than sliding its halves apart', () => {
    // A slot and its mirror, in one piece, about a captured line: the line
    // must travel with the paste, or the mirror lands across the old line.
    let source = panel(emptyDocument('source'), 'p', 0, false);
    source = addCutOut(pid('p'), fid('slot'), {
      kind: 'shape',
      shape: circleShape({ x: 20, y: 25 }, 3),
    }).apply(source);
    source = mirrorFeatures([fid('slot')], [fid('slot-m')], {
      origin: { x: 40, y: 0 },
      angleRad: Math.PI / 2,
    }).apply(source);
    const { pieces } = copyPieces(source.project, [pid('p')]);

    const next = pastePieces(pieces, freshIds(pieces), null).apply(source);

    const mirrored = evaluate(next.project).parts[1]!.features[2]!;
    expect(mirrored.ok && PathOps.bbox(mirrored.path)).toMatchObject({ minX: 142, maxX: 148 });
  });

  it('pastes a piece folded about its own fold, still folded about the copy of it', () => {
    let source = panel(emptyDocument('source'), 'p', 0, false);
    source = apply(
      source,
      addFoldLine(pid('p'), fid('fold'), {
        kind: 'path',
        path: PathOps.polyline(
          [
            { x: 40, y: 0 },
            { x: 40, y: 50 },
          ],
          false,
        ),
      }),
      addCutOut(pid('p'), fid('slot'), { kind: 'shape', shape: circleShape({ x: 20, y: 25 }, 3) }),
      mirrorAcrossFold([fid('slot')], [fid('slot-m')], fid('fold')),
    );
    const { pieces } = copyPieces(source.project, [pid('p')]);

    const next = pastePieces(pieces, freshIds(pieces), null).apply(emptyDocument('target'));

    expect(next.project.parts[0]?.features.map(referencesOf)).toEqual([
      [],
      [],
      [],
      ['new-f-2', 'new-f-1'],
    ]);
  });
});

/**
 * A project the commands could have built: a few panels, some stitched, with
 * the references a piece can make — a mirrored piece, a mirrored slot about a
 * captured line, a fold and its mirror, an overall size, a seam.
 */
const projects = fc
  .record({
    panels: fc.array(
      fc.record({
        w: fc.integer({ min: 20, max: 120 }),
        h: fc.integer({ min: 20, max: 90 }),
        stitched: fc.boolean(),
      }),
      { minLength: 1, maxLength: 3 },
    ),
    mirrorPiece: fc.boolean(),
    slotMirror: fc.boolean(),
    foldMirror: fc.boolean(),
    overallSize: fc.boolean(),
    seam: fc.boolean(),
  })
  .map((spec): Project => {
    let document = emptyDocument('source');
    let x = 0;
    spec.panels.forEach((p, i) => {
      const part = pid(`p${String(i)}`);
      const cut = fid(`p${String(i)}-cut`);
      document = addPart(
        rectanglePart(part, cut, `Panel ${String(i)}`, rectShape({ x, y: 0 }, p.w, p.h)),
      ).apply(document);
      if (p.stitched) {
        document = apply(
          document,
          addStitchLine(part, fid(`p${String(i)}-stitch`), cut),
          addStitchHoles(part, fid(`p${String(i)}-holes`), fid(`p${String(i)}-stitch`)),
        );
      }
      x += p.w + 10;
    });
    const first = spec.panels[0]!;
    if (spec.slotMirror) {
      document = addCutOut(pid('p0'), fid('slot'), {
        kind: 'shape',
        shape: circleShape({ x: first.w / 4, y: first.h / 2 }, 2),
      }).apply(document);
      document = mirrorFeatures([fid('slot')], [fid('slot-m')], {
        origin: { x: first.w / 2, y: 0 },
        angleRad: Math.PI / 2,
      }).apply(document);
    }
    if (spec.foldMirror) {
      document = apply(
        document,
        addFoldLine(pid('p0'), fid('fold'), {
          kind: 'path',
          path: PathOps.polyline(
            [
              { x: first.w / 2, y: 0 },
              { x: first.w / 2, y: first.h },
            ],
            false,
          ),
        }),
        addCutOut(pid('p0'), fid('hole'), {
          kind: 'shape',
          shape: circleShape({ x: first.w / 5, y: first.h / 3 }, 1.5),
        }),
        mirrorAcrossFold([fid('hole')], [fid('hole-m')], fid('fold')),
      );
    }
    if (spec.overallSize)
      document = addOverallSize(fid('p0-cut'), fid('w'), fid('h')).apply(document);
    if (spec.mirrorPiece) {
      const ids = document.project.parts[0]!.features.filter((f) => f.kind !== 'measurement').map(
        (f) => f.id,
      );
      const axis = mirrorAxisFor(document.project, ids, 'vertical');
      if (axis !== null) {
        document = mirrorFeatures(
          ids,
          ids.map((id) => fid(`${id}-pm`)),
          axis,
          [pid('mirrored')],
        ).apply(document);
      }
    }
    const stitched = document.project.parts
      .flatMap((p) => p.features)
      .filter((f) => f.kind === 'stitch-hole-set');
    if (spec.seam && stitched.length >= 2) {
      const whole = { kind: 'whole' } as const;
      document = addSeam({
        id: 'seam' as SeamId,
        a: { holeSetId: stitched[0]!.id, stretch: whole },
        b: { holeSetId: stitched[1]!.id, stretch: whole },
      }).apply(document);
    }
    return document.project;
  });

const anywhere = fc.integer({ min: -3_500_000, max: 3_500_000 }).map((n) => n / 7000);

describe('copy then paste, as a property', () => {
  const cases = projects.chain((project) =>
    fc.record({
      project: fc.constant(project),
      partIds: fc.subarray(
        project.parts.map((p) => p.id),
        { minLength: 1 },
      ),
      // Anywhere, not only on the storage grid: a pointer is wherever it is.
      at: fc.option(fc.record({ x: anywhere, y: anywhere }), { nil: null }),
      intoItself: fc.boolean(),
    }),
  );

  it('gives a sound project, with no id shared with the source and no reference leaving the pasted pieces', () => {
    fc.assert(
      fc.property(cases, ({ project, partIds, at, intoItself }) => {
        const { pieces } = copyPieces(project, partIds);
        const ids = freshIds(pieces);
        const target = intoItself ? { project } : panel(emptyDocument('target'), 'there', 0);

        const next = pastePieces(pieces, ids, at).apply(target).project;

        expect(graphProblems(next)).toEqual([]);
        expect(partStructureProblems(next)).toEqual([]);
        expect(seamStructureProblems(next)).toEqual([]);
        const pasted = next.parts.filter((p) => ids.parts.includes(p.id));
        expect(pasted).toHaveLength(pieces.parts.length);
        const sourceIds = allIds(project);
        const pastedIds = new Set(pasted.flatMap((p) => p.features.map((f) => f.id)));
        for (const part of pasted) {
          expect(sourceIds.has(part.id)).toBe(false);
          for (const feature of part.features) {
            expect(sourceIds.has(feature.id)).toBe(false);
            for (const ref of referencesOf(feature)) expect(pastedIds.has(ref)).toBe(true);
          }
        }
      }),
    );
  });

  it('evaluates to the same geometry as moving those pieces by the same offset', () => {
    fc.assert(
      fc.property(cases, ({ project, partIds, at }) => {
        const copy = copyPieces(project, partIds);
        const ids = freshIds(copy.pieces);
        const next = pastePieces(copy.pieces, ids, at).apply({ project }).project;

        // Where it went: the offset the paste chose, read off the outlines.
        const copied = copy.pieces.parts.map((p) => p.id);
        const before = boxOf(project, copied)!;
        const after = boxOf(next, ids.parts)!;
        const offset: Vec2 = { x: after.minX - before.minX, y: after.minY - before.minY };
        if (at !== null) {
          expect(approxEq((after.minX + after.maxX) / 2, at.x, HALF_QUANTUM)).toBe(true);
          expect(approxEq((after.minY + after.maxY) / 2, at.y, HALF_QUANTUM)).toBe(true);
          // Moved by whole quanta, so what was on the storage grid stays on it.
          expect(approxEq(offset.x, quantise(offset.x))).toBe(true);
          expect(approxEq(offset.y, quantise(offset.y))).toBe(true);
        }

        // The oracle: the source, with those pieces moved whole by that offset.
        const moving = project.parts
          .filter((p) => copied.includes(p.id))
          .flatMap((p) => p.features.map((f) => f.id));
        const moved = geometryOf(translateFeatures(moving, offset).apply({ project }).project);
        const pasted = geometryOf(next);

        const sourceOrder = copy.pieces.parts.flatMap((p) => p.features.map((f) => f.id));
        sourceOrder.forEach((sourceId, i) => {
          expectClose(pasted.get(ids.features[i]!), moved.get(sourceId), sourceId);
        });
      }),
    );
  });
});
