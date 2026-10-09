import { Fullscreen, Minus, Plus } from 'lucide-react';

import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import type { CommandId } from './keymap.js';
import { MenuButton } from './Menu.js';
import type { MenuEntry } from './menus.js';
import { Tooltip } from './Tooltip.js';

/** The commands the control runs, the same handlers their keys run. */
export type ZoomCommand = Extract<
  CommandId,
  'zoomIn' | 'zoomOut' | 'fit' | 'fitSelection' | 'trueSize'
>;

/** The sizes the percentage's menu offers besides true size (R-03). */
const SIZES = [50, 200, 400] as const;

/**
 * The zoom, said and set (U.4, R-03): − · the zoom · + · Fit, floating at the
 * canvas's bottom-right so it never moves the drawing. 100 % is true size —
 * the CSS reference pixel, 96 to the inch, since the app has no screen
 * calibration yet — and the percentage opens the fits and sizes. It drives
 * whichever view is showing; Fit selection is Design's alone.
 */
export function ZoomControl({
  percent,
  run,
  zoomTo,
  fitSelectionRefusal,
}: {
  /** The showing view's zoom; shown whole. */
  percent: number;
  run: (command: ZoomCommand) => void;
  zoomTo: (percent: number) => void;
  /** Why Fit selection cannot act now, said in its place in the menu. */
  fitSelectionRefusal: string | undefined;
}) {
  const { t } = useI18n();
  const whole = Math.round(percent);
  const entries: MenuEntry[] = [
    {
      kind: 'item',
      id: 'zoom-fit-drawing',
      label: t('zoom.fitDrawing'),
      keys: 'fit',
      onChoose: () => run('fit'),
    },
    {
      kind: 'item',
      id: 'zoom-fit-selection',
      label: t('zoom.fitSelection'),
      keys: 'fitSelection',
      refusal: fitSelectionRefusal,
      onChoose: () => run('fitSelection'),
    },
    {
      kind: 'item',
      id: 'zoom-true-size',
      label: t('zoom.trueSize', { percent: 100 }),
      keys: 'trueSize',
      onChoose: () => run('trueSize'),
    },
    ...SIZES.map((size): MenuEntry => ({
      kind: 'item',
      id: `zoom-${String(size)}`,
      label: t('zoom.percent', { percent: size }),
      onChoose: () => zoomTo(size),
    })),
  ];

  return (
    <div
      className="zoom-control"
      role="group"
      aria-label={t('zoom.title')}
      data-testid="zoom-control"
    >
      <Tooltip text={t('shortcuts.zoomOut')} keys="zoomOut">
        <button
          type="button"
          className="zoom-button"
          data-testid="zoom-out"
          aria-label={t('shortcuts.zoomOut')}
          onClick={() => run('zoomOut')}
        >
          <Icon of={Minus} />
        </button>
      </Tooltip>
      <MenuButton
        label={t('zoom.level', { percent: whole })}
        tooltip={t('zoom.levelTooltip')}
        testId="zoom-level"
        className="zoom-button zoom-level"
        align="end"
        above
        entries={entries}
      >
        {t('zoom.percent', { percent: whole })}
      </MenuButton>
      <Tooltip text={t('shortcuts.zoomIn')} keys="zoomIn">
        <button
          type="button"
          className="zoom-button"
          data-testid="zoom-in"
          aria-label={t('shortcuts.zoomIn')}
          onClick={() => run('zoomIn')}
        >
          <Icon of={Plus} />
        </button>
      </Tooltip>
      <Tooltip text={t('zoom.fitTooltip')} keys="fit">
        <button
          type="button"
          className="zoom-button"
          data-testid="zoom-fit"
          onClick={() => run('fit')}
        >
          <Icon of={Fullscreen} />
          {t('zoom.fit')}
        </button>
      </Tooltip>
    </div>
  );
}
