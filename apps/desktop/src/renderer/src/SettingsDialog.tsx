import type { Preferences } from '@leathercad/platform';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

import { Icon } from './icons/Icon.js';
import { focusAfter } from './menus.js';
import { SHORTCUT_GROUPS, keysFor } from './shortcuts.js';

export type SettingsSection = 'general' | 'appearance' | 'shortcuts';

interface Props {
  section: SettingsSection;
  onSection: (next: SettingsSection) => void;
  preferences: Preferences;
  onPreferences: (changes: Partial<Preferences>) => void;
  /** How many projects the Project menu lists. */
  recentCount: number;
  onClearRecent: () => void;
  onClose: () => void;
}

/**
 * The sections, in the sidebar's order (8.7). **A section is written only
 * when LeatherCAD has a real setting for it** — no placeholder, no "coming
 * soon". A new one is one entry here.
 */
const SECTIONS: readonly {
  id: SettingsSection;
  title: string;
  pane: (props: Props) => ReactNode;
}[] = [
  { id: 'general', title: 'General', pane: (props) => <General {...props} /> },
  { id: 'appearance', title: 'Appearance', pane: (props) => <Appearance {...props} /> },
  { id: 'shortcuts', title: 'Keyboard shortcuts', pane: () => <Shortcuts /> },
];

/**
 * Settings (8.7): the application's own, as a sidebar of sections — a
 * surface that grows a section when a setting needs one.
 *
 * Every change applies at once, through the same preference its in-place
 * control changes: there is no Save and no Cancel. A fixed height, so moving
 * between sections never resizes it. Keys stop here, as in the other dialogs,
 * so a letter typed in it cannot switch tools behind it.
 */
export function SettingsDialog(props: Props) {
  const { section, onSection, onClose } = props;
  const current = SECTIONS.find((entry) => entry.id === section) ?? SECTIONS[0]!;

  // Focus goes to the section it opened on, once: afterwards it is the maker's.
  const openedOn = useRef(section);
  useEffect(() => {
    document.getElementById(`settings-tab-${openedOn.current}`)?.focus();
  }, []);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        data-testid="settings-dialog"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onClose();
        }}
      >
        <header className="settings-header">
          <h3 id="settings-dialog-title">Settings</h3>
          <button
            type="button"
            className="tool quiet icon-only"
            aria-label="Close settings"
            data-testid="settings-close"
            onClick={onClose}
          >
            <Icon of={X} />
          </button>
        </header>
        <div className="settings-body">
          <div
            className="settings-sections"
            role="tablist"
            aria-orientation="vertical"
            aria-label="Sections"
            onKeyDown={(event) => {
              const at = SECTIONS.findIndex((entry) => entry.id === section);
              const next = SECTIONS[focusAfter(event.key, at, SECTIONS.length)];
              if (next === undefined) return;
              event.preventDefault();
              onSection(next.id);
              document.getElementById(`settings-tab-${next.id}`)?.focus();
            }}
          >
            {SECTIONS.map((entry) => (
              <button
                key={entry.id}
                id={`settings-tab-${entry.id}`}
                type="button"
                role="tab"
                aria-selected={entry.id === section}
                aria-controls="settings-pane"
                tabIndex={entry.id === section ? 0 : -1}
                className={entry.id === section ? 'settings-tab active' : 'settings-tab'}
                data-testid={`settings-tab-${entry.id}`}
                onClick={() => onSection(entry.id)}
              >
                {entry.title}
              </button>
            ))}
          </div>
          <div
            id="settings-pane"
            className="settings-pane"
            role="tabpanel"
            aria-labelledby={`settings-tab-${current.id}`}
            tabIndex={0}
            data-testid={`settings-pane-${current.id}`}
          >
            <h4>{current.title}</h4>
            {current.pane(props)}
          </div>
        </div>
      </div>
    </div>
  );
}

function General({ recentCount, onClearRecent }: Props) {
  return (
    <div className="setting">
      <div className="setting-text">
        <span className="setting-name">Recent projects</span>
        <span className="setting-note">
          The Project menu lists the projects you opened or saved most recently.{' '}
          {recentCount === 0
            ? 'None are listed now.'
            : `${String(recentCount)} ${recentCount === 1 ? 'is' : 'are'} listed now.`}
        </span>
      </div>
      <button
        type="button"
        className="tool"
        data-testid="clear-recent"
        disabled={recentCount === 0}
        onClick={onClearRecent}
      >
        Clear list
      </button>
    </div>
  );
}

function Appearance({ preferences, onPreferences }: Props) {
  return (
    <>
      <Toggle
        id="legend-open"
        name="Name the marks in the canvas legend"
        note="Off, the legend is a strip of marks until you open it."
        checked={preferences.legendOpen}
        onChange={(on) => onPreferences({ legendOpen: on })}
      />
      <Toggle
        id="tool-names"
        name="Show tool names in the rail"
        note="Off, each tool shows only its key. Below 1200 px wide the rail shows only keys anyway."
        checked={!preferences.toolRailCollapsed}
        onChange={(on) => onPreferences({ toolRailCollapsed: !on })}
      />
    </>
  );
}

/** One on-or-off setting: its name, what it changes, and the box. */
function Toggle({
  id,
  name,
  note,
  checked,
  onChange,
}: {
  id: string;
  name: string;
  note: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  const noteId = useId();
  return (
    <div className="setting">
      <div className="setting-text">
        <label className="setting-name" htmlFor={`setting-${id}`}>
          {name}
        </label>
        <span className="setting-note" id={noteId}>
          {note}
        </span>
      </div>
      <input
        id={`setting-${id}`}
        type="checkbox"
        data-testid={`setting-${id}`}
        aria-describedby={noteId}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}

/** Every key the app answers to (8.2), read-only until keys can be changed. */
function Shortcuts() {
  const isMac = navigator.userAgent.includes('Mac');
  return (
    <div className="shortcuts-groups">
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h5>{group.title}</h5>
          <dl>
            {group.shortcuts.map((shortcut) => (
              <div className="shortcut-row" key={`${group.title}-${shortcut.does}`}>
                <dt>
                  {shortcut.keys.map((keys, index) => (
                    <span key={keys}>
                      {index > 0 && <span className="shortcut-or"> or </span>}
                      <kbd>{keysFor(keys, isMac)}</kbd>
                    </span>
                  ))}
                </dt>
                <dd>{shortcut.does}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
