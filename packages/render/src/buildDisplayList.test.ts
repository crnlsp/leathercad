import { DEFAULT_SETTINGS, evaluate } from '@leathercad/domain';
import type {
  Diagnostic,
  Feature,
  LayerRole,
  Part,
  Project,
  ResolvedPart,
  ResolvedProject,
} from '@leathercad/domain';
import { PathOps, Shapes, uniformRadii, type Path } from '@leathercad/geometry';
import { FONT, placedText } from '@leathercad/typography';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  DIAGNOSTIC_COLOURS,
  buildDisplayList,
  type BuildOptions,
  type Caption,
} from './buildDisplayList.js';
import { ROLE_STROKES, type DisplayItem } from './displayList.js';
import { CANVAS, GROUND, NOMINAL_IRON } from './theme/index.js';
import { TRUE_SIZE_CSS_PX_PER_MM, type ViewportView } from './view.js';

/** The piece fills: the leather itself (R-02). */
const isPieceFill = (item: DisplayItem): boolean =>
  item.kind === 'fill' &&
  (item.colour === GROUND.pieceFill || item.colour === GROUND.pieceFillSelected);

/** Everything except the part caption and the piece's fill, which every part now carries. */
const drawing = (items: readonly DisplayItem[]): DisplayItem[] =>
  items.filter((item) => item.kind !== 'document-text' && !isPieceFill(item));

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

