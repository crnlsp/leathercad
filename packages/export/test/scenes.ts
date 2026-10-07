import {
  DEFAULT_SETTINGS,
  evaluate,
  type Feature,
  type LayerRole,
  type Part,
  type Project,
} from '@leathercad/domain';
import {
  PathOps,
  RectOps,
  SegmentOps,
  arc,
  cubic,
  line,
  uniformRadii,
  type Path,
  type Rect,
  type Segment,
  type Vec2,
} from '@leathercad/geometry';
import { outlinesOf, placedText } from '@leathercad/typography';
import fc from 'fast-check';

import {
  PRINT_STYLES,
  buildExportScene,
  type ExportPart,
  type ExportPath,
  type ExportScene,
  type ExportText,
} from '../src/scene.js';

/**
 * Scenes for the file writers' tests (SVG and DXF read the same scene, so they
 * are tried on the same ones): built by hand, built from a project, and drawn at
 * random.
 */

export const itemOf = (role: LayerRole, path: Path): ExportPath => ({
  role,
  path,
  style: PRINT_STYLES[role],
});

const boundsOf = (paths: readonly Path[]): Rect =>
  RectOps.unionAll(paths.flatMap((path) => PathOps.bbox(path) ?? []))!;

/** One part holding these paths and words. */
export function sceneOf(
  items: readonly ExportPath[],
  texts: readonly ExportText[] = [],
  name = 'Test',
): ExportScene {
  const part: ExportPart = {
    id: 'part-1',
    name: 'Part',
    quantity: 1,
    paths: items,
    texts,
    boundsMm: boundsOf([...items.map((i) => i.path), ...texts.flatMap((t) => t.glyphs)]),
  };
  return { projectName: name, parts: [part] };
}

export const textOf = (role: LayerRole, words: string, at: Vec2): ExportText => ({
  role,
  source: words,
  glyphs: outlinesOf(placedText(words, 4, at)),
  sizeMm: 4,
});

// ── From a project ───────────────────────────────────────────────────────────

const base = (id: string) => ({ id, name: id, visible: true, locked: false });

const outlineOf = (id: string, width: number, height: number, visible = true): Feature => ({
  ...base(id),
  visible,
  kind: 'cut-contour',
  role: 'outer',
  source: {
    kind: 'shape',
    shape: {
      type: 'rect',
      origin: { x: 0, y: 0 },
      width,
      height,
      radii: uniformRadii(0),
      rotation: 0,
    },
  },
});

const inset = (id: string, sourceId: string, distanceMm: number): Feature => ({
  ...base(id),
  kind: 'stitch-line',
  source: {
    kind: 'derived',
    sourceId,
    op: { type: 'offset', distanceMm, side: 'inward', run: { kind: 'whole' } },
  },
});

const holesOn = (id: string, sourceId: string): Feature => ({
  ...base(id),
  kind: 'stitch-hole-set',
  source: {
    kind: 'derived',
    sourceId,
    op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'hole-at-corner' },
  },
});

const words = (id: string): Feature => ({
  ...base(id),
  kind: 'text-label',
  source: { kind: 'text', text: 'Glue here', at: { x: 0, y: 0 }, sizeMm: 4, rotationRad: 0 },
});

const partOf = (id: string, features: Feature[]): Part => ({ id, name: id, quantity: 1, features });

/**
 * A project with things the PDF leaves out among the things it prints: a panel
 * with a stitch line and its holes, and beside it a hidden outline, a stitch
 * line too deep to build, an empty part, a hidden part, a part whose only
 * feature is broken, a part of words, and a strap longer than a sheet.
 */
export const MIXED_PROJECT: Project = {
  id: 'p',
  name: 'Mixed',
  settings: DEFAULT_SETTINGS,
  parts: [
    partOf('panel', [
      outlineOf('o1', 100, 70),
      inset('s1', 'o1', 3.5),
      holesOn('h1', 's1'),
      outlineOf('hidden-slot', 20, 10, false),
      inset('too-deep', 'o1', 500),
    ]),
    partOf('empty', []),
    partOf('hidden', [outlineOf('o2', 50, 50, false)]),
    partOf('broken', [outlineOf('o3', 40, 40, false), inset('s3', 'o3', 500)]),
    partOf('words', [words('l1')]),
    // Longer than a sheet: taped across two in the PDF, and one piece in a file.
    partOf('strap', [outlineOf('o4', 275, 25)]),
  ],
};

export const mixedScene = (): ExportScene =>
  buildExportScene(evaluate(MIXED_PROJECT), MIXED_PROJECT.name);

// ── At random ────────────────────────────────────────────────────────────────

const arbCoordinate = fc.double({ min: -500, max: 500, noNaN: true });
export const arbPoint: fc.Arbitrary<Vec2> = fc.record({ x: arbCoordinate, y: arbCoordinate });

type Step =
  | { readonly kind: 'line'; readonly to: Vec2 }
  | { readonly kind: 'cubic'; readonly c1: Vec2; readonly c2: Vec2; readonly to: Vec2 }
  | {
      readonly kind: 'arc';
      readonly radius: number;
      readonly startAngle: number;
      readonly sweep: number;
    };

const arbStep: fc.Arbitrary<Step> = fc.oneof(
  fc.record({ kind: fc.constant('line' as const), to: arbPoint }),
  fc.record({ kind: fc.constant('cubic' as const), c1: arbPoint, c2: arbPoint, to: arbPoint }),
  fc.record({
    kind: fc.constant('arc' as const),
    radius: fc.oneof(fc.double({ min: 0.2, max: 300, noNaN: true }), fc.constantFrom(12.5, 100)),
    startAngle: fc.double({ min: -Math.PI * 2, max: Math.PI * 2, noNaN: true }),
    sweep: fc.oneof(
      fc.double({ min: 0.05, max: 2 * Math.PI, noNaN: true }),
      fc.double({ min: -2 * Math.PI, max: -0.05, noNaN: true }),
      // Where an arc is hardest to write by its endpoints: half a turn, and all of one.
      fc.constantFrom(Math.PI, -Math.PI, 2 * Math.PI, -2 * Math.PI, Math.PI / 2),
    ),
  }),
);

/** A connected path of random segments, starting anywhere. */
function pathFrom(start: Vec2, steps: readonly Step[]): Path {
  const segments: Segment[] = [];
  let at = start;
  for (const step of steps) {
    if (step.kind === 'line') {
      segments.push(line(at, step.to));
      at = step.to;
    } else if (step.kind === 'cubic') {
      segments.push(cubic(at, step.c1, step.c2, step.to));
      at = step.to;
    } else {
      const centre = {
        x: at.x - step.radius * Math.cos(step.startAngle),
        y: at.y - step.radius * Math.sin(step.startAngle),
      };
      const piece = arc(centre, step.radius, step.startAngle, step.sweep);
      segments.push(piece);
      at = SegmentOps.end(piece);
    }
  }
  return { segments, closed: false };
}

const arbRole = fc.constantFrom<LayerRole>('cut', 'stitch', 'fold', 'mark', 'hardware');

/** One to four random items — lines, arcs (half and whole turns among them) and cubics — in random roles. */
export const arbItems: fc.Arbitrary<ExportPath[]> = fc.array(
  fc
    .tuple(arbRole, arbPoint, fc.array(arbStep, { minLength: 1, maxLength: 4 }))
    .map(([role, start, steps]) => itemOf(role, pathFrom(start, steps))),
  { minLength: 1, maxLength: 4 },
);
