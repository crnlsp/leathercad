import { isPartVisible } from '@leathercad/document';
import { materialOf, type Feature, type Part, type Project } from '@leathercad/domain';
import { thumbnailPath } from '@leathercad/render';
import { Maximize, PanelLeft, PanelRight, type LucideIcon } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';

import type { MessageKey, Translate } from '../../shared/i18n.js';

import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { FeatureMark, MarkOf } from './icons/marks.js';
import { KeyCap } from './keyCaps.js';
import type { CommandId } from './keymap.js';
import type { Panel } from './panelLayout.js';
import { resolvedFor } from './sheets.js';
import { Tooltip } from './Tooltip.js';

/**
 * A panel's fold (R-04, U.5): its toggle, the 40 px strip it folds to, and
 * the status bar's chips that reach it whatever shape it is in.
 */

/** How a button was pressed: from the keyboard, focus goes back where it came from (U.4's rule). */
export type Press = 'keyboard' | 'pointer';

/**
 * How a button was pressed. One pressed by the pointer lets go of focus, as
 * the zoom control's do (U.4): left focused, it would take the Enter that
 * finishes a polyline.
 */
export function pressOf(event: MouseEvent<HTMLElement>): Press {
  if (event.detail === 0) return 'keyboard';
  event.currentTarget.blur();
  return 'pointer';
}

const TOGGLE: Readonly<
  Record<Panel, { command: CommandId; show: MessageKey; hide: MessageKey; icon: LucideIcon }>
> = {
  parts: {
    command: 'toggleParts',
    show: 'panels.showParts',
    hide: 'panels.hideParts',
    icon: PanelLeft,
  },
  properties: {
    command: 'toggleProperties',
    show: 'panels.showProperties',
    hide: 'panels.hideProperties',
    icon: PanelRight,
  },
};

/**
 * Shows or hides a panel, with its key: in the panel's header while it is
 * open, at the top of its strip while it is folded.
 */
export function PanelToggle({
  panel,
  shown,
  onToggle,
}: {
  panel: Panel;
  /** Whether the panel is open: in its column, or over the board. */
  shown: boolean;
  onToggle: (press: Press) => void;
}) {
  const { t } = useI18n();
  const { command, show, hide, icon } = TOGGLE[panel];
  const label = t(shown ? hide : show);
  return (
    <Tooltip text={label} keys={command}>
      <button
        type="button"
        className="icon-toggle panel-toggle"
        data-testid={`${shown ? 'fold' : 'unfold'}-${panel}`}
        data-panel-toggle={panel}
        aria-label={label}
        onClick={(event) => onToggle(pressOf(event))}
      >
        <Icon of={icon} />
      </button>
    </Tooltip>
  );
}

/** A thumbnail's box: the strip's, and U.8's tree row's. */
const THUMBNAIL = { width: 24, height: 16 } as const;

/**
 * Parts, folded: one thumbnail per piece, the way back to every piece — a
 * locked one included, which the board cannot pick (F.2). A click selects the
 * piece; its tooltip names it as the board's caption does.
 */
export function PartsStrip({
  project,
  selectedParts,
  selected,
  onSelectPart,
  toggle,
}: {
  project: Project;
  selectedParts: ReadonlySet<string>;
  selected: ReadonlySet<string>;
  onSelectPart: (partId: string) => void;
  toggle: ReactNode;
}) {
  const { t } = useI18n();
  const resolved = resolvedFor(project);
  return (
    <aside
      className="panel-strip parts"
      data-testid="parts-strip"
      aria-label={t('panels.partsFolded')}
    >
      {toggle}
      {project.parts.map((part) => {
        const built = resolved.parts.find((entry) => entry.part.id === part.id);
        const outer = built === undefined ? null : materialOf(built).outer;
        const d = outer === null ? '' : thumbnailPath(outer, THUMBNAIL);
        const name = pieceName(part, t);
        const isSelected =
          selectedParts.has(part.id) || part.features.some((feature) => selected.has(feature.id));
        return (
          <Tooltip key={part.id} text={name}>
            <button
              type="button"
              className={['strip-button', isPartVisible(part) ? '' : 'off'].join(' ').trim()}
              data-testid={`strip-part-${part.id}`}
              aria-label={name}
              aria-pressed={isSelected}
              onClick={(event) => {
                pressOf(event);
                onSelectPart(part.id);
              }}
            >
              {d === '' ? (
                <FeatureMark mark="piece" />
              ) : (
                <svg
                  className="thumbnail"
                  width={THUMBNAIL.width}
                  height={THUMBNAIL.height}
                  viewBox={`0 0 ${String(THUMBNAIL.width)} ${String(THUMBNAIL.height)}`}
                  aria-hidden
                >
                  <path d={d} />
                </svg>
              )}
              {part.quantity > 1 && (
                <span className="strip-count" aria-hidden>
                  {part.quantity}
                </span>
              )}
            </button>
          </Tooltip>
        );
      })}
    </aside>
  );
}

