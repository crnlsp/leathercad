import { DEFAULT_SETTINGS, LAYER_ROLES, evaluate, type Project } from '@leathercad/domain';
import { PathOps, RectOps, uniformRadii, type Path, type Rect } from '@leathercad/geometry';
import { ROLE_STROKES, ROLE_STYLES, buildDisplayList } from '@leathercad/render';
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

  it('put a part’s caption above a dimension on its top edge, on both', () => {
    // The caption sits above everything the part draws. A dimension's number
    // is set beyond its line, and once the line counted and the number did
    // not, the part's name and the number shared a band — on both. They no
    // longer share a size: the board sets both at 12 px whatever the zoom
    // (R-01), and paper keeps its glyphs in millimetres.
    const resolved = evaluate(dimensionedAlongTop());
    const onScreen = buildDisplayList(resolved, {
      caption: (part) => ({ name: part.part.name, detail: null }),
    }).items.flatMap((item) => (item.kind === 'overlay-text' ? [item] : []));
    const screenCaption = onScreen.find((text) => text.text === 'Panel')!;
    const screenNumber = onScreen.find((text) => text.text === '30.0')!;

    const onPaper = buildExportScene(resolved, 'Test').parts[0]!.texts;
    const paperCaption = inkOf(onPaper.find((t) => t.source === 'Panel')!.glyphs);
    const paperNumber = inkOf(onPaper.find((t) => t.source === '30.0')!.glyphs);

    expect(screenCaption.at.y).toBeGreaterThan(screenNumber.at.y);
    expect(paperCaption.minY).toBeGreaterThan(paperNumber.maxY);
  });

  it('keep paper’s own caption: "Card pocket — cut 2", 2.8 mm tall, whatever the board says', () => {
    // R-01 changed the board's words to "Card pocket ×2" at 12 px; the printed
    // pattern did not move.
    const project = dimensionedAlongTop();
    const pocket = { ...project.parts[0]!, name: 'Card pocket', quantity: 2 };
    const scene = buildExportScene(evaluate({ ...project, parts: [pocket] }), 'Test');
    const caption = scene.parts[0]!.texts[0]!;
    expect(scene.parts[0]!.name).toBe('Card pocket — cut 2');
    expect(caption).toMatchObject({ source: 'Card pocket — cut 2', sizeMm: 2.8 });
    // 1.5 mm above everything the part prints, the number included.
    const number = inkOf(scene.parts[0]!.texts.find((t) => t.source === '30.0')!.glyphs);
    expect(inkOf(caption.glyphs).minY).toBeGreaterThan(number.maxY);
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
