import type {
  CompatibilityRule,
  PlacedThing,
  Problem,
  ProblemCode,
  ProblemFacts,
} from './problem.js';

/**
 * The message catalogue: the one place a problem becomes words.
 *
 * Headless and pure, so the loader, the tools' notices and the React panels
 * all say the same thing. Typed over every code, so a code without a message
 * does not compile.
 *
 * Only `problems/index.ts` may import this file — a dependency-cruiser rule
 * holds it. The rest of the domain produces facts and cannot reach for English.
 */

interface Entry<K extends ProblemCode> {
  /** A few words, for a list row. */
  readonly title: string;
  readonly describe: (facts: ProblemFacts[K]) => string;
}

const COMPATIBILITY: Readonly<Record<CompatibilityRule, string>> = {
  'holes-need-hole-set': 'Only a stitch hole set can follow a stitch line at a pitch.',
  'holes-need-stitch-line': 'Holes can only follow a stitch line.',
  'inset-needs-stitch-line': 'Only a stitch line can be inset from an outline.',
  'inset-needs-outline': 'A stitch line can only be inset from an outline or a cut-out.',
  'allowance-needs-outline': 'Only an outline can be offset outward from a stitch line.',
  'allowance-needs-stitch-line': 'An outline can only be offset outward from a stitch line.',
  'allowance-needs-outer':
    "Only a part's outer outline can be derived from its stitch line, not a cut-out.",
  'allowance-needs-whole-run':
    'A seam allowance follows the whole stitch line, so the outline it makes is closed.',
  'allowance-needs-closed-line':
    'A seam allowance needs a closed stitch line: an outline has to enclose the part.',
};

