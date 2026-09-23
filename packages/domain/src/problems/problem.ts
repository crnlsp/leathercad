import type { Mm } from '@leathercad/core';
import type { Path, Vec2 } from '@leathercad/geometry';

import type { FeatureId, PartId } from '../feature.js';

/**
 * What the domain knows about something being wrong — as facts, never as a
 * sentence.
 *
 * A problem carries the names and numbers a message needs, and nothing a
 * surface decides: no wording, no colour, no icon. That is what lets the same
 * problem be a status-bar notice, a row in the problems panel and a loader
 * error, and what lets a test assert `{ code: 'OFFSET_COLLAPSED', facts: {
 * distanceMm: 60 } }` and survive every rewording.
 *
 * Sentences live in `messages.ts`, and a dependency rule keeps every other
 * domain module from reaching them. See
 * docs/superpowers/specs/2026-09-15-diagnostic-channel-design.md.
 */

export type Severity = 'error' | 'warning' | 'info';

/**
 * The feature a problem is about, named as it was when the problem was found.
 *
 * A name is the user's data rather than presentation, and capturing it here
 * means a message never needs the project to look it up in.
 */
interface About {
  readonly featureId: FeatureId;
  readonly featureName: string;
}

/** What a tool was about to put on a part. */
export type PlacedThing = 'line' | 'label' | 'cut-out';

/** The row of the derivation compatibility table (domain-model.md §4.2) that refused. */
export type CompatibilityRule =
  | 'holes-need-hole-set'
  | 'holes-need-stitch-line'
  | 'inset-needs-stitch-line'
  | 'inset-needs-outline'
  | 'allowance-needs-outline'
  | 'allowance-needs-stitch-line'
  | 'allowance-needs-outer'
  | 'allowance-needs-whole-run'
  | 'allowance-needs-closed-line'
  | 'mirror-keeps-kind'
  | 'mirror-keeps-role';

/**
 * Every problem code, and the facts it carries.
 *
 * The keys of this map *are* the set of codes: `PROBLEM_CODES` and the message
 * catalogue are both typed over it, so a code added here without a
 * registration or a message does not compile.
 */
export interface ProblemFacts {
  // ——— Structural (S): refused by commands and the loader ———
  readonly DUPLICATE_ID: { readonly featureId: FeatureId };
  readonly SOURCE_MISSING: About;
  readonly FOLLOWS_ITSELF: About;
  readonly WOULD_LOOP: About & { readonly sourceId: FeatureId; readonly sourceName: string };
  readonly CYCLE: About;
  readonly DERIVATION_INCOMPATIBLE: About & { readonly rule: CompatibilityRule };
  /** S5: a part is one piece of leather, so it has one edge. */
  readonly PART_ALREADY_HAS_OUTER: About & {
    readonly partName: string;
    readonly outerName: string;
  };
  /**
   * S6: an outline or a cut-out has to enclose an area to be cut out.
   *
   * Raised by the loader about a feature, and by a drawing mode about one the
   * user is in the middle of drawing — which does not exist yet, and so has no
   * id.
   */
  readonly CONTOUR_NOT_CLOSED: {
    readonly featureId?: FeatureId;
    readonly featureName: string;
    readonly role: 'outer' | 'inner';
    /**
     * Whether closing it is a correction the user can actually make.
     *
     * A run of points can be closed; an arc has two ends and always will, so
     * telling its author to "close the shape" is advice nothing accepts —
     * the same defect as sending someone to draw a second outline. False only
     * where the shape itself cannot enclose anything.
     */
    readonly closable: boolean;
  };
  /** S7: a locked feature changes only by being unlocked. */
  readonly FEATURE_LOCKED: About;
  /** S2: the fold a mirror is folded about has to exist. */
  readonly MIRROR_FOLD_MISSING: About & { readonly foldId: FeatureId };
  /** S2: a dimension names two places, and both have to exist. */
  readonly MEASURE_REF_MISSING: About;
  /** S5: a part has one edge, so its outline cannot be mirrored into itself. */
  readonly MIRROR_OUTLINE_ACROSS_FOLD: About & { readonly partName: string };

