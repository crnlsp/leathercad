import {
  featureTree,
  type Badge,
  type FeatureNode,
  type Part,
  type PartId,
} from '@leathercad/domain';

import type { I18n } from '../../shared/i18n.js';

/**
 * The Parts tree as rows (R-07, U.8): each piece, and — while it is open —
 * what it is made of, nested the way it is built (`featureTree`): *Outline ›
 * Stitch line › Stitch holes*. One flat list, in the order shown, which is
 * what the keys move through and what the panel draws.
 */
export interface TreeRow {
  /** `part:<id>` or `feature:<id>`: a piece and a feature may share an id. */
  readonly key: string;
  readonly kind: 'part' | 'feature';
  readonly id: string;
  readonly partId: PartId;
  /** 1 for a piece; a feature one deeper than what it nests under. */
  readonly level: number;
  /** The row it nests under — its source, or its piece — or null for a piece. */
  readonly parent: string | null;
  /** Whether a piece is open; undefined for a row that does not fold — a feature, an empty piece. */
  readonly expanded: boolean | undefined;
  /** Its place among the rows it shares a parent with, from 1. */
  readonly position: number;
  readonly siblings: number;
}

export const partKey = (id: string): string => `part:${id}`;
export const featureKey = (id: string): string => `feature:${id}`;

/** The rows shown, with the pieces in `closed` folded shut. */
export function treeRows(parts: readonly Part[], closed: ReadonlySet<PartId>): TreeRow[] {
  const rows: TreeRow[] = [];
  parts.forEach((part, index) => {
    const folds = part.features.length > 0;
    const open = folds && !closed.has(part.id);
    rows.push({
      key: partKey(part.id),
      kind: 'part',
      id: part.id,
      partId: part.id,
      level: 1,
      parent: null,
      expanded: folds ? open : undefined,
      position: index + 1,
      siblings: parts.length,
    });
    if (!open) return;
    const walk = (nodes: readonly FeatureNode[], level: number, parent: string): void =>
      nodes.forEach((node, at) => {
        rows.push({
          key: featureKey(node.feature.id),
          kind: 'feature',
          id: node.feature.id,
          partId: part.id,
          level,
          parent,
          expanded: undefined,
          position: at + 1,
          siblings: nodes.length,
        });
        walk(node.children, level + 1, featureKey(node.feature.id));
      });
    walk(featureTree(part), 2, partKey(part.id));
  });
  return rows;
}

/** What a key does in the tree: focus another row, or open or close a piece. */
export type TreeMove =
  { readonly focus: string } | { readonly open: PartId } | { readonly close: PartId };

/**
 * Where a key takes the tree's focus from row `at` (the WAI-ARIA tree's keys):
 * Up and Down to the row above or below, Home and End to the first and last;
 * Right opens a closed piece, or goes to the first row inside; Left closes an
 * open piece, or goes to the row a feature nests under. Null when the key
 * does nothing here.
 */
export function treeMove(rows: readonly TreeRow[], at: string, key: string): TreeMove | null {
  const index = rows.findIndex((row) => row.key === at);
  const row = rows[index];
  if (row === undefined) return null;
  const to = (other: TreeRow | undefined): TreeMove | null =>
    other === undefined ? null : { focus: other.key };
  switch (key) {
    case 'ArrowDown':
      return to(rows[index + 1]);
    case 'ArrowUp':
      return to(rows[index - 1]);
    case 'Home':
      return to(rows[0]);
    case 'End':
      return to(rows[rows.length - 1]);
    case 'ArrowRight': {
      if (row.expanded === false) return { open: row.partId };
      const next = rows[index + 1];
      return next?.parent === row.key ? to(next) : null;
    }
    case 'ArrowLeft':
      if (row.expanded === true) return { close: row.partId };
      return to(rows.find((other) => other.key === row.parent));
    default:
      return null;
  }
}

/**
 * The pieces left closed once a selection is shown (R-07): a piece holding a
 * selected feature opens. The same set when none needs to, so a caller can
 * tell nothing changed.
 */
export function revealed(
  parts: readonly Part[],
  closed: ReadonlySet<PartId>,
  selected: ReadonlySet<string>,
): ReadonlySet<PartId> {
  const opening = parts.filter(
    (part) => closed.has(part.id) && part.features.some((feature) => selected.has(feature.id)),
  );
  if (opening.length === 0) return closed;
  const next = new Set(closed);
  for (const part of opening) next.delete(part.id);
  return next;
}

/** What a row shows, in the order it shows it. */
export interface RowFace {
  /** The piece's name and its ×N, or the feature's name. */
  readonly name: string;
  readonly problems: Badge | null;
  readonly holes: number | null;
  /** A piece with nothing in it, which shows *Empty* and *Delete part*. */
  readonly empty: boolean;
}

/**
 * What a row is called: everything it shows, in the order shown, so speech
 * input reaches it by whatever the maker reads there (WCAG 2.5.3, Label in
 * Name) — `Stitch holes, 2 (problems, worst: error), 146 holes`. Each count
 * is followed by its words. The problem count's are in parentheses, which
 * label-in-name matching passes over, so on a row that shows both counts
 * side by side they are side by side in its name too; speech reads them alike.
 */
export function rowName(face: RowFace, { t, list }: I18n): string {
  const said = [face.name];
  if (face.problems !== null) {
    said.push(
      t('parts.rowProblems', {
        count: face.problems.count,
        severity: t(`problems.severity.${face.problems.worst}`),
      }),
    );
  }
  if (face.holes !== null) said.push(t('parts.rowHoles', { count: face.holes }));
  if (face.empty) said.push(t('parts.emptyPart'), t('parts.remove'));
  return list(said, 'unit');
}
