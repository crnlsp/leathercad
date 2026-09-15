/**
 * Hole punch sizes, in millimetres.
 *
 * Application configuration, not document data — the same arrangement as
 * `irons.ts`, and for the same reason: the **value** is what gets persisted on
 * the hole, so a file opens identically on a machine that has never heard of
 * this list.
 *
 * These are deliberately **punch sizes and not hardware**. A list naming
 * "line 24 snap" or "#9 rivet" would imply the application knows what hole
 * each needs, and it does not — that is the hardware library, in v1.1. Until
 * then the user knows which punch their hardware wants, and this list is just
 * the drawer of punches they already own.
 */
export const PUNCH_SIZES_MM: readonly number[] = [2, 2.5, 3, 3.5, 4, 4.5, 5, 6];
