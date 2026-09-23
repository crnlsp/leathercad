import { DEFAULT_SETTINGS } from '@leathercad/domain';
import type { Diagnostic, Feature, LayerRole, Part, ResolvedProject } from '@leathercad/domain';
import { PathOps, Shapes, type Path } from '@leathercad/geometry';
import { placedText } from '@leathercad/typography';
import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_COLOURS, buildDisplayList } from './buildDisplayList.js';
import { ROLE_STROKES, type DisplayItem } from './displayList.js';
import { CANVAS, NOMINAL_IRON } from './theme/index.js';

/** Everything except the part caption, which every part now carries. */
const drawing = (items: readonly DisplayItem[]): DisplayItem[] =>
  items.filter((item) => item.kind !== 'document-text');

const outline: Feature = {
  id: 'cut-1',
  kind: 'cut-contour',
  role: 'outer',
  name: 'Outline',
  visible: true,
  locked: false,
  source: { kind: 'path', path: Shapes.rect({ x: 0, y: 0 }, 100, 60) },
};

const stitchLine: Feature = {
  id: 'stitch-1',
  kind: 'stitch-line',
  name: 'Stitch line',
  visible: true,
  locked: false,
  source: {
    kind: 'derived',
    sourceId: 'cut-1',
    op: { type: 'offset', distanceMm: 60, side: 'inward', run: { kind: 'whole' } },
  },
};

