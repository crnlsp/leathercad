import type { Preferences } from '@leathercad/platform';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

import {
  LANGUAGES,
  SYSTEM_LANGUAGE,
  catalogueFor,
  languageName,
  resolveLocale,
  type MessageKey,
} from '../../shared/i18n.js';
import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { focusAfter } from './menus.js';
import { KeyCap, useShownKeys } from './keyCaps.js';
import { SHORTCUT_GROUPS } from './shortcuts.js';

export type SettingsSection = 'general' | 'appearance' | 'language' | 'shortcuts';

/** Where a translator starts (README § Translations). */
const TRANSLATE_URL = 'https://github.com/crnlsp/leathercad#translations';

interface Props {
  section: SettingsSection;
  onSection: (next: SettingsSection) => void;
  preferences: Preferences;
  onPreferences: (changes: Partial<Preferences>) => void;
  /** The operating system's languages, most preferred first: what *Follow system* follows. */
  systemLanguages: readonly string[];
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
  title: MessageKey;
  pane: (props: Props) => ReactNode;
}[] = [
  { id: 'general', title: 'settings.section.general', pane: (props) => <General {...props} /> },
  {
    id: 'appearance',
    title: 'settings.section.appearance',
    pane: (props) => <Appearance {...props} />,
  },
  { id: 'language', title: 'settings.section.language', pane: (props) => <Language {...props} /> },
  { id: 'shortcuts', title: 'settings.section.shortcuts', pane: () => <Shortcuts /> },
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
  const { t } = useI18n();
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
        {/* A div, not a header: a header here would be a second banner. */}
        <div className="settings-header">
          <h3 id="settings-dialog-title">{t('settings.title')}</h3>
          <button
            type="button"
            className="tool quiet icon-only"
            aria-label={t('settings.close')}
            data-testid="settings-close"
            onClick={onClose}
          >
            <Icon of={X} />
          </button>
        </div>
        <div className="settings-body">
          <div
            className="settings-sections"
            role="tablist"
            aria-orientation="vertical"
            aria-label={t('settings.sections')}
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
                {t(entry.title)}
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
            <h4>{t(current.title)}</h4>
            {current.pane(props)}
          </div>
        </div>
      </div>
    </div>
  );
}

function General({ recentCount, onClearRecent }: Props) {
  const { t } = useI18n();
  return (
    <div className="setting">
      <div className="setting-text">
        <span className="setting-name">{t('settings.recent.name')}</span>
        <span className="setting-note">
          {t('settings.recent.note')}{' '}
          {recentCount === 0
            ? t('settings.recent.none')
            : t('settings.recent.count', { count: recentCount })}
        </span>
      </div>
      <button
        type="button"
        className="tool"
        data-testid="clear-recent"
        disabled={recentCount === 0}
        onClick={onClearRecent}
      >
        {t('settings.recent.clear')}
      </button>
    </div>
  );
}

function Appearance({ preferences, onPreferences }: Props) {
  const { t } = useI18n();
  return (
    <>
      <Toggle
        id="legend-open"
        name={t('settings.legend.name')}
        note={t('settings.legend.note')}
        checked={preferences.legendOpen}
        onChange={(on) => onPreferences({ legendOpen: on })}
      />
      <Toggle
        id="tool-names"
        name={t('settings.toolNames.name')}
        note={t('settings.toolNames.note')}
        checked={!preferences.toolRailCollapsed}
        onChange={(on) => onPreferences({ toolRailCollapsed: !on })}
      />
    </>
  );
}

/**
 * The interface's language (ADR 0018): the system's, or one chosen. Applies
 * at once, as every setting does. Lists the languages LeatherCAD supports —
 * `SUPPORTED_LANGUAGES`, not whatever files exist — each by its own name, so
 * the maker can find theirs whatever the window is in, and by this language's
 * name for it. A development build adds any translation not supported yet,
 * marked as a preview.
 */
function Language({ preferences, onPreferences, systemLanguages }: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  const noteId = useId();
  const named = (tag: string): string => languageName(catalogueFor(tag) ?? tag, i18n.locale);

  const followed = resolveLocale(SYSTEM_LANGUAGE, systemLanguages);
  // The system's own first language, when it is not the one followed: said,
  // so English on a French system is not a mystery.
  const wanted = systemLanguages[0];
  const unavailable =
    preferences.language === SYSTEM_LANGUAGE &&
    wanted !== undefined &&
    catalogueFor(followed) !== catalogueFor(wanted);
  const [before, after] = t('settings.language.invite').split('{{link}}');

  return (
    <div className="setting">
      <div className="setting-text">
        <label className="setting-name" htmlFor="setting-language">
          {t('settings.language.name')}
        </label>
        <span className="setting-note" id={noteId}>
          {t('settings.language.note')}
        </span>
        {unavailable && (
          <span className="setting-note" data-testid="language-unavailable">
            {t('settings.language.unavailable', {
              language: languageName(wanted.split(/[-_.]/)[0]!, i18n.locale),
              fallback: named(followed),
            })}
          </span>
        )}
        <span className="setting-note">
          {before}
          {/* An https link: the window-open handler sends it to the browser. */}
          <a href={TRANSLATE_URL} target="_blank" rel="noreferrer">
            {t('settings.language.inviteLink')}
          </a>
          {after}
        </span>
      </div>
      <select
        id="setting-language"
        data-testid="setting-language"
        aria-describedby={noteId}
        value={preferences.language}
        onChange={(event) => onPreferences({ language: event.target.value })}
      >
        <option value={SYSTEM_LANGUAGE}>
          {t('settings.language.system', { language: named(followed) })}
        </option>
        {LANGUAGES.map(({ tag, name, preview }) => {
          const label =
            tag === catalogueFor(i18n.locale)
              ? name
              : t('settings.language.option', { own: name, here: named(tag) });
          return (
            <option key={tag} value={tag} lang={tag}>
              {preview === true ? t('settings.language.preview', { language: label }) : label}
            </option>
          );
        })}
      </select>
    </div>
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

/** Every key the app answers to (8.2), from the keymap (U.3); read-only until U.12. */
function Shortcuts() {
  const { t } = useI18n();
  const shown = useShownKeys();
  return (
    <div className="shortcuts-groups">
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.id} aria-label={t(`shortcuts.group.${group.id}`)}>
          <h5>{t(`shortcuts.group.${group.id}`)}</h5>
          <dl>
            {group.shortcuts.map((shortcut) => (
              <div className="shortcut-row" key={`${group.id}-${shortcut.does}`}>
                <dt>
                  {shown(shortcut.keys).map((binding, index) => (
                    <span key={JSON.stringify(binding)}>
                      {index > 0 && <span className="shortcut-or"> {t('shortcuts.or')} </span>}
                      <KeyCap command={binding} />
                    </span>
                  ))}
                </dt>
                <dd>{t(shortcut.does)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
