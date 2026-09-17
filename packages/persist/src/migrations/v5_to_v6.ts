/**
 * Version 5 to version 6 — mirrored counterparts.
 *
 * Version 6 adds the `mirror` derivation: a feature that is another one
 * reflected across an axis and slid along it (slice 4.8a). No version 5
 * document contains one, so there is nothing in an old file to rewrite and
 * this returns it untouched.
 *
 * The bump's real job is the other direction: a build that predates mirror
 * must **refuse** a file holding one rather than dropping the counterpart and
 * saving the result back over it.
 *
 * Registered anyway, for the reason `v1_to_v2` gives: a gap in the chain is
 * only discovered at the next bump, when the file that needed the missing link
 * is already on someone's disk.
 */
export function v5ToV6(document: unknown): unknown {
  return document;
}