const failedAt = PathOps.polyline(
  [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  false,
);

function resolved(features: Feature[], failed: string[] = [], override?: Part): ResolvedProject {
  const part: Part = override ?? { id: 'part-1', name: 'Panel', quantity: 1, features };
  return {
    project: {
      id: 'p',
      name: 'Test',
      settings: DEFAULT_SETTINGS,
      parts: [part],
    },
    parts: [
      {
        part,
        features: features.map((feature) =>
          failed.includes(feature.id)
            ? {
                ok: false,
                feature,
                problem: {
                  code: 'OFFSET_COLLAPSED',
                  facts: {
                    featureId: feature.id,
                    featureName: feature.name,
                    distanceMm: 60,
                    side: 'inward',
                  },
                },
              }
            : {
                ok: true,
                feature,
                role: feature.kind === 'cut-contour' ? 'cut' : 'stitch',
                path: Shapes.rect({ x: 0, y: 0 }, 100, 60),
                anchors: [],
              },
        ),
      },
    ],
  };
}

const collapse: Diagnostic = {
  problem: {
    code: 'OFFSET_COLLAPSED',
    facts: { featureId: 'stitch-1', featureName: 'Stitch line', distanceMm: 60, side: 'inward' },
  },
  severity: 'error',
  partId: 'part-1',
  featureId: 'stitch-1',
  related: [],
  location: { kind: 'path', path: failedAt },
};

const crossings: Diagnostic = {
  problem: {
    code: 'CONTOUR_SELF_INTERSECTS',
    facts: { featureId: 'cut-1', featureName: 'Outline', crossings: 1 },
  },
  severity: 'error',
  partId: 'part-1',
  featureId: 'cut-1',
  related: [],
  location: { kind: 'points', points: [{ x: 25, y: 25 }] },
};

describe('diagnostics on the canvas', () => {
  // UI Foundations §8.5 (F.5): a failure marks the failure, not its source.
  // It used to redraw the healthy outline dashed in red, so the one feature
  // that was fine turned red and the one that had failed was invisible.
  const markers = (items: readonly DisplayItem[]) => items.filter((i) => i.kind === 'marker');

  it('draws nothing extra when nothing is wrong', () => {
    expect(drawing(buildDisplayList(resolved([outline])).items)).toHaveLength(1);
  });

  it('marks a failure with a marker, and leaves its healthy source alone', () => {
    const list = buildDisplayList(resolved([outline, stitchLine], ['stitch-1']), {
      diagnostics: [collapse],
    });

    // The outline draws as an outline — no second copy in the severity colour.
    const paths = list.items.filter((i) => i.kind === 'path');
    expect(paths).toHaveLength(1);
    if (paths[0]!.kind === 'path') expect(paths[0]!.stroke.colour).toBe(ROLE_STROKES.cut.colour);

    const [marker] = markers(list.items);
    expect(marker).toMatchObject({
      kind: 'marker',
      glyph: 'error',
      colour: DIAGNOSTIC_COLOURS.error,
    });
    // Pinned to the evidence: halfway along the geometry it failed on.
    if (marker?.kind === 'marker') {
      expect(marker.at.x).toBeCloseTo(50, 9);
      expect(marker.at.y).toBeCloseTo(0, 9);
    }
  });

  it('marks where an outline crosses itself, with the crossing itself shown', () => {
    const list = buildDisplayList(resolved([outline]), { diagnostics: [crossings] });

    expect(markers(list.items)).toEqual([
      expect.objectContaining({ at: { x: 25, y: 25 }, glyph: 'error' }),
    ]);
    const dots = list.items.find((i) => i.kind === 'dots');
    expect(dots).toMatchObject({ points: [{ x: 25, y: 25 }], fill: DIAGNOSTIC_COLOURS.error });
  });

  it('gives each severity its own shape, so colour is never the only carrier', () => {
    const glyphFor = (severity: Diagnostic['severity']) =>
      markers(
        buildDisplayList(resolved([outline]), { diagnostics: [{ ...crossings, severity }] }).items,
      )[0];
    expect(glyphFor('error')).toMatchObject({ glyph: 'error' });
    expect(glyphFor('warning')).toMatchObject({ glyph: 'warning' });
    expect(glyphFor('info')).toMatchObject({ glyph: 'info' });
  });

  it('draws markers over the geometry, never under it', () => {
    const list = buildDisplayList(resolved([outline]), { diagnostics: [crossings] });
    expect(list.items[list.items.length - 1]!.kind).toBe('marker');
  });

  it('says nothing about a feature the user has hidden', () => {
    const list = buildDisplayList(resolved([{ ...outline, visible: false }]), {
      diagnostics: [crossings],
    });
    expect(list.items).toEqual([]);
  });
});

describe('selection', () => {
  // UI Foundations §8.4 (F.5): selection adds a halo beneath; it never
  // repaints. A selected stitch line used to turn amber and stop looking like
  // a stitch line — exactly when the maker was about to work on it.
  it('keeps the role colour and dash, and lays a halo beneath the line', () => {
    const list = buildDisplayList(resolved([outline]), { selected: new Set(['cut-1']) });
    const [halo, line] = drawing(list.items);

    expect(halo).toMatchObject({ kind: 'path', stroke: { colour: CANVAS.halo.selected } });
    if (halo?.kind === 'path') expect(halo.stroke.widthPx).toBe(CANVAS.halo.widthPx);
    expect(line).toMatchObject({ kind: 'path', stroke: ROLE_STROKES.cut });
  });

  it('halos a hole set along its line, and leaves the holes as they are', () => {
    const holes = { ...stitchLine, id: 'holes-1', kind: 'stitch-hole-set' } as unknown as Feature;
    const project = resolved([outline]);
    const line = Shapes.rect({ x: 5, y: 5 }, 90, 50);
    const withHoles: ResolvedProject = {
      ...project,
      parts: [
        {
          ...project.parts[0]!,
          features: [
            ...project.parts[0]!.features,
            {
              ok: true,
              feature: holes,
              role: 'stitch-holes',
              path: line,
              anchors: [],
              holes: {
                holes: [
                  { point: { x: 5, y: 5 }, tangent: { x: 1, y: 0 } },
                  { point: { x: 9, y: 5 }, tangent: { x: 1, y: 0 } },
                ],
                achievedPitchMm: 4,
              },
            } as never,
          ],
        },
      ],
    };

    const list = buildDisplayList(withHoles, { selected: new Set(['holes-1']), pxPerMm: 4 });
    const halo = list.items.find(
      (i) => i.kind === 'path' && i.stroke.colour === CANVAS.halo.selected,
    );
    expect(halo).toMatchObject({ path: line });
    const slits = list.items.find((i) => i.kind === 'slits');
    expect(slits).toMatchObject({ stroke: { colour: ROLE_STROKES['stitch-holes'].colour } });
  });

  it('puts the halo on the marker of a selected feature that failed, not on its source', () => {
    const list = buildDisplayList(resolved([outline, stitchLine], ['stitch-1']), {
      diagnostics: [collapse],
      selected: new Set(['stitch-1']),
    });
    expect(
      list.items.some((i) => i.kind === 'path' && i.stroke.colour === CANVAS.halo.selected),
    ).toBe(false);
    expect(list.items.find((i) => i.kind === 'marker')).toMatchObject({ selected: true });
  });
});

describe('zoom bands', () => {
  // UI Foundations §9.3 (F.5): the meaning is constant, the detail adapts.
  // Zoomed out, a hole set stops being hundreds of specks and renders as its
  // stitch line, in stitch blue.
  const holesProject = (): ResolvedProject => {
    const project = resolved([outline]);
    const holes = { ...stitchLine, id: 'holes-1', kind: 'stitch-hole-set' } as unknown as Feature;
    const line = Shapes.rect({ x: 5, y: 5 }, 90, 50);
    return {
      ...project,
      parts: [
        {
          ...project.parts[0]!,
          features: [
            ...project.parts[0]!.features,
            {
              ok: true,
              feature: holes,
              role: 'stitch-holes',
              path: line,
              anchors: [],
              holes: {
                holes: [{ point: { x: 5, y: 5 }, tangent: { x: 1, y: 0 } }],
                achievedPitchMm: 4,
              },
            } as never,
          ],
        },
      ],
    };
  };

  it('draws the holes at a working zoom', () => {
    const list = buildDisplayList(holesProject(), { pxPerMm: CANVAS.bands.overviewBelowPxPerMm });
    expect(list.items.some((i) => i.kind === 'slits')).toBe(true);
  });

  it('draws the set as its stitch line in the overview band', () => {
    const list = buildDisplayList(holesProject(), {
      pxPerMm: CANVAS.bands.overviewBelowPxPerMm / 2,
    });
    expect(list.items.some((i) => i.kind === 'slits')).toBe(false);
    const asLine = list.items.filter((i) => i.kind === 'path' && i.role === 'stitch-holes');
    expect(asLine).toEqual([
      expect.objectContaining({
        stroke: expect.objectContaining({ colour: ROLE_STROKES.stitch.colour }),
      }),
    ]);
  });
});

describe('text labels', () => {
  const label: Feature = {
    id: 'label-1',
    kind: 'text-label',
    name: 'Glue here',
    visible: true,
    locked: false,
    source: { kind: 'text', text: 'Glue here', at: { x: 5, y: 5 }, sizeMm: 4, rotationRad: 0 },
  };

  /** What evaluation would hand the renderer for that label. */
  const withLabel = (): ResolvedProject => {
    const part: Part = { id: 'part-1', name: 'Panel', quantity: 1, features: [label] };
    return {
      project: {
        id: 'p',
        name: 'Test',
        settings: DEFAULT_SETTINGS,
        parts: [part],
      },
      parts: [
        {
          part,
          features: [
            {
              ok: true,
              feature: label,
              role: 'annotation',
              path: Shapes.rect({ x: 5, y: 5 }, 20, 4),
              text: placedText('Glue here', 4, { x: 5, y: 5 }),
              anchors: [],
            },
          ],
        },
      ],
    };
  };

  it('draws the words, not the box they sit in', () => {
    const items = buildDisplayList(withLabel()).items.filter(
      (item) => item.kind === 'document-text',
    );

    // The label and the part caption; no path item for the box, which exists
    // for selection rather than for drawing.
    expect(items.map((item) => item.kind === 'document-text' && item.placed.layout.text)).toContain(
      'Glue here',
    );
    expect(buildDisplayList(withLabel()).items.some((item) => item.kind === 'path')).toBe(false);
  });

  it('draws the layout evaluation produced, rather than laying it out again', () => {
    const resolved = withLabel();
    const drawn = buildDisplayList(resolved).items.find(
      (item) => item.kind === 'document-text' && item.placed.layout.text === 'Glue here',
    );

    const expected = resolved.parts[0]!.features[0]!;
    expect(drawn?.kind === 'document-text' && drawn.placed).toBe(expected.ok && expected.text);
  });
});

describe('part captions', () => {
  it('names each part above it, in millimetres', () => {
    const caption = buildDisplayList(resolved([outline])).items.find(
      (item) => item.kind === 'document-text',
    );

    expect(caption).toBeDefined();
    if (caption?.kind !== 'document-text') return;
    expect(caption.placed.layout.text).toBe('Panel');
    // Document text is sized in millimetres, never pixels: it is part of the
    // drawing, and the same caption prints on the sheet.
    expect(caption.placed.layout.sizeMm).toBeGreaterThan(0);
    // Above the panel's top edge (Y is up).
    expect(caption.placed.origin.y).toBeGreaterThan(60);
  });

  it('says how many to cut, the same words the printed sheet uses', () => {
    const list = buildDisplayList(
      resolved([outline], [], { id: 'part-1', name: 'Gusset', quantity: 2, features: [outline] }),
    );
    const caption = list.items.find((item) => item.kind === 'document-text');

    expect(caption?.kind === 'document-text' && caption.placed.layout.text).toBe('Gusset — cut 2');
  });

  it('leaves an empty part uncaptioned, having nothing to caption', () => {
    expect(buildDisplayList(resolved([])).items).toEqual([]);
  });

  it('can be turned off', () => {
    const list = buildDisplayList(resolved([outline]), { captions: false });
    expect(list.items.every((item) => item.kind !== 'document-text')).toBe(true);
  });
});

describe('leather-specific treatment (F.7)', () => {
  const at = (x: number, y: number) => ({ x, y });
  const base = { visible: true, locked: false } as const;

  const drawnOutline: Feature = {
    ...base,
    id: 'outline',
    kind: 'cut-contour',
    role: 'outer',
    name: 'Outline',
    source: { kind: 'path', path: Shapes.rect(at(0, 0), 100, 60) },
  };
  const followingStitch: Feature = {
    ...base,
    id: 'stitch',
    kind: 'stitch-line',
    name: 'Stitch line',
    source: {
      kind: 'derived',
      sourceId: 'outline',
      op: { type: 'offset', distanceMm: 4, side: 'inward', run: { kind: 'whole' } },
    },
  };
  const holeSet: Feature = {
    ...base,
    id: 'holes',
    kind: 'stitch-hole-set',
    name: 'Stitch holes',
    source: {
      kind: 'derived',
      sourceId: 'stitch',
      op: {
        type: 'stitch-holes',
        pitchMm: 3.85,
        mode: 'fit-whole',
        corners: 'hole-at-corner',
        ironLabel: 'KS Blade 3.85 mm',
      },
    },
  };
  const drawnStitch: Feature = {
    ...base,
    id: 'opening',
    kind: 'stitch-line',
    name: 'Stitch line',
    source: { kind: 'path', path: Shapes.rect(at(4, 4), 92, 52) },
  };
  const allowanceEdge: Feature = {
    ...base,
    id: 'edge',
    kind: 'cut-contour',
    role: 'outer',
    name: 'Outline',
    source: {
      kind: 'derived',
      sourceId: 'opening',
      op: { type: 'offset', distanceMm: 4, side: 'outward', run: { kind: 'whole' } },
    },
  };
  const cutOut: Feature = {
    ...base,
    id: 'slot',
    kind: 'cut-contour',
    role: 'inner',
    name: 'Cut-out',
    source: { kind: 'path', path: Shapes.rect(at(10, 10), 20, 8) },
  };
  const mirroredSlot: Feature = {
    ...base,
    id: 'slot-2',
    kind: 'cut-contour',
    role: 'inner',
    name: 'Cut-out',
    source: {
      kind: 'derived',
      sourceId: 'slot',
      op: {
        type: 'mirror',
        axis: { kind: 'line', origin: at(50, 0), angleRad: Math.PI / 2 },
        glideMm: 0,
      },
    },
  };
  const frozenSlot: Feature = {
    ...base,
    id: 'slot-3',
    kind: 'cut-contour',
    role: 'inner',
    name: 'Cut-out',
    frozenFrom: 'Cut-out',
    source: { kind: 'path', path: Shapes.rect(at(70, 40), 20, 8) },
  };
  const fold = (direction: 'valley' | 'mountain'): Feature => ({
    ...base,
    id: 'fold',
    kind: 'fold-line',
    name: 'Fold line',
    direction,
    source: { kind: 'path', path: PathOps.polyline([at(50, 0), at(50, 60)], false) },
  });

  const roleFor: Record<Feature['kind'], LayerRole> = {
    'cut-contour': 'cut',
    'stitch-line': 'stitch',
    'stitch-hole-set': 'stitch-holes',
    'fold-line': 'fold',
    'marking-line': 'mark',
    'hardware-hole': 'hardware',
    'text-label': 'annotation',
    measurement: 'annotation',
  };

  /** Each feature resolved to the path given, as evaluation would hand it over. */
  function scene(entries: [Feature, Path][], name = 'Panel'): ResolvedProject {
    const features = entries.map(([feature]) => feature);
    const part: Part = { id: 'part-1', name, quantity: 1, features };
    return {
      project: { id: 'p', name: 'Test', settings: DEFAULT_SETTINGS, parts: [part] },
      parts: [
        {
          part,
          features: entries.map(([feature, path]) => ({
            ok: true,
            feature,
            role: roleFor[feature.kind],
            path,
            anchors: [],
            ...(feature.kind === 'stitch-hole-set'
              ? {
                  holes: {
                    holes: [
                      { point: at(4, 4), tangent: at(1, 0), runIndex: 0, ordinal: 0 },
                      { point: at(7.85, 4), tangent: at(1, 0), runIndex: 0, ordinal: 1 },
                      { point: at(96, 30), tangent: at(0, 1), runIndex: 1, ordinal: 0 },
                    ],
                    count: 88,
                    achievedPitchMm: 3.84,
                    runs: [],
                  },
                }
              : {}),
          })),
        },
      ],
    };
  }

  const outlinePath = Shapes.rect(at(0, 0), 100, 60);
  const stitchPath = Shapes.rect(at(4, 4), 92, 52);
  const stitched = (): ResolvedProject =>
    scene([
      [drawnOutline, outlinePath],
      [followingStitch, stitchPath],
      [holeSet, stitchPath],
    ]);

  const ofKind = <K extends DisplayItem['kind']>(items: readonly DisplayItem[], kind: K) =>
    items.filter((i): i is Extract<DisplayItem, { kind: K }> => i.kind === kind);

  describe('stitch holes as slits', () => {
    it('draws each hole as a slit in stitch blue, not as a dot', () => {
      const list = buildDisplayList(stitched(), { pxPerMm: 4 });
      expect(ofKind(list.items, 'dots')).toEqual([]);
      const [slits] = ofKind(list.items, 'slits');
      expect(slits?.role).toBe('stitch-holes');
      expect(slits?.slits).toHaveLength(3);
      expect(slits?.stroke.colour).toBe(ROLE_STROKES['stitch-holes'].colour);
    });

    it('sizes the slit from the iron’s nominal pitch, not the achieved spacing', () => {
      const [slits] = ofKind(buildDisplayList(stitched(), { pxPerMm: 10 }).items, 'slits');
      const [a, b] = slits!.slits[0]!;
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(NOMINAL_IRON.toothPerPitch * 3.85, 9);
      // Detail band: as wide as the blade.
      expect(slits!.stroke.widthPx).toBeCloseTo(NOMINAL_IRON.bladeMm * 10, 9);
    });
  });

  describe('the seam allowance as a band', () => {
    const allowance = (): ResolvedProject =>
      scene([
        [drawnStitch, stitchPath],
        [allowanceEdge, outlinePath],
      ]);

    it('fills between the edge and the stitch line it grew from', () => {
      const [band] = ofKind(buildDisplayList(allowance()).items, 'fill');
      expect(band).toMatchObject({ colour: CANVAS.allowance, paths: [outlinePath, stitchPath] });
    });

    it('lies beneath every line of its part', () => {
      const items = buildDisplayList(allowance()).items;
      const band = items.findIndex((i) => i.kind === 'fill');
      const firstLine = items.findIndex((i) => i.kind === 'path');
      expect(band).toBeGreaterThanOrEqual(0);
      expect(band).toBeLessThan(firstLine);
    });

    it('is not drawn for an ordinary outline and the stitching inset from it', () => {
      expect(ofKind(buildDisplayList(stitched()).items, 'fill')).toEqual([]);
    });
  });

  describe('cut-outs hatched inward', () => {
    it('hatches a cut-out beneath its line, and never an outline', () => {
      const items = buildDisplayList(
        scene([
          [drawnOutline, outlinePath],
          [cutOut, Shapes.rect(at(10, 10), 20, 8)],
        ]),
      ).items;
      const hatches = ofKind(items, 'hatch');
      expect(hatches).toHaveLength(1);
      expect(hatches[0]!.path).toEqual(Shapes.rect(at(10, 10), 20, 8));
      expect(hatches[0]!.colour).toBe(CANVAS.hatch.colour);
      expect(items.indexOf(hatches[0]!)).toBeLessThan(items.findIndex((i) => i.kind === 'path'));
    });
  });

  describe('folds that say which way they fold', () => {
    it('ticks a valley with V and a mountain with Λ, on the line', () => {
      for (const direction of ['valley', 'mountain'] as const) {
        const line = PathOps.polyline([at(50, 0), at(50, 60)], false);
        const ticks = ofKind(
          buildDisplayList(scene([[fold(direction), line]]), { pxPerMm: 4 }).items,
          'fold-tick',
        );
        expect(ticks.length).toBeGreaterThan(0);
        expect(ticks.every((t) => t.fold === direction && t.at.x === 50)).toBe(true);
        expect(ticks[0]!.colour).toBe(ROLE_STROKES.fold.colour);
      }
    });
  });

  describe('the derived link tick', () => {
    const ticksOf = (project: ResolvedProject) =>
      ofKind(buildDisplayList(project).items, 'link-tick');

    it('marks a stitch line that follows an edge, in its own colour at 60 %', () => {
      const ticks = ticksOf(stitched());
      // The stitch line only: the outline is drawn, and the holes are always
      // derived, so a tick on them would say nothing.
      expect(ticks).toHaveLength(1);
      expect(ticks[0]).toMatchObject({ role: 'stitch', colour: `${ROLE_STROKES.stitch.colour}99` });
      // The middle of its longest side: 92 mm along the top or bottom.
      expect(ticks[0]!.at.x).toBeCloseTo(50, 9);
    });

    it('marks a seam-allowance edge and a mirrored counterpart', () => {
      expect(
        ticksOf(
          scene([
            [drawnStitch, stitchPath],
            [allowanceEdge, outlinePath],
          ]),
        ),
      ).toHaveLength(1);
      expect(
        ticksOf(
          scene([
            [cutOut, Shapes.rect(at(10, 10), 20, 8)],
            [mirroredSlot, Shapes.rect(at(70, 10), 20, 8)],
          ]),
        ),
      ).toEqual([expect.objectContaining({ role: 'cut' })]);
    });

    it('does not mark drawn geometry, or a feature frozen into it', () => {
      expect(
        ticksOf(
          scene([
            [drawnOutline, outlinePath],
            [frozenSlot, Shapes.rect(at(70, 40), 20, 8)],
          ]),
        ),
      ).toEqual([]);
    });
  });

  describe('the iron in the part caption', () => {
    const captions = (project: ResolvedProject) =>
      ofKind(buildDisplayList(project).items, 'document-text');

    it('says the iron under the part’s name, quieter than the name', () => {
      const [first, second] = captions(stitched());
      const name = [first, second].find((c) => c?.placed.layout.text === 'Panel')!;
      const iron = [first, second].find((c) => c !== name)!;
      expect(iron.placed.layout.text).toBe('88 holes · 3.85 mm · KS Blade');
      // Under the name and above the piece (Y is up).
      expect(iron.placed.origin.y).toBeGreaterThan(60);
      expect(name.placed.origin.y).toBeGreaterThan(
        iron.placed.origin.y + iron.placed.layout.ascentMm,
      );
      expect(iron.placed.layout.sizeMm).toBeLessThan(name.placed.layout.sizeMm);
      expect(iron.colour).toBe(CANVAS.caption);
    });

    it('leaves a part without stitching with its name alone', () => {
      expect(
        captions(scene([[drawnOutline, outlinePath]])).map((c) => c.placed.layout.text),
      ).toEqual(['Panel']);
    });
  });
});
