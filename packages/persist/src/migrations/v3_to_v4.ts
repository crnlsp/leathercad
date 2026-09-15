/**
 * Version 3 to version 4 — frozen features.
 *
 * Version 4 adds `frozenFrom` to features: the name of what a feature followed
 * before a delete froze it into drawn geometry (ADR 0009). No version 3 document
 * contains a frozen feature, so there is nothing in an old file to rewrite and
 * this returns it untouched.
 *
 * Registered anyway, for the reason `v1_to_v2` gives: a gap in the chain is only
 * discovered at the next bump, when the file that needed the missing link is
 * already on someone's disk.
 *
 * The other half of slice 4.2b needs no migration and is worth saying so: parts
 * may now be left empty. The schema always allowed an empty `features` array;
 * what changed is that commands stopped removing emptied parts.
 */
export function v3ToV4(document: unknown): unknown {
  return document;
}
