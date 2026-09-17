/**
 * Version 6 to version 7 — a mirror axis says which kind it is.
 *
 * Version 6 stored a mirror's axis as a bare line: `{ origin, angleRad }`.
 * Version 7 adds a **fold** axis that tracks a fold line instead of carrying
 * its own numbers (slice 4.8b), so the two arms need telling apart and every
 * version 6 axis becomes `{ kind: 'line', … }`.
 *
 * **The first migration that actually rewrites anything.** Every one before it
 * was an identity, because every earlier change only added shapes no old file
 * contained. A chain of identities satisfies the framework without proving it
 * can carry a real change, so this one is worth having on the record.
 *
 * Raw JSON, before validation: an old document cannot satisfy the new schema
 * by definition, which is why migrations run first (file-format.md §4.2).
 */
export function v6ToV7(document: unknown): unknown {
  return mapMirrorAxes(document);
}

/**
 * Rewrites every mirror axis in the tree, leaving everything else alone.
 *
 * Structural rather than path-based on purpose: it looks for the shape of a
 * mirror op wherever it occurs, so it keeps working if features are ever
 * nested differently, and it cannot be broken by a part or feature key being
 * renamed somewhere above it.
 */
function mapMirrorAxes(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(mapMirrorAxes);
  if (node === null || typeof node !== 'object') return node;

  const record = node as Record<string, unknown>;
  const rewritten: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) rewritten[key] = mapMirrorAxes(value);

  if (rewritten['type'] !== 'mirror') return rewritten;

  const axis = rewritten['axis'];
  if (axis === null || typeof axis !== 'object' || Array.isArray(axis)) return rewritten;

  // Already discriminated — a v7 document handed here by a longer chain, or a
  // shape this migration has no business touching.
  if ('kind' in axis) return rewritten;

  return { ...rewritten, axis: { kind: 'line', ...(axis as Record<string, unknown>) } };
}
