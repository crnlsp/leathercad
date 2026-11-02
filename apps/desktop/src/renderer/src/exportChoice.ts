import { EXPORT_ROLES, type ExportRole } from '@leathercad/export';

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
