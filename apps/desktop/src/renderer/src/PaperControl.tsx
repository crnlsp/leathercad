import { formatEditable } from '@leathercad/core';
import { setOrientation, setPaper, type DocumentStore } from '@leathercad/document';
import {
  PAPER_NAMES,
  PAPER_SIZES,
  type Orientation,
  type PaperName,
  type ProjectSettings,
} from '@leathercad/domain';
import { RectangleHorizontal, RectangleVertical, type LucideIcon } from 'lucide-react';

import { Icon } from './icons/Icon.js';
import { Tooltip } from './Tooltip.js';

/** `210 × 297 mm`: a paper as it is printed on its packet, without trailing zeros. */
export function paperDimensions(paper: PaperName): string {
  const { widthMm, heightMm } = PAPER_SIZES[paper];
  return `${formatEditable(widthMm, 1)} × ${formatEditable(heightMm, 1)} mm`;
}

const TURNS: readonly { orientation: Orientation; label: string; icon: LucideIcon }[] = [
  { orientation: 'portrait', label: 'Portrait', icon: RectangleVertical },
  { orientation: 'landscape', label: 'Landscape', icon: RectangleHorizontal },
];

/**
 * The paper the PDF prints on, and which way up (slice 6.4a).
 *
 * It edits the project's own page setup — the one `pageSetupFor` reads for the
 * export — so there is no second paper setting to disagree with it, and the
 * choice is saved with the project, undone like any edit, and carried into a
 * recovery copy. Nothing here scales anything: a larger sheet holds more at
 * 1:1, and a part too large for the chosen one is reported after export.
 */
export function PaperControl({
  settings,
  store,
}: {
  settings: ProjectSettings;
  store: DocumentStore;
}) {
  return (
    <div className="paper-control" role="group" aria-label="Paper" data-testid="paper-control">
      <Tooltip
        text={`Paper for the PDF: ${settings.paper}, ${paperDimensions(settings.paper)}. Printed at 1:1, never scaled to fit.`}
      >
        <select
          className="paper-select"
          data-testid="paper"
          aria-label="Paper size"
          value={settings.paper}
          onChange={(event) => store.dispatch(setPaper(event.target.value as PaperName))}
        >
          {PAPER_NAMES.map((name) => (
            <option key={name} value={name}>
              {name} · {paperDimensions(name)}
            </option>
          ))}
        </select>
      </Tooltip>
      {TURNS.map(({ orientation, label, icon }) => (
        <Tooltip key={orientation} text={label}>
          <button
            type="button"
            className={`tool icon-only${settings.orientation === orientation ? ' active' : ''}`}
            data-testid={`orientation-${orientation}`}
            aria-label={label}
            aria-pressed={settings.orientation === orientation}
            onClick={() => store.dispatch(setOrientation(orientation))}
          >
            <Icon of={icon} />
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
