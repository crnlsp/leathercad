import type { Diagnostic, Feature, Part, ResolvedProject } from '@leathercad/domain';
import { PathOps, Shapes } from '@leathercad/geometry';
import { placedText } from '@leathercad/typography';
import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_COLOURS, buildDisplayList } from './buildDisplayList.js';
import type { DisplayItem } from './displayList.js';

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
      settings: { gridSpacingMm: 5, defaultStitchInsetMm: 3.5, defaultIronPitchMm: 3.85 },
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
  it('draws nothing extra when nothing is wrong', () => {
    expect(drawing(buildDisplayList(resolved([outline])).items)).toHaveLength(1);
  });

  it('draws the geometry a failed feature was built from, dashed, in the severity colour', () => {
    // A failed feature has no geometry of its own. Without this it vanishes
    // from the canvas, which is the one thing domain-model.md §4.4 forbids.
    const list = buildDisplayList(resolved([outline, stitchLine], ['stitch-1']), {
      diagnostics: [collapse],
    });

    expect(drawing(list.items)).toHaveLength(2);
    const marker = list.items[list.items.length - 1]!;
    expect(marker.kind).toBe('path');
    if (marker.kind !== 'path') return;
    expect(marker.path).toBe(failedAt);
    expect(marker.stroke.colour).toBe(DIAGNOSTIC_COLOURS.error);
    expect(marker.stroke.dashPx).toBeDefined();
  });

  it('marks where an outline crosses itself', () => {
    const list = buildDisplayList(resolved([outline]), { diagnostics: [crossings] });
    const marker = list.items[list.items.length - 1]!;

    expect(marker.kind).toBe('dots');
    if (marker.kind !== 'dots') return;
    expect(marker.points).toEqual([{ x: 25, y: 25 }]);
    expect(marker.fill).toBe(DIAGNOSTIC_COLOURS.error);
  });

  it('draws markers over the geometry, never under it', () => {
    const list = buildDisplayList(resolved([outline]), { diagnostics: [crossings] });
    expect(list.items[list.items.length - 1]!.kind).toBe('dots');
  });

  it('says nothing about a feature the user has hidden', () => {
    const list = buildDisplayList(resolved([{ ...outline, visible: false }]), {
      diagnostics: [crossings],
    });
    expect(list.items).toEqual([]);
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
        settings: { gridSpacingMm: 5, defaultStitchInsetMm: 3.5, defaultIronPitchMm: 3.85 },
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
