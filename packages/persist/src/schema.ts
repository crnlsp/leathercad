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
  }),
  z.object({ type: z.literal('circle'), centre: vec2, radius: nonNegativeMm }),
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

const geometrySource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('path'), path }),
  z.object({ kind: z.literal('shape'), shape: parametricShape }),
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
