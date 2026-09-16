/**
 * Version 4 to version 5 — text labels.
 *
 * Version 5 adds the `text-label` feature and its `text` source: free words
 * printed on the template (slice 4.11b). No version 4 document contains one,
 * so there is nothing in an old file to rewrite and this returns it untouched.
 *
 * Registered anyway, for the reason `v1_to_v2` gives: a gap in the chain is
 * only discovered at the next bump, when the file that needed the missing link
 * is already on someone's disk.
 */
export function v4ToV5(document: unknown): unknown {
  return document;
}
