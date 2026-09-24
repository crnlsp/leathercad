import { DEFAULT_SETTINGS, LAYER_ROLES, evaluate, type Project } from '@leathercad/domain';
import { PathOps, RectOps, uniformRadii, type Path, type Rect } from '@leathercad/geometry';
import { ROLE_STROKES, ROLE_STYLES, buildDisplayList } from '@leathercad/render';
import { outlinesOf } from '@leathercad/typography';
import { describe, expect, it } from 'vitest';

import { PRINT_STYLES, buildExportScene } from './scene.js';

/**
 * The audit that screen and paper agree (UI Foundations §2, F.4).
 *
 * Before F.4 a marking line was solid on screen and dotted on the pattern, and
 * the stitch and fold rhythms differed between the two — a canvas that claimed
 * to preview the paper and did not. Now both read one role table, and this
 * holds them to it: a drift fails the build rather than waiting for someone to
 * notice a dotted line on paper.
 */
describe('screen and paper', () => {
  it('style every layer role, in both media', () => {
    for (const role of LAYER_ROLES) {
      expect(ROLE_STROKES[role], `screen style for ${role}`).toBeDefined();
      expect(PRINT_STYLES[role], `print style for ${role}`).toBeDefined();
    }
  });

  it('draw every role with the same dash rhythm — the very same array', () => {
    for (const role of LAYER_ROLES) {
      expect(ROLE_STROKES[role].dashMm, role).toBe(PRINT_STYLES[role].dashMm);
      expect(PRINT_STYLES[role].dashMm, role).toBe(ROLE_STYLES[role].dashMm);
    }
  });

  it('agree on which roles are dashed at all', () => {
    // The old defect in its plainest form: dotted on paper, solid on screen.
    for (const role of LAYER_ROLES) {
      const onScreen = (ROLE_STROKES[role].dashMm ?? []).length > 0;
      const onPaper = PRINT_STYLES[role].dashMm.length > 0;
      expect(onScreen, role).toBe(onPaper);
    }
  });

  it('put a part’s caption in the same place, above a dimension on its top edge', () => {
    // The caption sits above everything the part draws. A dimension's number
    // is set beyond its line, and once the line counted and the number did
    // not, the part's name and the number shared a band — on both.
    const resolved = evaluate(dimensionedAlongTop());
    const onScreen = buildDisplayList(resolved).items.flatMap((item) =>
      item.kind === 'document-text' ? [item.placed] : [],
    );
    const screenCaption = inkOf(outlinesOf(onScreen.find((p) => p.layout.text === 'Panel')!));
    const screenNumber = inkOf(outlinesOf(onScreen.find((p) => p.layout.text === '30.0')!));

    const onPaper = buildExportScene(resolved, 'Test').parts[0]!.texts;
    const paperCaption = inkOf(onPaper.find((t) => t.source === 'Panel')!.glyphs);

    expect(screenCaption.minY).toBeGreaterThan(screenNumber.maxY);
    expect(RectOps.equals(paperCaption, screenCaption)).toBe(true);
  });
});

function inkOf(glyphs: readonly Path[]): Rect {
  return RectOps.unionAll(glyphs.flatMap((glyph) => PathOps.bbox(glyph) ?? []))!;
}

/** A 30 × 50 panel, its top edge dimensioned 8 mm above it. */
function dimensionedAlongTop(): Project {
  return {
    id: 'p',
    name: 'Test',
    settings: DEFAULT_SETTINGS,
    parts: [
      {
        id: 'part-1',
        name: 'Panel',
        quantity: 1,
        features: [
          {
            id: 'outline',
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
                width: 30,
                height: 50,
                radii: uniformRadii(0),
                rotation: 0,
              },
            },
          },
          {
            id: 'width',
            kind: 'measurement',
            name: 'Width',
            visible: true,
            locked: false,
            source: {
              kind: 'measurement',
              measure: 'horizontal',
              // Corners are numbered after each edge: 2 is the top left, 1 the
              // top right.
              a: { kind: 'anchor', featureId: 'outline', anchor: 2 },
              b: { kind: 'anchor', featureId: 'outline', anchor: 1 },
              offsetMm: 8,
              precision: 1,
            },
          },
        ],
      },
    ],
  };
}
