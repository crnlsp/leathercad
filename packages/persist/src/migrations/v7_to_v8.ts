/**
 * Version 7 to version 8 — dimensions.
 *
 * Version 8 adds the `measurement` feature and its `measurement` source: two
 * anchor references and how to read between them (slice 4.10a). No version 7
 * document contains one, so there is nothing in an old file to rewrite and
 * this returns it untouched.
 *
 * Registered anyway, for the reason `v1_to_v2` gives: a gap in the chain is
 * only discovered at the next bump, when the file that needed the missing link
 * is already on someone's disk.
 */
export function v7ToV8(document: unknown): unknown {
  return document;
}
