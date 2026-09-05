import type { Mm, Radians, Ulid } from '@leathercad/core';
import type { CornerRadii, Path, Vec2 } from '@leathercad/geometry';

import type { LayerRole } from './layerRole.js';

export type FeatureId = Ulid;
export type PartId = Ulid;

/**
 * A parametric primitive.
 *
 * Stored as parameters rather than as a path, because the user edits it by
 * typing 105, not by dragging control points — and because regenerating it
 * means an improved shape constructor improves every existing file. The path
 * itself is produced on evaluation and never persisted.
 *
 * Lives here rather than in `packages/geometry` deliberately: if parametric
 * shapes were geometry types, every algorithm in the engine would need a case
 * for each one. See docs/geometry.md §4.6.
 */
export type ParametricShape =
  | {
      readonly type: 'rect';
      readonly origin: Vec2;
      readonly width: Mm;
      readonly height: Mm;
      readonly radii: CornerRadii;
      /**
       * Turn about the rectangle's own centre. Zero for an unrotated panel.
       *
       * `rect` had no angle until slice 3.7, which made a rotated rectangle as
       * unrepresentable as a non-uniformly scaled arc — and rotating a strap is
       * not an exotic thing to want. `domain-model.md` already gives `ellipse`
       * and `polygon` a rotation and never gives one to `rect`, which reads as
       * an oversight rather than a decision.
       */
      readonly rotation: Radians;
    }
  | { readonly type: 'circle'; readonly centre: Vec2; readonly radius: Mm }
  /**
   * Mirrors `ArcSegment` field for field, including the **sweep** rather than
   * an end angle: an end angle alone does not say which way round the circle
   * the arc travelled, and for a three-point arc that is the whole question.
   */
  | {
      readonly type: 'arc';
      readonly centre: Vec2;
      readonly radius: Mm;
      readonly startAngle: Radians;
      readonly sweepAngle: Radians;
    };

/**
 * How a derived feature is built from the one it follows.
 *
 * One source, one operation. The chain in this product is two links deep —
 * cut contour, stitch line, holes — so this is a linked list, not a graph, and
 * there is deliberately no array of sources reserved "for later". A genuinely
 * two-input derivation is a new variant, and adding it then costs less than
 * carrying the generality now.
 */
export type Derivation =
  | {
      readonly type: 'offset';
      readonly distanceMm: Mm;
      readonly side: 'inward' | 'outward';
      readonly run: Run;
    }
  | {
      readonly type: 'stitch-holes';
      /**
       * Nominal, from the iron. The **value** is stored rather than a preset
       * id, so a file opens identically on a machine that has never heard of
       * the author's iron library. The achieved spacing is derived.
       */
      readonly pitchMm: Mm;
      readonly mode: 'fit-whole' | 'exact-pitch';
      readonly corners: 'continuous' | 'hole-at-corner';
      readonly startOffsetMm?: Mm;
      readonly endOffsetMm?: Mm;
      /** Cosmetic, so the panel can say "KS Blade 3.85". Never read as geometry. */
      readonly ironLabel?: string;
    };

/**
 * Which part of the source is used.
 *
 * Anchors, not segment indices. `roundedRect` emits a variable number of
 * segments — a zero radius omits the corner arc — so an index-based run would
 * silently move to different edges when a radius changed, and silent wrongness
 * on a pattern about to be cut from leather is the worst failure this can
 * produce. Anchors are defined by the shape's parameters, so a rectangle has
 * four corners whatever its radii.
 */
export type Run =
  | { readonly kind: 'whole' }
  | { readonly kind: 'between'; readonly fromAnchor: number; readonly toAnchor: number };

/**
 * Where a feature's geometry comes from.
 *
 * The `offset` and `mirror` cases are the heart of the product — a stitch line
 * is not a copy of the cut line, it is the *relationship* "3.5 mm inside the
 * edge", so changing the outline updates it. Both arrive with the derivation
 * graph in slice 4.2; `offset` additionally needs Clipper (slice 1.9).
 *
 * See docs/domain-model.md §4.
 */
