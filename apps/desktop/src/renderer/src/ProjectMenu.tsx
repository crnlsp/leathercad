import type { RecentFile, RecentOutcome } from '@leathercad/platform';
import { useState, type RefObject } from 'react';

import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { MenuButton } from './Menu.js';
import { MessageDialog } from './MessageDialog.js';
import { newTabMenu, projectMenu } from './menus.js';
import type { Press } from './PanelFold.js';

/**
 * The Project menu (8.7) — new, open, save as, rename, the recent projects —
 * at the left of the tab strip since 8.12: an icon that opens it, beside the
 * tabs it acts on, where it was the project's name in the bar below. It stays
 * on the start screen, with *Save as* and *Rename* refused.
 */
export function ProjectMenu({
  hasProject,
  recent,
  triggerRef,
  onMenuOpen,
  onNew,
  onNewFromTemplate,
  onOpen,
  onSaveAs,
  onSaveAsTemplate,
  onRename,
  onOpenRecent,
}: {
  /** A project is open: false on the start screen. */
  hasProject: boolean;
  /** The recent projects (8.7), most recent first. */
  recent: readonly RecentFile[];
  /** The button: a keyboard's rename gives focus back to it. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** The menu is opening: its recent projects are asked for again. */
  onMenuOpen: () => void;
  onNew: () => void;
  /** *New project from template…* (8.12): the picker. */
  onNewFromTemplate: () => void;
  onOpen: () => void;
  onSaveAs: () => void;
  /** *Save as template…* (8.12). */
  onSaveAsTemplate: () => void;
  /** *Rename…*: the active tab's name becomes a field. */
  onRename: (how: Press) => void;
  /** One that is gone is taken off the list, and this menu says why (U.20). */
  onOpenRecent: (path: string) => Promise<RecentOutcome>;
}) {
  const { t } = useI18n();
  // A recent project that is no longer there: said in the app's own dialog,
  // where the main process used to raise a native message box (U.20).
  const [gone, setGone] = useState<string | null>(null);

  return (
    <>
      <MenuButton
        label={t('tabs.menu')}
        tooltip={t('tabs.menuTooltip')}
        testId="project-menu"
        className="tool quiet icon-only project-menu-button"
        triggerRef={triggerRef}
        entries={projectMenu(
          {
            newProject: onNew,
            newFromTemplate: onNewFromTemplate,
            open: onOpen,
            saveAs: onSaveAs,
            saveAsTemplate: onSaveAsTemplate,
            // A keyboard's choice gives focus back to the menu once the name
            // is set; the pointer's leaves it with the page (U.4).
            rename: (how) => onRename(how ?? 'keyboard'),
            openRecent: (path) =>
              void onOpenRecent(path)
                .then((outcome) => {
                  if (outcome === 'gone') setGone(path);
                })
                .catch(() => undefined),
          },
          recent,
          t,
          hasProject ? undefined : t('tabs.noProject'),
        )}
        onOpen={onMenuOpen}
      >
        <Icon of="menu" />
      </MenuButton>
      {gone !== null && <GoneDialog path={gone} onClose={() => setGone(null)} />}
    </>
  );
}

/**
 * *+* on the tab strip (8.12): a menu of a new project, *Open…*, and the
 * recent projects — a tab for something new, or for something the maker has.
 * Ctrl+N still starts a new one at once.
 */
export function NewTabMenu({
  recent,
  onMenuOpen,
  onNew,
  onNewFromTemplate,
  onOpen,
  onOpenRecent,
}: {
  recent: readonly RecentFile[];
  /** The menu is opening: its recent projects are asked for again. */
  onMenuOpen: () => void;
  onNew: () => void;
  onNewFromTemplate: () => void;
  onOpen: () => void;
  onOpenRecent: (path: string) => Promise<RecentOutcome>;
}) {
  const { t } = useI18n();
  const [gone, setGone] = useState<string | null>(null);
  return (
    <>
      <MenuButton
        label={t('tabs.add')}
        tooltip={t('tabs.addTooltip')}
        testId="new-tab"
        className="tool quiet icon-only tab-new"
        entries={newTabMenu(
          {
            newProject: onNew,
            newFromTemplate: onNewFromTemplate,
            open: onOpen,
            openRecent: (path) =>
              void onOpenRecent(path)
                .then((outcome) => {
                  if (outcome === 'gone') setGone(path);
                })
                .catch(() => undefined),
          },
          recent,
          t,
        )}
        onOpen={onMenuOpen}
      >
        <Icon of="plus" size={14} />
      </MenuButton>
      {gone !== null && <GoneDialog path={gone} onClose={() => setGone(null)} />}
    </>
  );
}

/** A recent project that is no longer there, said in the app's own dialog (U.20). */
function GoneDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <MessageDialog title={t('menu.recentGone')} testId="recent-gone" onClose={onClose}>
      <p className="dialog-part">{path}</p>
      <p>{t('menu.recentGoneDetail')}</p>
    </MessageDialog>
  );
}
