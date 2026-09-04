import type { FeatureId, ResolvedProject } from '@leathercad/domain';

import { ROLE_STROKES, pathItem, type DisplayItem, type DisplayList } from './displayList.js';

export interface BuildOptions {
  /** Drawn in the selection colour and slightly heavier. */
  readonly selected?: ReadonlySet<FeatureId>;
  readonly selectionColour?: string;
}

const SELECTION_COLOUR = '#ffcc44';

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

  for (const part of resolved.parts) {
    for (const entry of part.features) {
      if (!entry.ok || !entry.feature.visible) continue;

      const isSelected = selected.has(entry.feature.id);
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

  return { items };
}
