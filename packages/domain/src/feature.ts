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
    }
  | {
      /**
       * A counterpart that stays matched: the source, reflected and placed.
       *
       * The axis and the glide are the **only** things the counterpart owns —
       * everything about *what* it is comes from its source. Together they
       * express every orientation-reversing isometry, which is why any move or
       * turn of a counterpart can be absorbed back into them and none is ever
       * refused for want of a way to say it ([ADR 0012](../../../docs/adr/0012-mirror-is-a-derivation.md)).
       *
       * The axis is **absolute, in world millimetres, and does not track the
       * source**. An axis that chased the source's bounding box would jump
       * whenever the source's geometry changed, moving the counterpart by
       * twice as much for reasons nobody could see. Fixed, the rule is one
       * sentence: the counterpart is the source reflected in that line.
       */
      readonly type: 'mirror';
      readonly axis: {
        readonly origin: Vec2;
        /** Normalised to `[0, π)`: a line at θ and θ + π is the same line. */
        readonly angleRad: Radians;
      };
      /** How far along the axis, after reflecting. Signed against `angleRad`. */
      readonly glideMm: Mm;
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
 * edge", so changing the outline updates it. `offset` arrived with the
 * derivation graph in slice 4.2, offset analytically by `packages/geometry`'s
 * own Tier 1; `mirror` is slice 4.8. There is no Clipper binding and will not
 * be one ([ADR 0008](../../../docs/adr/0008-no-clipper-binding.md)) — Tier 2
 * is slice 9.11, written here rather than bought.
 *
 * See docs/domain-model.md §4.
 */
export type GeometrySource =
  /** Drawn freehand. The only kind persisted as coordinates. */
  | { readonly kind: 'path'; readonly path: Path }
  | { readonly kind: 'shape'; readonly shape: ParametricShape }
  /** Built from another feature, and rebuilt whenever that one changes. */
  | { readonly kind: 'derived'; readonly sourceId: FeatureId; readonly op: Derivation };

/**
 * What a text label is made of.
 *
 * Its geometry — the glyph outlines — is generated from these parameters by
 * the vendored typeface, and never stored: the oldest invariant here, and the
 * reason improving the typesetting improves every existing file.
 *
 * A source rather than fields on the feature, for the reason `HardwareHole`
 * records below: a feature whose position is not in `source` is the one
 * feature that moving, turning, hit-testing and mirroring each need a special
 * case for.
 */
export interface TextSource {
  readonly kind: 'text';
  readonly text: string;
  /** The left end of the baseline, before rotation. */
  readonly at: Vec2;
  readonly sizeMm: Mm;
  /** Counter-clockwise, about `at`. */
  readonly rotationRad: number;
}

/** Everything a feature's geometry can come from. */
export type FeatureSource = GeometrySource | TextSource;

export interface FeatureBase {
  readonly id: FeatureId;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly source: GeometrySource;
  /**
   * The name of what this feature followed, if a delete froze it into drawn
   * geometry (ADR 0009). Kept as a name rather than an id because the feature
   * it names is gone — the panel still has to be able to say "Frozen from
   * Outline". Absent on anything that was never frozen.
   */
  readonly frozenFrom?: string;
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

/**
 * A hole punched for hardware — a rivet, a snap, a screw, an eyelet.
 *
 * **Its geometry lives in `source`, as a `circle` shape.** `docs/domain-model.md`
 * §3.6 sketched it with its own `centre` and `diameterMm`, but that sketch
 * predates `GeometrySource`, and following it would make this the only feature
 * whose position is not in `source` — so `transformFeatures`, `translateFeatures`,
 * hit-testing, rendering and the mirror arriving in 4.8 would each need a case
 * for it. As a circle it inherits all of them, and the derived placement this
 * will eventually want ("12 mm in from that edge") is a new `Derivation` on the
 * same feature rather than a migration.
 *
 * The record holds the circle's **radius**; the panel asks for a diameter,
 * because that is the number stamped on the punch. One number, one spelling.
 *
 * Kept distinct from an inner `CutContour` because the semantics differ: these
 * are punched rather than cut, and they are reported separately.
 */
/**
 * Free text printed on the template: "fold before stitching", a maker's mark.
 *
 * The only feature whose source is text, and the only one that may hold text —
 * narrowed in both directions, so the compiler refuses a cut contour made of
 * words and a label made of a path.
 *
 * **Text that restates a model value is never a label.** Part captions and
 * measurement values are generated (X6), so they cannot disagree with the
 * model; a label is the user's own words, which is why it is stored.
 */
export interface TextLabel extends Omit<FeatureBase, 'source'> {
  readonly kind: 'text-label';
  readonly source: TextSource;
}

export interface HardwareHole extends FeatureBase {
  readonly kind: 'hardware-hole';
  /**
   * What the hole is *for*. Not what size it is — that is the radius, and it
   * stays independent because this application does not know what hole a
   * given snap needs until the hardware library lands in v1.1.
   */
  readonly hardwareType: 'rivet' | 'snap' | 'screw' | 'eyelet' | 'other';
}

export type Feature =
  CutContour | StitchLine | StitchHoleSet | FoldLine | MarkingLine | HardwareHole | TextLabel;
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
    case 'hardware-hole':
      return 'hardware';
    case 'text-label':
      return 'annotation';
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
