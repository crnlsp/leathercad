/**
 * Version 2 to version 3 — hardware holes arrive.
 *
 * Version 3 adds the `hardware-hole` feature kind. No version 2 document
 * contains one, so there is nothing in an old file to rewrite and this returns
 * it untouched.
 *
 * It exists anyway, and is registered anyway, for the reason `v1_to_v2` gives:
 * the chain has to be unbroken, and a missing link is only discovered at the
 * *next* bump, when the file that needed it is already on someone's disk.
 *
 * Note what did **not** need a migration. The hole's geometry is a `circle`
 * shape in `source`, a variant version 2 already understood — so the format
 * grew by one feature kind rather than by a new way of holding a position.
 * See docs/file-format.md §4.2.
 */
export function v2ToV3(document: unknown): unknown {
  return document;
}