/** "Card pocket ×2", as the board's caption names it (R-01). */
function pieceName(part: Part, t: Translate): string {
  return part.quantity > 1
    ? t('caption.cut', { name: part.name, quantity: part.quantity })
    : part.name;
}

/**
 * Properties, folded: the selection's mark, its tooltip naming what is
 * selected — and a press opens the panel on it.
 */
export function PropertiesStrip({
  project,
  selectedParts,
  selected,
  onOpen,
  toggle,
}: {
  project: Project;
  selectedParts: ReadonlySet<string>;
  selected: ReadonlySet<string>;
  onOpen: (press: Press) => void;
  toggle: ReactNode;
}) {
  const { t } = useI18n();
  const features = project.parts.flatMap((part) =>
    part.features
      .filter((feature) => selected.has(feature.id))
      .map((feature) => ({ part, feature })),
  );
  const parts = project.parts.filter((part) => selectedParts.has(part.id));
  const first: { part: Part; feature: Feature } | undefined = features[0];
  const named =
    first !== undefined
      ? features.length === 1
        ? t('panels.featureIn', { feature: first.feature.name, part: pieceName(first.part, t) })
        : t('properties.manySelected', { count: features.length })
      : parts.length === 1
        ? pieceName(parts[0]!, t)
        : parts.length > 1
          ? t('properties.manyPartsSelected', { count: parts.length })
          : null;
  const count = first !== undefined ? features.length : parts.length;
  return (
    <aside
      className="panel-strip properties"
      data-testid="properties-strip"
      aria-label={t('panels.propertiesFolded')}
    >
      {toggle}
      {named !== null && (
        <Tooltip text={named}>
          <button
            type="button"
            className="strip-button current"
            data-testid="strip-selection"
            aria-label={named}
            onClick={(event) => onOpen(pressOf(event))}
          >
            {first === undefined ? (
              <FeatureMark mark="piece" />
            ) : (
              <MarkOf feature={first.feature} />
            )}
            {count > 1 && (
              <span className="strip-count" aria-hidden>
                {count}
              </span>
            )}
          </button>
        </Tooltip>
      )}
    </aside>
  );
}

/**
 * One of the status bar's three chips (R-04), always there, so nothing is ever
 * out of reach: Parts `[`, Focus `\`, Properties `]`. One whose panel is
 * hidden — folded, or by focus mode — has the accent border.
 */
export function PanelChip({
  testId,
  icon,
  label,
  command,
  pressed,
  hiding,
  onPress,
}: {
  testId: string;
  icon: LucideIcon;
  label: string;
  command: CommandId;
  pressed: boolean;
  hiding: boolean;
  onPress: (press: Press) => void;
}) {
  return (
    <button
      type="button"
      className={hiding ? 'chip panel-chip hiding' : 'chip panel-chip'}
      data-testid={testId}
      aria-label={label}
      aria-pressed={pressed}
      onClick={(event) => onPress(pressOf(event))}
    >
      <Icon of={icon} />
      {label}
      <KeyCap command={command} />
    </button>
  );
}

export const CHIP_ICON = { parts: PanelLeft, focus: Maximize, properties: PanelRight } as const;
