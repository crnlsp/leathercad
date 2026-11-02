import { selectedFeatureIds, type Selection } from '@leathercad/document';
import { diagnose, evaluate, type FeatureId, type Project } from '@leathercad/domain';
import { buildDisplayList, type DisplayList, type ViewportView } from '@leathercad/render';

import type { I18n } from '../../shared/i18n.js';
import { captionOf } from './captionWords.js';

/** Everything the Design board's pattern is drawn from, as a frame reads it. */
export interface DesignInputs {
  readonly project: Project;
  readonly selection: Selection;
  /** The feature a click would pick, for the hover halo (§8.4). */
  readonly hovered: FeatureId | null;
  readonly view: ViewportView;
  /** The interface's words, which the board's captions are in (ADR 0018). */
  readonly i18n: I18n;
}

/**
 * The Design board's pattern: the pieces, their lines, words and markers, as a
 * display list for the frame. One a board, made with it.
 */
export function designContent(): (inputs: DesignInputs) => DisplayList {
  return build;
}

function build({ project, selection, hovered, view, i18n }: DesignInputs): DisplayList {
  return buildDisplayList(evaluate(project), {
    // A part picked by its heading shows as picked (Q30): Rotate turns it,
    // so the board has to say what will turn.
    selected:
      selection.parts.size === 0
        ? selection.features
        : new Set(selectedFeatureIds(project, selection)),
    hovered,
    // The same list the panels read (X7), so a feature that failed is
    // marked here instead of silently disappearing.
    diagnostics: diagnose(project),
    // The camera: how much detail the drawing carries at this zoom, the
    // same on any display (U.1), and where the board's words go — a
    // caption pins to the top-left once it would run under the ruler (R-01).
    view,
    // Each piece's caption, in the interface's words (ADR 0018).
    caption: (part) => captionOf(i18n, part),
  });
}
