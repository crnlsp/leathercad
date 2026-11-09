import { overlappingParts, type Part, type ResolvedProject } from '@leathercad/domain';
import { EXPORT_ROLES, type ExportRole } from '@leathercad/export';

/** Only a drawing containing cut outlines needs the board-overlap advisory (Q43). */
export function overlappingExportParts(
  resolved: ResolvedProject,
  roles: readonly ExportRole[],
): readonly Part[] {
  if (!roles.includes('cut')) return [];
  const ids = new Set(overlappingParts(resolved));
  return resolved.parts.filter(({ part }) => ids.has(part.id)).map(({ part }) => part);
}

/**
 * The roles with `role` kept or left out (6.4), in the domain's order whichever
 * way the maker ticked them, so the same choice is always the same list.
 */
export function withRole(
  roles: readonly ExportRole[],
  role: ExportRole,
  kept: boolean,
): readonly ExportRole[] {
  return EXPORT_ROLES.filter((each) => (each === role ? kept : roles.includes(each)));
}
