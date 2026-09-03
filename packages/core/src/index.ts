/**
 * @leathercad/core — the bottom layer.
 *
 * Ids, Result types, epsilons, quantisation and assertions. This package
 * imports nothing. Everything else is built on top of it.
 *
 * Currently a placeholder: slice 0.1 establishes the toolchain, slice 1.1
 * fills this in. See docs/roadmap.md §4.
 */

export const PACKAGE_NAME = '@leathercad/core';

/**
 * Millimetres are the source of truth throughout LeatherCAD. This alias
 * documents intent at API boundaries; it carries no runtime cost and no
 * runtime checking.
 *
 * See docs/geometry.md §1.
 */
export type Mm = number;
