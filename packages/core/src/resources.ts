/**
 * Work ceilings, not file-schema rules or geometry tolerances (PERF-012).
 * The rationale and compatibility policy live in docs/resource-limits.md.
 */
export const RESOURCE_LIMITS = {
  archiveBytes: 32 * 1024 * 1024,
  expandedBytes: 32 * 1024 * 1024,
  entries: 1024,
  nodes: 500_000,
  features: 10_000,
  segments: 250_000,
  characters: 20_000,
  holes: 250_000,
  pages: 1000,
  /** An SVG file's bytes, as the archive's (ADR 0023 step 2). */
  svgBytes: 32 * 1024 * 1024,
  /** An SVG document's length with its entities expanded (ADR 0023 step 4). */
  svgExpandedBytes: 32 * 1024 * 1024,
  /** Shape against shape, and point against path segment, sorting an SVG's paths into pieces. */
  svgShapeTests: 500_000_000,
} as const;

export type Resource = keyof typeof RESOURCE_LIMITS;

/** A refused operation. Only the app turns these facts into words. */
export class ResourceLimitError extends Error {
  constructor(
    readonly resource: Resource,
    readonly requested: number,
    readonly limit: number = RESOURCE_LIMITS[resource],
  ) {
    super('RESOURCE_LIMIT');
    this.name = 'ResourceLimitError';
  }
}

/** Check before allocating or looping; integer work counts need no epsilon. */
export function checkResourceLimit(resource: Resource, requested: number): void {
  if (!Number.isFinite(requested) || requested < 0 || requested > RESOURCE_LIMITS[resource]) {
    throw new ResourceLimitError(resource, requested);
  }
}
