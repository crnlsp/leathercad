import { DEFAULT_SETTINGS } from '@leathercad/domain';
import type { Diagnostic, Feature, Part, ResolvedProject } from '@leathercad/domain';
import { PathOps, Shapes } from '@leathercad/geometry';
import { placedText } from '@leathercad/typography';
import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_COLOURS, buildDisplayList } from './buildDisplayList.js';
import { ROLE_STROKES, type DisplayItem } from './displayList.js';
import { CANVAS } from './theme/index.js';

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
              holes: { holes: [{ point: { x: 5, y: 5 } }, { point: { x: 9, y: 5 } }] },
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
    const dots = list.items.find((i) => i.kind === 'dots');
    expect(dots).toMatchObject({ fill: ROLE_STROKES['stitch-holes'].colour });
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
              holes: { holes: [{ point: { x: 5, y: 5 } }] },
            } as never,
          ],
        },
      ],
    };
  };

  it('draws the holes at a working zoom', () => {
    const list = buildDisplayList(holesProject(), { pxPerMm: CANVAS.bands.overviewBelowPxPerMm });
    expect(list.items.some((i) => i.kind === 'dots')).toBe(true);
  });

  it('draws the set as its stitch line in the overview band', () => {
    const list = buildDisplayList(holesProject(), {
      pxPerMm: CANVAS.bands.overviewBelowPxPerMm / 2,
    });
    expect(list.items.some((i) => i.kind === 'dots')).toBe(false);
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
