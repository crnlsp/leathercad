import { z } from 'zod';

/**
 * What a `.lcp` file on disk may contain.
 *
 * Deliberately a separate description from the domain types rather than
 * generated from them. This describes the *file format*, which drifts from the
 * in-memory model as migrations accumulate; a generated schema would silently
 * accept whatever the current types happen to be, which is the opposite of
 * what a format check is for.
 *
 * See docs/file-format.md §5.
 */

/** Rejects NaN, Infinity, and coordinates outside the documented range. */
const mm = z
  .number()
  .finite()
  .min(-100_000, { message: 'coordinate below the -100000 mm limit' })
  .max(100_000, { message: 'coordinate above the 100000 mm limit' });

const nonNegativeMm = mm.min(0, { message: 'must not be negative' });

const vec2 = z.object({ x: mm, y: mm });

const cornerRadii = z.object({
  bottomLeft: nonNegativeMm,
  bottomRight: nonNegativeMm,
  topRight: nonNegativeMm,
  topLeft: nonNegativeMm,
});

const parametricShape = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('rect'),
    origin: vec2,
    width: mm,
    height: mm,
    radii: cornerRadii,
    // Defaulted, so `fixtures/format/v1.lcp` — written before slice 3.7 added
    // this — still opens and reads as an unrotated panel.
    rotation: z.number().finite().default(0),
  }),
  z.object({ type: z.literal('circle'), centre: vec2, radius: nonNegativeMm }),
  // Mirrors the arc *segment* below, deliberately: the parametric record and
  // the geometry it evaluates to carry the same four numbers, so neither can
  // drift into meaning something the other does not.
  z.object({
    type: z.literal('arc'),
    centre: vec2,
    radius: nonNegativeMm,
    startAngle: z.number().finite(),
    sweepAngle: z.number().finite(),
  }),
]);

const segment = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('line'), a: vec2, b: vec2 }),
  z.object({
    kind: z.literal('arc'),
    centre: vec2,
    radius: nonNegativeMm,
    startAngle: z.number().finite(),
    sweepAngle: z
      .number()
      .finite()
      .min(-Math.PI * 2 - 1e-9)
      .max(Math.PI * 2 + 1e-9),
  }),
  z.object({
    kind: z.literal('cubic'),
    p0: vec2,
    p1: vec2,
    p2: vec2,
    p3: vec2,
  }),
]);

const path = z.object({ segments: z.array(segment), closed: z.boolean() });

/**
 * What a derived feature does to the one it follows.
 *
 * The stitch pitch is stored as a **value**, not as an iron preset id: a file
 * must open identically on a machine that has never heard of the author's iron
 * library. `ironLabel` rides along purely so the panel can name it.
 */
const derivation = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('offset'),
    distanceMm: mm,
    side: z.enum(['inward', 'outward']),
    run: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('whole') }),
      z.object({
        kind: z.literal('between'),
        fromAnchor: z.number().int().nonnegative(),
        toAnchor: z.number().int().nonnegative(),
      }),
    ]),
  }),
  z.object({
    type: z.literal('stitch-holes'),
    pitchMm: nonNegativeMm,
    mode: z.enum(['fit-whole', 'exact-pitch']),
    corners: z.enum(['continuous', 'hole-at-corner']),
    startOffsetMm: nonNegativeMm.optional(),
    endOffsetMm: nonNegativeMm.optional(),
    ironLabel: z.string().optional(),
  }),
]);

const geometrySource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('path'), path }),
  z.object({ kind: z.literal('shape'), shape: parametricShape }),
  z.object({ kind: z.literal('derived'), sourceId: z.string().min(1), op: derivation }),
]);

const featureBase = {
  id: z.string().min(1),
  name: z.string(),
  visible: z.boolean(),
  locked: z.boolean(),
  source: geometrySource,
};

const feature = z.discriminatedUnion('kind', [
  z.object({ ...featureBase, kind: z.literal('cut-contour'), role: z.enum(['outer', 'inner']) }),
  z.object({ ...featureBase, kind: z.literal('stitch-line') }),
  z.object({ ...featureBase, kind: z.literal('stitch-hole-set') }),
  z.object({
    ...featureBase,
    kind: z.literal('fold-line'),
    direction: z.enum(['mountain', 'valley']),
    materialThicknessMm: nonNegativeMm.optional(),
  }),
  z.object({
    ...featureBase,
    kind: z.literal('marking-line'),
    purpose: z.enum(['glue-area', 'alignment', 'logo', 'skive', 'other']),
  }),
  // The hole's position and size are its `circle` source, not fields here —
  // so this variant adds a kind, not a second way to hold a position.
  z.object({
    ...featureBase,
    kind: z.literal('hardware-hole'),
    hardwareType: z.enum(['rivet', 'snap', 'screw', 'eyelet', 'other']),
  }),
]);

const part = z.object({
  id: z.string().min(1),
  name: z.string(),
  quantity: z.number().int().min(1),
  features: z.array(feature),
});

const settings = z.object({
  gridSpacingMm: nonNegativeMm,
  defaultStitchInsetMm: nonNegativeMm,
  defaultIronPitchMm: nonNegativeMm,
});

export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  settings,
  parts: z.array(part),
});

export const ManifestSchema = z.object({
  formatVersion: z.number().int().min(1),
  application: z.string(),
  applicationVersion: z.string(),
  createdUtc: z.string(),
  modifiedUtc: z.string(),
});

export type StoredProject = z.infer<typeof ProjectSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
