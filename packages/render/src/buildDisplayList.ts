import type { Diagnostic, FeatureId, ResolvedProject, Severity } from '@leathercad/domain';

import {
  ROLE_STROKES,
  dotsItem,
  pathItem,
  type DisplayItem,
  type DisplayList,
} from './displayList.js';

export interface BuildOptions {
  /** Drawn in the selection colour and slightly heavier. */
  readonly selected?: ReadonlySet<FeatureId>;
  readonly selectionColour?: string;
  /**
   * What is wrong with the design, from `diagnose`.
   *
   * Anything with a location is marked on the canvas — including the geometry
   * a **failed** feature was being built from, which is the only thing keeping
   * a feature that cannot resolve from simply vanishing (domain-model.md §4.4).
   */
  readonly diagnostics?: readonly Diagnostic[];
}

const SELECTION_COLOUR = '#ffcc44';

/** How a problem marks the drawing. Warmer than any layer role, on purpose. */
export const DIAGNOSTIC_COLOURS: Readonly<Record<Severity, string>> = {
  error: '#e5675f',
  warning: '#e0a93a',
  info: '#6f9fd8',
};

/**
 * Turns an evaluated project into something drawable.
 *
 * The one place a layer role becomes an appearance. Because the role is
 * decided by the domain, the user never picks a stroke style: a cut line is
 * solid because it is a cut line.
 */
export function buildDisplayList(
  resolved: ResolvedProject,
  options: BuildOptions = {},
): DisplayList {
  const selected = options.selected ?? new Set<FeatureId>();
  const highlight = options.selectionColour ?? SELECTION_COLOUR;
  const items: DisplayItem[] = [];
  const hidden = new Set<FeatureId>();

  for (const part of resolved.parts) {
    for (const entry of part.features) {
      if (!entry.feature.visible) hidden.add(entry.feature.id);
      if (!entry.ok || !entry.feature.visible) continue;

      const isSelected = selected.has(entry.feature.id);

      // A hole set's path is the line the holes sit on, which the stitch line
      // already draws. What this feature contributes is the holes, and they go
      // out as one batched item rather than one per hole — a wallet has
      // hundreds, and the budget is 60 fps while dragging.
      if (entry.holes !== undefined) {
        items.push(
          dotsItem(
            entry.role,
            entry.holes.holes.map((hole) => hole.point),
            isSelected ? 3 : 2,
            isSelected ? highlight : undefined,
          ),
        );
        continue;
      }

      items.push(
        pathItem(
          entry.role,
          entry.path,
          isSelected
            ? { colour: highlight, widthPx: ROLE_STROKES[entry.role].widthPx + 1 }
            : undefined,
        ),
      );
    }
  }

  // Markers last, so a warning is never drawn under the geometry it is about.
  for (const diagnostic of options.diagnostics ?? []) {
    if (diagnostic.location === undefined) continue;
    if (diagnostic.featureId !== undefined && hidden.has(diagnostic.featureId)) continue;

    const colour = DIAGNOSTIC_COLOURS[diagnostic.severity];
    items.push(
      diagnostic.location.kind === 'path'
        ? pathItem('construction', diagnostic.location.path, {
            colour,
            widthPx: 1.5,
            dashPx: [6, 4],
          })
        : dotsItem('construction', diagnostic.location.points, 4, colour),
    );
  }

  return { items };
}