  // ——— Interaction (X): refused at a gesture ———
  readonly FEATURE_MISSING: { readonly featureId: FeatureId };
  readonly NOT_DERIVED: About;
  readonly DERIVED_MOVED_ALONE: About & { readonly rootId: FeatureId; readonly rootName: string };
  /**
   * X3: a counterpart is the size of its original.
   *
   * Its placement is a reflection and a slide, which can say where a piece is
   * but not how big — so a scale has no parameter to land in, and is refused
   * rather than quietly dropped.
   */
  readonly MIRROR_WOULD_SCALE: About & { readonly sourceName: string };
  /** X3: nothing to take a mirror axis from. */
  readonly MIRROR_NO_AXIS: Record<string, never>;
  /**
   * X3: a dimension end needs a durable place, and this is not one.
   *
   * Empty space, a point along an edge, a grid position — none of them survive
   * the drawing changing, so a dimension to one would read as authoritative
   * while quietly going stale (ADR 0010).
   */
  readonly MEASURE_NEEDS_ANCHOR: Record<string, never>;
  /**
   * X3: a fold-tracked counterpart is placed by its fold, not by dragging.
   *
   * The general rule this is the first instance of: dragging a derived, linked
   * result must not silently break or half-alter the relationship. Absorbing
   * the drag would slide one half of a folded piece along the spine; silently
   * detaching from the fold would break the link the maker asked for (X3). So
   * it is refused, and the message names the two things that do move it.
   */
  readonly MIRROR_PLACED_BY_FOLD: About & {
    readonly foldName: string;
    readonly sourceName: string;
  };
  readonly TRANSFORM_FLATTENS: Record<string, never>;
  readonly WOULD_BECOME_ELLIPSE: { readonly shape: 'circle' | 'arc' };
  readonly WOULD_SHEAR: Record<string, never>;
  readonly TEXT_WOULD_DISTORT: Record<string, never>;
  readonly TEXT_WOULD_READ_BACKWARDS: Record<string, never>;
  /** `what` is the thing being placed, so one code serves every tool. */
  readonly NO_TARGET_PART: { readonly what: PlacedThing };
  readonly TARGET_SPANS_PARTS: { readonly what: PlacedThing };

  // ——— Evaluation outcomes (E): a feature that did not resolve ———
  readonly PARAMETER_INVALID: About & {
    readonly parameter: string;
    readonly value: number;
  } & (
      | { readonly requirement: 'finite' | 'positive' | 'non-negative' }
      /** Under a floor the editor enforces too — a pitch finer than any iron (5.6). */
      | { readonly requirement: 'at-least'; readonly minimum: Mm }
    );
  readonly OFFSET_COLLAPSED: About & {
    readonly distanceMm: Mm;
    readonly side: 'inward' | 'outward';
  };
  readonly OFFSET_UNSUPPORTED: About;
  readonly OFFSET_SPLIT: About & { readonly droppedPieces: number };
  readonly ANCHOR_MISSING: About & { readonly anchor: number; readonly available: number };
  readonly SOURCE_FAILED: About & { readonly sourceId: FeatureId; readonly sourceName: string };
  readonly GEOMETRY_FAILED: About & { readonly detail: string };
  /** E1: a bent or curved fold has no single line to mirror about. */
  readonly FOLD_NOT_STRAIGHT: Record<string, never>;
  /**
   * Text the vendored typeface cannot print: a part's name, or a label's own
   * words. The feature is named when there is one, so the panel can point at
   * the label rather than at the part it sits on.
   */
  readonly TEXT_GLYPH_MISSING: {
    readonly partId: PartId;
    readonly partName: string;
    readonly featureId?: FeatureId;
    readonly featureName?: string;
    readonly text: string;
    /** The distinct characters with no glyph, in the order they appear. */
    readonly characters: string;
  };

