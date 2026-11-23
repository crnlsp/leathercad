import type { RefObject } from 'react';

import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { MenuButton } from './Menu.js';
import { helpMenu } from './menus.js';

/**
 * **?** in the status bar's corner (MS.3), on the project screen and the
 * start screen: the Help menu, which F1 opens through `helpRef`. It opens
 * upwards, since nothing is below it.
 */
export function HelpButton({
  helpRef,
  onShortcuts,
  onAbout,
}: {
  helpRef: RefObject<HTMLButtonElement | null>;
  onShortcuts: () => void;
  onAbout: () => void;
}) {
  const { t } = useI18n();
  return (
    <span className="status-help">
      <MenuButton
        label={t('projectBar.help')}
        tooltip={t('projectBar.helpTooltip')}
        keys="help"
        testId="help-menu"
        className="tool quiet icon-only"
        align="end"
        above
        triggerRef={helpRef}
        entries={helpMenu({ shortcuts: onShortcuts, about: onAbout }, t)}
      >
        <Icon of="help" />
      </MenuButton>
    </span>
  );
}
