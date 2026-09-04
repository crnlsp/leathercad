import { PathOps, Shapes, type Vec2 } from '@leathercad/geometry';
import { dotsItem, pathItem, textItem, type DisplayList } from '@leathercad/render';

/**
 * A demonstration scene built from real geometry.
 *
 * Every millimetre here comes out of `@leathercad/geometry` — nothing is
 * hand-placed in pixels. It exists so the coordinate system can be checked by
 * eye against the rulers before any of it is wired to a document.
 *
 * Replaced by the real document in Phase 4. See docs/roadmap.md.
 */

const CARD_HOLDER = { width: 105, height: 75, radius: 8 };
const STITCH_INSET = 3.5;
const IRON_PITCH_MM = 3.85;

export interface SceneReport {
  readonly perimeterMm: number;
  readonly stitchLengthMm: number;
  readonly holeCount: number;
  readonly achievedPitchMm: number;
}

export function buildDemoScene(): { list: DisplayList; report: SceneReport } {
  const origin: Vec2 = { x: 0, y: 0 };

  const outline = Shapes.roundedRect(
    origin,
    CARD_HOLDER.width,
    CARD_HOLDER.height,
    CARD_HOLDER.radius,
  );

  // The inward offset of a rounded rectangle is exactly another rounded
  // rectangle, so this is analytic rather than approximated. The general
  // offset — needed for any other shape — arrives with Clipper in slice 1.9.
  const stitchLine = Shapes.roundedRect(
    { x: origin.x + STITCH_INSET, y: origin.y + STITCH_INSET },
    CARD_HOLDER.width - STITCH_INSET * 2,
    CARD_HOLDER.height - STITCH_INSET * 2,
    CARD_HOLDER.radius - STITCH_INSET,
  );

  // Fit-whole: round to the nearest whole number of holes so the run closes
  // evenly, rather than leaving a ragged gap at the seam.
  const measure = new PathOps.PathMeasure(stitchLine);
  const stitchLengthMm = measure.totalLength();
  const holeCount = Math.max(2, Math.round(stitchLengthMm / IRON_PITCH_MM));
  const achievedPitchMm = stitchLengthMm / holeCount;
  const holes = Array.from({ length: holeCount }, (_, i) =>
    measure.pointAtDistance(achievedPitchMm * i),
  );

  // A 100 mm reference square: the whole product promise, measurable against
  // the rulers with nothing else involved.
  const reference = Shapes.rect({ x: 0, y: -120 }, 100, 100);

  return {
    list: {
      items: [
        pathItem('construction', reference),
        textItem('annotation', { x: 0, y: -128 }, '100 × 100 mm reference'),

        pathItem('cut', outline),
        pathItem('stitch', stitchLine),
        dotsItem('stitch-holes', holes, 2.2),

        textItem('annotation', { x: 0, y: 80 }, 'Card holder — 105 × 75 mm, 8 mm corners'),
        textItem(
          'annotation',
          { x: 0, y: -8 },
          `stitch line inset ${STITCH_INSET} mm · ${holeCount} holes at ${achievedPitchMm.toFixed(3)} mm`,
        ),
      ],
    },
    report: {
      perimeterMm: PathOps.length(outline),
      stitchLengthMm,
      holeCount,
      achievedPitchMm,
    },
  };
}

/** Millimetre bounds of the demo content, for fit-to-content on first paint. */
export function demoBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
  return { minX: -10, minY: -135, maxX: 115, maxY: 90 };
}