  // ——— Design rules (DR): legal, and probably wrong for leather ———
  readonly CONTOUR_SELF_INTERSECTS: About & { readonly crossings: number };
  readonly HOLE_SPACING_DEVIATION: About & { readonly achievedMm: Mm; readonly pitchMm: Mm };
  readonly HOLE_SPACING_UNEVEN: About & { readonly narrowestMm: Mm; readonly widestMm: Mm };
  readonly HOLE_COUNT_TOO_LOW: About & { readonly count: number };
  readonly EMPTY_PART: { readonly partId: PartId; readonly partName: string };
  readonly PART_HAS_NO_OUTER_CONTOUR: { readonly partId: PartId; readonly partName: string };
  readonly CUT_OUT_OUTSIDE_PART: About;
  readonly OUTSIDE_PART: About & { readonly what: 'holes' | 'line' };
  readonly HOLE_TOO_CLOSE_TO_EDGE: About & {
    /** The nearest edge, in millimetres. */
    readonly clearanceMm: Mm;
    readonly minimumMm: Mm;
  };
}

export type ProblemCode = keyof ProblemFacts;

/** A problem: one code, and exactly the facts that code carries. */
export type Problem<K extends ProblemCode = ProblemCode> = {
  [C in K]: { readonly code: C; readonly facts: ProblemFacts[C] };
}[K];

export function problem<K extends ProblemCode>(code: K, facts: ProblemFacts[K]): Problem<K> {
  return { code, facts } as Problem<K>;
}

/**
 * Where on the design a problem is, in millimetres.
 *
 * Domain information, not a drawing instruction: whether a location becomes a
 * dashed outline, a dot, or somewhere to zoom to is a surface's decision.
 */
export type ProblemLocation =
  /** Where an outline crosses itself. */
  | { readonly kind: 'points'; readonly points: readonly Vec2[] }
  /** The geometry a failure is about — what a failed feature was being built from. */
  | { readonly kind: 'path'; readonly path: Path };

/**
 * A problem found in the design, placed in it.
 *
 * Only outcomes and rules become diagnostics. A structural or interaction
 * problem is refused where it happens and never exists in a document to be
 * listed (ADR 0013).
 */
export interface Diagnostic {
  readonly problem: Problem;
  readonly severity: Severity;
  readonly partId: PartId;
  /** Absent for a problem with a whole part, such as `EMPTY_PART`. */
  readonly featureId?: FeatureId;
  /** Other features the problem involves: what a `SOURCE_FAILED` follows. */
  readonly related: readonly FeatureId[];
  readonly location?: ProblemLocation;
}

/** The feature or part a problem is about, when it is about one. */
export function subjectOf(p: Problem): {
  readonly featureId?: FeatureId;
  readonly partId?: PartId;
} {
  const facts = p.facts as Partial<Record<'featureId' | 'partId', string>>;
  if (facts.featureId !== undefined) return { featureId: facts.featureId };
  if (facts.partId !== undefined) return { partId: facts.partId };
  return {};
}

/**
 * The identity of one occurrence: code, subject, and — for a code that can
 * occur twice on one subject — what tells the two apart.
 *
 * What `followRefusal` diffs to find a problem a re-point would introduce, what
 * React keys a list by, and what a suppression list would store.
 */
export function problemKey(p: Problem): string {
  const subject = subjectOf(p);
  const base = `${p.code}:${subject.featureId ?? subject.partId ?? ''}`;
  return p.code === 'DERIVATION_INCOMPATIBLE' ? `${base}:${p.facts.rule}` : base;
}

/**
 * Whether two problems say the same thing.
 *
 * A tool is asked for its notice on every pointer move and builds a fresh
 * problem each time. Comparing by value is what stops the status bar
 * re-rendering sixty times a second for an unchanged refusal. Facts are flat,
 * so this is a shallow comparison; `Object.is` compares identity, not
 * measurement — a fact that differs in the last bit is simply a new notice.
 */
export function sameProblem(a: Problem | null, b: Problem | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.code !== b.code) return false;

  const fa = a.facts as Readonly<Record<string, unknown>>;
  const fb = b.facts as Readonly<Record<string, unknown>>;
  const keys = Object.keys(fa);
  if (keys.length !== Object.keys(fb).length) return false;
  return keys.every((key) => Object.is(fa[key], fb[key]));
}
