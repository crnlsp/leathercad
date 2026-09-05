/**
 * Version 1 to version 2 — derived features arrive.
 *
 * Version 2 adds the `derived` geometry source and the `stitch-hole-set`
 * feature kind. No version 1 document contains either, so there is nothing in
 * an old file to rewrite and this returns it untouched.
 *
 * It exists anyway, and is registered anyway, because the chain has to be
 * unbroken: a v1 file must through every step on its way to the current
 * version, and a missing link is only discovered when the second bump lands.
 * An identity migration is cheap; a gap in the chain is not.
 *
 * The latitude taken in slices 3.6b and 3.7 — adding a field in place because
 * nothing had shipped — is spent. From here, a new persisted variant means a
 * version bump, a fixture, and a migration where one is needed.
 * See docs/file-format.md §4.2.
 */
export function v1ToV2(document: unknown): unknown {
  return document;
}
