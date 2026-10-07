import { quantise } from '@leathercad/core';
import { describe, expect, it } from 'vitest';

import { distributeAlongPath } from './ops/distribute.js';
import { offsetPath } from './ops/offset.js';
import { closed, length, measure, polyline, type Path } from './path/index.js';
import { arc, cubic, end, line, start, type Segment } from './segment/index.js';
import { arcThroughPoints, rect, roundedRect } from './shapes.js';
import { vec, type Vec2 } from './vec2.js';

/**
 * Golden fixtures: the stitch lines and holes this engine produces for real
 * pieces of leatherwork, committed under `packages/geometry/__golden__/`.
 *
 * Properties say what must hold of every answer; a golden says what the answer
 * *was*, so that an algorithm change which moves a hole is seen, read and
 * explained rather than shipped. See docs/testing.md §11 for how to read and
 * update them.
 *
 * Every number is millimetres rounded to the model's 0.1 µm grid (`quantise`),
 * so float noise in the last bits never churns a file — even an arc's sweep,
 * written as its length along the arc, signed like the sweep.
 */

/** A stitch line is normally set in 3–4 mm from the edge (docs/glossary.md). */
const MARGINS_MM = [3, 4] as const;

/** Two common pricking irons. 3.85 mm is the app's default pitch. */
const IRONS_MM = [3, 3.85] as const;

type Xy = readonly [number, number];

const xy = (p: Vec2): Xy => [quantise(p.x), quantise(p.y)];

function segmentRecord(s: Segment): object {
  switch (s.kind) {
    case 'line':
      return { line: [xy(s.a), xy(s.b)] };
    case 'arc':
      return {
        arc: [xy(start(s)), xy(end(s))],
        centre: xy(s.centre),
        radius: quantise(s.radius),
        sweepMm: quantise(s.radius * s.sweepAngle),
      };
    case 'cubic':
      return { cubic: [xy(s.p0), xy(s.p1), xy(s.p2), xy(s.p3)] };
  }
}

/** Holes along a stitch line, as the app places them by default: fit-whole. */
function stitchLineRecord(stitchLine: Path): object {
  const along = measure(stitchLine);
  return {
    lengthMm: quantise(length(stitchLine)),
    segments: stitchLine.segments.map(segmentRecord),
    irons: IRONS_MM.map((pitchMm) => {
      const { points, actualPitch } = distributeAlongPath(along, {
        mode: 'fit-whole',
        pitchMm,
        closed: stitchLine.closed,
      });
      return {
        pitchMm,
        holes: points.length,
        spacingMm: quantise(actualPitch),
        at: points.map((p) => xy(p.point)),
      };
    }),
  };
}

/**
 * Every piece the offset produced — none when it gave nothing back, a collapse
 * or a join Tier 1 cannot make — or `'refused'` where it throws rather than
 * guess: a cubic (docs/geometry.md §6.2).
 */
function offsetRecord(
  p: Path,
  distanceMm: number,
  each: (piece: Path) => object,
): object[] | 'refused' {
  try {
    return offsetPath(p, distanceMm, { join: 'round' }).map(each);
  } catch (e) {
    if (e instanceof RangeError) return 'refused';
    throw e;
  }
}

const cutLineRecord = (cutLine: Path): object => ({
  lengthMm: quantise(length(cutLine)),
  segments: cutLine.segments.map(segmentRecord),
});

/**
 * An outline stitched inside itself: the stitch inset, derived. Every outline
 * here runs counter-clockwise, or is an open run with the leather on its left,
 * so inward is a positive offset (docs/geometry.md §6.4).
 */
const inset = (outline: Path, margins: readonly number[] = MARGINS_MM): object => ({
  lengthMm: quantise(length(outline)),
  insets: margins.map((marginMm) => ({
    marginMm,
    stitchLines: offsetRecord(outline, marginMm, stitchLineRecord),
  })),
});

/** A stitch line drawn by hand, holes on it, and the seam allowance cut outside it. */
const drawn = (stitchLine: Path): object => ({
  stitchLine: stitchLineRecord(stitchLine),
  allowances: MARGINS_MM.map((marginMm) => ({
    marginMm,
    cutLines: offsetRecord(stitchLine, -marginMm, cutLineRecord),
  })),
});

/**
 * The sample project's 95 × 60 mm card pocket, its top edge cut for a thumb:
 * scooped with an arc, as the sample has it, or notched with a V.
 */
