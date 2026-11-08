import { problemKey, type Diagnostic } from '@leathercad/domain';

/** Stable problem identity, not selection: one feature can have several problems. */
export function nextDiagnostic(
  diagnostics: readonly Diagnostic[],
  current: string | null,
  direction: -1 | 1,
): Diagnostic | null {
  if (diagnostics.length === 0) return null;
  const index = diagnostics.findIndex((entry) => problemKey(entry.problem) === current);
  if (index < 0) return (direction === 1 ? diagnostics[0] : diagnostics.at(-1)) ?? null;
  return diagnostics[(index + direction + diagnostics.length) % diagnostics.length] ?? null;
}