export type GeometrySource =
  /** Drawn freehand. The only kind persisted as coordinates. */
  | { readonly kind: 'path'; readonly path: Path }
  | { readonly kind: 'shape'; readonly shape: ParametricShape }
  /** Built from another feature, and rebuilt whenever that one changes. */
  | { readonly kind: 'derived'; readonly sourceId: FeatureId; readonly op: Derivation };

export interface FeatureBase {
  readonly id: FeatureId;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly source: GeometrySource;
}

/** The outline actually cut from the leather. */
export interface CutContour extends FeatureBase {
  readonly kind: 'cut-contour';
  /**
   * A part has exactly one outer contour; inner ones are windows, card slots
   * and cut-outs.
   */
  readonly role: 'outer' | 'inner';
}

/** Where the thread runs, normally set in 3-4 mm from the edge. */
export interface StitchLine extends FeatureBase {
  readonly kind: 'stitch-line';
}

/** Where the leather bends rather than being cut. */
export interface FoldLine extends FeatureBase {
  readonly kind: 'fold-line';
  readonly direction: 'mountain' | 'valley';
  /**
   * Stored now though nothing consumes it yet: it costs nothing, and it is
   * what makes thickness compensation an additive change rather than a
   * migration. See docs/domain-model.md §3.4.
   */
  readonly materialThicknessMm?: Mm;
}

/**
 * Where the awl goes.
 *
 * Derived from a stitch line and never persisted as points: the file holds the
 * pitch and the policy, and evaluation recomputes the hundreds of holes.
 */
export interface StitchHoleSet extends FeatureBase {
  readonly kind: 'stitch-hole-set';
}

/** A printed guide — glue areas, alignment, logo placement. Never cut. */
export interface MarkingLine extends FeatureBase {
  readonly kind: 'marking-line';
  readonly purpose: 'glue-area' | 'alignment' | 'logo' | 'skive' | 'other';
}

export type Feature = CutContour | StitchLine | StitchHoleSet | FoldLine | MarkingLine;
export type FeatureKind = Feature['kind'];

/** One physical piece of leather to be cut out. */
export interface Part {
  readonly id: PartId;
  readonly name: string;
  readonly quantity: number;
  readonly features: readonly Feature[];
}

export interface ProjectSettings {
  readonly gridSpacingMm: Mm;
  readonly defaultStitchInsetMm: Mm;
  readonly defaultIronPitchMm: Mm;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  gridSpacingMm: 1,
  defaultStitchInsetMm: 3.5,
  defaultIronPitchMm: 3.85,
};

export interface Project {
  readonly id: Ulid;
  readonly name: string;
  readonly settings: ProjectSettings;
  readonly parts: readonly Part[];
}

/** The layer role a feature kind belongs to. One kind, one role, always. */
export function roleOf(feature: Feature): LayerRole {
  switch (feature.kind) {
    case 'cut-contour':
      return 'cut';
    case 'stitch-line':
      return 'stitch';
    case 'stitch-hole-set':
      return 'stitch-holes';
    case 'fold-line':
      return 'fold';
    case 'marking-line':
      return 'mark';
  }
}

export function isCutContour(feature: Feature): feature is CutContour {
  return feature.kind === 'cut-contour';
}

/** Every feature in the project, with the part it belongs to. */
export function* eachFeature(project: Project): Generator<{ part: Part; feature: Feature }> {
  for (const part of project.parts) {
    for (const feature of part.features) yield { part, feature };
  }
}

export function findFeature(
  project: Project,
  id: FeatureId,
): { part: Part; feature: Feature } | null {
  for (const entry of eachFeature(project)) {
    if (entry.feature.id === id) return entry;
  }
  return null;
}

export function findPart(project: Project, id: PartId): Part | null {
  return project.parts.find((p) => p.id === id) ?? null;
}