function pocket(thumb: 'scoop' | 'notch'): Path {
  const cut = [vec(63, 60), vec(47.5, 48), vec(32, 60)] as const;
  return closed([
    ...polyline([vec(0, 0), vec(95, 0), vec(95, 60), vec(63, 60)]).segments,
    ...(thumb === 'scoop' ? arcThroughPoints(...cut) : polyline(cut)).segments,
    ...polyline([vec(32, 60), vec(0, 60), vec(0, 0)]).segments,
  ]);
}

/** An 80 × 60 mm pouch front, its bottom corners rounded and its flap a curve. */
function curvedFlap(): Path {
  const quarter = Math.PI / 2;
  return closed([
    line(vec(10, 0), vec(70, 0)),
    arc(vec(70, 10), 10, -quarter, quarter),
    line(vec(80, 10), vec(80, 60)),
    cubic(vec(80, 60), vec(60, 85), vec(20, 85), vec(0, 60)),
    line(vec(0, 60), vec(0, 10)),
    arc(vec(10, 10), 10, Math.PI, quarter),
  ]);
}

/**
 * The corpus. What each one is for is in its description, which the file
 * carries too, so a reviewer reading a diff knows what the shape was.
 */
const CORPUS: readonly { name: string; shape: string; golden: () => object }[] = [
  {
    name: 'wallet-panel',
    shape: 'A wallet panel: 105 × 75 mm, 8 mm corners. Arcs stay arcs, 3 and 4 mm smaller',
    golden: () => inset(roundedRect(vec(0, 0), 105, 75, 8)),
  },
  {
    name: 'small-corner-panel',
    shape:
      'A panel with 3 mm corners, inset 3 and 4 mm: the offset consumes every corner arc, ' +
      'leaving sharp corners (docs/geometry.md §6.2)',
    golden: () => inset(roundedRect(vec(0, 0), 100, 60, 3)),
  },
  {
    name: 'strap',
    shape:
      'A 150 × 20 mm strap with fully rounded ends. A 10 mm inset is its inradius: ' +
      'the stitch line collapses to nothing',
    golden: () => inset(roundedRect(vec(0, 0), 150, 20, 10), [...MARGINS_MM, 10]),
  },
  {
    name: 'card-pocket-seam',
    shape:
      'Three sides of a 95 × 60 mm card pocket, the most common seam there is: an open run ' +
      'whose ends simply end, and whose sharp corners are trimmed',
    golden: () => inset(polyline([vec(0, 60), vec(0, 0), vec(95, 0), vec(95, 60)])),
  },
  {
    name: 'thumb-notch-pocket',
    shape:
      'The card pocket with a V cut for the thumb: a concave corner at the bottom of the V, ' +
      'bridged with an arc, and two sharp tips where it meets the top edge, trimmed',
    golden: () => inset(pocket('notch')),
  },
  {
    name: 'thumb-scoop-pocket',
    shape:
      "The sample project's card pocket, scooped for a thumb. The scoop meets the top edge at " +
      'two sharp tips, where an inset would trim an arc against a line, which Tier 1 cannot ' +
      'do: no stitch line comes back (docs/geometry.md §6.2). The sample draws its stitch line',
    golden: () => inset(pocket('scoop')),
  },
  {
    name: 'drawn-stitch-line',
    shape:
      'A 90 × 55 mm stitch line drawn by hand, its holes, and the seam allowance cut ' +
      '3 and 4 mm outside it, its corners bridged with arcs',
    golden: () => drawn(rect(vec(0, 0), 90, 55)),
  },
  {
    name: 'curved-flap',
    shape:
      'An 80 × 60 mm pouch front drawn as its own stitch line, with arcs and a cubic: holes ' +
      'follow the curve, and the allowance is refused, because a cubic has no exact offset',
    golden: () => drawn(curvedFlap()),
  },
];

/**
 * Two-space JSON, with each point — and each line's or arc's pair of ends —
 * kept on one line, so a moved hole is a one-line diff. `\n` line endings
 * everywhere: `.gitattributes` keeps them on a Windows checkout too.
 */
function serialise(value: object): string {
  const json = JSON.stringify(value, null, 2)
    .replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1, $2]')
    .replace(/\[\s+(\[[^\]]+\]),\s+(\[[^\]]+\])\s+\]/g, '[$1, $2]');
  return `${json}\n`;
}

describe('golden geometry', () => {
  it.each(CORPUS)('$name', async ({ name, shape, golden }) => {
    await expect(serialise({ shape, ...golden() })).toMatchFileSnapshot(
      `../__golden__/${name}.json`,
    );
  });
});
