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