describe('pieces read as pieces (R-02)', () => {
  const fills = (items: readonly DisplayItem[]) => items.filter((item) => item.kind === 'fill');

  it('fills a piece with the paper-pale piece colour, before anything else in it', () => {
    const list = buildDisplayList(resolved([outline]));
    expect(fills(list.items)).toEqual([
      expect.objectContaining({ colour: GROUND.pieceFill, paths: [expect.anything()] }),
    ]);
    expect(list.items.findIndex((item) => item.kind === 'fill')).toBeLessThan(
      list.items.findIndex((item) => item.kind === 'path'),
    );
  });

  it('fills the piece being worked on in the selected colour', () => {
    const list = buildDisplayList(resolved([outline]), { selected: new Set(['cut-1']) });
    expect(fills(list.items)[0]).toMatchObject({ colour: GROUND.pieceFillSelected });
  });

  it('warms the piece when any of its features is selected, not only its outline', () => {
    const list = buildDisplayList(resolved([outline, stitchLine]), {
      selected: new Set(['stitch-1']),
    });
    expect(fills(list.items)).toEqual([
      expect.objectContaining({ colour: GROUND.pieceFillSelected }),
    ]);
  });

  it('leaves the piece pale while something else is selected, or hovered', () => {
    const list = buildDisplayList(resolved([outline]), {
      selected: new Set(['another-part']),
      hovered: 'cut-1',
    });
    expect(fills(list.items)).toEqual([expect.objectContaining({ colour: GROUND.pieceFill })]);
  });

  it('fills nothing for a hidden outline, or an outline that did not resolve', () => {
    expect(fills(buildDisplayList(resolved([{ ...outline, visible: false }])).items)).toEqual([]);
    expect(fills(buildDisplayList(resolved([outline], ['cut-1'])).items)).toEqual([]);
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

/** The board's own words: captions, dimension values, readouts. */
const texts = (list: { readonly items: readonly DisplayItem[] }) =>
  list.items.filter(
    (item): item is Extract<DisplayItem, { kind: 'overlay-text' }> => item.kind === 'overlay-text',
  );

/** A camera at this many CSS px per mm, looking at `centreMm` on an 800 × 600 CSS px canvas. */
const looking = (css: number, centreMm = { x: 50, y: 30 }, dpr = 1): ViewportView => ({
  centreMm,
  scale: css * dpr,
  widthPx: 800 * dpr,
  heightPx: 600 * dpr,
  dpr,
});

/** What the app says a piece is called: the words are its own (ADR 0018). */
const words = (part: ResolvedPart): Caption => ({
  name: `${part.part.name} ×2`,
  detail: '52 holes · 3.85 mm',
});

/** A 30 × 50 panel, `measure`d along its top edge 8 mm out — or its left edge. */
function dimensioned(measure: 'horizontal' | 'vertical' = 'horizontal'): Project {
  const outlineOf: Feature = {
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
  };
  const width: Feature = {
    id: 'width',
    kind: 'measurement',
    name: 'Width',
    visible: true,
    locked: false,
    source: {
      kind: 'measurement',
      measure,
      // Corners are numbered after each edge: 2 is the top left, 1 the top
      // right, 3 the bottom left.
      a: { kind: 'anchor', featureId: 'outline', anchor: 2 },
      b: { kind: 'anchor', featureId: 'outline', anchor: measure === 'horizontal' ? 1 : 3 },
      offsetMm: 8,
      precision: 1,
    },
  };
  return {
    id: 'p',
    name: 'Test',
    settings: DEFAULT_SETTINGS,
    parts: [{ id: 'part-1', name: 'Panel', quantity: 1, features: [outlineOf, width] }],
  };
}

const atPercent = (percent: number): number => (percent / 100) * TRUE_SIZE_CSS_PX_PER_MM;

describe('part captions on the board (R-01)', () => {
  it('says nothing of its own: without the app’s words, no caption', () => {
    expect(texts(buildDisplayList(resolved([outline])))).toEqual([]);
    expect(
      buildDisplayList(resolved([outline])).items.some((item) => item.kind === 'document-text'),
    ).toBe(false);
  });

  it('asks the app for the words of each piece it captions', () => {
    const asked: string[] = [];
    buildDisplayList(resolved([outline]), {
      caption: (part) => {
        asked.push(part.part.id);
        return words(part);
      },
    });
    expect(asked).toEqual(['part-1']);
  });

  it('leaves an empty part uncaptioned, having nothing to caption', () => {
    expect(buildDisplayList(resolved([]), { caption: words }).items).toEqual([]);
  });

  it('names the piece over its detail, 12 px at every zoom, each on a halo of the ground', () => {
    const halo = { colour: GROUND.ground, widthPx: 4 };
    for (const percent of [23, 60, 160, 300]) {
      const zoom = atPercent(percent);
      const [name, detail, ...rest] = texts(
        buildDisplayList(resolved([outline]), { caption: words, pxPerMm: zoom }),
      );
      expect(rest).toEqual([]);
      expect(name).toMatchObject({
        text: 'Panel ×2',
        sizePx: 12,
        weight: 600,
        colour: GROUND.ink,
        halo,
      });
      if (percent < 40) {
        // Zoomed out, the name alone (R-01).
        expect(detail).toBeUndefined();
        continue;
      }
      expect(detail).toMatchObject({
        text: '52 holes · 3.85 mm',
        sizePx: 12,
        weight: 400,
        colour: GROUND.label,
        halo,
      });
      // Left-aligned on the piece's left edge, one 16 px line apart, and the
      // detail's baseline 7.5 px above the piece's top (Y is up): 4 px of gap
      // and the 3.5 px of its line below the baseline.
      expect(name!.at.x).toBeCloseTo(0, 9);
      expect(detail!.at.x).toBeCloseTo(0, 9);
      expect((name!.at.y - detail!.at.y) * zoom).toBeCloseTo(16, 9);
      expect((detail!.at.y - 60) * zoom).toBeCloseTo(7.5, 9);
    }
  });

  it('says the name alone below 40 %, and the detail too from 40 %', () => {
    const lines = (percent: number): number =>
      texts(buildDisplayList(resolved([outline]), { caption: words, pxPerMm: atPercent(percent) }))
        .length;
    expect(lines(39.9)).toBe(1);
    expect(lines(40)).toBe(2);
  });

  it('says the name alone when the app has no detail to give', () => {
    const list = buildDisplayList(resolved([outline]), {
      caption: (part) => ({ name: part.part.name, detail: null }),
    });
    expect(texts(list).map((text) => text.text)).toEqual(['Panel']);
  });

  it('reads the zoom from the camera, the same on any display', () => {
    for (const dpr of [1, 2]) {
      const [name, detail] = texts(
        buildDisplayList(resolved([outline]), {
          caption: words,
          view: looking(atPercent(60), { x: 50, y: 30 }, dpr),
        }),
      );
      expect(name!.sizePx).toBe(12);
      expect((detail!.at.y - 60) * atPercent(60)).toBeCloseTo(7.5, 9);
    }
  });

  describe('pinned while its piece’s top is off the canvas', () => {
    // At 4 px/mm, 800 × 600 CSS px show 200 × 150 mm; the rulers take 22 px
    // off the top and 34 px off the left.
    const zoom = 4;
    const area = (centre: { x: number; y: number }) => ({
      minX: centre.x - 100 + 34 / zoom,
      maxY: centre.y + 75 - 22 / zoom,
    });
    const captionAt = (centre: { x: number; y: number }) =>
      texts(buildDisplayList(resolved([outline]), { caption: words, view: looking(zoom, centre) }));

    it('stays above its piece while it fits on the canvas there', () => {
      for (const centre of [
        { x: 50, y: 30 },
        // The panel's top 36 px under the ruler: room for both lines and the gap.
        { x: 110, y: 60 + 36 / zoom - 75 + 22 / zoom },
      ]) {
        const [name] = captionAt(centre);
        expect(name!.at.x).toBeCloseTo(0, 9);
        expect((name!.at.y - 60) * zoom).toBeCloseTo(23.5, 9);
      }
    });

    it('pins once it would run under the ruler, before the piece’s top does', () => {
      // The top 20 px under the ruler: the name would be hidden by it, and a
      // name the maker cannot read is what R-01 is for.
      const centre = { x: 110, y: 60 + 20 / zoom - 75 + 22 / zoom };
      const [name] = captionAt(centre);
      expect(name!.at.x).toBeCloseTo(area(centre).minX + 12 / zoom, 9);
      expect((area(centre).maxY - name!.at.y) * zoom).toBeCloseTo(24.5, 9);
    });

    it('pins to the canvas’s top-left, 12 px in, once the top is off it', () => {
      // Looking at the panel's lower right: its top (y = 60) is above the
      // canvas, its left edge (x = 0) left of it.
      const centre = { x: 110, y: -30 };
      const [name, detail] = captionAt(centre);
      expect(name!.at.x).toBeCloseTo(area(centre).minX + 12 / zoom, 9);
      // The name's line starts 12 px under the ruler, and its baseline is
      // 12.5 px down that line.
      expect((area(centre).maxY - name!.at.y) * zoom).toBeCloseTo(24.5, 9);
      expect((name!.at.y - detail!.at.y) * zoom).toBeCloseTo(16, 9);
    });

    it('pins to the canvas’s left even when the piece’s left edge is on the canvas', () => {
      const centre = { x: 60, y: -30 };
      const [name] = captionAt(centre);
      expect(area(centre).minX).toBeLessThan(0);
      expect(name!.at.x).toBeCloseTo(area(centre).minX + 12 / zoom, 9);
    });

    it('goes with the piece once the piece has left the canvas', () => {
      // The panel entirely above the canvas: its caption stays above it, off
      // the canvas too.
      const [name] = captionAt({ x: 50, y: -200 });
      expect((name!.at.y - 60) * zoom).toBeCloseTo(23.5, 9);
    });

    it('stacks two pinned captions rather than writing one over the other', () => {
      const second: Part = { id: 'part-2', name: 'Lining', quantity: 1, features: [outline] };
      const project = resolved([outline]);
      const both: ResolvedProject = {
        ...project,
        parts: [...project.parts, { ...project.parts[0]!, part: second }],
      };
      const [first, , other] = texts(
        buildDisplayList(both, { caption: words, view: looking(zoom, { x: 90, y: -30 }) }),
      );
      expect(other!.text).toBe('Lining ×2');
      expect(other!.at.x).toBeCloseTo(first!.at.x, 9);
      // Two lines of 16 px and a 4 px gap under the first.
      expect((first!.at.y - other!.at.y) * zoom).toBeCloseTo(36, 9);
    });
  });

  it('never sets the board’s words below 12 px, at any zoom on any display', () => {
    const project = evaluate(dimensioned());
    fc.assert(
      fc.property(
        fc.double({ min: 0.05, max: 400, noNaN: true }),
        fc.constantFrom(1, 1.5, 2, 3),
        (css, dpr) => {
          const drawn = texts(
            buildDisplayList(project, {
              caption: words,
              view: looking(css, { x: 15, y: 25 }, dpr),
            }),
          );
          expect(drawn.length).toBeGreaterThan(1);
          for (const text of drawn) expect(text.sizePx).toBeGreaterThanOrEqual(CANVAS.text.minPx);
        },
      ),
    );
  });
});

describe('a dimension’s value on the board (R-01)', () => {
  const valueIn = (project: ResolvedProject, options: BuildOptions = {}) =>
    texts(buildDisplayList(project, options)).find((item) => item.text === '30.0');

  it('is 12 px in the measuring colour, centred on its line, on a halo of the ground', () => {
    const resolved = evaluate(dimensioned());
    for (const zoom of [1, 4, 12]) {
      const number = valueIn(resolved, { pxPerMm: zoom });
      expect(number).toMatchObject({
        sizePx: 12,
        weight: 500,
        colour: ROLE_STROKES.annotation.colour,
        align: 'center',
        halo: { colour: GROUND.ground, widthPx: 4 },
      });
      // The line runs at y = 58 from x 0 to 30. The number is centred on its
      // middle with its baseline half a capital below it, so the figures sit
      // on the line and their halo breaks it.
      expect(number!.at.x).toBeCloseTo(15, 9);
      expect((58 - number!.at.y) * zoom).toBeCloseTo((FONT.capHeight / FONT.unitsPerEm) * 6, 9);
      expect(number!.rotationRad ?? 0).toBe(0);
    }
  });

  it('reads along a vertical line, as the printed one does', () => {
    const resolved = evaluate(dimensioned('vertical'));
    const printed = resolved.parts[0]!.features.find((entry) => entry.feature.id === 'width');
    const number = texts(buildDisplayList(resolved))[0];
    expect(printed?.ok && printed.text !== undefined).toBe(true);
    if (!printed?.ok || printed.text === undefined) return;
    expect(number!.text).toBe('50.0');
    expect(number!.rotationRad).toBeCloseTo(printed.text.rotationRad, 9);
    expect(Math.abs(number!.rotationRad!)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('no longer draws the printed number’s glyphs on screen', () => {
    const list = buildDisplayList(evaluate(dimensioned()));
    expect(list.items.some((item) => item.kind === 'document-text')).toBe(false);
  });

  it('keeps the caption clear of a number above the piece, at any zoom', () => {
    // The number counts towards the piece's extent at its size on screen,
    // halo and all, so the caption sits above it, as the printed one does.
    const resolved = evaluate(dimensioned());
    fc.assert(
      fc.property(fc.double({ min: 1.6, max: 60, noNaN: true }), (zoom) => {
        const drawn = texts(
          buildDisplayList(resolved, {
            pxPerMm: zoom,
            caption: (part) => ({ name: part.part.name, detail: 'detail' }),
          }),
        );
        const number = drawn.find((item) => item.text === '30.0')!;
        const detail = drawn.find((item) => item.text === 'detail')!;
        // The number's line box tops out 12.5 px above its baseline and its
        // halo 4 px beyond; the detail's line box ends 3.5 px under its own.
        expect(detail.at.y - 3.5 / zoom).toBeGreaterThan(number.at.y + (12.5 + 4) / zoom);
      }),
    );
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
    const bands = (items: readonly DisplayItem[]) =>
      ofKind(items, 'fill').filter((fill) => fill.colour === CANVAS.allowance);

    it('fills between the edge and the stitch line it grew from', () => {
      const [band] = bands(buildDisplayList(allowance()).items);
      expect(band).toMatchObject({ colour: CANVAS.allowance, paths: [outlinePath, stitchPath] });
    });

    it('fills the piece to its edge, beneath the band (R-02)', () => {
      // The edge grown from the stitching is the part's outline: the one
      // outer contour S5 allows. The piece is filled to it, and the band is
      // drawn over the fill, so the allowance still shows.
      const items = buildDisplayList(allowance()).items;
      const piece = ofKind(items, 'fill').find(isPieceFill);
      expect(piece).toMatchObject({ colour: GROUND.pieceFill, paths: [outlinePath] });
      expect(items.indexOf(piece!)).toBeLessThan(items.indexOf(bands(items)[0]!));
    });

    it('lies beneath every line of its part', () => {
      const items = buildDisplayList(allowance()).items;
      const band = items.findIndex((i) => i.kind === 'fill');
      const firstLine = items.findIndex((i) => i.kind === 'path');
      expect(band).toBeGreaterThanOrEqual(0);
      expect(band).toBeLessThan(firstLine);
    });

    it('is not drawn for an ordinary outline and the stitching inset from it', () => {
      expect(bands(buildDisplayList(stitched()).items)).toEqual([]);
    });
  });

  describe('the piece fill (R-02)', () => {
    const slot = Shapes.rect(at(10, 10), 20, 8);

    it('leaves a cut-out open, as a hole in the leather, and keeps its hatch', () => {
      const items = buildDisplayList(
        scene([
          [drawnOutline, outlinePath],
          [cutOut, slot],
        ]),
      ).items;
      // Even-odd: the slot is the fill's second path, so the ground shows
      // through it.
      expect(ofKind(items, 'fill')).toEqual([
        expect.objectContaining({ colour: GROUND.pieceFill, paths: [outlinePath, slot] }),
      ]);
      expect(ofKind(items, 'hatch')).toHaveLength(1);
      expect(items.findIndex((i) => i.kind === 'fill')).toBeLessThan(
        items.findIndex((i) => i.kind === 'hatch'),
      );
    });

    it('fills over a hidden cut-out: hidden, it is not shown as a hole either', () => {
      const items = buildDisplayList(
        scene([
          [drawnOutline, outlinePath],
          [{ ...cutOut, visible: false }, slot],
        ]),
      ).items;
      expect(ofKind(items, 'fill')).toEqual([expect.objectContaining({ paths: [outlinePath] })]);
    });

    it('fills nothing for an outline that is not closed, or a part with no outline', () => {
      const open = PathOps.polyline([at(0, 0), at(100, 0), at(100, 60)], false);
      expect(ofKind(buildDisplayList(scene([[drawnOutline, open]])).items, 'fill')).toEqual([]);
      expect(ofKind(buildDisplayList(scene([[cutOut, slot]])).items, 'fill')).toEqual([]);
    });

    it('never hides another piece: every fill lies beneath every line on the board', () => {
      // Two pieces laid over each other, as a pocket is offered up to the
      // panel it is sewn to: both outlines and both stitch lines stay in view.
      const panel = scene([
        [drawnOutline, outlinePath],
        [followingStitch, stitchPath],
      ]);
      const pocket = scene([[{ ...drawnOutline, id: 'pocket' }, Shapes.rect(at(20, 20), 40, 30)]]);
      const both: ResolvedProject = {
        ...panel,
        parts: [
          ...panel.parts,
          { ...pocket.parts[0]!, part: { ...pocket.parts[0]!.part, id: 'p2' } },
        ],
      };
      const items = buildDisplayList(both).items;
      const lastFill = items.findLastIndex((i) => i.kind === 'fill');
      const firstLine = items.findIndex((i) => i.kind === 'path');
      expect(ofKind(items, 'fill')).toHaveLength(2);
      expect(lastFill).toBeLessThan(firstLine);
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
});
