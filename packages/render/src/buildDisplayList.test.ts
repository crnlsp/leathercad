import type { Diagnostic, Feature, Part, ResolvedProject } from '@leathercad/domain';
import { PathOps, Shapes } from '@leathercad/geometry';
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
    expect(caption.sizeMm).toBeGreaterThan(0);
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