const CATALOGUE: { readonly [K in ProblemCode]: Entry<K> } = {
  DUPLICATE_ID: {
    title: 'Repeated id',
    describe: (f) => `Two features share the id ${f.featureId}.`,
  },
  SOURCE_MISSING: {
    title: 'Follows nothing',
    describe: (f) => `${f.featureName} follows a feature that does not exist.`,
  },
  FOLLOWS_ITSELF: {
    title: 'Follows itself',
    describe: (f) => `${f.featureName} cannot follow itself.`,
  },
  WOULD_LOOP: {
    title: 'Would loop',
    describe: (f) => `${f.featureName} would end up following itself, through ${f.sourceName}.`,
  },
  CYCLE: {
    title: 'Follows itself',
    describe: (f) => `${f.featureName} follows a chain that leads back to itself.`,
  },
  DERIVATION_INCOMPATIBLE: {
    title: 'Cannot follow that',
    describe: (f) => COMPATIBILITY[f.rule],
  },

  FEATURE_MISSING: {
    title: 'No such feature',
    describe: () => 'That feature does not exist.',
  },
  NOT_DERIVED: {
    title: 'Follows nothing',
    describe: (f) => `${f.featureName} does not follow anything, so there is nothing to re-point.`,
  },
  DERIVED_MOVED_ALONE: {
    title: 'Moves with its source',
    describe: (f) =>
      `${f.featureName} follows ${f.rootName}, so it moves when ${f.rootName} does. ` +
      `Move ${f.rootName} instead.`,
  },
  TRANSFORM_FLATTENS: {
    title: 'Would flatten',
    describe: () => 'That would flatten the shape to nothing.',
  },
  WOULD_BECOME_ELLIPSE: {
    title: 'Would become an ellipse',
    describe: () =>
      'A circle or arc cannot survive a non-uniform scale — it would become an ellipse, which this ' +
      'editor cannot represent. Scale it evenly instead.',
  },
  WOULD_SHEAR: {
    title: 'Would shear',
    describe: () =>
      'A turned rectangle cannot be stretched along one axis — it would shear, and its corners ' +
      'would stop being square. Rotate it back to 0°, or scale it evenly.',
  },
  TEXT_WOULD_DISTORT: {
    title: 'Would distort the letters',
    describe: () =>
      'Text can only be scaled evenly — stretching it along one axis would distort the letters. ' +
      'Hold Shift, or set the size in the panel.',
  },

  TEXT_WOULD_READ_BACKWARDS: {
    title: 'Would read backwards',
    describe: () =>
      'A label cannot be mirrored — it would read backwards. Flip the shapes and leave the words, ' +
      'or retype them where you want them.',
  },

  NO_TARGET_PART: {
    title: 'No part selected',
    describe: (f) => `Select a part first — ${aThing(f.what)} belongs to the panel it is drawn on.`,
  },
  TARGET_SPANS_PARTS: {
    title: 'Selection spans parts',
    describe: () =>
      'Select one part: this belongs to a single panel, and the selection spans more than one.',
  },

  PARAMETER_INVALID: {
    title: 'Unusable number',
    describe: (f) => {
      const owner = `${f.featureName}'s ${f.parameter}`;
      switch (f.requirement) {
        case 'finite':
          return `${owner} is not a usable number. Type a value in millimetres.`;
        case 'positive':
          return `${owner} is ${formatNumber(f.value)}, and it must be more than zero.`;
        case 'non-negative':
          return `${owner} is ${formatNumber(f.value)}, and it must not be negative.`;
      }
    },
  },
  OFFSET_COLLAPSED: {
    title: 'Offset collapsed',
    describe: (f) =>
      f.side === 'inward'
        ? `A ${String(f.distanceMm)} mm inset is deeper than this outline can hold.`
        : `A ${String(f.distanceMm)} mm allowance cannot be built outside this stitch line.`,
  },
  OFFSET_UNSUPPORTED: {
    title: 'Cannot offset curves',
    describe: (f) =>
      `${f.featureName} cannot be built: what it follows has free-form curves, and an offset ` +
      'cannot follow those yet.',
  },
  OFFSET_SPLIT: {
    title: 'Offset came apart',
    describe: (f) =>
      `The offset for ${f.featureName} came apart into ${String(f.droppedPieces + 1)} pieces. ` +
      `Only the largest is drawn; ${plural(f.droppedPieces, 'piece')} left out.`,
  },
  ANCHOR_MISSING: {
    title: 'Corner not found',
    describe: (f) =>
      f.available < 1
        ? 'This outline has no corners to run between, so it can only be followed whole.'
        : `That run named corner ${String(f.anchor)}, and this outline has ${String(f.available)}.`,
  },
  SOURCE_FAILED: {
    title: 'Source failed',
    describe: (f) => `The ${f.sourceName} it follows could not be built.`,
  },
  GEOMETRY_FAILED: {
    title: 'Could not be built',
    describe: (f) => `${f.featureName} could not be built (${f.detail}).`,
  },

  TEXT_GLYPH_MISSING: {
    title: 'Cannot be printed',
    describe: (f) =>
      `“${f.text}” uses ${f.characters}, which this typeface cannot print — it comes out as a ` +
      `box. ${f.featureId === undefined ? 'Rename the part' : 'Retype the label'} using Latin ` +
      'characters.',
  },

  CONTOUR_SELF_INTERSECTS: {
    title: 'Outline crosses itself',
    describe: (f) =>
      `${f.featureName} crosses itself ${f.crossings < 2 ? 'once' : `${String(f.crossings)} times`}, ` +
      'so where to cut is ambiguous. Redraw it so the line never crosses.',
  },
  HOLE_SPACING_DEVIATION: {
    title: 'Spacing off the iron',
    describe: (f) =>
      `The spacing came out ${f.achievedMm.toFixed(2)} mm against a ${f.pitchMm.toFixed(2)} mm ` +
      'iron. Change the pitch, or the inset, to bring them together.',
  },
  HOLE_SPACING_UNEVEN: {
    title: 'Uneven spacing',
    describe: (f) =>
      `The runs of ${f.featureName} are spaced from ${f.narrowestMm.toFixed(2)} mm to ` +
      `${f.widestMm.toFixed(2)} mm, so the change will show at the corners.`,
  },
  HOLE_COUNT_TOO_LOW: {
    title: 'Too few holes',
    describe: (f) =>
      `${f.featureName} has ${f.count < 1 ? 'no holes' : plural(f.count, 'hole')}, ` +
      'and a seam needs at least two.',
  },
  EMPTY_PART: {
    title: 'Empty part',
    describe: (f) =>
      `${f.partName} has nothing in it. Draw into it, or remove it from the parts list.`,
  },
};

/** The sentence for a problem. */
export function describeProblem(p: Problem): string {
  // The union of entries cannot be narrowed by `p.code` alone; the catalogue's
  // mapped type is what guarantees this entry takes these facts.
  const entry = CATALOGUE[p.code] as Entry<ProblemCode>;
  return entry.describe(p.facts as never);
}

/** A few words naming the kind of problem, for a list. */
export function problemTitle(code: ProblemCode): string {
  return CATALOGUE[code].title;
}

/**
 * The sentence, prefixed with its subject's name when it does not already say
 * it.
 *
 * For a surface with no other way to show which feature is meant — the loader's
 * error, where a file can hold dozens.
 */
export function describeProblemWithSubject(p: Problem): string {
  const sentence = describeProblem(p);
  const facts = p.facts as Partial<Record<'featureName' | 'partName', string>>;
  const name = facts.featureName ?? facts.partName;
  return name === undefined || sentence.includes(name) ? sentence : `${name}: ${sentence}`;
}

/** Counts only, so the plural turns on "more than one" rather than an equality. */
function aThing(what: PlacedThing): string {
  return what === 'label' ? 'a label' : 'a fold or marking line';
}

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count > 1 ? 's' : ''}`;
}

/** Enough precision to recognise a typed value, without float noise. */
function formatNumber(value: number): string {
  return String(Math.round(value * 10_000) / 10_000);
}
