import type { Project } from '@leathercad/domain';
import { CANVAS, GROUND, linkTickShape } from '@leathercad/render';
import { useMemo } from 'react';

import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { FeatureMark } from './icons/marks.js';
import { legendEntries, type LegendKey } from './legend.js';
import { Tooltip } from './Tooltip.js';

/**
 * The key to the drawing, on the drawing (UI Foundations §8.6, F.7). Each
 * mark is named in the maker's words, the ones the panels already use —
 * *Outline*, not *cut line (outer)* (F.1): `legend.names.<mark>`.
 *
 * It lists the lines this document draws, each by the mark the tree, the
 * property header and the problem rows use, set on the ground as the canvas
 * sets them. It teaches the language where the language is used.
 *
 * **At the canvas's bottom-left, and open by default, with names** (U.10,
 * R-09): a key that showed only marks taught nothing, and a maker folded it
 * once learned. Whether it is open is remembered in `preferences.json` (8.2),
 * so the owner passes it; a window too small for it folds it for the session.
 * Folded, it is a chip reading *Legend*, named in its tooltip; open, each mark
 * gains its name. It floats over the canvas, so opening it never moves the
 * drawing (§9.4).
 */
export function CanvasLegend({
  project,
  open,
  onToggle,
}: {
  project: Project;
  open: boolean;
  onToggle: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const entries = useMemo(() => legendEntries(project), [project]);
  if (entries.length === 0) return null;

  const names = i18n.list(
    entries.map((key) => t(`legend.names.${key}`)),
    'unit',
  );
  return (
    <section
      className="canvas-legend"
      aria-label={t('legend.title')}
      data-testid="canvas-legend"
      // Over the board: the value chips keep clear of it (U.14).
      data-over-board=""
    >
      <Tooltip text={open ? t('legend.hide') : t('legend.tooltip', { names })}>
        <button
          type="button"
          className="canvas-legend-toggle"
          data-testid="canvas-legend-toggle"
          aria-expanded={open}
          // The strip's marks are pictures; the name is said here, and the
          // tooltip says what they are.
          aria-label={t('legend.title')}
          onClick={onToggle}
        >
          {!open && <Icon of="legend" />}
          <span className="canvas-legend-title">{t('legend.title')}</span>
          <Icon of={open ? 'chevron-down' : 'chevron-up'} />
        </button>
      </Tooltip>
      {open && (
        <ul className="canvas-legend-rows">
          {entries.map((key) => (
            <li key={key} data-legend={key}>
              <LegendMark entry={key} />
              <span>{t(`legend.names.${key}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LegendMark({ entry }: { entry: LegendKey }) {
  return entry === 'linked' ? <LinkMark /> : <FeatureMark mark={entry} plane="ground" />;
}

/**
 * The link tick as the canvas draws it — the same shape function — across a
 * line in the ground's ink, since it goes on a line of any role.
 */
function LinkMark() {
  const rings = linkTickShape({ x: 8, y: 8 }, { x: 1, y: 0 });
  return (
    <svg
      className="feature-mark"
      data-mark="linked"
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path d="M1 8h14" stroke={GROUND.ink} strokeWidth={1.25} />
      {rings.map(({ centre, radius }, index) => (
        <circle
          key={`fill-${String(index)}`}
          cx={centre.x}
          cy={centre.y}
          r={radius}
          fill={GROUND.ground}
        />
      ))}
      {rings.map(({ centre, radius }, index) => (
        <circle
          key={`ring-${String(index)}`}
          cx={centre.x}
          cy={centre.y}
          r={radius}
          stroke={GROUND.ink}
          strokeOpacity={CANVAS.linkTick.opacity}
          strokeWidth={CANVAS.linkTick.strokePx}
        />
      ))}
    </svg>
  );
}
